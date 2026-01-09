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
// GET /employee_kpi_assignments
router.get('/', auth_1.authMiddleware, async (req, res) => {
    try {
        const assignments = await prisma_1.default.employeeKpiAssignment.findMany({
            include: {
                employee: true,
                kpi: true,
            },
            orderBy: { createdAt: 'desc' },
        });
        return res.json(assignments || []);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// GET /employee_kpi_assignments/:id
router.get('/:id', auth_1.authMiddleware, async (req, res) => {
    try {
        const assignment = await prisma_1.default.employeeKpiAssignment.findUnique({
            where: { id: parseInt(req.params.id) },
            include: {
                employee: true,
                kpi: true,
            },
        });
        if (!assignment) {
            return res.status(404).json({ error: 'KPI assignment not found' });
        }
        return res.json(assignment);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// POST /employee_kpi_assignments
router.post('/', auth_1.authMiddleware, async (req, res) => {
    try {
        const { employee_id, kpi_id, target_value, weight_percentage, due_date } = req.body;
        if (!employee_id || !kpi_id) {
            return res.status(400).json({ error: 'employee_id and kpi_id required' });
        }
        const assignment = await prisma_1.default.employeeKpiAssignment.create({
            data: {
                employee_id: parseInt(employee_id),
                kpi_id: kpi_id ? parseInt(kpi_id) : undefined,
                target_value: target_value ? parseFloat(target_value) : undefined,
                weight: weight_percentage ? parseFloat(weight_percentage) : undefined,
            },
            include: {
                employee: true,
                kpi: true,
            },
        });
        const performedBy = req.user?.sub ? Number(req.user.sub) : undefined;
        await (0, audit_1.createAudit)({
            action: 'employee_kpi_assignment:create',
            entity_type: 'employee_kpi_assignment',
            user_id: performedBy,
            ip_address: req.ip,
        });
        return res.status(201).json(assignment);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// PATCH /employee_kpi_assignments/:id
router.patch('/:id', auth_1.authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { target_value, weight_percentage, due_date, status } = req.body;
        const assignment = await prisma_1.default.employeeKpiAssignment.update({
            where: { id: parseInt(id) },
            data: {
                target_value: target_value ? parseFloat(target_value) : undefined,
                weight: weight_percentage ? parseFloat(weight_percentage) : undefined,
                status,
            },
            include: {
                employee: true,
                kpi: true,
            },
        });
        const performedBy = req.user?.sub ? Number(req.user.sub) : undefined;
        await (0, audit_1.createAudit)({
            action: 'employee_kpi_assignment:update',
            entity_type: 'employee_kpi_assignment',
            user_id: performedBy,
            ip_address: req.ip,
        });
        return res.json(assignment);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// DELETE /employee_kpi_assignments/:id
router.delete('/:id', auth_1.authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        await prisma_1.default.employeeKpiAssignment.delete({
            where: { id: parseInt(id) },
        });
        const performedBy = req.user?.sub ? Number(req.user.sub) : undefined;
        await (0, audit_1.createAudit)({
            action: 'employee_kpi_assignment:delete',
            entity_type: 'employee_kpi_assignment',
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
