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
// GET /evaluation_result_areas?ad_hoc_evaluation_id=xxx
router.get('/', async (req, res) => {
    try {
        const { ad_hoc_evaluation_id, fields } = req.query;
        let query = 'SELECT * FROM evaluation_result_areas';
        const params = [];
        if (ad_hoc_evaluation_id) {
            query += ' WHERE ad_hoc_evaluation_id = $1';
            params.push(ad_hoc_evaluation_id);
        }
        query += ' ORDER BY "createdAt" DESC';
        const rows = await prisma_1.default.$queryRawUnsafe(query, ...params);
        return res.json(rows || []);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// POST /evaluation_result_areas - Batch insert KPIs
router.post('/', auth_1.authMiddleware, async (req, res) => {
    try {
        const { kpis } = req.body;
        if (!kpis || !Array.isArray(kpis) || kpis.length === 0) {
            return res.status(400).json({ error: 'kpis array required' });
        }
        const created = [];
        for (const kpi of kpis) {
            if (!kpi.ad_hoc_evaluation_id || !kpi.kpi_id) {
                return res.status(400).json({ error: 'ad_hoc_evaluation_id and kpi_id required' });
            }
            const result = await prisma_1.default.$queryRaw `
        INSERT INTO evaluation_result_areas (ad_hoc_evaluation_id, kpi_id, evaluator_type, weight, created_at)
        VALUES (${kpi.ad_hoc_evaluation_id}::uuid, ${kpi.kpi_id}::uuid, ${kpi.evaluator_type || null}, ${kpi.weight || 0}, now())
        RETURNING *`;
            created.push(result[0]);
        }
        const performedBy = req.user?.sub ? Number(req.user.sub) : undefined;
        await (0, audit_1.createAudit)({
            action: `create_evaluation_result_areas`,
            entity_type: 'evaluation_result_areas',
            user_id: performedBy,
            ip_address: req.ip
        });
        return res.status(201).json(created);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
exports.default = router;
