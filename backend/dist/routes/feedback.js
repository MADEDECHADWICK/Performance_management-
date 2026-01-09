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
// GET /feedback?subject_id=... or ?reviewer_id=...
router.get('/', async (req, res) => {
    try {
        const subjectId = req.query.subject_id;
        const reviewerId = req.query.reviewer_id;
        const limit = Math.min(1000, Number(req.query.limit) || 200);
        if (subjectId) {
            const rows = await prisma_1.default.$queryRaw `SELECT * FROM feedback WHERE subject_id = ${subjectId} ORDER BY "createdAt" DESC LIMIT ${limit}`;
            return res.json(rows || []);
        }
        if (reviewerId) {
            const rows = await prisma_1.default.$queryRaw `SELECT * FROM feedback WHERE reviewer_id = ${reviewerId} ORDER BY "createdAt" DESC LIMIT ${limit}`;
            return res.json(rows || []);
        }
        const rows = await prisma_1.default.$queryRaw `SELECT * FROM feedback ORDER BY "createdAt" DESC LIMIT ${limit}`;
        return res.json(rows || []);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// POST /feedback
router.post('/', auth_1.authMiddleware, async (req, res) => {
    try {
        const { subject_id, feedback_type, rating, comments, is_anonymous, reviewer_id } = req.body;
        if (!subject_id || !feedback_type)
            return res.status(400).json({ error: 'Missing required fields' });
        const reviewer = reviewer_id || (req.user?.sub ? Number(req.user.sub) : null);
        const created = await prisma_1.default.$queryRaw `
      INSERT INTO feedback (subject_id, feedback_type, rating, comments, is_anonymous, reviewer_id, created_at)
      VALUES (${subject_id}, ${feedback_type}, ${rating || null}, ${comments || null}, ${is_anonymous || false}, ${reviewer}, now())
      RETURNING *`;
        await (0, audit_1.createAudit)({ action: `submit_feedback:${feedback_type}`, entity_type: 'feedback', user_id: reviewer || null, ip_address: req.ip });
        return res.status(201).json(created[0] ?? null);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
exports.default = router;
