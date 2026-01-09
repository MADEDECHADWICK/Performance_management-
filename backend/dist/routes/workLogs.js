"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const prisma_1 = __importDefault(require("../prisma"));
const audit_1 = require("../utils/audit");
const router = (0, express_1.Router)();
// GET /work_logs?employeeId=&limit=
router.get('/', auth_1.authMiddleware, async (req, res) => {
    try {
        const employeeId = req.query.employeeId;
        const limit = parseInt(req.query.limit) || 50;
        if (!employeeId) {
            return res.status(400).json({ error: 'employeeId query parameter required' });
        }
        const workLogs = await prisma_1.default.workLog.findMany({
            where: { employee_id: parseInt(employeeId) },
            include: {
                employee: true,
                project: true,
            },
            orderBy: { work_date: 'desc' },
            take: limit,
        });
        return res.json(workLogs || []);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// GET /work_logs/:id
router.get('/:id', auth_1.authMiddleware, async (req, res) => {
    try {
        const workLog = await prisma_1.default.workLog.findUnique({
            where: { id: parseInt(req.params.id) },
            include: {
                employee: true,
                project: true,
            },
        });
        if (!workLog) {
            return res.status(404).json({ error: 'Work log not found' });
        }
        return res.json(workLog);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// POST /work_logs
router.post('/', auth_1.authMiddleware, async (req, res) => {
    try {
        const { employee_id, project_id, work_date, hours_worked, billable_hours, description, task_type, is_overtime } = req.body;
        if (!employee_id || !work_date || !hours_worked) {
            return res.status(400).json({ error: 'employee_id, work_date, and hours_worked required' });
        }
        const workLog = await prisma_1.default.workLog.create({
            data: {
                employee_id: parseInt(employee_id),
                project_id: project_id ? parseInt(project_id) : undefined,
                work_date: new Date(work_date),
                hours_worked: parseFloat(hours_worked),
                billable_hours: billable_hours ? parseFloat(billable_hours) : parseFloat(hours_worked),
                description,
                task_type,
                is_overtime: is_overtime || false,
            },
        });
        const performedBy = req.user?.sub ? Number(req.user.sub) : undefined;
        await (0, audit_1.createAudit)({
            action: 'work_log:create',
            entity_type: 'work_log',
            user_id: performedBy,
            ip_address: req.ip,
        });
        return res.status(201).json(workLog);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// PATCH /work_logs/:id
router.patch('/:id', auth_1.authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { hours_worked, billable_hours, description, is_overtime } = req.body;
        const workLog = await prisma_1.default.workLog.update({
            where: { id: parseInt(id) },
            data: {
                hours_worked: hours_worked ? parseFloat(hours_worked) : undefined,
                billable_hours: billable_hours ? parseFloat(billable_hours) : undefined,
                description,
                is_overtime,
            },
        });
        const performedBy = req.user?.sub ? Number(req.user.sub) : undefined;
        await (0, audit_1.createAudit)({
            action: 'work_log:update',
            entity_type: 'work_log',
            user_id: performedBy,
            ip_address: req.ip,
        });
        return res.json(workLog);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// DELETE /work_logs/:id
router.delete('/:id', auth_1.authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        await prisma_1.default.workLog.delete({
            where: { id: parseInt(id) },
        });
        const performedBy = req.user?.sub ? Number(req.user.sub) : undefined;
        await (0, audit_1.createAudit)({
            action: 'work_log:delete',
            entity_type: 'work_log',
            user_id: performedBy,
            ip_address: req.ip,
        });
        return res.json({ ok: true });
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
exports.default = router;
