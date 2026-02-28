import { Router } from 'express';
import prisma from '../prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { requireModuleAccess } from '../middleware/requireModuleAccess';
import { createAudit } from '../utils/audit';

const router = Router();

// Role hierarchy for escalation warnings (access roles only)
const ROLE_HIERARCHY: Record<string, number> = {
  employee: 1,
  marketing: 2,
  finance: 2,
  manager: 3,
  partner: 4,
  gmp: 5,
  group_managing_partner: 5,
  hr: 5,
  hr_manager: 5,
  admin: 6,
  super_admin: 7,
};

const rolePriority = (roleName: string) => ROLE_HIERARCHY[normalizeRoleName(roleName)] || 0;

const CORE_ACCESS_ROLES = [
  'employee',
  'marketing',
  'finance',
  'manager',
  'partner',
  'gmp',
  'group_managing_partner',
  'hr',
  'hr_manager',
  'admin',
  'super_admin',
] as const;

const CORE_ACCESS_ROLE_SET = new Set<string>(CORE_ACCESS_ROLES);

const normalizeRoleName = (value: unknown) => String(value || '').trim().toLowerCase();
const isCoreAccessRole = (roleName: unknown) => CORE_ACCESS_ROLE_SET.has(normalizeRoleName(roleName));
const PRIMARY_ASSIGNABLE_ACCESS_ROLES = [
  'gmp',
  'admin',
  'partner',
  'manager',
  'marketing',
  'finance',
  'employee',
] as const;
const PRIMARY_ASSIGNABLE_ACCESS_ROLE_SET = new Set<string>(PRIMARY_ASSIGNABLE_ACCESS_ROLES);
const isPrimaryAssignableAccessRole = (roleName: unknown) =>
  PRIMARY_ASSIGNABLE_ACCESS_ROLE_SET.has(normalizeRoleName(roleName));

