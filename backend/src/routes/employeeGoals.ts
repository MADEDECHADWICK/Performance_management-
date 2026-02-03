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

    const goals = await prisma.$queryRaw`
      SELECT * FROM employee_goals WHERE employee_id = ${parseInt(employeeId)} ORDER BY "createdAt" DESC`;
    return res.json((goals as any[]) || []);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /employee_goals/:id
router.get('/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const rows = await prisma.$queryRaw`
      SELECT * FROM employee_goals WHERE id = ${parseInt(req.params.id)} LIMIT 1`;
    const goal = Array.isArray(rows) ? rows[0] : rows;
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

    const goal = await prisma.$queryRaw`
      INSERT INTO employee_goals (employee_id, goal_title, description, category, target_date, kpi_id, status, progress_percentage)
      VALUES (${parseInt(employee_id)}, ${goal_title}, ${description}, ${category}, ${target_date ? new Date(target_date) : null}, ${kpi_id ? parseInt(kpi_id) : null}, ${"in_progress"}, ${0})
      RETURNING *`;

    const performedBy = req.user?.userId ? Number(req.user.userId) : undefined;
    await createAudit({
      action: 'employee_goal:create',
      entity_type: 'employee_goal',
      user_id: performedBy,
      ip_address: req.ip,
    });

    return res.status(201).json(Array.isArray(goal) ? goal[0] : goal);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// PATCH /employee_goals/:id
router.patch('/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { status, progress_percentage, description } = req.body;

    const goal = await prisma.$queryRaw`
      UPDATE employee_goals
      SET
        status = COALESCE(${status}, status),
        progress_percentage = COALESCE(${progress_percentage}, progress_percentage),
        description = COALESCE(${description}, description)
      WHERE id = ${parseInt(id)}
      RETURNING *`;

    const performedBy = req.user?.userId ? Number(req.user.userId) : undefined;
    await createAudit({
      action: 'employee_goal:update',
      entity_type: 'employee_goal',
      user_id: performedBy,
      ip_address: req.ip,
    });

    return res.json(Array.isArray(goal) ? goal[0] : goal);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// DELETE /employee_goals/:id
router.delete('/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    await prisma.$executeRaw`
      DELETE FROM employee_goals WHERE id = ${parseInt(id)}`;

    const performedBy = req.user?.userId ? Number(req.user.userId) : undefined;
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
