import { Router } from 'express';
import prisma from '../prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { createAudit } from '../utils/audit';

const router = Router();

// GET /employee_goals?employee_id=...
router.get('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const employeeId = req.query.employee_id as string | undefined;
    if (!employeeId) {
      return res.status(400).json({ error: 'employee_id query parameter required' });
    }

    const goals = await prisma.employeeGoal.findMany({
      where: { employee_id: parseInt(employeeId) },
      include: { kpi: true },
      orderBy: { createdAt: 'desc' },
    });

    return res.json(goals || []);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /employee_goals/:id
router.get('/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const goal = await prisma.employeeGoal.findUnique({
      where: { id: parseInt(req.params.id) },
      include: { kpi: true },
    });
    if (!goal) return res.status(404).json({ error: 'Goal not found' });
    return res.json(goal);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /employee_goals
router.post('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { employee_id, goal_title, description, category, target_date, kpi_id } = req.body;

    if (!employee_id || !goal_title) {
      return res.status(400).json({ error: 'employee_id and goal_title required' });
    }

    const goal = await prisma.employeeGoal.create({
      data: {
        employee_id: parseInt(employee_id),
        goal_title,
        description,
        category,
        target_date: target_date ? new Date(target_date) : undefined,
        kpi_id: kpi_id ? parseInt(kpi_id) : undefined,
        status: 'in_progress',
        progress_percentage: 0,
      },
      include: { kpi: true },
    });

    const performedBy = req.user?.sub ? Number(req.user.sub) : undefined;
    await createAudit({
      action: 'employee_goal:create',
      entity_type: 'employee_goal',
      user_id: performedBy,
      ip_address: req.ip,
    });

    return res.status(201).json(goal);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// PATCH /employee_goals/:id
router.patch('/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { status, progress_percentage, description } = req.body;

    const goal = await prisma.employeeGoal.update({
      where: { id: parseInt(id) },
      data: {
        status,
        progress_percentage: progress_percentage !== undefined ? progress_percentage : undefined,
        description,
      },
      include: { kpi: true },
    });

    const performedBy = req.user?.sub ? Number(req.user.sub) : undefined;
    await createAudit({
      action: 'employee_goal:update',
      entity_type: 'employee_goal',
      user_id: performedBy,
      ip_address: req.ip,
    });

    return res.json(goal);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// DELETE /employee_goals/:id
router.delete('/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    await prisma.employeeGoal.delete({
      where: { id: parseInt(id) },
    });

    const performedBy = req.user?.sub ? Number(req.user.sub) : undefined;
    await createAudit({
      action: 'employee_goal:delete',
      entity_type: 'employee_goal',
      user_id: performedBy,
      ip_address: req.ip,
    });

    return res.json({ ok: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
