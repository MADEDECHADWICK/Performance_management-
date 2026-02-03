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
    const scoreIds = logs
      .filter((log) => log.entityType === 'performance_score' && log.entityId)
      .map((log) => log.entityId as number);
    const scoreLookup = new Map<number, { employeeName: string }>();
    if (scoreIds.length > 0) {
      const scores = await prisma.performanceScore.findMany({
        where: { id: { in: scoreIds } },
        include: { employee: { select: { firstName: true, lastName: true } } },
      });
      scores.forEach((score) => {
        const name = score.employee
          ? `${score.employee.firstName} ${score.employee.lastName}`
          : "Employee";
        scoreLookup.set(score.id, { employeeName: name });
      });
    }
    // transform to snake_case keys expected by frontend
    const out = logs.map(l => ({
      id: l.id,
      action: l.action,
      entity_type: l.entityType || '',
      entity_id: l.entityId ?? null,
      user_id: l.userId != null ? String(l.userId) : null,
      ip_address: l.ipAddress || null,
      metadata: l.metadata ?? null,
      employee_name:
        l.entityType === 'performance_score' && l.entityId
          ? scoreLookup.get(l.entityId)?.employeeName || null
          : null,
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
