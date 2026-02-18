import { Router } from 'express';
import prisma from '../prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { loadProfile } from '../middleware/loadProfile';
import { requireRole } from '../middleware/reqiureRole';
import { createAudit } from '../utils/audit';
import { NotificationService } from '../services/notifications.service';
import { emitWebhook } from '../services/webhook.service';

const router = Router();

const normalizeRole = (role: string) => role.toLowerCase().trim();

const resolveRoles = (req: AuthRequest) => {
  const roles = new Set<string>();
  (req.userRoles || []).forEach((role) => roles.add(normalizeRole(role)));
  (req.user?.authRoles || []).forEach((role) => roles.add(normalizeRole(role)));
  if (req.profile?.role?.name) roles.add(normalizeRole(req.profile.role.name));
  return Array.from(roles);
};

const isPrivileged = (roles: string[]) =>
  roles.includes('admin') || roles.includes('super_admin') || roles.includes('hr') || roles.includes('hr_manager');

const isManagerRole = (roles: string[]) => roles.includes('manager');

const VALID_EVALUATION_ASSIGNMENT_STATUSES = new Set([
  'pending',
  'in_progress',
  'submitted',
  'cancelled',
]);

const EVALUATION_ASSIGNMENT_STATUS_ALIASES: Record<string, string> = {
  completed: 'submitted',
  complete: 'submitted',
  done: 'submitted',
  inprogress: 'in_progress',
  'in-progress': 'in_progress',
  'in progress': 'in_progress',
  active: 'in_progress',
};

const normalizeEvaluationAssignmentStatus = (value?: string): string | undefined => {
  if (!value) return undefined;
  const normalized = value.toLowerCase().trim();
  if (VALID_EVALUATION_ASSIGNMENT_STATUSES.has(normalized)) {
    return normalized;
  }
  return EVALUATION_ASSIGNMENT_STATUS_ALIASES[normalized];
};

const getManagedProfileIds = async (managerProfileId: number) => {
  const reports = await prisma.profile.findMany({
    where: { managerId: managerProfileId, status: 'active' },
    select: { id: true },
  });
  return reports.map((report) => report.id);
};

const buildAuthContext = (req: AuthRequest) => ({
  userId: req.user?.userId ?? 0,
  profileId: req.profile?.id ?? req.user?.profileId ?? 0,
  roleName: req.profile?.role?.name,
});

const getProfilesByRoles = async (roleNames: string[]) => {
  const profiles = await prisma.profile.findMany({
    where: {
      user: {
        roles: {
          some: {
            role: {
              name: {
                in: roleNames,
              },
            },
          },
        },
      },
    },
    select: { id: true },
  });
  return profiles;
};

const buildTemplateData = async (assignment: any, extra?: Record<string, unknown>) => {
  const profileIds = [assignment.evaluatorProfileId, assignment.evaluateeProfileId].filter(
    (id): id is number => typeof id === 'number'
  );
  const profiles = await prisma.profile.findMany({
    where: { id: { in: profileIds } },
    select: { id: true, firstName: true, lastName: true },
  });
  const byId = new Map(profiles.map((profile) => [profile.id, profile]));
  const evaluator = byId.get(assignment.evaluatorProfileId);
  const evaluatee = byId.get(assignment.evaluateeProfileId);

  return {
    assignmentId: assignment.id,
    evaluationDefinitionId: assignment.evaluationDefinitionId,
    evaluatorProfileId: assignment.evaluatorProfileId,
    evaluateeProfileId: assignment.evaluateeProfileId,
    evaluatorName: evaluator ? `${evaluator.firstName} ${evaluator.lastName}` : "Evaluator",
    evaluateeName: evaluatee ? `${evaluatee.firstName} ${evaluatee.lastName}` : "Evaluatee",
    ...extra,
  };
};

