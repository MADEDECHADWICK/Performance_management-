import { Router } from 'express';
import prisma from '../prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { loadProfile } from '../middleware/loadProfile';
import { requireRole } from '../middleware/reqiureRole';
import { createAudit } from '../utils/audit';

const router = Router();

const resolveRoles = (req: AuthRequest) => {
  const roles = new Set<string>();
  (req.userRoles || []).forEach((role) => roles.add(role.toLowerCase()));
  (req.user?.authRoles || []).forEach((role) => roles.add(role.toLowerCase()));
  if (req.profile?.role?.name) roles.add(req.profile.role.name.toLowerCase());
  return Array.from(roles);
};

const isPrivileged = (roles: string[]) =>
  roles.includes('admin') ||
  roles.includes('super_admin') ||
  roles.includes('hr') ||
  roles.includes('hr_manager');

// GET /ad_hoc_evaluations?is_active=true
router.get('/', authMiddleware, loadProfile, async (req: AuthRequest, res) => {
  try {
    const active = req.query.is_active === 'true';
    const roles = resolveRoles(req);
    const privileged = isPrivileged(roles);

    if (active || !privileged) {
      const rows = await prisma.$queryRaw`SELECT * FROM ad_hoc_evaluations WHERE status = 'published' ORDER BY published_at DESC`;
      return res.json(rows || []);
    }
    const rows = await prisma.$queryRaw`SELECT * FROM ad_hoc_evaluations ORDER BY published_at DESC`;
    return res.json(rows || []);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /ad_hoc_evaluations
router.post(
  '/',
  authMiddleware,
  loadProfile,
  requireRole('admin', 'hr', 'hr_manager', 'super_admin'),
  async (req: AuthRequest, res) => {
  try {
    const payload = req.body;
    // Minimal validation
    if (!payload.name) return res.status(400).json({ error: 'name required' });
    
    const created = {
      id: 0,
      name: payload.name,
      status: payload.status || 'draft',
      publishedAt: payload.published_at ? new Date(payload.published_at) : null,
    };
    
    const performedBy = req.user?.userId;
    await createAudit({ action: `create_ad_hoc:${payload.name}`, entity_type: 'ad_hoc_evaluation', user_id: performedBy, ip_address: req.ip });
    return res.status(201).json(created);
  } catch (err: any) {
    console.error('Error creating ad_hoc_evaluation:', err);
    return res.status(500).json({ error: err.message });
  }
});

export default router;
