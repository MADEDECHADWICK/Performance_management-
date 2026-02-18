import { Router } from "express";
import prisma from "../prisma";
import { AuthRequest } from "../middleware/auth";
import { requireRole } from "../middleware/reqiureRole";
import { createAudit } from "../utils/audit";
import {
  EXPLICIT_NONE_PERMISSION_KEY,
  ModuleAction,
  ModuleKey,
  RoleModulePolicyInput,
  buildModuleAccessMatrix,
  isModuleAction,
  isModuleKey,
  matrixToPermissionKeys,
  moduleCatalog,
} from "../services/moduleAccess.service";

const router = Router();

const canManageModulePolicies = requireRole("hr", "hr_manager", "admin", "super_admin");

const normalizeModuleActions = (value: unknown): ModuleAction[] => {
  if (!Array.isArray(value)) return [];
  const normalized = value
    .map((action) => String(action).toLowerCase().trim())
    .filter((action): action is ModuleAction => isModuleAction(action));
  return Array.from(new Set(normalized));
};

const normalizeModuleAccessPayload = (
  payload: unknown
): Partial<Record<ModuleKey, ModuleAction[]>> => {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return {};
  }

  const result: Partial<Record<ModuleKey, ModuleAction[]>> = {};
  Object.entries(payload as Record<string, unknown>).forEach(([moduleKey, actions]) => {
    const normalizedModuleKey = String(moduleKey).toLowerCase();
    if (!isModuleKey(normalizedModuleKey)) return;
    result[normalizedModuleKey] = normalizeModuleActions(actions);
  });
  return result;
};

const normalizePermissionKeys = (permissionKeys: unknown): string[] => {
  if (!Array.isArray(permissionKeys)) return [];

  return Array.from(
    new Set(
      permissionKeys
        .map((item) => String(item).toLowerCase().trim())
        .filter((key) => {
          if (key === EXPLICIT_NONE_PERMISSION_KEY) return true;
          const parts = key.split(".");
          if (parts.length !== 3 || parts[0] !== "module") return false;
          return isModuleKey(parts[1]) && isModuleAction(parts[2]);
        })
    )
  );
};

const toRoleSummary = (
  role: {
    id: number;
    name: string;
    description: string | null;
    isActive: boolean;
    permissions: Array<{ permission: { key: string } }>;
  }
) => {
  const permissionKeys = Array.from(
    new Set(
      role.permissions
        .map((item) => item.permission.key)
        .filter((key) => key.toLowerCase().startsWith("module."))
    )
  );

  const explicitAccess = buildModuleAccessMatrix({
    permissionKeys,
  });
  const effectiveAccess = buildModuleAccessMatrix({
    rolePolicies: [
      {
        roleName: role.name,
        permissionKeys,
      },
    ],
  });

  return {
    id: role.id,
    name: role.name,
    description: role.description,
    isActive: role.isActive,
    permissionKeys,
    explicitAccess,
    effectiveAccess,
  };
};

router.get("/modules", async (_req, res) => {
  res.json({
    modules: moduleCatalog,
    actions: ["read", "write", "approve", "admin"],
  });
});

router.get("/roles", canManageModulePolicies, async (_req, res) => {
  try {
    const roles = await prisma.authRole.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      include: {
        permissions: {
          include: {
            permission: {
              select: { key: true },
            },
          },
        },
      },
    });

    res.json({
      roles: roles.map((role) => toRoleSummary(role)),
    });
  } catch (error) {
    console.error("Failed to list module access policies:", error);
    res.status(500).json({ error: "Failed to list module access policies" });
  }
});