const notifyRolesWithTemplate = async (
  roleNames: string[],
  templateLabel: string,
  data: Record<string, unknown>,
  fallback: { title: string; message: string; link?: string; evaluationDefinitionId?: number },
  auth: AuthRequest
) => {
  const profiles = await getProfilesByRoles(roleNames);
  const authContext = buildAuthContext(auth);

  await Promise.all(
    profiles.map((profile) =>
      NotificationService.createFromTemplate(
        {
          recipientProfileId: profile.id,
          label: templateLabel,
          data,
          type: "info",
          title: fallback.title,
          message: fallback.message,
          evaluationDefinitionId: fallback.evaluationDefinitionId,
          link: fallback.link,
          actionRequired: false,
        },
        authContext
      )
    )
  );
};

const notifyEvaluationSubmitted = async (
  assignment: any,
  req: AuthRequest
) => {
  const auth = buildAuthContext(req);
  const data = await buildTemplateData(assignment);
  const evaluateeProfileId = assignment.evaluateeProfileId;
  await NotificationService.createFromTemplate(
    {
      recipientProfileId: evaluateeProfileId,
      label: "evaluation.submitted.evaluatee",
      data,
      type: "action",
      title: "Evaluation submitted",
      message: "An evaluation has been submitted and is awaiting your acknowledgement.",
      evaluationDefinitionId: assignment.evaluationDefinitionId,
      actionRequired: true,
      link: `/evaluations/${assignment.id}`,
    },
    auth
  );

  await notifyRolesWithTemplate(
    ["hr", "hr_manager"],
    "evaluation.submitted.hr",
    data,
    {
      title: "Evaluation submitted",
      message: "A submitted evaluation is available for calibration review.",
      link: "/calibration",
      evaluationDefinitionId: assignment.evaluationDefinitionId,
    },
    req
  );

  await emitWebhook("evaluation.submitted", {
    assignmentId: assignment.id,
    evaluateeProfileId: assignment.evaluateeProfileId,
    evaluatorProfileId: assignment.evaluatorProfileId,
    evaluationDefinitionId: assignment.evaluationDefinitionId,
    status: assignment.status,
  });
};

const notifyEvaluationSigned = async (assignment: any, req: AuthRequest) => {
  const auth = buildAuthContext(req);
  const data = await buildTemplateData(assignment);

  await NotificationService.createFromTemplate(
    {
      recipientProfileId: assignment.evaluateeProfileId,
      label: "evaluation.signed.evaluatee",
      data,
      type: "info",
      title: "Evaluation signed",
      message: "Your evaluator has signed the evaluation.",
      evaluationDefinitionId: assignment.evaluationDefinitionId,
      actionRequired: false,
      link: `/evaluations/${assignment.id}`,
    },
    auth
  );

  await notifyRolesWithTemplate(
    ["hr", "hr_manager"],
    "evaluation.signed.hr",
    data,
    {
      title: "Evaluation signed",
      message: "An evaluator has signed an evaluation.",
      link: "/calibration",
      evaluationDefinitionId: assignment.evaluationDefinitionId,
    },
    req
  );

  await emitWebhook("evaluation.signed", {
    assignmentId: assignment.id,
    evaluateeProfileId: assignment.evaluateeProfileId,
    evaluatorProfileId: assignment.evaluatorProfileId,
    evaluationDefinitionId: assignment.evaluationDefinitionId,
  });
};

const notifyEvaluationAcknowledged = async (assignment: any, req: AuthRequest) => {
  const auth = buildAuthContext(req);
  const data = await buildTemplateData(assignment);

  await NotificationService.createFromTemplate(
    {
      recipientProfileId: assignment.evaluatorProfileId,
      label: "evaluation.acknowledged.evaluator",
      data,
      type: "info",
      title: "Evaluation acknowledged",
      message: "The evaluatee has acknowledged the evaluation.",
      evaluationDefinitionId: assignment.evaluationDefinitionId,
      actionRequired: false,
      link: `/evaluations/${assignment.id}`,
    },
    auth
  );

  await notifyRolesWithTemplate(
    ["hr", "hr_manager"],
    "evaluation.acknowledged.hr",
    data,
    {
      title: "Evaluation acknowledged",
      message: "An evaluatee has acknowledged an evaluation.",
      link: "/calibration",
      evaluationDefinitionId: assignment.evaluationDefinitionId,
    },
    req
  );

  await emitWebhook("evaluation.acknowledged", {
    assignmentId: assignment.id,
    evaluateeProfileId: assignment.evaluateeProfileId,
    evaluatorProfileId: assignment.evaluatorProfileId,
    evaluationDefinitionId: assignment.evaluationDefinitionId,
  });
};

