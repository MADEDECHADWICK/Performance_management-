import { Router } from 'express';
import prisma from '../prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { createAudit } from '../utils/audit';

const router = Router();

// GET /evaluation_assignments?status=pending&evaluator_id=123&include=ad_hoc_evaluations,evaluatee_profile
router.get('/', async (req, res) => {
  try {
    const status = req.query.status as string | undefined;
    const evaluatorId = req.query.evaluator_id as string | undefined;
    const evaluateeId = req.query.evaluatee_id as string | undefined;
    const evaluationType = req.query.evaluation_type as string | undefined;
    const include = req.query.include as string | undefined;
    const limit = Math.min(1000, Number(req.query.limit as string) || 200);
    
    const whereConditions: any = {};
    
    if (status) whereConditions.status = status;
    if (evaluatorId) whereConditions.evaluator_id = parseInt(evaluatorId);
    if (evaluateeId) whereConditions.evaluatee_id = parseInt(evaluateeId);
    if (evaluationType) whereConditions.evaluation_type = evaluationType;
    
    // Check if we need to include related data
    const includeData: any = {};
    if (include) {
      const includeFields = include.split(',').map(field => field.trim());
      
      if (includeFields.includes('ad_hoc_evaluations') || includeFields.includes('ad_hoc_evaluation')) {
        includeData.adHocEvaluation = true;
      }
      
      if (includeFields.includes('evaluatee_profile') || includeFields.includes('evaluatee')) {
        includeData.evaluatee = {
          select: {
            id: true,
            first_name: true,
            last_name: true,
            position: true,
            email: true,
          }
        };
      }
      
      if (includeFields.includes('evaluator_profile') || includeFields.includes('evaluator')) {
        includeData.evaluator = {
          select: {
            id: true,
            first_name: true,
            last_name: true,
            position: true,
            email: true,
          }
        };
      }
    }
    
    const assignments = await prisma.evaluationAssignment.findMany({
      where: Object.keys(whereConditions).length > 0 ? whereConditions : undefined,
      include: Object.keys(includeData).length > 0 ? includeData : undefined,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    
    return res.json(assignments || []);
  } catch (err: any) {
    console.error('Error fetching evaluation assignments:', err);
    return res.status(500).json({ error: err.message });
  }
});

// POST /evaluation_assignments  (accepts array of assignments)
router.post('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const payload = req.body;
    if (!payload) return res.status(400).json({ error: 'No payload' });
    
    const performedBy = req.user?.sub ? Number(req.user.sub) : undefined;
    
    // If payload is an array, insert multiple
    if (Array.isArray(payload)) {
      const assignments = payload.map((p: any) => ({
        ad_hoc_evaluation_id: p.ad_hoc_evaluation_id || null,
        evaluator_id: p.evaluator_id,
        evaluatee_id: p.evaluatee_id,
        evaluation_type: p.evaluation_type || 'downward',
        status: p.status || 'pending',
      }));
      
      const created = await prisma.evaluationAssignment.createMany({
        data: assignments,
      });
      
      await createAudit({ 
        action: `create_assignments:${created.count}`, 
        entity_type: 'evaluation_assignment', 
        user_id: performedBy, 
        ip_address: req.ip 
      });
      
      // Fetch the created assignments to return them
      const createdAssignments = await prisma.evaluationAssignment.findMany({
        where: {
          ad_hoc_evaluation_id: assignments[0].ad_hoc_evaluation_id,
          evaluator_id: { in: assignments.map(a => a.evaluator_id) },
          evaluatee_id: { in: assignments.map(a => a.evaluatee_id) },
        },
        orderBy: { createdAt: 'desc' },
        take: assignments.length,
      });
      
      return res.status(201).json(createdAssignments);
    }
    
    // Single insert
    const p = payload;
    const created = await prisma.evaluationAssignment.create({
      data: {
        ad_hoc_evaluation_id: p.ad_hoc_evaluation_id || null,
        evaluator_id: p.evaluator_id,
        evaluatee_id: p.evaluatee_id,
        evaluation_type: p.evaluation_type || 'downward',
        status: p.status || 'pending',
      }
    });
    
    await createAudit({ 
      action: `create_assignment:${p.ad_hoc_evaluation_id}`, 
      entity_type: 'evaluation_assignment', 
      user_id: performedBy, 
      ip_address: req.ip 
    });
    
    return res.status(201).json(created);
  } catch (err: any) {
    console.error('Error creating evaluation assignments:', err);
    return res.status(500).json({ error: err.message });
  }
});

// GET /evaluation_assignments/:id
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const assignment = await prisma.evaluationAssignment.findUnique({
      where: { id: parseInt(id) },
      include: {
        adHocEvaluation: true,
        evaluatee: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
            position: true,
            email: true,
          }
        },
        evaluator: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
            position: true,
            email: true,
          }
        }
      },
    });
    
    if (!assignment) {
      return res.status(404).json({ error: 'Assignment not found' });
    }
    
    return res.json(assignment);
  } catch (err: any) {
    console.error('Error fetching evaluation assignment:', err);
    return res.status(500).json({ error: err.message });
  }
});

// PATCH /evaluation_assignments/:id
router.patch('/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { responses, evidence_urls, evaluator_comments, status, submitted_at } = req.body;
    const userId = req.user?.sub ? Number(req.user.sub) : undefined;
    
    const updateData: any = {};
    
    if (responses !== undefined) updateData.responses = JSON.stringify(responses);
    if (evidence_urls !== undefined) updateData.evidence_urls = evidence_urls;
    if (evaluator_comments !== undefined) updateData.evaluator_comments = evaluator_comments;
    if (status !== undefined) updateData.status = status;
    if (submitted_at !== undefined) updateData.submitted_at = new Date(submitted_at);
    
    const assignment = await prisma.evaluationAssignment.update({
      where: { id: parseInt(id) },
      data: updateData,
    });
    
    await createAudit({
      action: 'update_evaluation_assignment',
      entity_type: 'evaluation_assignment',
      user_id: userId,
      ip_address: req.ip,
    });
    
    return res.json(assignment);
  } catch (err: any) {
    console.error('Error updating evaluation assignment:', err);
    return res.status(500).json({ error: err.message });
  }
});

export default router;
