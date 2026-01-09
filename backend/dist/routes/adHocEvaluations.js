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
// GET /ad_hoc_evaluations?is_active=true
router.get('/', async (req, res) => {
    try {
        const active = req.query.is_active === 'true';
        if (active) {
            const rows = await prisma_1.default.$queryRaw `SELECT * FROM ad_hoc_evaluations WHERE status = 'published' ORDER BY published_at DESC`;
            return res.json(rows || []);
        }
        const rows = await prisma_1.default.$queryRaw `SELECT * FROM ad_hoc_evaluations ORDER BY published_at DESC`;
        return res.json(rows || []);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// POST /ad_hoc_evaluations
router.post('/', auth_1.authMiddleware, async (req, res) => {
    try {
        const payload = req.body;
        // Minimal validation
        if (!payload.name)
            return res.status(400).json({ error: 'name required' });
        const created = await prisma_1.default.$queryRaw `
      INSERT INTO ad_hoc_evaluations (name, created_by, enable_self_evaluation, enable_peer_evaluation, enable_upward_evaluation, enable_downward_evaluation, due_date, process_anonymously, hide_from_dashboard, require_all_kpis, exclude_from_score, require_evaluator_signature, require_evaluatee_signature, send_signature_to_evaluatee, send_signature_to_managers, send_signature_to_downward_evaluators, status, published_at, created_at)
      VALUES (${payload.name}, ${payload.created_by || null}, ${payload.enable_self_evaluation || false}, ${payload.enable_peer_evaluation || false}, ${payload.enable_upward_evaluation || false}, ${payload.enable_downward_evaluation || false}, ${payload.due_date || null}, ${payload.process_anonymously || false}, ${payload.hide_from_dashboard || false}, ${payload.require_all_kpis || false}, ${payload.exclude_from_score || false}, ${payload.require_evaluator_signature || false}, ${payload.require_evaluatee_signature || false}, ${payload.send_signature_to_evaluatee || false}, ${payload.send_signature_to_managers || false}, ${payload.send_signature_to_downward_evaluators || false}, ${payload.status || 'draft'}, ${payload.published_at || null}, now())
      RETURNING *`;
        const performedBy = req.user?.sub ? Number(req.user.sub) : undefined;
        await (0, audit_1.createAudit)({ action: `create_ad_hoc:${payload.name}`, entity_type: 'ad_hoc_evaluation', user_id: performedBy, ip_address: req.ip });
        return res.status(201).json(created[0] ?? null);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
exports.default = router;
