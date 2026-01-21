import { Router } from 'express';
import prisma from '../prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { createAudit } from '../utils/audit';

const router = Router();

// Role hierarchy for preventing certain escalations
const ROLE_HIERARCHY: Record<string, number> = {
  'intern': 1,
  'associate': 2,
  'manager': 3,
  'partner': 4,
  'admin': 5,
  'super_admin': 6
};

/**
 * Check if current user is admin/superuser
 * Only admins can assign or modify roles
 */
const isAdmin = async (userId: number): Promise<boolean> => {
  const roles = await prisma.userAuthRole.findMany({
    where: { userId },
    include: { role: true },
  });
  return roles.some(r => r.role.name === 'admin' || r.role.name === 'super_admin');
};

// GET /user_roles?userId=123
// Retrieve all roles for a specific user
router.get('/', async (req, res) => {
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
router.get('/list/all', authMiddleware, async (req: AuthRequest, res) => {
  try {
    // Check authorization - only admins can view all users
    const userId = req.user?.userId ? Number(req.user.userId) : undefined;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    
    const isUserAdmin = await isAdmin(userId);
    if (!isUserAdmin) {
      return res.status(403).json({ error: 'Only admins can view user list' });
    }

    // Get all users with their roles and profile info
    const users = await prisma.user.findMany({
      include: {
        roles: { include: { role: true } },
        profile: {
          include: {
            department: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Format response
    const formattedUsers = users.map(user => ({
      id: user.id,
      email: user.email,
      name: user.name,
      roles: user.roles.map(r => r.role.name),
      status: user.profile?.status || 'inactive',
      department: user.profile?.department?.name || 'Unassigned',
      departmentId: user.profile?.departmentId,
      position: user.profile?.positionTitle,
      hireDate: user.profile?.hireDate,
      createdAt: user.createdAt,
    }));

    return res.json(formattedUsers);
  } catch (err: any) {
    console.error('Error fetching users:', err);
    return res.status(500).json({ error: err.message });
  }
});

// POST /user_roles
// Assign a role to a user (Admin only)
router.post('/', authMiddleware, async (req: AuthRequest, res) => {
  const { userId, role } = req.body;
  if (!userId || !role) return res.status(400).json({ error: 'userId and role required' });

  try {
    // Check authorization - only admins can assign roles
    const currentUserId = req.user?.userId ? Number(req.user.userId) : undefined;
    if (!currentUserId) return res.status(401).json({ error: 'Unauthorized' });
    
    const isUserAdmin = await isAdmin(currentUserId);
    if (!isUserAdmin) {
      return res.status(403).json({ error: 'Only admins can assign roles' });
    }

    // Prevent user from changing their own role
    if (currentUserId === Number(userId)) {
      return res.status(403).json({ error: 'You cannot change your own role' });
    }

    // Check if user already has this role
    const roleRecord = await prisma.authRole.findUnique({
      where: { name: role },
    });

    if (!roleRecord) {
      return res.status(400).json({ error: `Invalid role: ${role}` });
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

    const created = await prisma.userAuthRole.create({
      data: {
        userId: Number(userId),
        roleId: roleRecord.id,
      },
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
      id: created.id,
      message: `Role '${role}' assigned to user ${targetUser?.email || userId}`,
    });
  } catch (err: any) {
    console.error('Error assigning role:', err);
    return res.status(500).json({ error: err.message });
  }
});

// PUT /user_roles/change
// Change a user's primary role (Admin only) - removes old role and assigns new one
router.put('/change', authMiddleware, async (req: AuthRequest, res) => {
  const { userId, oldRole, newRole } = req.body;
  if (!userId || !oldRole || !newRole) {
    return res.status(400).json({ error: 'userId, oldRole, and newRole required' });
  }

  try {
    // Check authorization - only admins can change roles
    const currentUserId = req.user?.userId ? Number(req.user.userId) : undefined;
    if (!currentUserId) return res.status(401).json({ error: 'Unauthorized' });
    
    const isUserAdmin = await isAdmin(currentUserId);
    if (!isUserAdmin) {
      return res.status(403).json({ error: 'Only admins can change roles' });
    }

    // Prevent user from changing their own role
    if (currentUserId === Number(userId)) {
      return res.status(403).json({ error: 'You cannot change your own role' });
    }

    // Check if user has the old role
    const oldRoleRecord = await prisma.authRole.findUnique({
      where: { name: oldRole },
    });
    const newRoleRecord = await prisma.authRole.findUnique({
      where: { name: newRole },
    });

    if (!oldRoleRecord || !newRoleRecord) {
      return res.status(400).json({ error: 'Invalid role provided' });
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
    const oldHierarchy = ROLE_HIERARCHY[oldRole] || 0;
    const newHierarchy = ROLE_HIERARCHY[newRole] || 0;
    const isEscalation = newHierarchy > oldHierarchy;

    // Remove old role
    await prisma.userAuthRole.deleteMany({
      where: {
        userId: Number(userId),
        roleId: oldRoleRecord.id,
      },
    });

    // Add new role
    const newUserRole = await prisma.userAuthRole.create({
      data: {
        userId: Number(userId),
        roleId: newRoleRecord.id,
      },
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
      id: newUserRole.id,
      message: `Role changed from '${oldRole}' to '${newRole}' for user ${targetUser?.email || userId}`,
      escalation: isEscalation,
      userId: Number(userId),
      oldRole,
      newRole,
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
router.delete('/', authMiddleware, async (req: AuthRequest, res) => {
  const { userId, role } = req.body;
  if (!userId || !role) return res.status(400).json({ error: 'userId and role required' });
  
  try {
    // Check authorization - only admins can remove roles
    const currentUserId = req.user?.userId ? Number(req.user.userId) : undefined;
    if (!currentUserId) return res.status(401).json({ error: 'Unauthorized' });
    
    const isUserAdmin = await isAdmin(currentUserId);
    if (!isUserAdmin) {
      return res.status(403).json({ error: 'Only admins can remove roles' });
    }

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
