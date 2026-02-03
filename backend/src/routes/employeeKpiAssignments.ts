import { Router } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import prisma from '../prisma';
import { createAudit } from '../utils/audit';
import { NotificationService } from '../services/notifications.service';

const router = Router();

// GET /employee_kpi_assignments
router.get('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const assignments = await prisma.employeeKpiAssignment.findMany({
      include: {
        employee: true,
        kpi: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return res.json(assignments || []);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /employee_kpi_assignments/:id
router.get('/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const assignment = await prisma.employeeKpiAssignment.findUnique({
      where: { id: parseInt(req.params.id) },
      include: {
        employee: true,
        kpi: true,
      },
    });

    if (!assignment) {
      return res.status(404).json({ error: 'KPI assignment not found' });
    }

    return res.json(assignment);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /employee_kpi_assignments
router.post('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const {
      employeeProfileId,
      employee_id,
      kpiId,
      kpi_id,
      targetValue,
      target_value,
      weight,
      weight_percentage,
      periodStart,
      period_start,
      periodEnd,
      period_end,
      status,
    } = req.body;

    const resolvedEmployeeId = employeeProfileId ?? employee_id;
    const resolvedKpiId = kpiId ?? kpi_id;

    if (!resolvedEmployeeId || !resolvedKpiId) {
      return res.status(400).json({ error: 'employeeProfileId and kpiId required' });
    }

    const assignment = await prisma.employeeKpiAssignment.create({
      data: {
        employeeProfileId: Number(resolvedEmployeeId),
        kpiId: Number(resolvedKpiId),
        targetValue: targetValue ?? target_value ? Number(targetValue ?? target_value) : undefined,
        weight: weight ?? weight_percentage ? Number(weight ?? weight_percentage) : undefined,
        periodStart: periodStart ?? period_start ? new Date(periodStart ?? period_start) : undefined,
        periodEnd: periodEnd ?? period_end ? new Date(periodEnd ?? period_end) : undefined,
        status,
      },
      include: {
        employee: true,
        kpi: true,
      },
    });

    const performedBy = req.user?.userId ? Number(req.user.userId) : undefined;
    await createAudit({
      action: 'employee_kpi_assignment:create',
      entity_type: 'employee_kpi_assignment',
      user_id: performedBy,
      ip_address: req.ip,
    });

    await NotificationService.createNotification(
      {
        recipientProfileId: assignment.employeeProfileId,
        type: 'info',
        title: 'New KPI assigned',
        message: `A KPI "${assignment.kpi?.name ?? 'KPI'}" has been assigned to you.`,
        actionRequired: false,
        link: '/kpi-management',
      },
      {
        userId: req.user?.userId ?? 0,
        profileId: req.profile?.id ?? 0,
        roleName: req.profile?.role?.name,
      }
    );

    return res.status(201).json(assignment);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// PATCH /employee_kpi_assignments/:id
router.patch('/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const {
      targetValue,
      target_value,
      weight,
      weight_percentage,
      periodStart,
      period_start,
      periodEnd,
      period_end,
      status,
    } = req.body;

    const assignment = await prisma.employeeKpiAssignment.update({
      where: { id: parseInt(id) },
      data: {
        targetValue: targetValue ?? target_value ? Number(targetValue ?? target_value) : undefined,
        weight: weight ?? weight_percentage ? Number(weight ?? weight_percentage) : undefined,
        periodStart: periodStart ?? period_start ? new Date(periodStart ?? period_start) : undefined,
        periodEnd: periodEnd ?? period_end ? new Date(periodEnd ?? period_end) : undefined,
        status,
      },
      include: {
        employee: true,
        kpi: true,
      },
    });

    const performedBy = req.user?.userId ? Number(req.user.userId) : undefined;
    await createAudit({
      action: 'employee_kpi_assignment:update',
      entity_type: 'employee_kpi_assignment',
      user_id: performedBy,
      ip_address: req.ip,
    });

    await NotificationService.createNotification(
      {
        recipientProfileId: assignment.employeeProfileId,
        type: 'info',
        title: 'KPI updated',
        message: `Your KPI "${assignment.kpi?.name ?? 'KPI'}" was updated.`,
        actionRequired: false,
        link: '/kpi-management',
      },
      {
        userId: req.user?.userId ?? 0,
        profileId: req.profile?.id ?? 0,
        roleName: req.profile?.role?.name,
      }
    );

    return res.json(assignment);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// DELETE /employee_kpi_assignments/:id
router.delete('/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    await prisma.employeeKpiAssignment.delete({
      where: { id: parseInt(id) },
    });

    const performedBy = req.user?.userId ? Number(req.user.userId) : undefined;
    await createAudit({
      action: 'employee_kpi_assignment:delete',
      entity_type: 'employee_kpi_assignment',
      user_id: performedBy,
      ip_address: req.ip,
    });

    return res.json({ ok: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