router.put("/roles/:roleName", canManageModulePolicies, async (req: AuthRequest, res) => {
  try {
    const roleName = String(req.params.roleName || "").toLowerCase().trim();
    if (!roleName) {
      return res.status(400).json({ error: "Role name is required" });
    }

    const access = normalizeModuleAccessPayload(req.body?.access ?? req.body?.modules);
    const hasAccessMatrixPayload =
      req.body?.access !== undefined || req.body?.modules !== undefined;
    let permissionKeys = matrixToPermissionKeys(access);

    if (permissionKeys.length === 0) {
      permissionKeys = normalizePermissionKeys(req.body?.permissionKeys);
    }

    // An explicit empty matrix means "deny all for this role in strict mode".
    // Persist a marker key so fallback role defaults do not re-apply.
    if (permissionKeys.length === 0 && hasAccessMatrixPayload) {
      permissionKeys = [EXPLICIT_NONE_PERMISSION_KEY];
    }

    const role = await prisma.authRole.findUnique({
      where: { name: roleName },
      select: { id: true, name: true },
    });

    if (!role) {
      return res.status(404).json({ error: "Role not found" });
    }

    await prisma.$transaction(async (tx) => {
      await tx.authRolePermission.deleteMany({
        where: {
          roleId: role.id,
          permission: {
            key: {
              startsWith: "module.",
            },
          },
        },
      });

      if (permissionKeys.length === 0) return;

      const permissions = await Promise.all(
        permissionKeys.map((key) =>
          tx.permission.upsert({
            where: { key },
            update: {},
            create: {
              key,
              description: `Module permission: ${key}`,
            },
          })
        )
      );

      await tx.authRolePermission.createMany({
        data: permissions.map((permission) => ({
          roleId: role.id,
          permissionId: permission.id,
        })),
        skipDuplicates: true,
      });
    });

    await createAudit({
      action: "module_access.role_policy_updated",
      entity_type: "auth_role",
      entity_id: role.id,
      user_id: req.user?.userId ? Number(req.user.userId) : undefined,
      ip_address: req.ip,
      metadata: {
        roleName: role.name,
        permissionKeys,
      },
    });

    const updatedRole = await prisma.authRole.findUnique({
      where: { id: role.id },
      include: {
        permissions: {
          include: {
            permission: {
              select: { key: true },
            },
          },
        },
      },
    });

    if (!updatedRole) {
      return res.status(404).json({ error: "Role not found after update" });
    }

    res.json({
      role: toRoleSummary(updatedRole),
      message: "Role module access policy updated",
    });
  } catch (error) {
    console.error("Failed to update role module policy:", error);
    res.status(500).json({ error: "Failed to update role module policy" });
  }
});

router.get("/users/:userId", canManageModulePolicies, async (req, res) => {
  try {
    const userId = Number(req.params.userId);
    if (!Number.isFinite(userId) || userId <= 0) {
      return res.status(400).json({ error: "Invalid userId" });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            status: true,
          },
        },
        roles: {
          include: {
            role: {
              include: {
                permissions: {
                  include: {
                    permission: {
                      select: { key: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const activeRoleEntries = user.roles.filter((entry) => entry.role.isActive);
    const roleNames = activeRoleEntries.map((entry) => entry.role.name);
    const rolePolicies: RoleModulePolicyInput[] = activeRoleEntries.map((entry) => ({
      roleName: entry.role.name,
      permissionKeys: entry.role.permissions.map((permissionEntry) => permissionEntry.permission.key),
    }));
    const permissionKeys = Array.from(
      new Set(
        activeRoleEntries.flatMap((entry) =>
          entry.role.permissions
            .map((permissionEntry) => permissionEntry.permission.key)
            .filter((key) => key.toLowerCase().startsWith("module."))
        )
      )
    );

    const explicitAccess = buildModuleAccessMatrix({ permissionKeys });
    const effectiveAccess = buildModuleAccessMatrix({
      rolePolicies,
    });

    res.json({
      user: {
        id: user.id,
        email: user.email,
        profile: user.profile
          ? {
              id: user.profile.id,
              firstName: user.profile.firstName,
              lastName: user.profile.lastName,
              status: user.profile.status,
            }
          : null,
      },
      roles: roleNames,
      permissionKeys,
      explicitAccess,
      effectiveAccess,
    });
  } catch (error) {
    console.error("Failed to load user module access:", error);
    res.status(500).json({ error: "Failed to load user module access" });
  }
});

router.get("/me", async (req: AuthRequest, res) => {
  try {
    const userId = req.user?.userId ? Number(req.user.userId) : undefined;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const userRoles = await prisma.userAuthRole.findMany({
      where: { userId },
      include: {
        role: {
          include: {
            permissions: {
              include: {
                permission: {
                  select: { key: true },
                },
              },
            },
          },
        },
      },
    });

    const activeRoleEntries = userRoles.filter((entry) => entry.role.isActive);
    const roleNames = activeRoleEntries.map((entry) => entry.role.name);
    const rolePolicies: RoleModulePolicyInput[] = activeRoleEntries.map((entry) => ({
      roleName: entry.role.name,
      permissionKeys: entry.role.permissions.map((permissionEntry) => permissionEntry.permission.key),
    }));
    const permissionKeys = Array.from(
      new Set(
        activeRoleEntries.flatMap((entry) =>
          entry.role.permissions
            .map((permissionEntry) => permissionEntry.permission.key)
            .filter((key) => key.toLowerCase().startsWith("module."))
        )
      )
    );

    const effectiveAccess = buildModuleAccessMatrix({
      rolePolicies,
    });

    res.json({
      userId,
      roles: roleNames,
      permissionKeys,
      effectiveAccess,
    });
  } catch (error) {
    console.error("Failed to load current user module access:", error);
    res.status(500).json({ error: "Failed to load module access" });
  }
});

export default router;
