import { Router } from "express";
import prisma from "../prisma";
import { AuthRequest } from "../middleware/auth";
import { requireModuleAccess } from "../middleware/requireModuleAccess";
import { createAudit } from "../utils/audit";
import {
  EXPLICIT_NONE_PERMISSION_KEY,
  ModuleAction,
  ModuleKey,
  ROLE_MODULE_PERMISSION_MATRIX,
  RoleModulePolicyInput,
  buildModuleAccessMatrix,
  isModuleAction,
  isModuleKey,
  matrixToPermissionKeys,
  moduleCatalog,
} from "../services/moduleAccess.service";
import {
  CANONICAL_ROLES,
  canonicalizeRoleName,
} from "../auth/canonicalRoles";
import {
  MODULE_REQUIREMENTS_BY_MODULE,
  ROUTE_MODULE_REQUIREMENTS,
} from "./moduleRouteRequirements";

const router = Router();

const canManageModulePolicies = requireModuleAccess("access_control", "admin");

const toSnakeCase = (value: string) =>
  value
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/-/g, "_")
    .toLowerCase();

const normalizeModuleKeyInput = (value: unknown): ModuleKey | null => {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const snake = toSnakeCase(raw);
  return isModuleKey(snake) ? snake : null;
};

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
    const normalizedModuleKey = normalizeModuleKeyInput(moduleKey);
    if (!normalizedModuleKey) return;
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

const getUserOverrideRoleName = (userId: number) =>
  `user_override_${userId}`.toLowerCase();

router.get("/modules", async (_req, res) => {
  res.json({
    modules: moduleCatalog,
    actions: ["read", "write", "approve", "admin"],
    permissionLevels: {
      no_access: [],
      view_only: ["read"],
      view_edit: ["read", "write"],
      create: ["write"],
      delete: ["write"],
    },
  });
});

router.get("/matrix", canManageModulePolicies, async (_req, res) => {
  res.json({
    canonicalRoles: CANONICAL_ROLES,
    roleModulePermissionMatrix: ROLE_MODULE_PERMISSION_MATRIX,
  });
});

