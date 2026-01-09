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
            error: 'Access denied. Only HR, HR Manager, and Super Admin can manage employee roles'
        });
    }
    next();
};
// GET /employees - List all employees with their current roles
router.get('/', auth_1.authMiddleware, requireHROrAdmin, async (req, res) => {
    try {
        const employees = await prisma_1.default.profile.findMany({
            include: {
                role: true,
                user: {
                    select: { email: true },
                },
            },
            orderBy: { first_name: 'asc' },
        });
        res.json(employees);
    }
    catch (error) {
        console.error('Error fetching employees:', error);
        res.status(500).json({ error: 'Failed to fetch employees' });
    }
});
// GET /employees/:employeeId - Get single employee with role
router.get('/:employeeId', auth_1.authMiddleware, requireHROrAdmin, async (req, res) => {
    try {
        const { employeeId } = req.params;
        const employee = await prisma_1.default.profile.findUnique({
            where: { id: parseInt(employeeId) },
            include: {
                role: true,
                user: {
                    select: { email: true },
                },
            },
        });
        if (!employee) {
            return res.status(404).json({ error: 'Employee not found' });
        }
        res.json(employee);
    }
    catch (error) {
        console.error('Error fetching employee:', error);
        res.status(500).json({ error: 'Failed to fetch employee' });
    }
});
// PUT /employees/:employeeId/role - Assign/update employee role
router.put('/:employeeId/role', auth_1.authMiddleware, requireHROrAdmin, async (req, res) => {
    try {
        const { employeeId } = req.params;
        const { role_id, notes } = req.body;
        // Validate inputs
        if (!role_id || typeof role_id !== 'number') {
            return res.status(400).json({ error: 'Valid role_id is required' });
        }
        // Check if employee exists
        const employee = await prisma_1.default.profile.findUnique({
            where: { id: parseInt(employeeId) },
            include: { role: true },
        });
        if (!employee) {
            return res.status(404).json({ error: 'Employee not found' });
        }
        // Check if new role exists
        const newRole = await prisma_1.default.role.findUnique({
            where: { id: role_id },
        });
        if (!newRole) {
            return res.status(404).json({ error: 'Role not found' });
        }
        if (!newRole.is_active) {
            return res.status(400).json({ error: 'Cannot assign an inactive role' });
        }
        // Store old role name for audit
        const oldRoleName = employee.role?.name || 'None';
        // Update employee role
        const updated = await prisma_1.default.profile.update({
            where: { id: parseInt(employeeId) },
            data: { role_id },
            include: { role: true },
        });
        // Audit log
        await (0, audit_1.createAudit)({
            user_id: req.user?.sub,
            action: 'EMPLOYEE_ROLE_ASSIGNED',
            entity_type: 'Profile',
        });
        res.json({
            message: 'Employee role updated successfully',
            employee: updated,
        });
    }
    catch (error) {
        console.error('Error updating employee role:', error);
        res.status(500).json({ error: 'Failed to update employee role' });
    }
});
// GET /employees/:employeeId/role-history - Get role change history (optional, for audit trail)
router.get('/:employeeId/role-history', auth_1.authMiddleware, requireHROrAdmin, async (req, res) => {
    try {
        const { employeeId } = req.params;
        // Check if employee exists
        const employee = await prisma_1.default.profile.findUnique({
            where: { id: parseInt(employeeId) },
        });
        if (!employee) {
            return res.status(404).json({ error: 'Employee not found' });
        }
        // Get audit logs for this employee
        const history = await prisma_1.default.auditLog.findMany({
            where: {
                entityType: 'Profile',
                action: 'EMPLOYEE_ROLE_ASSIGNED',
            },
            orderBy: { createdAt: 'desc' },
            take: 50,
        });
        res.json(history);
    }
    catch (error) {
        console.error('Error fetching role history:', error);
        res.status(500).json({ error: 'Failed to fetch role history' });
    }
});
exports.default = router;
