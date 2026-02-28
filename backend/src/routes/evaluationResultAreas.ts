import { Router } from 'express';
import prisma from '../prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { loadProfile } from '../middleware/loadProfile';
import { requireModuleAccess } from '../middleware/requireModuleAccess';
import { createAudit } from '../utils/audit';

const router = Router();
const toCamelKey = (key: string) => key.replace(/_([a-z])/g, (_, ch: string) => ch.toUpperCase());
const toCamelRow = (row: any) =>
  Object.fromEntries(
    Object.entries(row || {}).map(([key, value]) => [toCamelKey(key), value])
  );

// GET /evaluation_result_areas?adHocEvaluationId=xxx
router.get(
  '/',
  authMiddleware,
  loadProfile,
  requireModuleAccess('evaluations', 'admin'),
  async (req, res) => {
  try {
    const { adHocEvaluationId } = req.query;
    let query = 'SELECT * FROM evaluation_result_areas';
    const params: any[] = [];

    if (adHocEvaluationId) {
      query += ' WHERE ad_hoc_evaluation_id = $1';
      params.push(adHocEvaluationId);
    }

    query += ' ORDER BY "createdAt" DESC';

    const rows = await prisma.$queryRawUnsafe(query, ...params);
    return res.json((rows as any[] || []).map(toCamelRow));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /evaluation_result_areas - Batch insert KPIs
router.post(
  '/',
  authMiddleware,
  loadProfile,
  requireModuleAccess('evaluations', 'admin'),
  async (req: AuthRequest, res) => {
  try {
    const { kpis } = req.body;
    if (!kpis || !Array.isArray(kpis) || kpis.length === 0) {
      return res.status(400).json({ error: 'kpis array required' });
    }

    const created: any[] = [];
    for (const kpi of kpis) {
      if (!kpi.adHocEvaluationId || !kpi.kpiId) {
        return res.status(400).json({ error: 'adHocEvaluationId and kpiId required' });
      }

      const result = await prisma.$queryRaw`
        INSERT INTO evaluation_result_areas (ad_hoc_evaluation_id, kpi_id, evaluator_type, weight)
        VALUES (${kpi.adHocEvaluationId}, ${kpi.kpiId}, ${kpi.evaluatorType || null}, ${kpi.weight || 0})
        RETURNING *`;
      created.push(toCamelRow(Array.isArray(result) ? result[0] : result));
    }

    const performedBy = req.user?.userId ? Number(req.user.userId) : undefined;
    await createAudit({
      action: `create_evaluation_result_areas`,
      entity_type: 'evaluation_result_areas',
      user_id: performedBy,
      ip_address: req.ip
    });

    return res.status(201).json(created);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
