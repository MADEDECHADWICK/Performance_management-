import { Router } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import prisma from '../prisma';
import { createAudit } from '../utils/audit';

const router = Router();

// GET /todos?userId=
router.get('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userIdRaw = req.query.userId as string | undefined;
    let profileId = req.user?.profileId;

    if (userIdRaw) {
      const userId = Number(userIdRaw);
      if (Number.isNaN(userId)) {
        return res.status(400).json({ error: 'Invalid userId query parameter' });
      }

      const profile = await prisma.profile.findUnique({
        where: { userId },
        select: { id: true },
      });
      profileId = profile?.id;
    }

    if (!profileId) {
      return res.status(400).json({ error: 'profileId not available for user' });
    }

    const tasks = await prisma.task.findMany({
      where: { assignedToProfileId: profileId },
      include: {
        job: {
          select: {
            id: true,
            jobName: true,
            description: true,
            startDate: true,
            dueDate: true,
            status: true,
            budgetHours: true,
            fixedFeeAmount: true,
            jobCosting: {
              select: {
                totalEstimatedHours: true,
                budgetCap: { select: { totalAllocatedHours: true } },
              },
            },
            department: { select: { name: true } },
            client: { select: { clientName: true } },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const normalized = (tasks || []).map((task: any) => {
      const job = task.job;
      if (!job) return task;
      const budgetHours =
        Number(job.jobCosting?.budgetCap?.totalAllocatedHours ??
          job.jobCosting?.totalEstimatedHours ??
          job.budgetHours ??
          0);
      return {
        ...task,
        job: {
          ...job,
          budgetHours,
          jobCosting: undefined,
        },
      };
    });

    return res.json(normalized);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /todos/:id
router.get('/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const todo = await prisma.task.findUnique({
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
    const { jobId, title, description, priority, dueDate, assignedToProfileId } = req.body;

    if (!jobId || !title) {
      return res.status(400).json({ error: 'jobId and title required' });
    }

    const todo = await prisma.task.create({
      data: {
        jobId: Number(jobId),
        title,
        description,
        priority,
        dueDate: dueDate ? new Date(dueDate) : undefined,
        assignedToProfileId: assignedToProfileId ? Number(assignedToProfileId) : req.user?.profileId,
        status: 'pending',
      },
    });

    const performedBy = req.user?.userId;
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

    const todo = await prisma.task.update({
      where: { id: parseInt(id) },
      data: {
        status,
      },
    });

    const performedBy = req.user?.userId;
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

    const todo = await prisma.task.update({
      where: { id: parseInt(id) },
      data: { description },
    });

    const performedBy = req.user?.userId;
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

    await prisma.task.delete({
      where: { id: parseInt(id) },
    });

    const performedBy = req.user?.userId;
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
