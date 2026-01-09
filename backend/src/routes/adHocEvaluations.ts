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
    const created = await prisma.$queryRaw<any>`
      INSERT INTO ad_hoc_evaluations (name, created_by, enable_self_evaluation, enable_peer_evaluation, enable_upward_evaluation, enable_downward_evaluation, due_date, process_anonymously, hide_from_dashboard, require_all_kpis, exclude_from_score, require_evaluator_signature, require_evaluatee_signature, send_signature_to_evaluatee, send_signature_to_managers, send_signature_to_downward_evaluators, status, published_at, created_at)
      VALUES (${payload.name}, ${payload.created_by || null}, ${payload.enable_self_evaluation || false}, ${payload.enable_peer_evaluation || false}, ${payload.enable_upward_evaluation || false}, ${payload.enable_downward_evaluation || false}, ${payload.due_date || null}, ${payload.process_anonymously || false}, ${payload.hide_from_dashboard || false}, ${payload.require_all_kpis || false}, ${payload.exclude_from_score || false}, ${payload.require_evaluator_signature || false}, ${payload.require_evaluatee_signature || false}, ${payload.send_signature_to_evaluatee || false}, ${payload.send_signature_to_managers || false}, ${payload.send_signature_to_downward_evaluators || false}, ${payload.status || 'draft'}, ${payload.published_at || null}, now())
      RETURNING *`;
    const performedBy = req.user?.sub ? Number(req.user.sub) : undefined;
    await createAudit({ action: `create_ad_hoc:${payload.name}`, entity_type: 'ad_hoc_evaluation', user_id: performedBy, ip_address: req.ip });
    return res.status(201).json((created as any[])[0] ?? null);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