// GET /evaluation_assignments?status=pending&evaluatorProfileId=123&include=definition,evaluatee,evaluator
router.get('/', authMiddleware, loadProfile, async (req: AuthRequest, res) => {
  try {
    if (!req.profile?.id) {
      return res.status(401).json({ error: 'Profile not found' });
    }

    const roles = resolveRoles(req);
    const rawStatus = req.query.status as string | undefined;
    const status = normalizeEvaluationAssignmentStatus(rawStatus);
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
    
    if (rawStatus && !status) {
      return res.status(400).json({
        error: `Invalid status "${rawStatus}". Allowed: pending, in_progress, submitted, cancelled`,
      });
    }
    if (status) whereConditions.status = status;
    if (evaluatorId) whereConditions.evaluatorProfileId = parseInt(evaluatorId);
    if (evaluateeId) whereConditions.evaluateeProfileId = parseInt(evaluateeId);
    if (evaluationType) whereConditions.evaluatorType = evaluationType;
    if (evaluationDefinitionId) {
      whereConditions.evaluationDefinitionId = parseInt(evaluationDefinitionId);
    }

    let scope: any = undefined;
    if (!isPrivileged(roles)) {
      if (isManagerRole(roles)) {
        const reportIds = await getManagedProfileIds(req.profile.id);
        scope = {
          OR: [
            { evaluatorProfileId: req.profile.id },
            { evaluateeProfileId: req.profile.id },
            { evaluateeProfileId: { in: reportIds } },
          ],
        };
      } else {
        scope = {
          OR: [
            { evaluatorProfileId: req.profile.id },
            { evaluateeProfileId: req.profile.id },
          ],
        };
      }
    }
    
    // Check if we need to include related data
    const includeData: any = {};
    if (include) {
      const includeFields = include.split(',').map(field => field.trim());

      if (includeFields.includes('definition')) {
        includeData.definition = {
          select: {
            id: true,
            name: true,
            status: true,
            dueDate: true,
            processAnonymously: true,
            hideFromDashboard: true,
          },
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
        select: { id: true, processAnonymously: true, hideFromDashboard: true },
      };
    }

    let assignments = await prisma.evaluationAssignment.findMany({
      where:
        scope && Object.keys(whereConditions).length > 0
          ? { AND: [scope, whereConditions] }
          : scope
            ? scope
            : Object.keys(whereConditions).length > 0
              ? whereConditions
              : undefined,
      include: Object.keys(includeData).length > 0 ? includeData : undefined,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    if (!isPrivileged(roles)) {
      assignments = (assignments as any[]).filter((assignment: any) => {
        if (assignment.evaluateeProfileId === req.profile?.id) {
          return !assignment.definition?.hideFromDashboard;
        }
        return true;
      });
    }

    const normalized = (assignments as any[] || []).map((assignment: any) => {
      const viewerProfileId = req.profile?.id;
      const viewerIsEvaluatee = viewerProfileId && assignment.evaluateeProfileId === viewerProfileId;
      const shouldHideEvaluator =
        assignment.definition?.processAnonymously && viewerIsEvaluatee && !isPrivileged(roles);

      const evaluatee = assignment.evaluatee
        ? {
            ...assignment.evaluatee,
            first_name: assignment.evaluatee.firstName ?? assignment.evaluatee.first_name,
            last_name: assignment.evaluatee.lastName ?? assignment.evaluatee.last_name,
            position: assignment.evaluatee.positionTitle ?? assignment.evaluatee.position,
            email: assignment.evaluatee.user?.email,
          }
        : assignment.evaluatee;

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
        evaluator: shouldHideEvaluator
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
router.post(
  '/',
  authMiddleware,
  loadProfile,
  requireRole('admin', 'hr', 'hr_manager', 'super_admin'),
  async (req: AuthRequest, res) => {
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

      const definitionIds = Array.from(new Set(assignments.map((a: any) => a.evaluationDefinitionId)));
      const definitions = await prisma.evaluationDefinition.findMany({
        where: { id: { in: definitionIds } },
        select: { id: true, status: true, cycleId: true },
      });

      if (definitions.length !== definitionIds.length) {
        return res.status(404).json({ error: 'One or more evaluation definitions not found' });
      }

      const nonPublished = definitions.find((def) => def.status !== 'published');
      if (nonPublished) {
        return res.status(409).json({ error: 'All evaluation definitions must be published before assigning' });
      }

      const cycleIds = Array.from(
        new Set(definitions.map((def) => def.cycleId).filter((id): id is number => typeof id === 'number'))
      );
      if (cycleIds.length > 0) {
        const cycles = await prisma.evaluationCycle.findMany({
          where: { id: { in: cycleIds } },
          select: { id: true, status: true },
        });

        const inactiveCycle = cycles.find((cycle) => cycle.status !== 'active');
        if (inactiveCycle) {
          return res.status(409).json({ error: 'Evaluation cycle is not active' });
        }
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
    if (!p.evaluationDefinitionId && !p.evaluation_definition_id && !p.ad_hoc_evaluation_id) {
      return res.status(400).json({ error: 'evaluationDefinitionId is required' });
    }

    const definitionId =
      p.evaluationDefinitionId ?? p.evaluation_definition_id ?? p.ad_hoc_evaluation_id;
    const definition = await prisma.evaluationDefinition.findUnique({
      where: { id: Number(definitionId) },
      select: { id: true, status: true, cycleId: true },
    });

    if (!definition) {
      return res.status(404).json({ error: 'Evaluation definition not found' });
    }

    if (definition.status !== 'published') {
      return res.status(409).json({ error: 'Evaluation definition must be published before assigning' });
    }

    if (definition.cycleId) {
      const cycle = await prisma.evaluationCycle.findUnique({
        where: { id: definition.cycleId },
        select: { status: true },
      });
      if (cycle?.status !== 'active') {
        return res.status(409).json({ error: 'Evaluation cycle is not active' });
      }
    }

    const created = await prisma.evaluationAssignment.create({
      data: {
        evaluationDefinitionId: Number(definitionId),
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
router.get('/:id', authMiddleware, loadProfile, async (req: AuthRequest, res) => {
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

    if (!req.profile?.id) {
      return res.status(401).json({ error: 'Profile not found' });
    }

    const roles = resolveRoles(req);
    const isPriv = isPrivileged(roles);
    const isEvaluator = assignment.evaluatorProfileId === req.profile.id;
    const isEvaluatee = assignment.evaluateeProfileId === req.profile.id;

    if (!isPriv) {
      if (isManagerRole(roles) && !isEvaluator && !isEvaluatee) {
        const reportIds = await getManagedProfileIds(req.profile.id);
        if (!reportIds.includes(assignment.evaluateeProfileId)) {
          return res.status(403).json({ error: 'Access denied' });
        }
      } else if (!isEvaluator && !isEvaluatee) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    if (!isPriv && isEvaluatee && assignment.definition?.hideFromDashboard) {
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

    const shouldHideEvaluator =
      assignment.definition?.processAnonymously && isEvaluatee && !isPriv;

    return res.json({
      ...assignment,
      evaluatee,
      evaluator: shouldHideEvaluator
        ? {
            id: null,
            first_name: "Anonymous",
            last_name: "Evaluator",
            position: null,
            email: null,
          }
        : evaluator,
    });
  } catch (err: any) {
    console.error('Error fetching evaluation assignment:', err);
    return res.status(500).json({ error: err.message });
  }
});

// PATCH /evaluation_assignments/:id
router.patch('/:id', authMiddleware, loadProfile, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { responses, evidenceUrls, evidence_urls, evaluatorComments, evaluator_comments, status, submittedAt, submitted_at } = req.body;
    const userId = req.user?.userId ? Number(req.user.userId) : undefined;

    if (!req.profile?.id) {
      return res.status(401).json({ error: 'Profile not found' });
    }

    const existing = await prisma.evaluationAssignment.findUnique({
      where: { id: parseInt(id) },
      include: {
        definition: { select: { status: true, cycle: { select: { status: true } } } },
      },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Assignment not found' });
    }

    const roles = resolveRoles(req);
    const isPriv = isPrivileged(roles);
    const isEvaluator = existing.evaluatorProfileId === req.profile.id;

    if (!isPriv && !isEvaluator) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (!isPriv && existing.definition?.status === 'closed') {
      return res.status(409).json({ error: 'Evaluation definition is closed' });
    }

    if (!isPriv && existing.definition?.cycle?.status === 'closed') {
      return res.status(409).json({ error: 'Evaluation cycle is closed' });
    }

    if (!isPriv && existing.status === 'submitted') {
      return res.status(409).json({ error: 'Submitted evaluations cannot be edited' });
    }

    const updateData: any = {};
    if (responses !== undefined) updateData.responses = responses;
    if (evidenceUrls !== undefined) updateData.evidenceUrls = evidenceUrls;
    if (evidence_urls !== undefined) updateData.evidenceUrls = evidence_urls;
    if (evaluatorComments !== undefined) updateData.evaluatorComments = evaluatorComments;
    if (evaluator_comments !== undefined) updateData.evaluatorComments = evaluator_comments;

    const nextStatus = status ?? undefined;
    if (nextStatus !== undefined) {
      const allowedTransitions: Record<string, string[]> = {
        pending: ['in_progress', 'submitted', 'cancelled'],
        in_progress: ['submitted', 'cancelled'],
        submitted: [],
        cancelled: [],
      };

      if (existing.status !== nextStatus) {
        const allowed = allowedTransitions[String(existing.status)] || [];
        if (!allowed.includes(nextStatus)) {
          return res.status(409).json({ error: `Invalid status transition from ${existing.status} to ${nextStatus}` });
        }
      }

      if (nextStatus === 'cancelled' && !isPriv) {
        return res.status(403).json({ error: 'Only HR/Admin can cancel evaluations' });
      }

      updateData.status = nextStatus;
      if (nextStatus === 'submitted') {
        updateData.submittedAt = new Date();
        updateData.rejectionReason = null;
      }
    }

    if (!updateData.status && existing.status === 'pending') {
      if (responses !== undefined || evaluatorComments !== undefined || evaluator_comments !== undefined) {
        updateData.status = 'in_progress';
      }
    }

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
      metadata: {
        previousStatus: existing.status,
        newStatus: assignment.status,
        evaluatorProfileId: assignment.evaluatorProfileId,
        evaluateeProfileId: assignment.evaluateeProfileId,
      },
    });

    if (
      existing.status !== assignment.status &&
      assignment.status === 'submitted'
    ) {
      await notifyEvaluationSubmitted(assignment, req);
    }
    
    return res.json(assignment);
  } catch (err: any) {
    console.error('Error updating evaluation assignment:', err);
    return res.status(500).json({ error: err.message });
  }
});

// PATCH /evaluation_assignments/:id/sign
router.patch('/:id/sign', authMiddleware, loadProfile, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid assignment id' });

    if (!req.profile?.id) {
      return res.status(401).json({ error: 'Profile not found' });
    }

    const assignment = await prisma.evaluationAssignment.findUnique({
      where: { id },
      include: {
        definition: {
          select: {
            status: true,
            requireEvaluatorSignature: true,
            cycle: { select: { status: true } },
          },
        },
      },
    });

    if (!assignment) {
      return res.status(404).json({ error: 'Assignment not found' });
    }

    const roles = resolveRoles(req);
    const privileged = isPrivileged(roles);
    const isEvaluator = assignment.evaluatorProfileId === req.profile.id;

    if (!privileged && !isEvaluator) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (!privileged && assignment.definition?.status === 'closed') {
      return res.status(409).json({ error: 'Evaluation definition is closed' });
    }

    if (!privileged && assignment.definition?.cycle?.status === 'closed') {
      return res.status(409).json({ error: 'Evaluation cycle is closed' });
    }

    if (assignment.status === 'cancelled') {
      return res.status(409).json({ error: 'Cancelled evaluations cannot be signed' });
    }

    if (assignment.status === 'submitted') {
      return res.status(409).json({ error: 'Evaluations cannot be signed after submission' });
    }

    if (assignment.evaluatorSigned) {
      return res.json(assignment);
    }

    const updated = await prisma.evaluationAssignment.update({
      where: { id },
      data: {
        evaluatorSigned: true,
        evaluatorSignedAt: new Date(),
      },
    });

    await createAudit({
      action: 'evaluation_assignment.evaluator_signed',
      entity_type: 'evaluation_assignment',
      entity_id: id,
      user_id: req.user?.userId ?? undefined,
      ip_address: req.ip,
      metadata: {
        evaluatorProfileId: assignment.evaluatorProfileId,
        evaluateeProfileId: assignment.evaluateeProfileId,
      },
    });

    await notifyEvaluationSigned(updated, req);

    return res.json(updated);
  } catch (err: any) {
    console.error('Error signing evaluation assignment:', err);
    return res.status(500).json({ error: err.message });
  }
});

// PATCH /evaluation_assignments/:id/acknowledge
router.patch('/:id/acknowledge', authMiddleware, loadProfile, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid assignment id' });

    if (!req.profile?.id) {
      return res.status(401).json({ error: 'Profile not found' });
    }

    const assignment = await prisma.evaluationAssignment.findUnique({
      where: { id },
      include: {
        definition: {
          select: {
            status: true,
            requireEvaluateeSignature: true,
            requireEvaluatorSignature: true,
            cycle: { select: { status: true } },
          },
        },
      },
    });

    if (!assignment) {
      return res.status(404).json({ error: 'Assignment not found' });
    }

    const roles = resolveRoles(req);
    const privileged = isPrivileged(roles);
    const isEvaluatee = assignment.evaluateeProfileId === req.profile.id;

    if (!privileged && !isEvaluatee) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (!privileged && assignment.definition?.status === 'closed') {
      return res.status(409).json({ error: 'Evaluation definition is closed' });
    }

    if (!privileged && assignment.definition?.cycle?.status === 'closed') {
      return res.status(409).json({ error: 'Evaluation cycle is closed' });
    }

    if (assignment.status !== 'submitted') {
      return res.status(409).json({ error: 'Evaluation must be submitted before acknowledgement' });
    }

    if (
      assignment.definition?.requireEvaluatorSignature &&
      !assignment.evaluatorSigned
    ) {
      return res.status(409).json({ error: 'Evaluator signature required before acknowledgement' });
    }

    if (assignment.evaluateeAcknowledged) {
      return res.json(assignment);
    }

    const updated = await prisma.evaluationAssignment.update({
      where: { id },
      data: {
        evaluateeAcknowledged: true,
        evaluateeAcknowledgedAt: new Date(),
      },
    });

    await createAudit({
      action: 'evaluation_assignment.evaluatee_acknowledged',
      entity_type: 'evaluation_assignment',
      entity_id: id,
      user_id: req.user?.userId ?? undefined,
      ip_address: req.ip,
      metadata: {
        evaluatorProfileId: assignment.evaluatorProfileId,
        evaluateeProfileId: assignment.evaluateeProfileId,
      },
    });

    await notifyEvaluationAcknowledged(updated, req);

    return res.json(updated);
  } catch (err: any) {
    console.error('Error acknowledging evaluation assignment:', err);
    return res.status(500).json({ error: err.message });
  }
});

export default router;
