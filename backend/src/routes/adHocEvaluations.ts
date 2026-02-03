import { Router } from 'express';
import prisma from '../prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { createAudit } from '../utils/audit';

const router = Router();

// GET /ad_hoc_evaluations?is_active=true
router.get('/', async (req, res) => {
  try {
    const active = req.query.is_active === 'true';
    if (active) {
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
router.post('/', authMiddleware, async (req: AuthRequest, res) => {
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
