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
// GET /employee_goals?employee_id=...
router.get('/', auth_1.authMiddleware, async (req, res) => {
    try {
        const employeeId = req.query.employee_id;
        if (!employeeId) {
            return res.status(400).json({ error: 'employee_id query parameter required' });
        }
        const goals = await prisma_1.default.employeeGoal.findMany({
            where: { employee_id: parseInt(employeeId) },
            include: { kpi: true },
            orderBy: { createdAt: 'desc' },
        });
        return res.json(goals || []);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// GET /employee_goals/:id
router.get('/:id', auth_1.authMiddleware, async (req, res) => {
    try {
        const goal = await prisma_1.default.employeeGoal.findUnique({
            where: { id: parseInt(req.params.id) },
            include: { kpi: true },
        });
        if (!goal)
            return res.status(404).json({ error: 'Goal not found' });
        return res.json(goal);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// POST /employee_goals
router.post('/', auth_1.authMiddleware, async (req, res) => {
    try {
        const { employee_id, goal_title, description, category, target_date, kpi_id } = req.body;
        if (!employee_id || !goal_title) {
            return res.status(400).json({ error: 'employee_id and goal_title required' });
        }
        const goal = await prisma_1.default.employeeGoal.create({
            data: {
                employee_id: parseInt(employee_id),
                goal_title,
                description,
                category,
                target_date: target_date ? new Date(target_date) : undefined,
                kpi_id: kpi_id ? parseInt(kpi_id) : undefined,
                status: 'in_progress',
                progress_percentage: 0,
            },
            include: { kpi: true },
        });
        const performedBy = req.user?.sub ? Number(req.user.sub) : undefined;
        await (0, audit_1.createAudit)({
            action: 'employee_goal:create',
            entity_type: 'employee_goal',
            user_id: performedBy,
            ip_address: req.ip,
        });
        return res.status(201).json(goal);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// PATCH /employee_goals/:id
router.patch('/:id', auth_1.authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { status, progress_percentage, description } = req.body;
        const goal = await prisma_1.default.employeeGoal.update({
            where: { id: parseInt(id) },
            data: {
                status,
                progress_percentage: progress_percentage !== undefined ? progress_percentage : undefined,
                description,
            },
            include: { kpi: true },
        });
        const performedBy = req.user?.sub ? Number(req.user.sub) : undefined;
        await (0, audit_1.createAudit)({
            action: 'employee_goal:update',
            entity_type: 'employee_goal',
            user_id: performedBy,
            ip_address: req.ip,
        });
        return res.json(goal);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// DELETE /employee_goals/:id
router.delete('/:id', auth_1.authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        await prisma_1.default.employeeGoal.delete({
            where: { id: parseInt(id) },
        });
        const performedBy = req.user?.sub ? Number(req.user.sub) : undefined;
        await (0, audit_1.createAudit)({
            action: 'employee_goal:delete',
            entity_type: 'employee_goal',
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
// POST /employee_goals
router.post('/', auth_1.authMiddleware, async (req, res) => {
    try {
        const { employee_id, cycle_id, kpi_id, goal_title, goal_description, target_value } = req.body;
        if (!employee_id || !goal_title)
            return res.status(400).json({ error: 'Missing required fields' });
        const created = await prisma_1.default.$queryRaw `
      INSERT INTO employee_goals (employee_id, kpi_id, goal_title, description, status, created_at)
      VALUES (${employee_id}::uuid, ${kpi_id ? `${kpi_id}::uuid` : null}, ${goal_title}, ${goal_description || null}, 'in_progress', now())
      RETURNING *`;
        const performedBy = req.user?.sub ? Number(req.user.sub) : undefined;
        await (0, audit_1.createAudit)({ action: `create_goal:${goal_title}`, entity_type: 'employee_goal', user_id: performedBy, ip_address: req.ip });
        return res.status(201).json(created[0] ?? null);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
