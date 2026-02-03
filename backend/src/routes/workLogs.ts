import { Router } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import prisma from '../prisma';
import { createAudit } from '../utils/audit';

const router = Router();

// GET /work_logs?employeeId=&limit=
router.get('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    return res.json([]);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /work_logs/:id
router.get('/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    return res.json({ id: Number(req.params.id), message: 'Work logs are handled via time entries.' });
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

    const workLog = {
      id: 0,
      employeeId: Number(employee_id),
      projectId: project_id ? Number(project_id) : undefined,
      workDate: new Date(work_date),
      hoursWorked: Number(hours_worked),
      billableHours: billable_hours ? Number(billable_hours) : Number(hours_worked),
      description,
      taskType: task_type,
      isOvertime: Boolean(is_overtime),
    };

    const performedBy = req.user?.userId;
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

    const workLog = {
      id: Number(id),
      hoursWorked: hours_worked ? Number(hours_worked) : undefined,
      billableHours: billable_hours ? Number(billable_hours) : undefined,
      description,
      isOvertime: is_overtime,
    };

    const performedBy = req.user?.userId;
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

    const performedBy = req.user?.userId;
    await createAudit({
      action: 'work_log:delete',
      entity_type: 'work_log',
      user_id: performedBy,
      ip_address: req.ip,
    });

    return res.json({ ok: true, id: Number(id) });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
