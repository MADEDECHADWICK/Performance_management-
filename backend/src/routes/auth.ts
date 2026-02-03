import { Router } from 'express';
import bcrypt from "bcryptjs";
import jwt from 'jsonwebtoken';
import { Prisma } from '@prisma/client';
import prisma from '../prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

router.post('/register', async (req, res) => {
  const { email, password, name, first_name, last_name, firstName, lastName } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  try {
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(409).json({ error: 'Email already in use' });
    }

    const hashed = await bcrypt.hash(password, 10);
    
    // User model only has email, password - no name field
    const user = await prisma.user.create({ 
      data: { email, password: hashed } 
    });
    
    // Parse name into first/last or use provided first_name/last_name
    const [parsedFirst, ...restName] = name ? name.split(' ') : [];
    const parsedLast = restName.join(' ');
    const resolvedFirstName = firstName || first_name || parsedFirst || 'User';
    const resolvedLastName = lastName || last_name || parsedLast || '';
    
    const defaultBillingRole = await prisma.positionRole.findFirst({
      where: {
        name: { in: ['Associate', 'Trainee'] },
        isActive: true,
      },
      orderBy: { name: 'asc' },
    });

    // Create corresponding profile with the name
    await prisma.profile.create({
      data: {
        userId: user.id,
        firstName: resolvedFirstName,
        lastName: resolvedLastName,
        status: 'active',
        roleId: defaultBillingRole?.id,
      }
    });
    
    res.json({ 
      id: user.id, 
      email: user.email, 
      name: `${resolvedFirstName} ${resolvedLastName}`.trim() 
    });
  } catch (err: any) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return res.status(409).json({ error: 'Email already in use' });
    }
    res.status(500).json({ error: 'Failed to register user' });
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  try {
    const user = await prisma.user.findUnique({ 
      where: { email },
      include: { 
        roles: { include: { role: true } },
        profile: { include: { role: true, department: true } }
      }
    });
    if (!user || !user.password) return res.status(401).json({ error: 'Invalid credentials' });
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
    
    const authRoles = user.roles.map(r => r.role.name);
    
    // Extract job role info (for billing and permissions)
    const jobRole = user.profile?.role ? {
      id: user.profile.role.id,
      name: user.profile.role.name,
      billingRate: user.profile.role.billingRate,
      defaultAccess: user.profile.role.defaultAccess,
    } : null;
    
    const secret = process.env.JWT_SECRET || 'change-me';
    const token = jwt.sign({ 
      userId: user.id,
      sub: user.id,
      email: user.email, 
      profileId: user.profile?.id,
      authRoles,  // Authentication roles: super_admin, hr_manager, partner, employee
      jobRole     // Job role with billing rate
    }, secret, { expiresIn: '7d' });
    
    res.json({ 
      token, 
      user: { 
        id: user.id, 
        email: user.email, 
        name: user.profile ? `${user.profile.firstName} ${user.profile.lastName}`.trim() : undefined,
        roles: authRoles,
        authRoles,
        jobRole,
        profile: user.profile ?? null,
        isPartner: authRoles.includes('partner') || !!user.profile?.isPartner,
        is_partner: authRoles.includes('partner') || !!user.profile?.isPartner
      } 
    });
  } catch (err: any) {
    console.error('Login error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/debug-me', authMiddleware, async (req: AuthRequest, res) => {
  const userId = req.user?.userId;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  
  try {
    const user = await prisma.user.findUnique({ 
      where: { id: userId },
      include: {
        roles: { include: { role: true } },
        profile: { include: { role: true, department: true } }
      }
    });
    if (!user) return res.status(404).json({ error: 'Not found' });
    
    // Return JWT token content + DB roles for debugging
    res.json({
      jwt_payload: req.user,
      database_user: {
        id: user.id,
        email: user.email,
        name: user.profile ? `${user.profile.firstName} ${user.profile.lastName}`.trim() : undefined,
        roles_in_db: user.roles.map(r => r.role.name)
      }
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/me', authMiddleware, async (req: AuthRequest, res) => {
  const userId = req.user?.userId;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  
  try {
    const user = await prisma.user.findUnique({ 
      where: { id: userId },
      include: {
        roles: { include: { role: true } },
        profile: true
      }
    });
    if (!user) return res.status(404).json({ error: 'Not found' });
    
    // Check if user is a partner
    let partner = null;
    if (user.profile) {
      partner = await prisma.partner.findUnique({
        where: { profileId: user.profile.id },
        include: { company: true }
      });
    }
    
    const roles = user.roles.map(r => r.role.name);
    
    res.json({ 
      id: user.id, 
      email: user.email, 
      name: user.profile ? `${user.profile.firstName} ${user.profile.lastName}`.trim() : undefined,
      profileId: user.profile?.id,
      profile_id: user.profile?.id,
      profile: user.profile ?? null,
      roles,
      isPartner: roles.includes('partner'),
      is_partner: roles.includes('partner'),
      partner: partner ? {
        id: partner.id,
        profileId: partner.profileId,
        profile_id: partner.profileId,
        companyName: partner.company?.companyName,
        company_name: partner.company?.companyName,
        commissionRate: partner.commissionRate,
        commission_rate: partner.commissionRate,
        performanceThreshold: partner.performanceThreshold,
        performance_threshold: partner.performanceThreshold
      } : null
    });
  } catch (err: any) {
    console.error('Get user error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
