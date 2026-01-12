import { Router } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { createAudit } from '../utils/audit';
import prisma from '../prisma';

const router = Router();

// Middleware: Check if user is HR/Admin/SuperAdmin
const requireHROrAdmin = (req: AuthRequest, res: any, next: any) => {
  const userRoles = req.user?.roles || [];
  const isHROrAdmin = 
    userRoles.includes('super_admin') || 
    userRoles.includes('hr_manager') || 
    userRoles.includes('hr');
  
  if (!isHROrAdmin) {
    return res.status(403).json({ 
      error: 'Access denied. Only HR, HR Manager, and Super Admin can manage position rates' 
    });
  }
  next();
};

/**
 * Position Rates Management Routes
 * 
 * This implements position-based costing system where:
 * - Each position level has billing_rate (what we charge clients)
 * - Each position level has cost_rate (internal cost per hour)
 * - Rates are used to automatically calculate job profitability
 * - Only HR/Admin can modify rates
 */

// GET /position-rates - List all position rates
router.get('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const rates = await prisma.positionRate.findMany({
      where: { is_active: true },
      orderBy: { billing_rate: 'desc' },
    });
    
    res.json(rates);
  } catch (error: any) {
    console.error('Error fetching position rates:', error);
    res.status(500).json({ error: 'Failed to fetch position rates' });
  }
});

// GET /position-rates/:id - Get single position rate
router.get('/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const rate = await prisma.positionRate.findUnique({
      where: { id },
    });
    
    if (!rate) {
      return res.status(404).json({ error: 'Position rate not found' });
    }
    
    res.json(rate);
  } catch (error: any) {
    console.error('Error fetching position rate:', error);
    res.status(500).json({ error: 'Failed to fetch position rate' });
  }
});

// POST /position-rates - Create new position rate
router.post('/', authMiddleware, requireHROrAdmin, async (req: AuthRequest, res) => {
  try {
    const { position_level, billing_rate, cost_rate, effective_from } = req.body;
    
    // Validation
    if (!position_level || typeof position_level !== 'string') {
      return res.status(400).json({ error: 'Position level is required' });
    }
    
    const validLevels = ['group_managing_partner', 'partner', 'manager', 'senior', 'semi_senior', 'associate', 'intern'];
    if (!validLevels.includes(position_level)) {
      return res.status(400).json({ 
        error: `Invalid position level. Must be one of: ${validLevels.join(', ')}` 
      });
    }
    
    if (typeof billing_rate !== 'number' || billing_rate < 0) {
      return res.status(400).json({ error: 'Billing rate must be a positive number' });
    }
    
    if (typeof cost_rate !== 'number' || cost_rate < 0) {
      return res.status(400).json({ error: 'Cost rate must be a positive number' });
    }
    
    // Check if position level already exists and is active
    const existing = await prisma.positionRate.findFirst({ 
      where: { 
        position_level, 
        is_active: true 
      } 
    });
    
    if (existing) {
      return res.status(409).json({ error: 'Position level already has an active rate' });
    }
    
    const rate = await prisma.positionRate.create({
      data: {
        position_level,
        billing_rate,
        cost_rate,
        effective_from: effective_from ? new Date(effective_from) : new Date(),
        is_active: true,
      },
    });
    
    // Audit log
    await createAudit({
      user_id: req.user?.sub,
      action: `POSITION_RATE_CREATED:${position_level}`,
      entity_type: 'PositionRate',
    });
    
    res.status(201).json(rate);
  } catch (error: any) {
    console.error('Error creating position rate:', error);
    res.status(500).json({ error: 'Failed to create position rate' });
  }
});

// PATCH /position-rates/:id - Update position rate
router.patch('/:id', authMiddleware, requireHROrAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { billing_rate, cost_rate, effective_from, is_active } = req.body;
    
    const existing = await prisma.positionRate.findUnique({
      where: { id },
    });
    
    if (!existing) {
      return res.status(404).json({ error: 'Position rate not found' });
    }
    
    // Validate rates if provided
    if (billing_rate !== undefined && (typeof billing_rate !== 'number' || billing_rate < 0)) {
      return res.status(400).json({ error: 'Billing rate must be a positive number' });
    }
    
    if (cost_rate !== undefined && (typeof cost_rate !== 'number' || cost_rate < 0)) {
      return res.status(400).json({ error: 'Cost rate must be a positive number' });
    }
    
    const updateData: any = {};
    if (billing_rate !== undefined) updateData.billing_rate = billing_rate;
    if (cost_rate !== undefined) updateData.cost_rate = cost_rate;
    if (effective_from !== undefined) updateData.effective_from = new Date(effective_from);
    if (is_active !== undefined) updateData.is_active = is_active;
    
    const updatedRate = await prisma.positionRate.update({
      where: { id },
      data: updateData,
    });
    
    // Audit log
    await createAudit({
      user_id: req.user?.sub,
      action: `POSITION_RATE_UPDATED:${existing.position_level}`,
      entity_type: 'PositionRate',
    });
    
    res.json(updatedRate);
  } catch (error: any) {
    console.error('Error updating position rate:', error);
    res.status(500).json({ error: 'Failed to update position rate' });
  }
});

// DELETE /position-rates/:id - Deactivate position rate (soft delete)
router.delete('/:id', authMiddleware, requireHROrAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    
    const existing = await prisma.positionRate.findUnique({
      where: { id },
    });
    
    if (!existing) {
      return res.status(404).json({ error: 'Position rate not found' });
    }
    
    // Soft delete by setting is_active to false
    const deactivatedRate = await prisma.positionRate.update({
      where: { id },
      data: { is_active: false },
    });
    
    // Audit log
    await createAudit({
      user_id: req.user?.sub,
      action: `POSITION_RATE_DELETED:${existing.position_level}`,
      entity_type: 'PositionRate',
    });
    
    res.json({ message: 'Position rate deactivated successfully', rate: deactivatedRate });
  } catch (error: any) {
    console.error('Error deactivating position rate:', error);
    res.status(500).json({ error: 'Failed to deactivate position rate' });
  }
});

// GET /position-rates/by-level/:level - Get rate by position level
router.get('/by-level/:level', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { level } = req.params;
    
    const rate = await prisma.positionRate.findFirst({
      where: { 
        position_level: level,
        is_active: true 
      },
    });
    
    if (!rate) {
      return res.status(404).json({ error: 'Position rate not found for this level' });
    }
    
    res.json(rate);
  } catch (error: any) {
    console.error('Error fetching position rate by level:', error);
    res.status(500).json({ error: 'Failed to fetch position rate' });
  }
});

export default router;
