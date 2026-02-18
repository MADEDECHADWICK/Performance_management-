import { Router } from 'express';
import prisma from '../prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { loadProfile } from '../middleware/loadProfile';
import { requireRole } from '../middleware/reqiureRole';
import { createAudit } from '../utils/audit';

const router = Router();

// GET /evaluation_result_areas?ad_hoc_evaluation_id=xxx
router.get(
  '/',
  authMiddleware,
  loadProfile,
  requireRole('admin', 'hr', 'hr_manager', 'super_admin'),
  async (req, res) => {
  try {
    const { ad_hoc_evaluation_id, fields } = req.query;
    let query = 'SELECT * FROM evaluation_result_areas';
    const params: any[] = [];

    if (ad_hoc_evaluation_id) {
      query += ' WHERE ad_hoc_evaluation_id = $1';
      params.push(ad_hoc_evaluation_id);
    }

    query += ' ORDER BY "createdAt" DESC';

    const rows = await prisma.$queryRawUnsafe(query, ...params);
    return res.json(rows || []);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /evaluation_result_areas - Batch insert KPIs
router.post(
  '/',
  authMiddleware,
  loadProfile,
  requireRole('admin', 'hr', 'hr_manager', 'super_admin'),
  async (req: AuthRequest, res) => {
  try {
    const { kpis } = req.body;
    if (!kpis || !Array.isArray(kpis) || kpis.length === 0) {
      return res.status(400).json({ error: 'kpis array required' });
    }

    const created: any[] = [];
    for (const kpi of kpis) {
      if (!kpi.ad_hoc_evaluation_id || !kpi.kpi_id) {
        return res.status(400).json({ error: 'ad_hoc_evaluation_id and kpi_id required' });
      }

      const result = await prisma.$queryRaw`
        INSERT INTO evaluation_result_areas (ad_hoc_evaluation_id, kpi_id, evaluator_type, weight)
        VALUES (${kpi.ad_hoc_evaluation_id}, ${kpi.kpi_id}, ${kpi.evaluator_type || null}, ${kpi.weight || 0})
        RETURNING *`;
      created.push(Array.isArray(result) ? result[0] : result);
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
