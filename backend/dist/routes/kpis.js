"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const prisma_1 = __importDefault(require("../prisma"));
const router = (0, express_1.Router)();
// GET /kpis - List all KPIs
router.get('/', async (req, res) => {
    try {
        const kpis = await prisma_1.default.kpi.findMany({
            include: {
                department: true,
                employeeKpiAssignments: true,
            },
            orderBy: { createdAt: 'desc' },
        });
        return res.json(kpis || []);
    }
    catch (err) {
        console.error('Error fetching KPIs:', err);
        return res.status(500).json({ error: 'Failed to fetch KPIs' });
    }
});
// GET /kpis/:id
router.get('/:id', async (req, res) => {
    try {
        const id = req.params.id;
        const kpi = await prisma_1.default.kpi.findUnique({
            where: { id: parseInt(id) },
            include: {
                department: true,
                employeeKpiAssignments: true,
            },
        });
        if (!kpi) {
            return res.status(404).json({ error: 'KPI not found' });
        }
        return res.json(kpi);
    }
    catch (err) {
        console.error('Error fetching KPI:', err);
        return res.status(500).json({ error: 'Failed to fetch KPI' });
    }
});
// POST /kpis
router.post('/', auth_1.authMiddleware, async (req, res) => {
    try {
        const { name, description, category, measurement_unit, target_value, weight, bsc_category, department_id } = req.body;
        if (!name) {
            return res.status(400).json({ error: 'KPI name is required' });
        }
        const kpi = await prisma_1.default.kpi.create({
            data: {
                name,
                description,
                category,
                measurement_unit,
                target_value: target_value ? parseFloat(target_value) : undefined,
                weight: weight ? parseFloat(weight) : undefined,
                bsc_category,
                department_id: department_id ? parseInt(department_id) : undefined,
            },
        });
        return res.status(201).json(kpi);
    }
    catch (err) {
        console.error('Error creating KPI:', err);
        return res.status(500).json({ error: 'Failed to create KPI' });
    }
});
// PATCH /kpis/:id
router.patch('/:id', auth_1.authMiddleware, async (req, res) => {
    try {
        const id = req.params.id;
        const { name, description, category, measurement_unit, target_value, weight, bsc_category, department_id } = req.body;
        const kpi = await prisma_1.default.kpi.update({
            where: { id: parseInt(id) },
            data: {
                ...(name && { name }),
                ...(description && { description }),
                ...(category && { category }),
                ...(measurement_unit && { measurement_unit }),
                ...(target_value && { target_value: parseFloat(target_value) }),
                ...(weight && { weight: parseFloat(weight) }),
                ...(bsc_category && { bsc_category }),
                ...(department_id && { department_id: parseInt(department_id) }),
            },
        });
        return res.json(kpi);
    }
    catch (err) {
        console.error('Error updating KPI:', err);
        return res.status(500).json({ error: 'Failed to update KPI' });
    }
});
// DELETE /kpis/:id
router.delete('/:id', auth_1.authMiddleware, async (req, res) => {
    try {
        const id = req.params.id;
        await prisma_1.default.kpi.delete({
            where: { id: parseInt(id) },
        });
        return res.json({ ok: true });
    }
    catch (err) {
        console.error('Error deleting KPI:', err);
        return res.status(500).json({ error: 'Failed to delete KPI' });
    }
});
exports.default = router;
