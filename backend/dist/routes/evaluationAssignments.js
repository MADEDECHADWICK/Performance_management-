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
// GET /evaluation_assignments?status=pending
router.get('/', async (req, res) => {
    try {
        const status = req.query.status;
        const evaluatorId = req.query.evaluator_id;
        const limit = Math.min(1000, Number(req.query.limit) || 200);
        if (status) {
            const rows = await prisma_1.default.$queryRaw `SELECT * FROM evaluation_assignments WHERE status = ${status} ORDER BY "createdAt" DESC LIMIT ${limit}`;
            return res.json(rows || []);
        }
        if (evaluatorId) {
            const rows = await prisma_1.default.$queryRaw `SELECT * FROM evaluation_assignments WHERE evaluator_id = ${evaluatorId} ORDER BY "createdAt" DESC LIMIT ${limit}`;
            return res.json(rows || []);
        }
        const rows = await prisma_1.default.$queryRaw `SELECT * FROM evaluation_assignments ORDER BY "createdAt" DESC LIMIT ${limit}`;
        return res.json(rows || []);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// POST /evaluation_assignments  (accepts array of assignments)
router.post('/', auth_1.authMiddleware, async (req, res) => {
    try {
        const payload = req.body;
        if (!payload)
            return res.status(400).json({ error: 'No payload' });
        // If payload is an array, insert multiple
        if (Array.isArray(payload)) {
            const values = payload.map((p) => `(${p.ad_hoc_evaluation_id}, ${p.evaluator_id}, ${p.evaluatee_id}, '${p.evaluation_type}', '${p.status || 'pending'}', now())`).join(',');
            const sql = `INSERT INTO evaluation_assignments (ad_hoc_evaluation_id, evaluator_id, evaluatee_id, evaluation_type, status, created_at) VALUES ${values} RETURNING *`;
            const created = await prisma_1.default.$queryRawUnsafe(sql);
            const performedBy = req.user?.sub ? Number(req.user.sub) : undefined;
            await (0, audit_1.createAudit)({ action: `create_assignments:${created.length}`, entity_type: 'evaluation_assignment', user_id: performedBy, ip_address: req.ip });
            return res.status(201).json(created || []);
        }
        // Single insert
        const p = payload;
        const created = await prisma_1.default.$queryRaw `
      INSERT INTO evaluation_assignments (ad_hoc_evaluation_id, evaluator_id, evaluatee_id, evaluation_type, status, created_at)
      VALUES (${p.ad_hoc_evaluation_id}, ${p.evaluator_id}, ${p.evaluatee_id}, ${p.evaluation_type || 'downward'}, ${p.status || 'pending'}, now())
      RETURNING *`;
        const performedBy = req.user?.sub ? Number(req.user.sub) : undefined;
        await (0, audit_1.createAudit)({ action: `create_assignment:${p.ad_hoc_evaluation_id}`, entity_type: 'evaluation_assignment', user_id: performedBy, ip_address: req.ip });
        return res.status(201).json(created[0] ?? null);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
exports.default = router;
