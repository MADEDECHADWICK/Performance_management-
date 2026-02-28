import { Router } from 'express';
import prisma from '../prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { requireModuleAccess } from '../middleware/requireModuleAccess';
import { createAudit } from '../utils/audit';

const router = Router();
const canManageRoles = requireModuleAccess('users', 'admin');

const parseOptionalRate = (value: unknown): number | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  return parsed;
};

const normalizePermissions = (value: unknown) => {
  if (Array.isArray(value)) {
    return value;
  }
  return [];
};

const formatPositionRole = (role: any) => ({
  id: role.id,
  name: role.name,
  description: role.description,
  billingRate: Number(role.billingRate ?? 0),
  costRate: Number(role.costRate ?? 0),
  permissions: normalizePermissions(role.defaultAccess),
  isActive: role.isActive,
  createdAt: role.createdAt,
  updatedAt: role.updatedAt,
});

// GET /roles - List all active billing positions
router.get('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const roles = await prisma.positionRole.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
    res.json(roles.map(formatPositionRole));
  } catch (error: any) {
    console.error('Error fetching roles:', error);
    res.status(500).json({ error: 'Failed to fetch roles' });
  }
});

// GET /roles/:id - Get single role
router.get('/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const role = await prisma.positionRole.findUnique({
      where: { id: parseInt(id) },
    });
    
    if (!role) {
      return res.status(404).json({ error: 'Role not found' });
    }
    
    res.json(formatPositionRole(role));
  } catch (error: any) {
    console.error('Error fetching role:', error);
    res.status(500).json({ error: 'Failed to fetch role' });
  }
});

// POST /roles - Create new role
router.post('/', authMiddleware, canManageRoles, async (req: AuthRequest, res) => {
  try {
    const { name, description } = req.body;
    const billingRateRaw = req.body.billingRate;
    const costRateRaw = req.body.costRate;
    const billingRate = parseOptionalRate(billingRateRaw);
    const costRate = parseOptionalRate(costRateRaw);
    const permissions = req.body.permissions ?? req.body.defaultAccess ?? [];
    const isActive = req.body.isActive ?? true;
    
    // Validation
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'Role name is required' });
    }
    
    if (billingRateRaw !== undefined && (billingRate === undefined || billingRate < 0)) {
      return res.status(400).json({ error: 'Billing rate must be a positive number' });
    }
    if (costRateRaw !== undefined && (costRate === undefined || costRate < 0)) {
      return res.status(400).json({ error: 'Cost rate must be a positive number' });
    }
    
    // Check if role already exists
    const existing = await prisma.positionRole.findUnique({ where: { name } });
    if (existing) {
      return res.status(409).json({ error: 'Role already exists' });
    }
    
    const role = await prisma.positionRole.create({
      data: {
        name,
        billingRate: billingRate ?? 0,
        costRate: costRate ?? 0,
        defaultAccess: normalizePermissions(permissions),
        description: description || null,
        isActive,
      },
    });
    
    // Audit log
    await createAudit({
      user_id: req.user?.userId,
      action: 'ROLE_CREATED',
      entity_type: 'Role',
    });
    
    res.status(201).json(formatPositionRole(role));
  } catch (error: any) {
    console.error('Error creating role:', error);
    res.status(500).json({ error: 'Failed to create role' });
  }
});

// PUT /roles/:id - Update role
router.put('/:id', authMiddleware, canManageRoles, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { name, description } = req.body;
    const billingRateRaw = req.body.billingRate;
    const costRateRaw = req.body.costRate;
    const billingRate = parseOptionalRate(billingRateRaw);
    const costRate = parseOptionalRate(costRateRaw);
    const permissions = req.body.permissions ?? req.body.defaultAccess;
    const isActive = req.body.isActive;
    
    // Check if role exists
    const role = await prisma.positionRole.findUnique({
      where: { id: parseInt(id) },
    });
    
    if (!role) {
      return res.status(404).json({ error: 'Role not found' });
    }
    
    if (billingRateRaw !== undefined && (billingRate === undefined || billingRate < 0)) {
      return res.status(400).json({ error: 'Billing rate must be a positive number' });
    }
    if (costRateRaw !== undefined && (costRate === undefined || costRate < 0)) {
      return res.status(400).json({ error: 'Cost rate must be a positive number' });
    }

    // Prepare update data
    const updateData: any = {};
    if (name) updateData.name = name;
    if (billingRateRaw !== undefined && billingRate !== undefined) updateData.billingRate = billingRate;
    if (costRateRaw !== undefined && costRate !== undefined) updateData.costRate = costRate;
    if (permissions !== undefined) updateData.defaultAccess = normalizePermissions(permissions);
    if (description) updateData.description = description;
    if (typeof isActive === 'boolean') updateData.isActive = isActive;
    
    const updated = await prisma.positionRole.update({
      where: { id: parseInt(id) },
      data: updateData,
    });
    
    // Audit log
    await createAudit({
      user_id: req.user?.userId,
      action: 'ROLE_UPDATED',
      entity_type: 'Role',
    });
    
    res.json(formatPositionRole(updated));
  } catch (error: any) {
    console.error('Error updating role:', error);
    res.status(500).json({ error: 'Failed to update role' });
  }
});

// DELETE /roles/:id - Deactivate role (soft delete)
router.delete('/:id', authMiddleware, canManageRoles, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    
    // Check if role exists
    const role = await prisma.positionRole.findUnique({
      where: { id: parseInt(id) },
    });
    
    if (!role) {
      return res.status(404).json({ error: 'Role not found' });
    }
    
    // Check if role is in use
    const profileCount = await prisma.profile.count({
      where: { roleId: parseInt(id) },
    });
    
    if (profileCount > 0) {
      return res.status(409).json({ 
        error: `Cannot delete role. ${profileCount} employee(s) are assigned to this role.` 
      });
    }
    
    // Soft delete - just deactivate
    const updated = await prisma.positionRole.update({
      where: { id: parseInt(id) },
      data: { isActive: false },
    });
    
    // Audit log
    await createAudit({
      user_id: req.user?.userId,
      action: 'ROLE_DEACTIVATED',
      entity_type: 'Role',
    });
    
    res.json({ message: 'Role deactivated successfully', role: formatPositionRole(updated) });
  } catch (error: any) {
    console.error('Error deleting role:', error);
    res.status(500).json({ error: 'Failed to delete role' });
  }
});

export default router;
