"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const prisma_1 = __importDefault(require("../prisma"));
const router = (0, express_1.Router)();
// GET /upward_evaluations?evaluatorId= or ?evaluateeId=
router.get('/', auth_1.authMiddleware, async (req, res) => {
    try {
        const evaluatorId = req.query.evaluatorId;
        const evaluateeId = req.query.evaluateeId;
        const where = {};
        if (evaluatorId) {
            where.manager_id = parseInt(evaluatorId);
        }
        if (evaluateeId) {
            where.employee_id = parseInt(evaluateeId);
        }
        const evaluations = await prisma_1.default.upwardEvaluation.findMany({
            where: Object.keys(where).length > 0 ? where : undefined,
            orderBy: { createdAt: 'desc' },
        });
        return res.json(evaluations || []);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// GET /upward_evaluations/:id
router.get('/:id', auth_1.authMiddleware, async (req, res) => {
    try {
        const evaluation = await prisma_1.default.upwardEvaluation.findUnique({
            where: { id: parseInt(req.params.id) },
        });
        if (!evaluation) {
            return res.status(404).json({ error: 'Upward evaluation not found' });
        }
        return res.json(evaluation);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
exports.default = router;
