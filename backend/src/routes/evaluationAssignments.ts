import { Router } from 'express';
import prisma from '../prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { createAudit } from '../utils/audit';

const router = Router();

// GET /evaluation_assignments?status=pending
router.get('/', async (req, res) => {
  try {
    const status = req.query.status as string | undefined;
    const evaluatorId = req.query.evaluator_id as string | undefined;
    const limit = Math.min(1000, Number(req.query.limit as string) || 200);
    if (status) {
      const rows = await prisma.$queryRaw`SELECT * FROM evaluation_assignments WHERE status = ${status} ORDER BY "createdAt" DESC LIMIT ${limit}`;
      return res.json(rows || []);
    }
    if (evaluatorId) {
      const rows = await prisma.$queryRaw`SELECT * FROM evaluation_assignments WHERE evaluator_id = ${evaluatorId} ORDER BY "createdAt" DESC LIMIT ${limit}`;
      return res.json(rows || []);
    }
    const rows = await prisma.$queryRaw`SELECT * FROM evaluation_assignments ORDER BY "createdAt" DESC LIMIT ${limit}`;
    return res.json(rows || []);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /evaluation_assignments  (accepts array of assignments)
router.post('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const payload = req.body;
    if (!payload) return res.status(400).json({ error: 'No payload' });
    // If payload is an array, insert multiple
    if (Array.isArray(payload)) {
      const values = payload.map((p: any) => `(${p.ad_hoc_evaluation_id}, ${p.evaluator_id}, ${p.evaluatee_id}, '${p.evaluation_type}', '${p.status || 'pending'}', now())`).join(',');
      const sql = `INSERT INTO evaluation_assignments (ad_hoc_evaluation_id, evaluator_id, evaluatee_id, evaluation_type, status, created_at) VALUES ${values} RETURNING *`;
      const created = await prisma.$queryRawUnsafe<any>(sql);
      const performedBy = req.user?.sub ? Number(req.user.sub) : undefined;
      await createAudit({ action: `create_assignments:${(created as any[]).length}`, entity_type: 'evaluation_assignment', user_id: performedBy, ip_address: req.ip });
      return res.status(201).json(created || []);
    }
    // Single insert
    const p = payload;
    const created = await prisma.$queryRaw<any>`
      INSERT INTO evaluation_assignments (ad_hoc_evaluation_id, evaluator_id, evaluatee_id, evaluation_type, status, created_at)
      VALUES (${p.ad_hoc_evaluation_id}, ${p.evaluator_id}, ${p.evaluatee_id}, ${p.evaluation_type || 'downward'}, ${p.status || 'pending'}, now())
      RETURNING *`;
    const performedBy = req.user?.sub ? Number(req.user.sub) : undefined;
    await createAudit({ action: `create_assignment:${p.ad_hoc_evaluation_id}`, entity_type: 'evaluation_assignment', user_id: performedBy, ip_address: req.ip });
    return res.status(201).json((created as any[])[0] ?? null);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
