import { Router } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import prisma from '../prisma';

const router = Router();

// GET /kpis - List all KPIs
router.get('/', async (req, res) => {
  try {
    const isActiveQuery = req.query.is_active ?? req.query.isActive;
    const isActive =
      typeof isActiveQuery === 'string'
        ? isActiveQuery.toLowerCase() === 'true'
        : undefined;

    const kpis = await prisma.kpi.findMany({
      where: typeof isActive === 'boolean' ? { isActive } : undefined,
      include: {
        department: true,
        role: true,
        employeeAssignments: true,
        employeeScores: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return res.json(kpis || []);
  } catch (err: any) {
    console.error('Error fetching KPIs:', err);
    return res.status(500).json({ error: 'Failed to fetch KPIs' });
  }
});

// GET /kpis/:id
router.get('/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const kpi = await prisma.kpi.findUnique({
      where: { id: parseInt(id) },
      include: {
        department: true,
        role: true,
        employeeAssignments: true,
        employeeScores: true,
      },
    });
    if (!kpi) {
      return res.status(404).json({ error: 'KPI not found' });
    }
    return res.json(kpi);
  } catch (err: any) {
    console.error('Error fetching KPI:', err);
    return res.status(500).json({ error: 'Failed to fetch KPI' });
  }
});

// POST /kpis
router.post('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const {
      name,
      description,
      category,
      kpiType,
      kpi_type,
      measurementUnit,
      measurement_unit,
      targetValue,
      target_value,
      targetFrequency,
      target_frequency,
      targetDescription,
      target_description,
      weight,
      departmentId,
      department_id,
      roleId,
      role_id,
      isActive,
      is_active,
    } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'KPI name is required' });
    }

    const kpi = await prisma.kpi.create({
      data: {
        name,
        description,
        category: category || 'general',
        kpiType: kpiType || kpi_type || 'general',
        measurementUnit: measurementUnit || measurement_unit,
        targetValue: targetValue ?? (target_value ? parseFloat(target_value) : undefined),
        targetFrequency: targetFrequency || target_frequency,
        targetDescription: targetDescription || target_description,
        weight: weight ? parseFloat(weight) : undefined,
        departmentId: departmentId ?? (department_id ? parseInt(department_id) : undefined),
        roleId: roleId ?? (role_id ? parseInt(role_id) : undefined),
        isActive: typeof isActive === 'boolean' ? isActive : (typeof is_active === 'boolean' ? is_active : undefined),
      },
    });
    return res.status(201).json(kpi);
  } catch (err: any) {
    console.error('Error creating KPI:', err);
    return res.status(500).json({ error: 'Failed to create KPI' });
  }
});

// PATCH /kpis/:id
router.patch('/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const id = req.params.id;
    const {
      name,
      description,
      category,
      kpiType,
      kpi_type,
      measurementUnit,
      measurement_unit,
      targetValue,
      target_value,
      targetFrequency,
      target_frequency,
      targetDescription,
      target_description,
      weight,
      departmentId,
      department_id,
      roleId,
      role_id,
      isActive,
      is_active,
    } = req.body;

    const kpi = await prisma.kpi.update({
      where: { id: parseInt(id) },
      data: {
        ...(name && { name }),
        ...(description && { description }),
        ...(category && { category }),
        ...(kpiType || kpi_type ? { kpiType: kpiType || kpi_type } : {}),
        ...(measurementUnit || measurement_unit ? { measurementUnit: measurementUnit || measurement_unit } : {}),
        ...(targetValue || target_value ? { targetValue: targetValue ?? parseFloat(target_value) } : {}),
        ...(targetFrequency || target_frequency ? { targetFrequency: targetFrequency || target_frequency } : {}),
        ...(targetDescription || target_description ? { targetDescription: targetDescription || target_description } : {}),
        ...(weight && { weight: parseFloat(weight) }),
        ...(departmentId || department_id ? { departmentId: departmentId ?? parseInt(department_id) } : {}),
        ...(roleId || role_id ? { roleId: roleId ?? parseInt(role_id) } : {}),
        ...(typeof isActive === 'boolean' ? { isActive } : typeof is_active === 'boolean' ? { isActive: is_active } : {}),
      },
    });
    return res.json(kpi);
  } catch (err: any) {
    console.error('Error updating KPI:', err);
    return res.status(500).json({ error: 'Failed to update KPI' });
  }
});

// DELETE /kpis/:id
router.delete('/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const id = req.params.id;
    await prisma.kpi.delete({
      where: { id: parseInt(id) },
    });
    return res.json({ ok: true });
  } catch (err: any) {
    console.error('Error deleting KPI:', err);
    return res.status(500).json({ error: 'Failed to delete KPI' });
  }
});

export default router;
