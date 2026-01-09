"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = __importDefault(require("../prisma"));
const router = (0, express_1.Router)();
// GET /employee_evaluations?employee_id=3 or ?employee_ids=1,2,3
router.get('/', async (req, res) => {
    try {
        const { employee_id, employee_ids } = req.query;
        let ids = [];
        if (employee_id) {
            ids = [parseInt(employee_id)];
        }
        else if (employee_ids) {
            ids = employee_ids.split(',').map(id => parseInt(id.trim()));
        }
        const evaluations = await prisma_1.default.employeeEvaluation.findMany({
            where: ids.length > 0 ? { employee_id: { in: ids } } : undefined,
            include: {
                employee: true,
                evaluationCycle: true,
            },
        });
        return res.json(evaluations);
    }
    catch (err) {
        console.error('Error in employee_evaluations:', err);
        return res.status(500).json({ error: 'Failed to fetch employee evaluations' });
    }
});
// GET /employee_evaluations/:id
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const evaluation = await prisma_1.default.employeeEvaluation.findUnique({
            where: { id: parseInt(id) },
            include: {
                employee: true,
                evaluationCycle: true,
            },
        });
        if (!evaluation) {
            return res.status(404).json({ error: 'Evaluation not found' });
        }
        return res.json(evaluation);
    }
    catch (err) {
        console.error('Error fetching employee evaluation:', err);
        return res.status(500).json({ error: 'Failed to fetch employee evaluation' });
    }
});
exports.default = router;
