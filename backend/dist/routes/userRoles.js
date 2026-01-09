"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = __importDefault(require("../prisma"));
const auth_1 = require("../middleware/auth");
const audit_1 = require("../utils/audit");
const router = (0, express_1.Router)();
// Valid roles in the system
const VALID_ROLES = ['admin', 'partner', 'manager', 'associate', 'intern'];
// Role hierarchy for preventing certain escalations
const ROLE_HIERARCHY = {
    'intern': 1,
    'associate': 2,
    'manager': 3,
    'partner': 4,
    'admin': 5
};
/**
 * Check if current user is admin/superuser
 * Only admins can assign or modify roles
 */
const isAdmin = async (userId) => {
    const roles = await prisma_1.default.userRole.findMany({
        where: { userId },
    });
    return roles.some(r => r.role === 'admin' || r.role === 'super_admin');
};
// GET /user_roles?userId=123
// Retrieve all roles for a specific user
router.get('/', async (req, res) => {
    const userIdRaw = req.query.userId;
    if (!userIdRaw)
        return res.json([]);
    const userId = Number(userIdRaw);
    if (Number.isNaN(userId))
        return res.status(400).json({ error: 'Invalid userId' });
    try {
        const roles = await prisma_1.default.userRole.findMany({ where: { userId } });
        // return shape compatible with previous frontend usage: [{ role: '...' }, ...]
        return res.json(roles.map(r => ({ role: r.role })));
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// GET /user_roles/list/all
// Retrieve all users with their roles, departments, and status (Admin only)
router.get('/list/all', auth_1.authMiddleware, async (req, res) => {
    try {
        // Check authorization - only admins can view all users
        const userId = req.user?.sub ? Number(req.user.sub) : undefined;
        if (!userId)
            return res.status(401).json({ error: 'Unauthorized' });
        const isUserAdmin = await isAdmin(userId);
        if (!isUserAdmin) {
            return res.status(403).json({ error: 'Only admins can view user list' });
        }
        // Get all users with their roles and profile info
        const users = await prisma_1.default.user.findMany({
            include: {
                roles: true,
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
            roles: user.roles.map(r => r.role),
            status: user.profile?.status || 'inactive',
            department: user.profile?.department?.name || 'Unassigned',
            departmentId: user.profile?.departmentId,
            position: user.profile?.position,
            hireDate: user.profile?.hire_date,
            createdAt: user.createdAt,
        }));
        return res.json(formattedUsers);
    }
    catch (err) {
        console.error('Error fetching users:', err);
        return res.status(500).json({ error: err.message });
    }
});
// POST /user_roles
// Assign a role to a user (Admin only)
router.post('/', auth_1.authMiddleware, async (req, res) => {
    const { userId, role } = req.body;
    if (!userId || !role)
        return res.status(400).json({ error: 'userId and role required' });
    // Validate role
    if (!VALID_ROLES.includes(role)) {
        return res.status(400).json({ error: `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}` });
    }
    try {
        // Check authorization - only admins can assign roles
        const currentUserId = req.user?.sub ? Number(req.user.sub) : undefined;
        if (!currentUserId)
            return res.status(401).json({ error: 'Unauthorized' });
        const isUserAdmin = await isAdmin(currentUserId);
        if (!isUserAdmin) {
            return res.status(403).json({ error: 'Only admins can assign roles' });
        }
        // Prevent user from changing their own role
        if (currentUserId === Number(userId)) {
            return res.status(403).json({ error: 'You cannot change your own role' });
        }
        // Check if user already has this role
        const existingRole = await prisma_1.default.userRole.findFirst({
            where: {
                userId: Number(userId),
                role: role,
            },
        });
        if (existingRole) {
            return res.status(400).json({ error: 'User already has this role' });
        }
        const created = await prisma_1.default.userRole.create({
            data: {
                userId: Number(userId),
                role,
            },
        });
        // audit: who assigned the role
        const performedBy = currentUserId;
        const targetUser = await prisma_1.default.user.findUnique({
            where: { id: Number(userId) },
        });
        await (0, audit_1.createAudit)({
            action: `role_assignment`,
            entity_type: 'user_role',
            user_id: performedBy,
            ip_address: req.ip,
        });
        return res.status(201).json({
            id: created.id,
            message: `Role '${role}' assigned to user ${targetUser?.email || userId}`,
        });
    }
    catch (err) {
        console.error('Error assigning role:', err);
        return res.status(500).json({ error: err.message });
    }
});
// PUT /user_roles/change
// Change a user's primary role (Admin only) - removes old role and assigns new one
router.put('/change', auth_1.authMiddleware, async (req, res) => {
    const { userId, oldRole, newRole } = req.body;
    if (!userId || !oldRole || !newRole) {
        return res.status(400).json({ error: 'userId, oldRole, and newRole required' });
    }
    // Validate roles
    if (!VALID_ROLES.includes(newRole)) {
        return res.status(400).json({ error: `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}` });
    }
    try {
        // Check authorization - only admins can change roles
        const currentUserId = req.user?.sub ? Number(req.user.sub) : undefined;
        if (!currentUserId)
            return res.status(401).json({ error: 'Unauthorized' });
        const isUserAdmin = await isAdmin(currentUserId);
        if (!isUserAdmin) {
            return res.status(403).json({ error: 'Only admins can change roles' });
        }
        // Prevent user from changing their own role
        if (currentUserId === Number(userId)) {
            return res.status(403).json({ error: 'You cannot change your own role' });
        }
        // Check if user has the old role
        const existingRole = await prisma_1.default.userRole.findFirst({
            where: {
                userId: Number(userId),
                role: oldRole,
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
        await prisma_1.default.userRole.deleteMany({
            where: {
                userId: Number(userId),
                role: oldRole,
            },
        });
        // Add new role
        const newUserRole = await prisma_1.default.userRole.create({
            data: {
                userId: Number(userId),
                role: newRole,
            },
        });
        // Comprehensive audit logging
        const targetUser = await prisma_1.default.user.findUnique({
            where: { id: Number(userId) },
        });
        await (0, audit_1.createAudit)({
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
    }
    catch (err) {
        console.error('Error changing role:', err);
        return res.status(500).json({ error: err.message });
    }
});
// DELETE /user_roles  body: { userId, role }
// Remove a specific role from a user (Admin only)
router.delete('/', auth_1.authMiddleware, async (req, res) => {
    const { userId, role } = req.body;
    if (!userId || !role)
        return res.status(400).json({ error: 'userId and role required' });
    try {
        // Check authorization - only admins can remove roles
        const currentUserId = req.user?.sub ? Number(req.user.sub) : undefined;
        if (!currentUserId)
            return res.status(401).json({ error: 'Unauthorized' });
        const isUserAdmin = await isAdmin(currentUserId);
        if (!isUserAdmin) {
            return res.status(403).json({ error: 'Only admins can remove roles' });
        }
        // Prevent user from removing their own roles
        if (currentUserId === Number(userId)) {
            return res.status(403).json({ error: 'You cannot remove your own roles' });
        }
        const deleted = await prisma_1.default.userRole.deleteMany({
            where: {
                userId: Number(userId),
                role,
            },
        });
        if (deleted.count === 0) {
            return res.status(400).json({ error: 'Role not found for this user' });
        }
        const performedBy = currentUserId;
        const targetUser = await prisma_1.default.user.findUnique({
            where: { id: Number(userId) },
        });
        await (0, audit_1.createAudit)({
            action: `role_removal`,
            entity_type: 'user_role',
            user_id: performedBy,
            ip_address: req.ip,
        });
        return res.json({
            deleted: deleted.count,
            message: `Role '${role}' removed from user ${targetUser?.email || userId}`,
        });
    }
    catch (err) {
        console.error('Error removing role:', err);
        return res.status(500).json({ error: err.message });
    }
});
exports.default = router;
