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
    const userIds = Array.from(
      new Set(
        logs
          .map((log) => (log.userId != null ? Number(log.userId) : null))
          .filter((id): id is number => Number.isFinite(id))
      )
    );
    const profileIds = Array.from(
      new Set(
        logs
          .map((log) => {
            const meta = (log.metadata ?? {}) as Record<string, any>;
            return (
              meta.actorProfileId ??
              meta.profileId ??
              meta.performedByProfileId ??
              meta.approvedByProfileId ??
              meta.assignedByProfileId ??
              null
            );
          })
          .filter((id): id is number => Number.isFinite(Number(id)))
          .map((id) => Number(id))
      )
    );
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

    const actorLookup = new Map<number, string>();
    if (userIds.length > 0) {
      const users = await prisma.user.findMany({
        where: { id: { in: userIds } },
        include: { profile: { select: { firstName: true, lastName: true } } },
      });
      users.forEach((user) => {
        const name = user.profile
          ? `${user.profile.firstName} ${user.profile.lastName}`
          : user.email || `User #${user.id}`;
        actorLookup.set(user.id, name);
      });
    }

    const profileLookup = new Map<number, string>();
    if (profileIds.length > 0) {
      const profiles = await prisma.profile.findMany({
        where: { id: { in: profileIds } },
        select: { id: true, firstName: true, lastName: true },
      });
      profiles.forEach((profile) => {
        profileLookup.set(profile.id, `${profile.firstName} ${profile.lastName}`);
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
      actor_name:
        l.userId != null
          ? actorLookup.get(Number(l.userId)) || null
          : (() => {
              const meta = (l.metadata ?? {}) as Record<string, any>;
              const profileId =
                meta.actorProfileId ??
                meta.profileId ??
                meta.performedByProfileId ??
                meta.approvedByProfileId ??
                meta.assignedByProfileId ??
                null;
              return profileId != null
                ? profileLookup.get(Number(profileId)) || null
                : null;
            })(),
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
  return res.status(405).json({
    error: "Direct audit log writes are disabled. Use audited domain endpoints.",
  });
});

export default router;