router.get("/requirements", canManageModulePolicies, async (_req, res) => {
  res.json({
    byRoute: ROUTE_MODULE_REQUIREMENTS,
    byModule: MODULE_REQUIREMENTS_BY_MODULE,
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
    const overrideRoleName = getUserOverrideRoleName(userId);
    const overrideRoleEntry = activeRoleEntries.find(
      (entry) => entry.role.name.toLowerCase() === overrideRoleName
    );
    const effectiveRoleEntries = overrideRoleEntry ? [overrideRoleEntry] : activeRoleEntries;

    const roleNames = Array.from(
      new Set(
        activeRoleEntries
      .filter((entry) => entry.role.name.toLowerCase() !== overrideRoleName)
      .map((entry) => canonicalizeRoleName(entry.role.name))
      )
    );
    const rolePolicies: RoleModulePolicyInput[] = effectiveRoleEntries.map((entry) => ({
      roleName: canonicalizeRoleName(entry.role.name),
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
    const overridePermissionKeys = overrideRoleEntry
      ? Array.from(
          new Set(
            overrideRoleEntry.role.permissions
              .map((permissionEntry) => permissionEntry.permission.key)
              .filter((key) => key.toLowerCase().startsWith("module."))
          )
        )
      : [];

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
      effectiveRoles: effectiveRoleEntries.map((entry) => entry.role.name),
      permissionKeys,
      explicitAccess,
      effectiveAccess,
      override: {
        active: Boolean(overrideRoleEntry),
        roleName: overrideRoleEntry?.role.name ?? null,
        permissionKeys: overridePermissionKeys,
        explicitAccess: buildModuleAccessMatrix({ permissionKeys: overridePermissionKeys }),
      },
    });
  } catch (error) {
    console.error("Failed to load user module access:", error);
    res.status(500).json({ error: "Failed to load user module access" });
  }
});

router.put("/users/:userId/override", canManageModulePolicies, async (req: AuthRequest, res) => {
  try {
    const userId = Number(req.params.userId);
    if (!Number.isFinite(userId) || userId <= 0) {
      return res.status(400).json({ error: "Invalid userId" });
    }

    const overrideRoleName = getUserOverrideRoleName(userId);
    const clearOverride = req.body?.clear === true;

    const access = normalizeModuleAccessPayload(req.body?.access ?? req.body?.modules);
    const hasAccessMatrixPayload =
      req.body?.access !== undefined || req.body?.modules !== undefined;
    let permissionKeys = matrixToPermissionKeys(access);

    if (permissionKeys.length === 0) {
      permissionKeys = normalizePermissionKeys(req.body?.permissionKeys);
    }

    if (permissionKeys.length === 0 && hasAccessMatrixPayload && !clearOverride) {
      permissionKeys = [EXPLICIT_NONE_PERMISSION_KEY];
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true },
    });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const result = await prisma.$transaction(async (tx) => {
      const existingRole = await tx.authRole.findUnique({
        where: { name: overrideRoleName },
        select: { id: true },
      });

      if (clearOverride) {
        if (!existingRole) {
          return { mode: "cleared", permissionKeys: [] as string[] };
        }

        await tx.authRolePermission.deleteMany({
          where: { roleId: existingRole.id },
        });
        await tx.userAuthRole.deleteMany({
          where: { userId, roleId: existingRole.id },
        });
        await tx.authRole.update({
          where: { id: existingRole.id },
          data: { isActive: false },
        });
        return { mode: "cleared", permissionKeys: [] as string[] };
      }

      const role = await tx.authRole.upsert({
        where: { name: overrideRoleName },
        update: {
          description: "Per-user module access override",
          isActive: true,
        },
        create: {
          name: overrideRoleName,
          description: "Per-user module access override",
          isActive: true,
        },
        select: { id: true, name: true },
      });

      await tx.userAuthRole.createMany({
        data: [{ userId, roleId: role.id }],
        skipDuplicates: true,
      });

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

      if (permissionKeys.length > 0) {
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
      }

      return { mode: "set", permissionKeys };
    });

    await createAudit({
      action: clearOverride
        ? "module_access.user_override_cleared"
        : "module_access.user_override_updated",
      entity_type: "user",
      entity_id: userId,
      user_id: req.user?.userId ? Number(req.user.userId) : undefined,
      ip_address: req.ip,
      metadata: {
        userId,
        overrideRoleName,
        clearOverride,
        permissionKeys: result.permissionKeys,
      },
    });

    // IMPLEMENTED: Granular RBAC user overrides - override role can define a per-user module policy that takes precedence over base roles.
    return res.json({
      userId,
      overrideRoleName,
      clearOverride,
      permissionKeys: result.permissionKeys,
      explicitAccess: buildModuleAccessMatrix({ permissionKeys: result.permissionKeys }),
    });
  } catch (error) {
    console.error("Failed to update user module override:", error);
    return res.status(500).json({ error: "Failed to update user module override" });
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
    const overrideRoleName = getUserOverrideRoleName(userId);
    const overrideRoleEntry = activeRoleEntries.find(
      (entry) => entry.role.name.toLowerCase() === overrideRoleName
    );
    const effectiveRoleEntries = overrideRoleEntry ? [overrideRoleEntry] : activeRoleEntries;

    const roleNames = Array.from(
      new Set(
        activeRoleEntries
      .filter((entry) => entry.role.name.toLowerCase() !== overrideRoleName)
      .map((entry) => canonicalizeRoleName(entry.role.name))
      )
    );
    const rolePolicies: RoleModulePolicyInput[] = effectiveRoleEntries.map((entry) => ({
      roleName: canonicalizeRoleName(entry.role.name),
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
      effectiveRoles: effectiveRoleEntries.map((entry) => entry.role.name),
      permissionKeys,
      effectiveAccess,
      override: {
        active: Boolean(overrideRoleEntry),
        roleName: overrideRoleEntry?.role.name ?? null,
      },
    });
  } catch (error) {
    console.error("Failed to load current user module access:", error);
    res.status(500).json({ error: "Failed to load module access" });
  }
});

export default router;
