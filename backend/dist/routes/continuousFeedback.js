"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const router = (0, express_1.Router)();
// GET /continuous_feedback?user_id=
router.get('/', async (req, res) => {
    try {
        const userId = req.query.user_id;
        if (!userId) {
            return res.json([]);
        }
        // Return empty array - continuous feedback data doesn't exist yet
        return res.json([]);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// POST /continuous_feedback
router.post('/', async (req, res) => {
    try {
        const { recipient_id, giver_id, feedback_type, category, message, is_anonymous, is_public } = req.body;
        if (!recipient_id || !feedback_type || !message) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        return res.status(201).json({ ok: true });
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
exports.default = router;
