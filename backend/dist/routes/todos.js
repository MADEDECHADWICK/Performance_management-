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
// GET /todos?userId=
router.get('/', auth_1.authMiddleware, async (req, res) => {
    try {
        const userId = req.query.userId;
        if (!userId) {
            return res.status(400).json({ error: 'userId query parameter required' });
        }
        const todos = await prisma_1.default.todo.findMany({
            where: { user_id: parseInt(userId) },
            orderBy: { createdAt: 'desc' },
        });
        return res.json(todos || []);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// GET /todos/:id
router.get('/:id', auth_1.authMiddleware, async (req, res) => {
    try {
        const todo = await prisma_1.default.todo.findUnique({
            where: { id: parseInt(req.params.id) },
        });
        if (!todo)
            return res.status(404).json({ error: 'Todo not found' });
        return res.json(todo);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// POST /todos
router.post('/', auth_1.authMiddleware, async (req, res) => {
    try {
        const { user_id, title, description, priority, due_date } = req.body;
        if (!user_id || !title) {
            return res.status(400).json({ error: 'user_id and title required' });
        }
        const todo = await prisma_1.default.todo.create({
            data: {
                user_id: parseInt(user_id),
                title,
                description,
                priority,
                due_date: due_date ? new Date(due_date) : undefined,
                status: 'pending',
            },
        });
        const performedBy = req.user?.sub ? Number(req.user.sub) : undefined;
        await (0, audit_1.createAudit)({
            action: 'todo:create',
            entity_type: 'todo',
            user_id: performedBy,
            ip_address: req.ip,
        });
        return res.status(201).json(todo);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// PATCH /todos/:id { status }
router.patch('/:id', auth_1.authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        if (!status) {
            return res.status(400).json({ error: 'status required' });
        }
        const todo = await prisma_1.default.todo.update({
            where: { id: parseInt(id) },
            data: {
                status,
                completed_at: status === 'completed' ? new Date() : null,
            },
        });
        const performedBy = req.user?.sub ? Number(req.user.sub) : undefined;
        await (0, audit_1.createAudit)({
            action: `todo:update:status->${status}`,
            entity_type: 'todo',
            user_id: performedBy,
            ip_address: req.ip,
        });
        return res.json(todo);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// PATCH /todos/:id/notes { description }
router.patch('/:id/notes', auth_1.authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { description } = req.body;
        const todo = await prisma_1.default.todo.update({
            where: { id: parseInt(id) },
            data: { description },
        });
        const performedBy = req.user?.sub ? Number(req.user.sub) : undefined;
        await (0, audit_1.createAudit)({
            action: 'todo:update:notes',
            entity_type: 'todo',
            user_id: performedBy,
            ip_address: req.ip,
        });
        return res.json(todo);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// DELETE /todos/:id
router.delete('/:id', auth_1.authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        await prisma_1.default.todo.delete({
            where: { id: parseInt(id) },
        });
        const performedBy = req.user?.sub ? Number(req.user.sub) : undefined;
        await (0, audit_1.createAudit)({
            action: 'todo:delete',
            entity_type: 'todo',
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
