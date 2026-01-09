import { Router } from 'express';
import prisma from '../prisma';

const router = Router();

// GET /audit_logs?limit=100
router.get('/', async (req, res) => {
  const limitRaw = req.query.limit as string | undefined;
  const limit = limitRaw ? Math.min(1000, Number(limitRaw) || 100) : 100;
  try {
    const logs = await prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    // transform to snake_case keys expected by frontend
    const out = logs.map(l => ({
      id: l.id,
      action: l.action,
      entity_type: l.entityType || '',
      user_id: l.userId != null ? String(l.userId) : null,
      ip_address: l.ipAddress || null,
      created_at: l.createdAt,
    }));
    return res.json(out);
  } catch (err: any) {
    console.error('Error fetching audit logs:', err);
    return res.status(500).json({ error: err.message });
  }
});

// POST /audit_logs
router.post('/', async (req, res) => {
  const { action, entity_type, user_id, ip_address } = req.body;
  try {
    const created = await prisma.auditLog.create({
      data: {
        action: action || '',
        entityType: entity_type || null,
        ipAddress: ip_address || null,
        userId: user_id ? Number(user_id) : null,
      }
    });
    return res.status(201).json({ id: created.id });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
