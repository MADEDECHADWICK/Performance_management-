import { Router } from 'express';
import prisma from '../prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { createAudit } from '../utils/audit';

const router = Router();

// Middleware: Check if user is HR/Admin/SuperAdmin
const requireHROrAdmin = (req: AuthRequest, res: any, next: any) => {
  const userRoles = req.user?.authRoles || (req.user as any)?.roles || [];
  const isHROrAdmin =
    userRoles.includes('super_admin') ||
    userRoles.includes('admin') ||
    userRoles.includes('hr_manager') ||
    userRoles.includes('hr');

  if (!isHROrAdmin) {
    return res.status(403).json({
      error: 'Access denied. Only HR/Admin can manage position rates',
    });
  }
  next();
};

const mapRate = (role: any) => ({
  id: role.id,
  position_level: role.name,
  billing_rate: Number(role.billingRate ?? 0),
  cost_rate: Number(role.costRate ?? 0),
  is_active: role.isActive,
  effective_from: role.createdAt,
  created_at: role.createdAt,
  updated_at: role.updatedAt,
});

// GET /position-rates - List all position rates
router.get('/', authMiddleware, async (_req: AuthRequest, res) => {
  try {
    const roles = await prisma.positionRole.findMany({
      where: { isActive: true },
      orderBy: { billingRate: 'desc' },
    });
    res.json(roles.map(mapRate));
  } catch (error: any) {
    console.error('Error fetching position rates:', error);
    res.status(500).json({ error: 'Failed to fetch position rates' });
  }
});

// GET /position-rates/:id - Get single position rate
router.get('/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: 'Invalid id' });
    }
    const role = await prisma.positionRole.findUnique({
      where: { id },
    });

    if (!role) {
      return res.status(404).json({ error: 'Position rate not found' });
    }

    res.json(mapRate(role));
  } catch (error: any) {
    console.error('Error fetching position rate:', error);
    res.status(500).json({ error: 'Failed to fetch position rate' });
  }
});

// POST /position-rates - Create new position rate
router.post('/', authMiddleware, requireHROrAdmin, async (req: AuthRequest, res) => {
  try {
    const positionLevel = req.body.position_level ?? req.body.name;
    const billingRate = req.body.billing_rate ?? req.body.billingRate;
    const costRate = req.body.cost_rate ?? req.body.costRate ?? 0;

    if (!positionLevel || typeof positionLevel !== 'string') {
      return res.status(400).json({ error: 'position_level is required' });
    }

    if (typeof billingRate !== 'number' || Number.isNaN(billingRate) || billingRate < 0) {
      return res.status(400).json({ error: 'Billing rate must be a positive number' });
    }

    if (typeof costRate !== 'number' || Number.isNaN(costRate) || costRate < 0) {
      return res.status(400).json({ error: 'Cost rate must be a positive number' });
    }

    const existing = await prisma.positionRole.findUnique({
      where: { name: positionLevel },
    });
    if (existing) {
      return res.status(409).json({ error: 'Position level already exists' });
    }

    const role = await prisma.positionRole.create({
      data: {
        name: positionLevel,
        billingRate,
        costRate,
        isActive: true,
      },
    });

    await createAudit({
      user_id: req.user?.userId,
      action: `POSITION_RATE_CREATED:${positionLevel}`,
      entity_type: 'PositionRole',
    });

    res.status(201).json(mapRate(role));
  } catch (error: any) {
    console.error('Error creating position rate:', error);
    res.status(500).json({ error: 'Failed to create position rate' });
  }
});

// PATCH /position-rates/:id - Update position rate
router.patch('/:id', authMiddleware, requireHROrAdmin, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: 'Invalid id' });
    }

    const billingRate = req.body.billing_rate ?? req.body.billingRate;
    const costRate = req.body.cost_rate ?? req.body.costRate;
    const isActive = req.body.is_active ?? req.body.isActive;

    const existing = await prisma.positionRole.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'Position rate not found' });
    }

    const data: any = {};
    if (typeof billingRate === 'number') data.billingRate = billingRate;
    if (typeof costRate === 'number') data.costRate = costRate;
    if (typeof isActive === 'boolean') data.isActive = isActive;

    const updated = await prisma.positionRole.update({ where: { id }, data });

    await createAudit({
      user_id: req.user?.userId,
      action: `POSITION_RATE_UPDATED:${existing.name}`,
      entity_type: 'PositionRole',
    });

    res.json(mapRate(updated));
  } catch (error: any) {
    console.error('Error updating position rate:', error);
    res.status(500).json({ error: 'Failed to update position rate' });
  }
});

// DELETE /position-rates/:id - Deactivate position rate (soft delete)
router.delete('/:id', authMiddleware, requireHROrAdmin, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: 'Invalid id' });
    }

    const existing = await prisma.positionRole.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'Position rate not found' });
    }

    const updated = await prisma.positionRole.update({
      where: { id },
      data: { isActive: false },
    });

    await createAudit({
      user_id: req.user?.userId,
      action: `POSITION_RATE_DELETED:${existing.name}`,
      entity_type: 'PositionRole',
    });

    res.json({ message: 'Position rate deactivated successfully', rate: mapRate(updated) });
  } catch (error: any) {
    console.error('Error deactivating position rate:', error);
    res.status(500).json({ error: 'Failed to deactivate position rate' });
  }
});

// GET /position-rates/by-level/:level - Get rate by position level
router.get('/by-level/:level', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const level = req.params.level;
    const role = await prisma.positionRole.findUnique({
      where: { name: level },
    });

    if (!role || !role.isActive) {
      return res.status(404).json({ error: 'Position rate not found for this level' });
    }

    res.json(mapRate(role));
  } catch (error: any) {
    console.error('Error fetching position rate by level:', error);
    res.status(500).json({ error: 'Failed to fetch position rate by level' });
  }
});

export default router;
