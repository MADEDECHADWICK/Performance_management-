"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const library_1 = require("@prisma/client/runtime/library");
const auth_1 = require("../middleware/auth");
const audit_1 = require("../utils/audit");
const prisma_1 = __importDefault(require("../prisma"));
const router = (0, express_1.Router)();
/**
 * Time Entry Management Routes
 *
 * This implements a role-based costing model where:
 * - billable_amount = hours × employee.position.billing_rate
 * - cost = hours × employee.position.cost_rate
 *
 * Visibility Rules:
 * - Employees: see only their own time entries
 * - Partners: see time entries for jobs they own
 * - HR/Super Admin: see all time entries
 */
// Helper function to get employee role billing and cost rates
async function getEmployeeRates(employeeId) {
    const profile = await prisma_1.default.profile.findUnique({
        where: { id: employeeId },
        include: { role: true },
    });
    if (!profile) {
        throw new Error(`Employee profile not found for ID: ${employeeId}`);
    }
    if (!profile.role) {
        throw new Error(`Employee role not assigned for ID: ${employeeId}`);
    }
    // Return object with billing_rate and cost_rate
    return {
        billing_rate: profile.role.billing_rate,
        cost_rate: profile.cost_rate || 0,
    };
}
// Helper function to check if user can view a time entry
async function canViewTimeEntry(userId, timeEntryId, userRoles) {
    const timeEntry = await prisma_1.default.timeEntry.findUnique({
        where: { id: timeEntryId },
        include: {
            employee: true,
            job: true,
        },
    });
    if (!timeEntry)
        return false;
    // HR and Super Admin can see all
    if (userRoles.includes('hr') || userRoles.includes('super_admin')) {
        return true;
    }
    // Employees can see only their own
    if (timeEntry.employee_id === userId) {
        return true;
    }
    // Partners can see time entries for their jobs
    if (userRoles.includes('partner')) {
        const partnerJob = await prisma_1.default.job.findFirst({
            where: {
                id: timeEntry.job_id,
                partner_id: userId,
            },
        });
        return !!partnerJob;
    }
    return false;
}
// GET /time_entries - List time entries with filters
router.get('/', auth_1.authMiddleware, async (req, res) => {
    try {
        const userId = req.user?.sub ? Number(req.user.sub) : undefined;
        const userRoles = req.user?.roles || [];
        const { job_id, employee_id, status, start_date, end_date } = req.query;
        // Build where clause based on user role
        let whereClause = {};
        if (status) {
            whereClause.status = status;
        }
        if (start_date) {
            whereClause.date_worked = {
                ...whereClause.date_worked,
                gte: new Date(start_date),
            };
        }
        if (end_date) {
            whereClause.date_worked = {
                ...whereClause.date_worked,
                lte: new Date(end_date),
            };
        }
        // Role-based filtering
        if (userRoles.includes('hr') || userRoles.includes('super_admin')) {
            // HR/Super Admin see all (with optional filters)
            if (job_id) {
                whereClause.job_id = parseInt(job_id);
            }
            if (employee_id) {
                whereClause.employee_id = parseInt(employee_id);
            }
        }
        else if (userRoles.includes('partner')) {
            // Partners see time entries for their jobs only
            const partnerJobs = await prisma_1.default.job.findMany({
                where: { partner_id: userId },
                select: { id: true },
            });
            const jobIds = partnerJobs.map((j) => j.id);
            whereClause.job_id = { in: jobIds };
            if (job_id) {
                const jobIdNum = parseInt(job_id);
                if (!jobIds.includes(jobIdNum)) {
                    return res.status(403).json({ error: 'Access denied to this job' });
                }
                whereClause.job_id = jobIdNum;
            }
        }
        else {
            // Employees see only their own time entries
            whereClause.employee_id = userId;
        }
        const timeEntries = await prisma_1.default.timeEntry.findMany({
            where: whereClause,
            include: {
                job: true,
                task: true,
                employee: true,
                approver: true,
            },
            orderBy: { date_worked: 'desc' },
        });
        res.json(timeEntries);
    }
    catch (error) {
        console.error('Error fetching time entries:', error);
        res.status(500).json({ error: 'Failed to fetch time entries' });
    }
});
// GET /time_entries/:id - Get specific time entry
router.get('/:id', auth_1.authMiddleware, async (req, res) => {
    try {
        const userId = req.user?.sub ? Number(req.user.sub) : undefined;
        const userRoles = req.user?.roles || [];
        const { id } = req.params;
        if (!userId) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        const canView = await canViewTimeEntry(userId, parseInt(id), userRoles);
        if (!canView) {
            return res.status(403).json({ error: 'Access denied' });
        }
        const timeEntry = await prisma_1.default.timeEntry.findUnique({
            where: { id: parseInt(id) },
            include: {
                job: true,
                task: true,
                employee: true,
                approver: true,
            },
        });
        if (!timeEntry) {
            return res.status(404).json({ error: 'Time entry not found' });
        }
        res.json(timeEntry);
    }
    catch (error) {
        console.error('Error fetching time entry:', error);
        res.status(500).json({ error: 'Failed to fetch time entry' });
    }
});
// POST /time_entries - Create new time entry
// Automatically calculates billable_amount and cost based on employee position rate
router.post('/', auth_1.authMiddleware, async (req, res) => {
    try {
        const userId = req.user?.sub ? Number(req.user.sub) : undefined;
        const userRoles = req.user?.roles || [];
        const { job_id, task_id, date_worked, start_time, end_time, hours, billable, description } = req.body;
        const performedBy = userId;
        // Validate required fields
        if (!job_id || !date_worked || !hours) {
            return res.status(400).json({
                error: 'job_id, date_worked, and hours are required'
            });
        }
        // Check if user can log time on this job
        const job = await prisma_1.default.job.findUnique({
            where: { id: parseInt(job_id) },
        });
        if (!job) {
            return res.status(404).json({ error: 'Job not found' });
        }
        // Only allow logging time on your own behalf (or HR/Super Admin can log for others)
        const employeeId = req.body.employee_id ? parseInt(req.body.employee_id) : userId;
        if (!employeeId) {
            return res.status(400).json({ error: 'Employee ID is required' });
        }
        if (employeeId !== userId && !userRoles.includes('hr') && !userRoles.includes('super_admin')) {
            return res.status(403).json({ error: 'Cannot log time for other employees' });
        }
        // Get employee role rates for cost calculation
        const rates = await getEmployeeRates(employeeId);
        const hoursDecimal = parseFloat(hours);
        // Calculate billable amount and cost based on role rates
        // Xero Model: billable_amount = hours × role.billing_rate
        const billable_amount = billable !== false
            ? new library_1.Decimal(hoursDecimal).mul(rates.billing_rate)
            : new library_1.Decimal(0);
        // cost = hours × role.cost_rate (used for profit calculation)
        const cost = new library_1.Decimal(hoursDecimal).mul(rates.cost_rate);
        const timeEntry = await prisma_1.default.timeEntry.create({
            data: {
                job_id: parseInt(job_id),
                task_id: task_id ? parseInt(task_id) : null,
                employee_id: employeeId,
                date_worked: new Date(date_worked),
                start_time,
                end_time,
                hours: hoursDecimal,
                billable: billable !== false,
                description,
                billable_amount,
                cost,
                status: 'submitted',
            },
            include: {
                job: true,
                task: true,
                employee: true,
            },
        });
        await (0, audit_1.createAudit)({
            action: `time_entry:${timeEntry.id}:created`,
            entity_type: 'time_entry',
            user_id: performedBy,
            ip_address: req.ip,
        });
        res.status(201).json(timeEntry);
    }
    catch (error) {
        console.error('Error creating time entry:', error);
        res.status(500).json({ error: error.message || 'Failed to create time entry' });
    }
});
// PATCH /time_entries/:id - Update time entry
// Recalculates billable_amount and cost if hours change
router.patch('/:id', auth_1.authMiddleware, async (req, res) => {
    try {
        const userId = req.user?.sub ? Number(req.user.sub) : undefined;
        const userRoles = req.user?.roles || [];
        const { id } = req.params;
        const { hours, billable, description, status } = req.body;
        const performedBy = userId;
        if (!userId) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        // Check access
        const canView = await canViewTimeEntry(userId, parseInt(id), userRoles);
        if (!canView && !userRoles.includes('hr') && !userRoles.includes('super_admin')) {
            return res.status(403).json({ error: 'Access denied' });
        }
        // Can't approve own time entries
        if (status === 'approved' && !userRoles.includes('hr') && !userRoles.includes('super_admin')) {
            return res.status(403).json({ error: 'Only HR/Super Admin can approve time entries' });
        }
        const existingEntry = await prisma_1.default.timeEntry.findUnique({
            where: { id: parseInt(id) },
        });
        if (!existingEntry) {
            return res.status(404).json({ error: 'Time entry not found' });
        }
        // If hours or billable status changes, recalculate costs
        let billable_amount = existingEntry.billable_amount;
        let cost = existingEntry.cost;
        if (hours !== undefined || billable !== undefined) {
            const newHours = hours !== undefined ? parseFloat(hours) : Number(existingEntry.hours);
            const newBillable = billable !== undefined ? billable : existingEntry.billable;
            const rates = await getEmployeeRates(existingEntry.employee_id);
            billable_amount = newBillable ? new library_1.Decimal(newHours).mul(rates.billing_rate) : new library_1.Decimal(0);
            cost = new library_1.Decimal(newHours).mul(rates.cost_rate);
        }
        const updateData = {};
        if (hours !== undefined)
            updateData.hours = parseFloat(hours);
        if (billable !== undefined)
            updateData.billable = billable;
        if (description !== undefined)
            updateData.description = description;
        if (status !== undefined)
            updateData.status = status;
        if (billable_amount !== existingEntry.billable_amount)
            updateData.billable_amount = billable_amount;
        if (cost !== existingEntry.cost)
            updateData.cost = cost;
        if (status === 'approved') {
            updateData.approved_at = new Date();
            updateData.approved_by = performedBy;
        }
        const timeEntry = await prisma_1.default.timeEntry.update({
            where: { id: parseInt(id) },
            data: updateData,
            include: {
                job: true,
                task: true,
                employee: true,
                approver: true,
            },
        });
        await (0, audit_1.createAudit)({
            action: `time_entry:${id}:updated`,
            entity_type: 'time_entry',
            user_id: performedBy,
            ip_address: req.ip,
        });
        res.json(timeEntry);
    }
    catch (error) {
        console.error('Error updating time entry:', error);
        res.status(500).json({ error: error.message || 'Failed to update time entry' });
    }
});
// DELETE /time_entries/:id - Delete time entry
router.delete('/:id', auth_1.authMiddleware, async (req, res) => {
    try {
        const userId = req.user?.sub ? Number(req.user.sub) : undefined;
        const userRoles = req.user?.roles || [];
        const { id } = req.params;
        const performedBy = userId;
        // Only HR/Super Admin or the employee who created it can delete
        const timeEntry = await prisma_1.default.timeEntry.findUnique({
            where: { id: parseInt(id) },
        });
        if (!timeEntry) {
            return res.status(404).json({ error: 'Time entry not found' });
        }
        if (timeEntry.employee_id !== userId &&
            !userRoles.includes('hr') &&
            !userRoles.includes('super_admin')) {
            return res.status(403).json({ error: 'Access denied' });
        }
        await prisma_1.default.timeEntry.delete({
            where: { id: parseInt(id) },
        });
        await (0, audit_1.createAudit)({
            action: `time_entry:${id}:deleted`,
            entity_type: 'time_entry',
            user_id: performedBy,
            ip_address: req.ip,
        });
        res.json({ ok: true });
    }
    catch (error) {
        console.error('Error deleting time entry:', error);
        res.status(500).json({ error: 'Failed to delete time entry' });
    }
});
exports.default = router;
