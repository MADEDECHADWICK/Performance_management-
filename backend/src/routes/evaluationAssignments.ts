import { Router } from 'express';
import prisma from '../prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { createAudit } from '../utils/audit';

const router = Router();

// GET /evaluation_assignments?status=pending&evaluatorProfileId=123&include=definition,evaluatee,evaluator
router.get('/', async (req: AuthRequest, res) => {
  try {
    const status = req.query.status as string | undefined;
    const evaluatorId =
      (req.query.evaluatorProfileId as string | undefined) ||
      (req.query.evaluator_id as string | undefined);
    const evaluateeId =
      (req.query.evaluateeProfileId as string | undefined) ||
      (req.query.evaluatee_id as string | undefined);
    const evaluationType =
      (req.query.evaluatorType as string | undefined) ||
      (req.query.evaluation_type as string | undefined);
    const evaluationDefinitionId =
      (req.query.evaluationDefinitionId as string | undefined) ||
      (req.query.evaluation_definition_id as string | undefined);
    const include = req.query.include as string | undefined;
    const limit = Math.min(1000, Number(req.query.limit as string) || 200);
    
    const whereConditions: any = {};
    
    if (status) whereConditions.status = status;
    if (evaluatorId) whereConditions.evaluatorProfileId = parseInt(evaluatorId);
    if (evaluateeId) whereConditions.evaluateeProfileId = parseInt(evaluateeId);
    if (evaluationType) whereConditions.evaluatorType = evaluationType;
    if (evaluationDefinitionId) {
      whereConditions.evaluationDefinitionId = parseInt(evaluationDefinitionId);
    }
    
    // Check if we need to include related data
    const includeData: any = {};
    if (include) {
      const includeFields = include.split(',').map(field => field.trim());

      if (includeFields.includes('definition')) {
        includeData.definition = {
          select: { id: true, name: true, status: true, dueDate: true, processAnonymously: true },
        };
      }

      if (includeFields.includes('evaluatee_profile') || includeFields.includes('evaluatee')) {
        includeData.evaluatee = {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            positionTitle: true,
            user: { select: { email: true } },
          },
        };
      }
      
      if (includeFields.includes('evaluator_profile') || includeFields.includes('evaluator')) {
        includeData.evaluator = {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            positionTitle: true,
            user: { select: { email: true } },
          },
        };
      }
    }
    
    if (!includeData.definition) {
      includeData.definition = {
        select: { id: true, processAnonymously: true },
      };
    }

    const assignments = await prisma.evaluationAssignment.findMany({
      where: Object.keys(whereConditions).length > 0 ? whereConditions : undefined,
      include: Object.keys(includeData).length > 0 ? includeData : undefined,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    const normalized = (assignments as any[] || []).map((assignment: any) => {
      const evaluatee = assignment.evaluatee
        ? {
            ...assignment.evaluatee,
            first_name: assignment.evaluatee.firstName ?? assignment.evaluatee.first_name,
            last_name: assignment.evaluatee.lastName ?? assignment.evaluatee.last_name,
            position: assignment.evaluatee.positionTitle ?? assignment.evaluatee.position,
            email: assignment.evaluatee.user?.email,
          }
        : assignment.evaluatee;
      const isAnonymous =
        assignment.definition?.processAnonymously &&
        req.user?.profileId &&
        assignment.evaluateeProfileId === Number(req.user.profileId);

      const evaluator = assignment.evaluator
        ? {
            ...assignment.evaluator,
            first_name: assignment.evaluator.firstName ?? assignment.evaluator.first_name,
            last_name: assignment.evaluator.lastName ?? assignment.evaluator.last_name,
            position: assignment.evaluator.positionTitle ?? assignment.evaluator.position,
            email: assignment.evaluator.user?.email,
          }
        : assignment.evaluator;

      return {
        ...assignment,
        evaluatee,
        evaluator: isAnonymous
          ? {
              id: null,
              first_name: "Anonymous",
              last_name: "Evaluator",
              position: null,
              email: null,
            }
          : evaluator,
      };
    });

    return res.json(normalized);
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
    
    const performedBy = req.user?.userId ? Number(req.user.userId) : undefined;
    
    // If payload is an array, insert multiple
    if (Array.isArray(payload)) {
      const assignments = payload.map((p: any) => ({
        evaluationDefinitionId:
          p.evaluationDefinitionId ?? p.evaluation_definition_id ?? p.ad_hoc_evaluation_id,
        evaluatorProfileId: p.evaluatorProfileId ?? p.evaluator_id,
        evaluateeProfileId: p.evaluateeProfileId ?? p.evaluatee_id,
        evaluatorType: (() => {
          const raw = p.evaluatorType ?? p.evaluation_type ?? 'manager';
          if (raw === 'downward') return 'manager';
          if (raw === 'upward') return 'direct_report';
          return raw;
        })(),
        status: p.status || 'pending',
      }));

      const missingDefinition = assignments.some((a: any) => !a.evaluationDefinitionId);
      if (missingDefinition) {
        return res.status(400).json({ error: 'evaluationDefinitionId is required' });
      }
      
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
          evaluationDefinitionId: assignments[0].evaluationDefinitionId,
          evaluatorProfileId: { in: assignments.map(a => a.evaluatorProfileId) },
          evaluateeProfileId: { in: assignments.map(a => a.evaluateeProfileId) },
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
        evaluationDefinitionId:
          p.evaluationDefinitionId ?? p.evaluation_definition_id ?? p.ad_hoc_evaluation_id,
        evaluatorProfileId: p.evaluatorProfileId ?? p.evaluator_id,
        evaluateeProfileId: p.evaluateeProfileId ?? p.evaluatee_id,
        evaluatorType: (() => {
          const raw = p.evaluatorType ?? p.evaluation_type ?? 'manager';
          if (raw === 'downward') return 'manager';
          if (raw === 'upward') return 'direct_report';
          return raw;
        })(),
        status: p.status || 'pending',
      }
    });
    
    await createAudit({ 
      action: `create_assignment:${created.evaluationDefinitionId}`, 
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
        definition: true,
        evaluatee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            positionTitle: true,
            user: { select: { email: true } },
          },
        },
        evaluator: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            positionTitle: true,
            user: { select: { email: true } },
          },
        },
      },
    });
    
    if (!assignment) {
      return res.status(404).json({ error: 'Assignment not found' });
    }
    
    if (!assignment) {
      return res.status(404).json({ error: 'Assignment not found' });
    }

    const evaluatee = assignment.evaluatee
      ? {
          ...assignment.evaluatee,
          first_name: assignment.evaluatee.firstName,
          last_name: assignment.evaluatee.lastName,
          position: assignment.evaluatee.positionTitle,
          email: assignment.evaluatee.user?.email,
        }
      : assignment.evaluatee;
    const evaluator = assignment.evaluator
      ? {
          ...assignment.evaluator,
          first_name: assignment.evaluator.firstName,
          last_name: assignment.evaluator.lastName,
          position: assignment.evaluator.positionTitle,
          email: assignment.evaluator.user?.email,
        }
      : assignment.evaluator;

    return res.json({
      ...assignment,
      evaluatee,
      evaluator,
    });
  } catch (err: any) {
    console.error('Error fetching evaluation assignment:', err);
    return res.status(500).json({ error: err.message });
  }
});

// PATCH /evaluation_assignments/:id
router.patch('/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { responses, evidenceUrls, evidence_urls, evaluatorComments, evaluator_comments, status, submittedAt, submitted_at } = req.body;
    const userId = req.user?.userId ? Number(req.user.userId) : undefined;
    
    const updateData: any = {};
    
    if (responses !== undefined) updateData.responses = responses;
    if (evidenceUrls !== undefined) updateData.evidenceUrls = evidenceUrls;
    if (evidence_urls !== undefined) updateData.evidenceUrls = evidence_urls;
    if (evaluatorComments !== undefined) updateData.evaluatorComments = evaluatorComments;
    if (evaluator_comments !== undefined) updateData.evaluatorComments = evaluator_comments;
    if (status !== undefined) updateData.status = status;
    if (submittedAt !== undefined) updateData.submittedAt = new Date(submittedAt);
    if (submitted_at !== undefined) updateData.submittedAt = new Date(submitted_at);
    
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
