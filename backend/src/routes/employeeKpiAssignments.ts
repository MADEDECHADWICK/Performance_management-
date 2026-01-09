import { Router } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import prisma from '../prisma';
import { createAudit } from '../utils/audit';

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
    const { employee_id, kpi_id, target_value, weight_percentage, due_date } = req.body;

    if (!employee_id || !kpi_id) {
      return res.status(400).json({ error: 'employee_id and kpi_id required' });
    }

    const assignment = await prisma.employeeKpiAssignment.create({
      data: {
        employee_id: parseInt(employee_id),
        kpi_id: kpi_id ? parseInt(kpi_id) : undefined,
        target_value: target_value ? parseFloat(target_value) : undefined,
        weight: weight_percentage ? parseFloat(weight_percentage) : undefined,
      },
      include: {
        employee: true,
        kpi: true,
      },
    });

    const performedBy = req.user?.sub ? Number(req.user.sub) : undefined;
    await createAudit({
      action: 'employee_kpi_assignment:create',
      entity_type: 'employee_kpi_assignment',
      user_id: performedBy,
      ip_address: req.ip,
    });

    return res.status(201).json(assignment);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// PATCH /employee_kpi_assignments/:id
router.patch('/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { target_value, weight_percentage, due_date, status } = req.body;

    const assignment = await prisma.employeeKpiAssignment.update({
      where: { id: parseInt(id) },
      data: {
        target_value: target_value ? parseFloat(target_value) : undefined,
        weight: weight_percentage ? parseFloat(weight_percentage) : undefined,
        status,
      },
      include: {
        employee: true,
        kpi: true,
      },
    });

    const performedBy = req.user?.sub ? Number(req.user.sub) : undefined;
    await createAudit({
      action: 'employee_kpi_assignment:update',
      entity_type: 'employee_kpi_assignment',
      user_id: performedBy,
      ip_address: req.ip,
    });

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

    const performedBy = req.user?.sub ? Number(req.user.sub) : undefined;
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
