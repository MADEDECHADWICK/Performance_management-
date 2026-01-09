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
// Middleware: Check if user is HR/Admin/SuperAdmin
const requireHROrAdmin = (req, res, next) => {
    const userRoles = req.user?.roles || [];
    const isHROrAdmin = userRoles.includes('super_admin') ||
        userRoles.includes('hr_manager') ||
        userRoles.includes('hr');
    if (!isHROrAdmin) {
        return res.status(403).json({
            error: 'Access denied. Only HR, HR Manager, and Super Admin can manage roles'
        });
    }
    next();
};
// GET /roles - List all active roles
router.get('/', auth_1.authMiddleware, async (req, res) => {
    try {
        const roles = await prisma_1.default.role.findMany({
            where: { is_active: true },
            orderBy: { name: 'asc' },
        });
        res.json(roles);
    }
    catch (error) {
        console.error('Error fetching roles:', error);
        res.status(500).json({ error: 'Failed to fetch roles' });
    }
});
// GET /roles/:id - Get single role
router.get('/:id', auth_1.authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const role = await prisma_1.default.role.findUnique({
            where: { id: parseInt(id) },
        });
        if (!role) {
            return res.status(404).json({ error: 'Role not found' });
        }
        res.json(role);
    }
    catch (error) {
        console.error('Error fetching role:', error);
        res.status(500).json({ error: 'Failed to fetch role' });
    }
});
// POST /roles - Create new role
router.post('/', auth_1.authMiddleware, requireHROrAdmin, async (req, res) => {
    try {
        const { name, billing_rate, permissions, description, is_active } = req.body;
        // Validation
        if (!name || typeof name !== 'string') {
            return res.status(400).json({ error: 'Role name is required' });
        }
        if (typeof billing_rate !== 'number' || billing_rate < 0) {
            return res.status(400).json({ error: 'Billing rate must be a positive number' });
        }
        // Check if role already exists
        const existing = await prisma_1.default.role.findUnique({ where: { name } });
        if (existing) {
            return res.status(409).json({ error: 'Role already exists' });
        }
        const role = await prisma_1.default.role.create({
            data: {
                name,
                billing_rate,
                permissions: permissions || [],
                description: description || null,
                is_active: is_active ?? true,
            },
        });
        // Audit log
        await (0, audit_1.createAudit)({
            user_id: req.user?.sub,
            action: 'ROLE_CREATED',
            entity_type: 'Role',
        });
        res.status(201).json(role);
    }
    catch (error) {
        console.error('Error creating role:', error);
        res.status(500).json({ error: 'Failed to create role' });
    }
});
// PUT /roles/:id - Update role
router.put('/:id', auth_1.authMiddleware, requireHROrAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { name, billing_rate, permissions, description, is_active } = req.body;
        // Check if role exists
        const role = await prisma_1.default.role.findUnique({
            where: { id: parseInt(id) },
        });
        if (!role) {
            return res.status(404).json({ error: 'Role not found' });
        }
        // Prepare update data
        const updateData = {};
        if (name)
            updateData.name = name;
        if (typeof billing_rate === 'number')
            updateData.billing_rate = billing_rate;
        if (permissions)
            updateData.permissions = permissions;
        if (description)
            updateData.description = description;
        if (typeof is_active === 'boolean')
            updateData.is_active = is_active;
        const updated = await prisma_1.default.role.update({
            where: { id: parseInt(id) },
            data: updateData,
        });
        // Audit log
        await (0, audit_1.createAudit)({
            user_id: req.user?.sub,
            action: 'ROLE_UPDATED',
            entity_type: 'Role',
        });
        res.json(updated);
    }
    catch (error) {
        console.error('Error updating role:', error);
        res.status(500).json({ error: 'Failed to update role' });
    }
});
// DELETE /roles/:id - Deactivate role (soft delete)
router.delete('/:id', auth_1.authMiddleware, requireHROrAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        // Check if role exists
        const role = await prisma_1.default.role.findUnique({
            where: { id: parseInt(id) },
        });
        if (!role) {
            return res.status(404).json({ error: 'Role not found' });
        }
        // Check if role is in use
        const profileCount = await prisma_1.default.profile.count({
            where: { role_id: parseInt(id) },
        });
        if (profileCount > 0) {
            return res.status(409).json({
                error: `Cannot delete role. ${profileCount} employee(s) are assigned to this role.`
            });
        }
        // Soft delete - just deactivate
        const updated = await prisma_1.default.role.update({
            where: { id: parseInt(id) },
            data: { is_active: false },
        });
        // Audit log
        await (0, audit_1.createAudit)({
            user_id: req.user?.sub,
            action: 'ROLE_DEACTIVATED',
            entity_type: 'Role',
        });
        res.json({ message: 'Role deactivated successfully', role: updated });
    }
    catch (error) {
        console.error('Error deleting role:', error);
        res.status(500).json({ error: 'Failed to delete role' });
    }
});
exports.default = router;
