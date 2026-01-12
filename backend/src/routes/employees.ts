import { Router } from 'express';
import prisma from '../prisma';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// GET /employees - Returns employees in expected format for frontend
router.get('/', authMiddleware, async (req, res) => {
  try {
    const profiles = await prisma.profile.findMany({
      where: {
        status: 'active'
      },
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
            name: true,
            department_code: true
          }
        }
      }
    });

    // Transform to expected frontend format
    const employees = profiles.map(profile => ({
      id: profile.userId,
      first_name: profile.first_name,
      last_name: profile.last_name,
      email: profile.email,
      position: profile.position,
      department: profile.department?.name || 'Not assigned',
      department_id: profile.departmentId,
      role: profile.role?.name || 'Employee',
      role_id: profile.role_id,
      hourly_rate: profile.role?.billing_rate || 0,
      cost_rate: profile.role?.billing_rate || 0,
      experience_years: profile.position_level === 'senior' ? 5 : 
                       profile.position_level === 'manager' ? 4 : 
                       profile.position_level === 'partner' ? 6 : 1,
      is_partner: profile.is_partner || profile.position?.toLowerCase().includes('partner') || false,
      status: profile.status
    }));

    res.json({ employees });

  } catch (error) {
    console.error('Error fetching employees:', error);
    res.status(500).json({ 
      error: 'Failed to fetch employees',
      details: error.message
    });
  }
});

// GET /employees/partners - Get only partners
router.get('/partners', authMiddleware, async (req, res) => {
  try {
    const profiles = await prisma.profile.findMany({
      where: {
        status: 'active',
        OR: [
          { position: { contains: 'Partner', mode: 'insensitive' } },
          { position: { contains: 'Managing', mode: 'insensitive' } }
        ]
      },
      include: {
        role: true,
        department: true
      }
    });

    const partners = profiles.map(profile => ({
      id: profile.userId,
      first_name: profile.firstName,
      last_name: profile.lastName,
      position: profile.position,
      department: profile.department?.name,
      role: profile.role?.name
    }));

    res.json({ partners });

  } catch (error) {
    console.error('Error fetching partners:', error);
    res.status(500).json({ error: 'Failed to fetch partners' });
  }
});

// GET /employees/managers - Get only managers
router.get('/managers', authMiddleware, async (req, res) => {
  try {
    const profiles = await prisma.profile.findMany({
      where: {
        status: 'active',
        position: { contains: 'Manager', mode: 'insensitive' }
      },
      include: {
        role: true,
        department: true
      }
    });

    const managers = profiles.map(profile => ({
      id: profile.userId,
      first_name: profile.firstName,
      last_name: profile.lastName,
      position: profile.position,
      department: profile.department?.name,
      role: profile.role?.name
    }));

    res.json({ managers });

  } catch (error) {
    console.error('Error fetching managers:', error);
    res.status(500).json({ error: 'Failed to fetch managers' });
  }
});

export default router;