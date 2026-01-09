"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const library_1 = require("@prisma/client/runtime/library");
const prisma_1 = __importDefault(require("../prisma"));
const auth_1 = require("../middleware/auth");
const audit_1 = require("../utils/audit");
const router = (0, express_1.Router)();
// GET /jobs/:jobId/staff - Get all staff assigned to a job
router.get('/job/:jobId/staff', auth_1.authMiddleware, async (req, res) => {
    try {
        const { jobId } = req.params;
        // Verify job exists and user has access
        const job = await prisma_1.default.job.findUnique({
            where: { id: parseInt(jobId) },
        });
        if (!job) {
            return res.status(404).json({ error: 'Job not found' });
        }
        // Authorization check
        const userRoles = req.user?.roles || [];
        const isAdmin = userRoles.includes('super_admin') || userRoles.includes('hr_manager') || userRoles.includes('hr');
        const isPartner = userRoles.includes('partner');
        if (!isAdmin && (!isPartner || job.partner_id !== req.user?.sub)) {
            return res.status(403).json({ error: 'Access denied' });
        }
        // Get assigned staff
        const assignments = await prisma_1.default.jobStaffAssignment.findMany({
            where: { job_id: parseInt(jobId) },
            include: {
                employee: {
                    select: {
                        id: true,
                        first_name: true,
                        last_name: true,
                        email: true,
                    },
                },
                assigned_role: true,
            },
            orderBy: { assigned_at: 'asc' },
        });
        res.json(assignments);
    }
    catch (error) {
        console.error('Error fetching job staff:', error);
        res.status(500).json({ error: 'Failed to fetch job staff' });
    }
});
// POST /:jobId/staff - Assign employee to job (Frontend expects this path, mounted at /jobs)
router.post('/:jobId/staff', auth_1.authMiddleware, async (req, res) => {
    try {
        const { jobId } = req.params;
        const { employee_id, assigned_role_id, assigned_hourly_rate } = req.body;
        // Validation
        if (!employee_id) {
            return res.status(400).json({ error: 'Valid employee_id is required' });
        }
        // Verify job exists
        const job = await prisma_1.default.job.findUnique({
            where: { id: parseInt(jobId) },
        });
        if (!job) {
            return res.status(404).json({ error: 'Job not found' });
        }
        // Authorization check - only admins or job partner can assign staff
        const userRoles = req.user?.authRoles || req.user?.roles || [];
        const isAdmin = userRoles.includes('super_admin') || userRoles.includes('hr_manager') || userRoles.includes('hr');
        const isPartner = userRoles.includes('partner');
        if (!isAdmin && (!isPartner || job.partner_id !== req.user?.sub)) {
            return res.status(403).json({
                error: 'Access denied. Only admins and job partners can assign staff.'
            });
        }
        // Verify employee exists
        const employee = await prisma_1.default.profile.findUnique({
            where: { id: parseInt(employee_id) },
            include: { role: true },
        });
        if (!employee) {
            return res.status(404).json({ error: 'Employee not found' });
        }
        // Get the role
        const role = assigned_role_id
            ? await prisma_1.default.role.findUnique({ where: { id: parseInt(assigned_role_id) } })
            : employee.role;
        if (!role) {
            return res.status(400).json({
                error: 'Employee must have a role assigned.'
            });
        }
        // Check if already assigned
        const existing = await prisma_1.default.jobStaffAssignment.findUnique({
            where: {
                job_id_employee_id: {
                    job_id: parseInt(jobId),
                    employee_id: parseInt(employee_id),
                },
            },
        });
        if (existing) {
            return res.status(409).json({
                error: 'Employee is already assigned to this job'
            });
        }
        // Create assignment with role snapshot
        const assignment = await prisma_1.default.jobStaffAssignment.create({
            data: {
                job_id: parseInt(jobId),
                employee_id: parseInt(employee_id),
                assigned_role_id: role.id,
                assigned_hourly_rate: new library_1.Decimal(assigned_hourly_rate || role.billing_rate),
                role_snapshot: {
                    name: role.name,
                    billing_rate: role.billing_rate,
                    created_at: new Date().toISOString(),
                },
            },
            include: {
                employee: {
                    select: {
                        id: true,
                        first_name: true,
                        last_name: true,
                        email: true,
                    },
                },
                assigned_role: true,
            },
        });
        // Audit log
        await (0, audit_1.createAudit)({
            user_id: req.user?.sub,
            action: 'STAFF_ASSIGNED_TO_JOB',
            entity_type: 'JobStaffAssignment',
        });
        res.status(201).json(assignment);
    }
    catch (error) {
        console.error('Error assigning staff:', error);
        res.status(500).json({ error: error.message || 'Failed to assign staff to job' });
    }
});
// POST /jobs/:jobId/assign-staff - Assign employee to job
router.post('/job/:jobId/assign-staff', auth_1.authMiddleware, async (req, res) => {
    try {
        const { jobId } = req.params;
        const { employee_id } = req.body;
        // Validation
        if (!employee_id || typeof employee_id !== 'number') {
            return res.status(400).json({ error: 'Valid employee_id is required' });
        }
        // Verify job exists
        const job = await prisma_1.default.job.findUnique({
            where: { id: parseInt(jobId) },
        });
        if (!job) {
            return res.status(404).json({ error: 'Job not found' });
        }
        // Authorization check - only admins or job partner can assign staff
        const userRoles = req.user?.roles || [];
        const isAdmin = userRoles.includes('super_admin') || userRoles.includes('hr_manager') || userRoles.includes('hr');
        const isPartner = userRoles.includes('partner');
        if (!isAdmin && (!isPartner || job.partner_id !== req.user?.sub)) {
            return res.status(403).json({
                error: 'Access denied. Only admins and job partners can assign staff.'
            });
        }
        // Verify employee exists and has a role
        const employee = await prisma_1.default.profile.findUnique({
            where: { id: employee_id },
            include: { role: true },
        });
        if (!employee) {
            return res.status(404).json({ error: 'Employee not found' });
        }
        if (!employee.role_id || !employee.role) {
            return res.status(400).json({
                error: 'Employee must be assigned a role before being added to a job.'
            });
        }
        // Check if already assigned
        const existing = await prisma_1.default.jobStaffAssignment.findUnique({
            where: {
                job_id_employee_id: {
                    job_id: parseInt(jobId),
                    employee_id,
                },
            },
        });
        if (existing) {
            return res.status(409).json({
                error: 'Employee is already assigned to this job'
            });
        }
        // Create assignment with role snapshot
        const assignment = await prisma_1.default.jobStaffAssignment.create({
            data: {
                job_id: parseInt(jobId),
                employee_id,
                assigned_role_id: employee.role.id,
                assigned_hourly_rate: new library_1.Decimal(employee.role.billing_rate),
                role_snapshot: {
                    name: employee.role.name,
                    billing_rate: employee.role.billing_rate,
                    created_at: new Date().toISOString(),
                },
            },
            include: {
                employee: {
                    select: {
                        id: true,
                        first_name: true,
                        last_name: true,
                        email: true,
                    },
                },
                assigned_role: true,
            },
        });
        // Audit log
        await (0, audit_1.createAudit)({
            user_id: req.user?.sub,
            action: 'STAFF_ASSIGNED_TO_JOB',
            entity_type: 'JobStaffAssignment',
        });
        res.status(201).json(assignment);
    }
    catch (error) {
        console.error('Error assigning staff:', error);
        res.status(500).json({ error: 'Failed to assign staff to job' });
    }
});
// DELETE /jobs/:jobId/staff/:employeeId - Remove staff from job
router.delete('/job/:jobId/staff/:employeeId', auth_1.authMiddleware, async (req, res) => {
    try {
        const { jobId, employeeId } = req.params;
        // Verify job exists
        const job = await prisma_1.default.job.findUnique({
            where: { id: parseInt(jobId) },
        });
        if (!job) {
            return res.status(404).json({ error: 'Job not found' });
        }
        // Authorization check
        const userRoles = req.user?.roles || [];
        const isAdmin = userRoles.includes('super_admin') || userRoles.includes('hr_manager') || userRoles.includes('hr');
        const isPartner = userRoles.includes('partner');
        if (!isAdmin && (!isPartner || job.partner_id !== req.user?.sub)) {
            return res.status(403).json({
                error: 'Access denied. Only admins and job partners can remove staff.'
            });
        }
        // Verify assignment exists
        const assignment = await prisma_1.default.jobStaffAssignment.findUnique({
            where: {
                job_id_employee_id: {
                    job_id: parseInt(jobId),
                    employee_id: parseInt(employeeId),
                },
            },
            include: { employee: true },
        });
        if (!assignment) {
            return res.status(404).json({ error: 'Staff assignment not found' });
        }
        // Delete assignment
        await prisma_1.default.jobStaffAssignment.delete({
            where: {
                job_id_employee_id: {
                    job_id: parseInt(jobId),
                    employee_id: parseInt(employeeId),
                },
            },
        });
        // Audit log
        await (0, audit_1.createAudit)({
            user_id: req.user?.sub,
            action: 'STAFF_REMOVED_FROM_JOB',
            entity_type: 'JobStaffAssignment',
        });
        res.json({ message: 'Staff removed from job successfully' });
    }
    catch (error) {
        console.error('Error removing staff:', error);
        res.status(500).json({ error: 'Failed to remove staff from job' });
    }
});
exports.default = router;
