"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const prisma_1 = __importDefault(require("../prisma"));
const router = (0, express_1.Router)();
// GET /evaluation_cycles?status=active
router.get('/', async (req, res) => {
    try {
        const { status } = req.query;
        const cycles = await prisma_1.default.evaluationCycle.findMany({
            where: status ? { status: status } : undefined,
            include: {
                employeeEvaluations: true,
                peerEvaluations: true,
                upwardEvaluations: true,
            },
        });
        return res.json(cycles);
    }
    catch (err) {
        console.error('Error fetching evaluation cycles:', err);
        return res.status(500).json({ error: 'Failed to fetch evaluation cycles' });
    }
});
// GET /evaluation_cycles/:id
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const cycle = await prisma_1.default.evaluationCycle.findUnique({
            where: { id: parseInt(id) },
            include: {
                employeeEvaluations: true,
                peerEvaluations: true,
                upwardEvaluations: true,
            },
        });
        if (!cycle) {
            return res.status(404).json({ error: 'Evaluation cycle not found' });
        }
        return res.json(cycle);
    }
    catch (err) {
        console.error('Error fetching evaluation cycle:', err);
        return res.status(500).json({ error: 'Failed to fetch evaluation cycle' });
    }
});
// POST /evaluation_cycles
router.post('/', auth_1.authMiddleware, async (req, res) => {
    try {
        const { cycle_name, description, start_date, end_date, status } = req.body;
        const userId = req.user?.sub ? Number(req.user.sub) : undefined;
        if (!cycle_name || !start_date || !end_date) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        const cycle = await prisma_1.default.evaluationCycle.create({
            data: {
                cycle_name,
                description,
                start_date: new Date(start_date),
                end_date: new Date(end_date),
                status: status || 'draft',
                created_by: userId,
            },
        });
        return res.status(201).json(cycle);
    }
    catch (err) {
        console.error('Error creating evaluation cycle:', err);
        return res.status(500).json({ error: 'Failed to create evaluation cycle' });
    }
});
// PATCH /evaluation_cycles/:id
router.patch('/:id', auth_1.authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { cycle_name, description, start_date, end_date, status } = req.body;
        const cycle = await prisma_1.default.evaluationCycle.update({
            where: { id: parseInt(id) },
            data: {
                ...(cycle_name && { cycle_name }),
                ...(description && { description }),
                ...(start_date && { start_date: new Date(start_date) }),
                ...(end_date && { end_date: new Date(end_date) }),
                ...(status && { status }),
            },
        });
        return res.json(cycle);
    }
    catch (err) {
        console.error('Error updating evaluation cycle:', err);
        return res.status(500).json({ error: 'Failed to update evaluation cycle' });
    }
});
// DELETE /evaluation_cycles/:id
router.delete('/:id', auth_1.authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        await prisma_1.default.evaluationCycle.delete({
            where: { id: parseInt(id) },
        });
        return res.json({ ok: true });
    }
    catch (err) {
        console.error('Error deleting evaluation cycle:', err);
        return res.status(500).json({ error: 'Failed to delete evaluation cycle' });
    }
});
exports.default = router;
