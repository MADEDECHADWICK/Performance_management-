import { Router } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import prisma from '../prisma';

const router = Router();

// GET /notifications?user_id=&is_read=false
router.get('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.query.user_id as string | undefined;
    const isRead = req.query.is_read as string | undefined;
    
    if (!userId) {
      return res.status(400).json({ error: 'user_id query parameter required' });
    }

    const where: any = { user_id: parseInt(userId) };
    if (isRead !== undefined) {
      where.is_read = isRead === 'true';
    }

    const notifications = await prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return res.json(notifications || []);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /notifications/:id
router.get('/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const notification = await prisma.notification.findUnique({
      where: { id: parseInt(req.params.id) },
    });
    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }
    return res.json(notification);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// PATCH /notifications/:id { is_read }
router.patch('/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { is_read } = req.body;

    const notification = await prisma.notification.update({
      where: { id: parseInt(id) },
      data: { is_read },
    });

    return res.json(notification);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// PATCH /notifications/user/:userId/mark-all-read
router.patch('/user/:userId/mark-all-read', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { userId } = req.params;

    await prisma.notification.updateMany({
      where: { user_id: parseInt(userId) },
      data: { is_read: true },
    });

    return res.json({ ok: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /notifications
router.post('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { user_id, title, message, type, link } = req.body;

    if (!user_id || !title || !message) {
      return res.status(400).json({ error: 'user_id, title, and message required' });
    }

    const notification = await prisma.notification.create({
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
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
