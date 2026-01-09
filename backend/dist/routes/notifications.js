"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const prisma_1 = __importDefault(require("../prisma"));
const router = (0, express_1.Router)();
// GET /notifications?user_id=&is_read=false
router.get('/', auth_1.authMiddleware, async (req, res) => {
    try {
        const userId = req.query.user_id;
        const isRead = req.query.is_read;
        if (!userId) {
            return res.status(400).json({ error: 'user_id query parameter required' });
        }
        const where = { user_id: parseInt(userId) };
        if (isRead !== undefined) {
            where.is_read = isRead === 'true';
        }
        const notifications = await prisma_1.default.notification.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: 50,
        });
        return res.json(notifications || []);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// GET /notifications/:id
router.get('/:id', auth_1.authMiddleware, async (req, res) => {
    try {
        const notification = await prisma_1.default.notification.findUnique({
            where: { id: parseInt(req.params.id) },
        });
        if (!notification) {
            return res.status(404).json({ error: 'Notification not found' });
        }
        return res.json(notification);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// PATCH /notifications/:id { is_read }
router.patch('/:id', auth_1.authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { is_read } = req.body;
        const notification = await prisma_1.default.notification.update({
            where: { id: parseInt(id) },
            data: { is_read },
        });
        return res.json(notification);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// PATCH /notifications/user/:userId/mark-all-read
router.patch('/user/:userId/mark-all-read', auth_1.authMiddleware, async (req, res) => {
    try {
        const { userId } = req.params;
        await prisma_1.default.notification.updateMany({
            where: { user_id: parseInt(userId) },
            data: { is_read: true },
        });
        return res.json({ ok: true });
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// POST /notifications
router.post('/', auth_1.authMiddleware, async (req, res) => {
    try {
        const { user_id, title, message, type, link } = req.body;
        if (!user_id || !title || !message) {
            return res.status(400).json({ error: 'user_id, title, and message required' });
        }
        const notification = await prisma_1.default.notification.create({
            data: {
                user_id: parseInt(user_id),
                title,
                message,
                type,
                link,
                is_read: false,
            },
        });
        return res.status(201).json(notification);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
exports.default = router;
