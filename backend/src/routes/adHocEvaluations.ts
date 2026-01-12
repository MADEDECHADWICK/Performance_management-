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
    
    const created = await prisma.adHocEvaluation.create({
      data: {
        name: payload.name,
        evaluation_target: payload.evaluation_target || null,
        department_id: payload.department_id || null,
        created_by: payload.created_by || null,
        enable_self_evaluation: payload.enable_self_evaluation || false,
        enable_peer_evaluation: payload.enable_peer_evaluation || false,
        enable_upward_evaluation: payload.enable_upward_evaluation || false,
        enable_downward_evaluation: payload.enable_downward_evaluation || false,
        due_date: payload.due_date ? new Date(payload.due_date) : null,
        cancel_if_not_processed: payload.cancel_if_not_processed || false,
        process_anonymously: payload.process_anonymously || false,
        hide_from_dashboard: payload.hide_from_dashboard || false,
        require_all_kpis: payload.require_all_kpis || false,
        exclude_from_score: payload.exclude_from_score || false,
        require_evaluator_signature: payload.require_evaluator_signature || false,
        require_evaluatee_signature: payload.require_evaluatee_signature || false,
        send_signature_to_evaluatee: payload.send_signature_to_evaluatee || false,
        send_signature_to_managers: payload.send_signature_to_managers || false,
        send_signature_to_downward_evaluators: payload.send_signature_to_downward_evaluators || false,
        status: payload.status || 'draft',
        published_at: payload.published_at ? new Date(payload.published_at) : null,
      }
    });
    
    const performedBy = req.user?.sub ? Number(req.user.sub) : undefined;
    await createAudit({ action: `create_ad_hoc:${payload.name}`, entity_type: 'ad_hoc_evaluation', user_id: performedBy, ip_address: req.ip });
    return res.status(201).json(created);
  } catch (err: any) {
    console.error('Error creating ad_hoc_evaluation:', err);
    return res.status(500).json({ error: err.message });
  }
});

export default router;
