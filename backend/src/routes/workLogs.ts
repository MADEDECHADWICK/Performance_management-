import { Router } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import prisma from '../prisma';
import { createAudit } from '../utils/audit';

const router = Router();

// GET /work_logs?employeeId=&limit=
router.get('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const employeeId = req.query.employeeId as string | undefined;
    const limit = parseInt(req.query.limit as string) || 50;
    
    if (!employeeId) {
      return res.status(400).json({ error: 'employeeId query parameter required' });
    }

    const workLogs = await prisma.workLog.findMany({
      where: { employee_id: parseInt(employeeId) },
      include: {
        employee: true,
        project: true,
      },
      orderBy: { work_date: 'desc' },
      take: limit,
    });

    return res.json(workLogs || []);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /work_logs/:id
router.get('/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const workLog = await prisma.workLog.findUnique({
      where: { id: parseInt(req.params.id) },
      include: {
        employee: true,
        project: true,
      },
    });
    if (!workLog) {
      return res.status(404).json({ error: 'Work log not found' });
    }
    return res.json(workLog);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /work_logs
router.post('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { employee_id, project_id, work_date, hours_worked, billable_hours, description, task_type, is_overtime } = req.body;

    if (!employee_id || !work_date || !hours_worked) {
      return res.status(400).json({ error: 'employee_id, work_date, and hours_worked required' });
    }

    const workLog = await prisma.workLog.create({
      data: {
        employee_id: parseInt(employee_id),
        project_id: project_id ? parseInt(project_id) : undefined,
        work_date: new Date(work_date),
        hours_worked: parseFloat(hours_worked),
        billable_hours: billable_hours ? parseFloat(billable_hours) : parseFloat(hours_worked),
        description,
        task_type,
        is_overtime: is_overtime || false,
      },
    });

    const performedBy = req.user?.sub ? Number(req.user.sub) : undefined;
    await createAudit({
      action: 'work_log:create',
      entity_type: 'work_log',
      user_id: performedBy,
      ip_address: req.ip,
    });

    return res.status(201).json(workLog);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// PATCH /work_logs/:id
router.patch('/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { hours_worked, billable_hours, description, is_overtime } = req.body;

    const workLog = await prisma.workLog.update({
      where: { id: parseInt(id) },
      data: {
        hours_worked: hours_worked ? parseFloat(hours_worked) : undefined,
        billable_hours: billable_hours ? parseFloat(billable_hours) : undefined,
        description,
        is_overtime,
      },
    });

    const performedBy = req.user?.sub ? Number(req.user.sub) : undefined;
    await createAudit({
      action: 'work_log:update',
      entity_type: 'work_log',
      user_id: performedBy,
      ip_address: req.ip,
    });

    return res.json(workLog);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// DELETE /work_logs/:id
router.delete('/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    await prisma.workLog.delete({
      where: { id: parseInt(id) },
    });

    const performedBy = req.user?.sub ? Number(req.user.sub) : undefined;
    await createAudit({
      action: 'work_log:delete',
      entity_type: 'work_log',
      user_id: performedBy,
      ip_address: req.ip,
    });

    return res.json({ ok: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
