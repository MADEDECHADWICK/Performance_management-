// This file defines the API routes for managing employee roles. It includes endpoints for listing all employees with their current roles, retrieving a single employee's role, assigning or updating an employee's role, and fetching the role change history for an employee. The routes are protected with authentication and role-based access control middleware to ensure that only authorized users can perform these actions. The implementation also includes error handling and audit logging to track changes to employee roles. By organizing these routes in a dedicated file, we can maintain a clear structure for our API and facilitate the management of employee roles within the application.

import { Router } from 'express';
import prisma from '../prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { requireModuleAccess } from '../middleware/requireModuleAccess';
import { createAudit } from '../utils/audit';

const router = Router();
const canManageEmployeeRoles = requireModuleAccess('users', 'admin');

// GET /employees - List all employees with their current roles
router.get('/', authMiddleware, canManageEmployeeRoles, async (req: AuthRequest, res) => {
  try {
    const employees = await prisma.profile.findMany({
      include: {
        role: true,
        user: {
          select: { email: true },
        },
      },
      orderBy: { firstName: 'asc' },
    });
    
    res.json(employees);
  } catch (error: any) {
    console.error('Error fetching employees:', error);
    res.status(500).json({ error: 'Failed to fetch employees' });
  }
});

// GET /employees/:employeeId - Get single employee with role
router.get('/:employeeId', authMiddleware, canManageEmployeeRoles, async (req: AuthRequest, res) => {
  try {
    const { employeeId } = req.params;
    
    const employee = await prisma.profile.findUnique({
      where: { id: parseInt(employeeId) },
      include: {
        role: true,
        user: {
          select: { email: true },
        },
      },
    });
    
    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    
    res.json(employee);
  } catch (error: any) {
    console.error('Error fetching employee:', error);
    res.status(500).json({ error: 'Failed to fetch employee' });
  }
});

// PUT /employees/:employeeId/role - Assign/update employee role
router.put('/:employeeId/role', authMiddleware, canManageEmployeeRoles, async (req: AuthRequest, res) => {
  try {
    const { employeeId } = req.params;
    const roleId = req.body.roleId;
    const { notes } = req.body;
    
    // Validate inputs
    if (!roleId || typeof roleId !== 'number') {
      return res.status(400).json({ error: 'Valid roleId is required' });
    }
    
    // Check if employee exists
    const employee = await prisma.profile.findUnique({
      where: { id: parseInt(employeeId) },
      include: { role: true },
    });
    
    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    
    // Check if new role exists
    const newRole = await prisma.positionRole.findUnique({
      where: { id: roleId },
    });
    
    if (!newRole) {
      return res.status(404).json({ error: 'Role not found' });
    }
    
    if (!newRole.isActive) {
      return res.status(400).json({ error: 'Cannot assign an inactive role' });
    }
    
    // Store old role name for audit
    const oldRoleName = employee.role?.name || 'None';
    
    // Update employee role
    const updated = await prisma.profile.update({
      where: { id: parseInt(employeeId) },
      data: { roleId },
      include: { role: true },
    });
    
    // Audit log
    await createAudit({
      user_id: req.user?.userId,
      action: 'EMPLOYEE_ROLE_ASSIGNED',
      entity_type: 'Profile',
      ip_address: req.ip,
    });
    
    res.json({
      message: 'Employee role updated successfully',
      employee: updated,
    });
  } catch (error: any) {
    console.error('Error updating employee role:', error);
    res.status(500).json({ error: 'Failed to update employee role' });
  }
});

// GET /employees/:employeeId/role-history - Get role change history (optional, for audit trail)
router.get('/:employeeId/role-history', authMiddleware, canManageEmployeeRoles, async (req: AuthRequest, res) => {
  try {
    const { employeeId } = req.params;
    
    // Check if employee exists
    const employee = await prisma.profile.findUnique({
      where: { id: parseInt(employeeId) },
    });
    
    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    
    // Get audit logs for this employee
    const history = await prisma.auditLog.findMany({
      where: {
        entityType: 'Profile',
        action: 'EMPLOYEE_ROLE_ASSIGNED',
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    
    res.json(history);
  } catch (error: any) {
    console.error('Error fetching role history:', error);
    res.status(500).json({ error: 'Failed to fetch role history' });
  }
});

export default router;
