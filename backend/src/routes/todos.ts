import { Router } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import prisma from '../prisma';
import { createAudit } from '../utils/audit';

const router = Router();

// GET /todos?userId=
router.get('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.query.userId as string | undefined;
    
    if (!userId) {
      return res.status(400).json({ error: 'userId query parameter required' });
    }

    const todos = await prisma.todo.findMany({
      where: { user_id: parseInt(userId) },
      orderBy: { createdAt: 'desc' },
    });
    
    return res.json(todos || []);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /todos/:id
router.get('/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const todo = await prisma.todo.findUnique({
      where: { id: parseInt(req.params.id) },
    });
    if (!todo) return res.status(404).json({ error: 'Todo not found' });
    return res.json(todo);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /todos
router.post('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { user_id, title, description, priority, due_date } = req.body;
    
    if (!user_id || !title) {
      return res.status(400).json({ error: 'user_id and title required' });
    }

    const todo = await prisma.todo.create({
      data: {
        user_id: parseInt(user_id),
        title,
        description,
        priority,
        due_date: due_date ? new Date(due_date) : undefined,
        status: 'pending',
      },
    });

    const performedBy = req.user?.sub ? Number(req.user.sub) : undefined;
    await createAudit({
      action: 'todo:create',
      entity_type: 'todo',
      user_id: performedBy,
      ip_address: req.ip,
    });

    return res.status(201).json(todo);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// PATCH /todos/:id { status }
router.patch('/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    if (!status) {
      return res.status(400).json({ error: 'status required' });
    }

    const todo = await prisma.todo.update({
      where: { id: parseInt(id) },
      data: {
        status,
        completed_at: status === 'completed' ? new Date() : null,
      },
    });

    const performedBy = req.user?.sub ? Number(req.user.sub) : undefined;
    await createAudit({
      action: `todo:update:status->${status}`,
      entity_type: 'todo',
      user_id: performedBy,
      ip_address: req.ip,
    });

    return res.json(todo);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// PATCH /todos/:id/notes { description }
router.patch('/:id/notes', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { description } = req.body;

    const todo = await prisma.todo.update({
      where: { id: parseInt(id) },
      data: { description },
    });

    const performedBy = req.user?.sub ? Number(req.user.sub) : undefined;
    await createAudit({
      action: 'todo:update:notes',
      entity_type: 'todo',
      user_id: performedBy,
      ip_address: req.ip,
    });

    return res.json(todo);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// DELETE /todos/:id
router.delete('/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    await prisma.todo.delete({
      where: { id: parseInt(id) },
    });

    const performedBy = req.user?.sub ? Number(req.user.sub) : undefined;
    await createAudit({
      action: 'todo:delete',
      entity_type: 'todo',
      user_id: performedBy,
      ip_address: req.ip,
    });

    return res.json({ ok: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
