import { Router } from 'express';
import prisma from '../prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

// GET /profiles?status=active&exclude_id=123&limit=50&user_id=3
router.get('/', async (req, res) => {
  try {
    const status = req.query.status as string | undefined;
    const excludeId = req.query.exclude_id as string | undefined;
    const userId = req.query.user_id as string | undefined;
    const includeDepartment = req.query.include_department === 'true';
    const limit = Math.min(1000, Number(req.query.limit as string) || 100);

    // If user_id is provided, return single profile
    if (userId) {
      const profile = await prisma.profile.findFirst({
        where: { userId: Number(userId) },
        include: {
          role: { select: { id: true, name: true, billing_rate: true } },
          ...(includeDepartment && { department: { select: { id: true, name: true } } }),
        },
      });
      if (!profile) return res.status(404).json({ error: 'Profile not found' });
      // Add snake_case user_id for frontend compatibility
      return res.json({ ...profile, user_id: profile.userId });
    }

    // For other queries, use Prisma instead of raw SQL to avoid type issues
    let profiles;
    
    if (excludeId) {
      const excludeUserId = Number(excludeId);
      profiles = await prisma.profile.findMany({
        where: {
          ...(status && { status }),
          userId: { not: excludeUserId },
        },
        include: {
          role: { select: { id: true, name: true, billing_rate: true } },
          ...(includeDepartment && { department: { select: { id: true, name: true } } }),
        },
        take: limit,
        orderBy: { first_name: 'asc' },
      });
    } else {
      profiles = await prisma.profile.findMany({
        where: status ? { status } : {},
        include: {
          role: { select: { id: true, name: true, billing_rate: true } },
          ...(includeDepartment && { department: { select: { id: true, name: true } } }),
        },
        take: limit,
        orderBy: { first_name: 'asc' },
      });
    }
    
    // Add snake_case user_id for frontend compatibility
    const profilesWithUserId = profiles?.map(p => ({ ...p, user_id: p.userId })) || [];
    return res.json(profilesWithUserId);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /profiles/:id?include_department=true
router.get('/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const includeDepartment = req.query.include_department === 'true';

    const profile = await prisma.profile.findUnique({
      where: { id: Number(id) },
      include: {
        role: { select: { id: true, name: true, billing_rate: true } },
        ...(includeDepartment && { department: { select: { id: true, name: true } } }),
      },
    });

    if (!profile) return res.status(404).json({ error: 'Not found' });
    return res.json(profile);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// PATCH /profiles/:id
router.patch('/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const id = req.params.id;
    if (!id) return res.status(400).json({ error: 'id required' });

    // Map snake_case to camelCase for Prisma
    const fieldMapping: Record<string, string> = {
      'first_name': 'first_name',
      'last_name': 'last_name',
      'email': 'email',
      'phone_number': 'phone_number',
      'profile_picture': 'profile_picture',
      'position': 'position',
      'hire_date': 'hire_date',
      'department_id': 'departmentId',
      'manager_id': 'manager_id',
      'status': 'status',
      'hourly_rate': 'hourly_rate',
      'cost_rate': 'cost_rate',
      'is_partner': 'is_partner',
    };

    const updateData: any = {};
    
    for (const [snakeField, prismaField] of Object.entries(fieldMapping)) {
      if (req.body[snakeField] !== undefined) {
        let value = req.body[snakeField];
        
        // Handle null values explicitly
        if (value === '') {
          value = null;
        }
        
        // Convert date strings to DateTime
        if (snakeField === 'hire_date' && value && typeof value === 'string') {
          // Parse date string and convert to ISO-8601 DateTime
          const date = new Date(value);
          if (!isNaN(date.getTime())) {
            value = date.toISOString();
          }
        }
        
        updateData[prismaField] = value;
      }
    }
    
    if (Object.keys(updateData).length === 0) return res.status(400).json({ error: 'No valid fields to update' });

    console.log('Updating profile:', id, 'with data:', updateData);

    // Check if email is being updated and already exists
    if (updateData.email) {
      const existingProfile = await prisma.profile.findFirst({
        where: {
          email: updateData.email,
          NOT: { id: Number(id) }
        }
      });
      if (existingProfile) {
        return res.status(409).json({ error: 'Email already in use' });
      }
    }

    const updated = await prisma.profile.update({
      where: { id: Number(id) },
      data: updateData,
    });
    
    console.log('Profile updated successfully:', updated);
    
    return res.json({ ...updated, user_id: updated.userId });
  } catch (err: any) {
    console.error('Error updating profile:', err);
    return res.status(500).json({ error: err.message, code: err.code });
  }
});

// DELETE /profiles/:id - Delete a profile and associated user account
router.delete('/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const id = req.params.id;
    if (!id) return res.status(400).json({ error: 'id required' });

    // Get the profile to find the user_id
    const profile = await prisma.profile.findUnique({
      where: { id: Number(id) },
    });

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    if (!profile.userId) {
      return res.status(400).json({ error: 'Profile has no associated user' });
    }

    // Delete all sessions/tokens for this user so they can't access the system
    await prisma.session.deleteMany({
      where: { userId: profile.userId },
    });

    // Delete all user roles for this user
    await prisma.userRole.deleteMany({
      where: { userId: profile.userId },
    });

    // Delete the user account completely
    await prisma.user.delete({
      where: { id: profile.userId },
    });
    
    // Delete the profile (should be cascade deleted by user deletion, but ensure it's gone)
    await prisma.profile.delete({
      where: { id: Number(id) },
    }).catch(() => {
      // Profile may already be deleted via cascade
    });
    
    return res.json({ success: true, message: 'User account and profile deleted successfully' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /profiles/me/employee-view - Employee's own profile with read-only restrictions
router.get('/me/employee-view', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user?.sub;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const profile = await prisma.profile.findFirst({
      where: { userId: Number(userId) },
      include: {
        role: { 
          select: { 
            id: true, 
            name: true, 
            billing_rate: true 
          } 
        },
        department: { 
          select: { 
            id: true, 
            name: true 
          } 
        },
        user: {
          select: {
            id: true,
            email: true,
            name: true
          }
        }
      },
    });

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    // Get manager info if manager_id exists
    let manager = null;
    if (profile.manager_id) {
      manager = await prisma.profile.findUnique({
        where: { id: profile.manager_id },
        select: {
          id: true,
          first_name: true,
          last_name: true,
          email: true,
          position: true
        }
      });
    }

    // Return employee profile with proper structure
    const employeeProfile = {
      id: profile.id,
      name: `${profile.first_name} ${profile.last_name}`,
      first_name: profile.first_name,
      last_name: profile.last_name,
      phone_number: profile.phone_number,
      email: profile.email,
      profile_picture: profile.profile_picture,
      
      // Read-only fields (managed by HR/Admin)
      role: profile.role ? {
        id: profile.role.id,
        name: profile.role.name
      } : null,
      hire_date: profile.hire_date,
      position: profile.position,
      department: profile.department ? {
        id: profile.department.id,
        name: profile.department.name
      } : null,
      manager: manager ? {
        id: manager.id,
        name: `${manager.first_name} ${manager.last_name}`,
        email: manager.email,
        position: manager.position
      } : null,
      
      // Meta fields
      user_id: profile.userId,
      status: profile.status,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt
    };

    return res.json(employeeProfile);
  } catch (err: any) {
    console.error('Error fetching employee profile:', err);
    return res.status(500).json({ error: err.message });
  }
});

// PATCH /profiles/me/employee-update - Allow employee to update only certain fields
router.patch('/me/employee-update', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user?.sub;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    // Only allow employees to update these fields
    const allowedFields = ['first_name', 'last_name', 'phone_number', 'profile_picture'];
    const updateData: any = {};
    
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        let value = req.body[field];
        
        // Handle null values explicitly
        if (value === '') {
          value = null;
        }
        
        updateData[field] = value;
      }
    }
    
    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    console.log('Employee updating profile:', userId, 'with data:', updateData);

    // Find the profile by user ID
    const existingProfile = await prisma.profile.findFirst({
      where: { userId: Number(userId) }
    });

    if (!existingProfile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const updated = await prisma.profile.update({
      where: { id: existingProfile.id },
      data: updateData,
    });
    
    console.log('Employee profile updated successfully:', updated);
    
    return res.json({ 
      ...updated, 
      user_id: updated.userId,
      message: 'Profile updated successfully'
    });
  } catch (err: any) {
    console.error('Error updating employee profile:', err);
    return res.status(500).json({ error: err.message, code: err.code });
  }
});

export default router;

