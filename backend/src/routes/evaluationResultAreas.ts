import { Router } from 'express';
import prisma from '../prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { createAudit } from '../utils/audit';

const router = Router();

// GET /evaluation_result_areas?ad_hoc_evaluation_id=xxx
router.get('/', async (req, res) => {
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
router.post('/', authMiddleware, async (req: AuthRequest, res) => {
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

      const result = await prisma.evaluationResultArea.create({
        data: {
          ad_hoc_evaluation_id: kpi.ad_hoc_evaluation_id,
          kpi_id: kpi.kpi_id,
          evaluator_type: kpi.evaluator_type || null,
          weight: kpi.weight || 0,
        }
      });
      created.push(result);
    }

    const performedBy = req.user?.sub ? Number(req.user.sub) : undefined;
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
