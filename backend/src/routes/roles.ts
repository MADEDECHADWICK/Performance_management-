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
    userRoles.includes('hr_manager') || 
    userRoles.includes('hr') ||
    userRoles.includes('admin');
  
  if (!isHROrAdmin) {
    return res.status(403).json({ 
      error: 'Access denied. Only HR, HR Manager, and Super Admin can manage roles' 
    });
  }
  next();
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
router.post('/', authMiddleware, requireHROrAdmin, async (req: AuthRequest, res) => {
  try {
    const { name, description } = req.body;
    const billingRate = req.body.billingRate ?? req.body.billing_rate;
    const costRate = req.body.costRate ?? req.body.cost_rate ?? 0;
    const permissions = req.body.permissions ?? req.body.defaultAccess ?? [];
    const isActive = req.body.isActive ?? req.body.is_active ?? true;
    
    // Validation
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'Role name is required' });
    }
    
    if (typeof billingRate !== 'number' || Number.isNaN(billingRate) || billingRate < 0) {
      return res.status(400).json({ error: 'Billing rate must be a positive number' });
    }
    if (typeof costRate !== 'number' || Number.isNaN(costRate) || costRate < 0) {
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
        billingRate,
        costRate,
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
router.put('/:id', authMiddleware, requireHROrAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { name, description } = req.body;
    const billingRate = req.body.billingRate ?? req.body.billing_rate;
    const costRate = req.body.costRate ?? req.body.cost_rate;
    const permissions = req.body.permissions ?? req.body.defaultAccess;
    const isActive = req.body.isActive ?? req.body.is_active;
    
    // Check if role exists
    const role = await prisma.positionRole.findUnique({
      where: { id: parseInt(id) },
    });
    
    if (!role) {
      return res.status(404).json({ error: 'Role not found' });
    }
    
    // Prepare update data
    const updateData: any = {};
    if (name) updateData.name = name;
    if (typeof billingRate === 'number') updateData.billingRate = billingRate;
    if (typeof costRate === 'number') updateData.costRate = costRate;
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
router.delete('/:id', authMiddleware, requireHROrAdmin, async (req: AuthRequest, res) => {
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