// GET /user_roles?userId=123
// Retrieve all roles for a specific user
router.get('/', authMiddleware, async (req, res) => {
  const userIdRaw = req.query.userId as string | undefined;
  if (!userIdRaw) return res.json([]);
  const userId = Number(userIdRaw);
  if (Number.isNaN(userId)) return res.status(400).json({ error: 'Invalid userId' });
  try {
    const roles = await prisma.userAuthRole.findMany({
      where: { userId },
      include: { role: true },
    });
    // return shape compatible with previous frontend usage: [{ role: '...' }, ...]
    return res.json(roles.map(r => ({ role: r.role.name })));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /user_roles/list/all
// Retrieve all users with their roles, departments, and status (Admin only)
router.get('/list/all', authMiddleware, requireModuleAccess('users', 'admin'), async (req: AuthRequest, res) => {
  try {
    const userId = req.user?.userId ? Number(req.user.userId) : undefined;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    // Get all users with their roles and profile info
    const users = await prisma.user.findMany({
      include: {
        roles: { include: { role: true } },
        profile: {
          include: {
            department: true,
            role: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Format response
    const formattedUsers = users.map(user => {
      const sortedRoles = user.roles
        .map((item) => normalizeRoleName(item.role.name))
        .filter(Boolean)
        .sort((a, b) => rolePriority(b) - rolePriority(a));
      const primaryRole = sortedRoles[0] || null;

      return {
      id: user.id,
      profileId: user.profile?.id,
      email: user.email,
      name: user.profile ? `${user.profile.firstName} ${user.profile.lastName}` : user.email,
      roles: sortedRoles,
      primaryRole,
      status: user.profile?.status || 'inactive',
      department: user.profile?.department?.name || 'Unassigned',
      departmentId: user.profile?.departmentId,
      position: user.profile?.positionTitle,
      positionRoleId: user.profile?.role?.id,
      positionRoleName: user.profile?.role?.name,
      billingRate: user.profile?.role?.billingRate ?? null,
      hireDate: user.profile?.hireDate,
      createdAt: user.createdAt,
    };
    });

    return res.json(formattedUsers);
  } catch (err: any) {
    console.error('Error fetching users:', err);
    return res.status(500).json({ error: err.message });
  }
});

// POST /user_roles
// Assign a role to a user (Admin only)
router.post('/', authMiddleware, requireModuleAccess('users', 'admin'), async (req: AuthRequest, res) => {
  const { userId, role } = req.body;
  if (!userId || !role) return res.status(400).json({ error: 'userId and role required' });

  try {
    const currentUserId = req.user?.userId ? Number(req.user.userId) : undefined;
    if (!currentUserId) return res.status(401).json({ error: 'Unauthorized' });

    // Prevent user from changing their own role
    if (currentUserId === Number(userId)) {
      return res.status(403).json({ error: 'You cannot change your own role' });
    }

    // Check if user already has this role
    const normalizedRoleName = normalizeRoleName(role);
    const roleRecord = await prisma.authRole.findUnique({
      where: { name: normalizedRoleName },
    });

    if (!roleRecord) {
      return res.status(400).json({ error: `Invalid role: ${role}` });
    }

    if (!isPrimaryAssignableAccessRole(roleRecord.name)) {
      return res.status(400).json({
        error: `Role '${roleRecord.name}' cannot be assigned as a primary access role`,
        allowedRoles: PRIMARY_ASSIGNABLE_ACCESS_ROLES,
      });
    }

    const existingRole = await prisma.userAuthRole.findFirst({
      where: {
        userId: Number(userId),
        roleId: roleRecord.id,
      },
    });

    if (existingRole) {
      return res.status(400).json({ error: 'User already has this role' });
    }

    const userIdNum = Number(userId);
    await prisma.$transaction(async (tx) => {
      await tx.userAuthRole.create({
        data: {
          userId: userIdNum,
          roleId: roleRecord.id,
        },
      });

      if (isCoreAccessRole(roleRecord.name)) {
        const coreRoleRecords = await tx.authRole.findMany({
          where: { name: { in: [...CORE_ACCESS_ROLE_SET] } },
          select: { id: true },
        });
        const coreRoleIds = coreRoleRecords.map((item) => item.id);
        await tx.userAuthRole.deleteMany({
          where: {
            userId: userIdNum,
            roleId: { in: coreRoleIds.filter((roleId) => roleId !== roleRecord.id) },
          },
        });
      }
    });

    // audit: who assigned the role
    const performedBy = currentUserId;
    const targetUser = await prisma.user.findUnique({
      where: { id: Number(userId) },
    });

    await createAudit({
      action: `role_assignment`,
      entity_type: 'user_role',
      user_id: performedBy,
      ip_address: req.ip,
    });

    return res.status(201).json({
      userId: userIdNum,
      roleId: roleRecord.id,
      message: `Role '${role}' assigned to user ${targetUser?.email || userId}`,
    });
  } catch (err: any) {
    console.error('Error assigning role:', err);
    return res.status(500).json({ error: err.message });
  }
});

// PUT /user_roles/change
// Change a user's primary role (Admin only) - removes old role and assigns new one
router.put('/change', authMiddleware, requireModuleAccess('users', 'admin'), async (req: AuthRequest, res) => {
  const { userId, oldRole, newRole } = req.body;
  if (!userId || !oldRole || !newRole) {
    return res.status(400).json({ error: 'userId, oldRole, and newRole required' });
  }

  try {
    const currentUserId = req.user?.userId ? Number(req.user.userId) : undefined;
    if (!currentUserId) return res.status(401).json({ error: 'Unauthorized' });

    // Prevent user from changing their own role
    if (currentUserId === Number(userId)) {
      return res.status(403).json({ error: 'You cannot change your own role' });
    }

    const normalizedOldRole = normalizeRoleName(oldRole);
    const normalizedNewRole = normalizeRoleName(newRole);

    if (!isPrimaryAssignableAccessRole(normalizedNewRole)) {
      return res.status(400).json({
        error: `Role '${newRole}' cannot be assigned as a primary access role`,
        allowedRoles: PRIMARY_ASSIGNABLE_ACCESS_ROLES,
      });
    }

    // Check if user has the old role
    const oldRoleRecord = await prisma.authRole.findUnique({
      where: { name: normalizedOldRole },
    });
    const newRoleRecord = await prisma.authRole.findUnique({
      where: { name: normalizedNewRole },
    });

    if (!oldRoleRecord || !newRoleRecord) {
      return res.status(400).json({ error: 'Invalid role provided' });
    }

    if (oldRoleRecord.id === newRoleRecord.id) {
      return res.status(400).json({ error: 'Old role and new role cannot be the same' });
    }

    const existingRole = await prisma.userAuthRole.findFirst({
      where: {
        userId: Number(userId),
        roleId: oldRoleRecord.id,
      },
    });

    if (!existingRole) {
      return res.status(400).json({ error: `User does not have role '${oldRole}'` });
    }

    // Role escalation warning - record but allow (admin approved)
    const oldHierarchy = ROLE_HIERARCHY[normalizeRoleName(oldRoleRecord.name)] || 0;
    const newHierarchy = ROLE_HIERARCHY[normalizeRoleName(newRoleRecord.name)] || 0;
    const isEscalation = newHierarchy > oldHierarchy;

    // Transactional replace:
    // 1) Ensure target role exists for user (create if missing)
    // 2) For core access roles, keep only one core role
    // 3) Remove old role for non-core transitions
    const userIdNum = Number(userId);
    await prisma.$transaction(async (tx) => {
      const alreadyHasNewRole = await tx.userAuthRole.findFirst({
        where: {
          userId: userIdNum,
          roleId: newRoleRecord.id,
        },
      });

      if (!alreadyHasNewRole) {
        await tx.userAuthRole.create({
          data: {
            userId: userIdNum,
            roleId: newRoleRecord.id,
          },
        });
      }

      if (isCoreAccessRole(newRoleRecord.name)) {
        const coreRoleRecords = await tx.authRole.findMany({
          where: { name: { in: [...CORE_ACCESS_ROLE_SET] } },
          select: { id: true },
        });
        const coreRoleIds = coreRoleRecords.map((item) => item.id);
        await tx.userAuthRole.deleteMany({
          where: {
            userId: userIdNum,
            roleId: { in: coreRoleIds.filter((roleId) => roleId !== newRoleRecord.id) },
          },
        });
      } else {
        await tx.userAuthRole.deleteMany({
          where: {
            userId: userIdNum,
            roleId: oldRoleRecord.id,
          },
        });
      }
    });

    // Comprehensive audit logging
    const targetUser = await prisma.user.findUnique({
      where: { id: Number(userId) },
    });

    await createAudit({
      action: `role_change`,
      entity_type: 'user_role',
      user_id: currentUserId,
      ip_address: req.ip,
    });

    return res.json({
      userId: userIdNum,
      roleId: newRoleRecord.id,
      message: `Role changed from '${oldRoleRecord.name}' to '${newRoleRecord.name}' for user ${targetUser?.email || userId}`,
      escalation: isEscalation,
      oldRole: oldRoleRecord.name,
      newRole: newRoleRecord.name,
      changedBy: currentUserId,
      changedAt: new Date(),
    });
  } catch (err: any) {
    console.error('Error changing role:', err);
    return res.status(500).json({ error: err.message });
  }
});

// DELETE /user_roles  body: { userId, role }
// Remove a specific role from a user (Admin only)
router.delete('/', authMiddleware, requireModuleAccess('users', 'admin'), async (req: AuthRequest, res) => {
  const { userId, role } = req.body;
  if (!userId || !role) return res.status(400).json({ error: 'userId and role required' });
  
  try {
    const currentUserId = req.user?.userId ? Number(req.user.userId) : undefined;
    if (!currentUserId) return res.status(401).json({ error: 'Unauthorized' });

    // Prevent user from removing their own roles
    if (currentUserId === Number(userId)) {
      return res.status(403).json({ error: 'You cannot remove your own roles' });
    }

    const roleRecord = await prisma.authRole.findUnique({
      where: { name: role },
    });

    if (!roleRecord) {
      return res.status(400).json({ error: `Invalid role: ${role}` });
    }

    if (isCoreAccessRole(roleRecord.name)) {
      return res.status(400).json({
        error: 'Primary access roles cannot be removed directly. Use role change instead.',
      });
    }

    const deleted = await prisma.userAuthRole.deleteMany({
      where: {
        userId: Number(userId),
        roleId: roleRecord.id,
      },
    });

    if (deleted.count === 0) {
      return res.status(400).json({ error: 'Role not found for this user' });
    }

    const performedBy = currentUserId;
    const targetUser = await prisma.user.findUnique({
      where: { id: Number(userId) },
    });

    await createAudit({
      action: `role_removal`,
      entity_type: 'user_role',
      user_id: performedBy,
      ip_address: req.ip,
    });

    return res.json({
      deleted: deleted.count,
      message: `Role '${role}' removed from user ${targetUser?.email || userId}`,
    });
  } catch (err: any) {
    console.error('Error removing role:', err);
    return res.status(500).json({ error: err.message });
  }
});

export default router;
