import express, { Request, Response, Router } from 'express';
import prisma from '../prisma';
import { nonFinancialPerformanceService } from '../services/nonFinancialPerformance.service';
import { mergeWithDefaultScoringConfig } from '../services/performanceFramework.service';
import { authMiddleware } from '../middleware/auth';
import { loadProfile } from '../middleware/loadProfile';
import { Decimal } from '@prisma/client/runtime/library';

const router = Router();

const resolveRoles = (req: any) => {
  const roles = new Set<string>();
  (req.userRoles || []).forEach((role: string) => roles.add(role.toLowerCase()));
  (req.userRoles || []).forEach((role: string) => roles.add(role.toLowerCase()));
  if (req.profile?.role?.name) roles.add(req.profile.role.name.toLowerCase());
  return Array.from(roles);
};

const isPrivileged = (roles: string[]) =>
  roles.includes('super_admin') ||
  roles.includes('hr');

const isManagerRole = (roles: string[]) => roles.includes('manager');

const canAccessEmployee = async (req: any, employeeId: number) => {
  if (!req.profile?.id) return false;
  const roles = resolveRoles(req);
  if (isPrivileged(roles)) return true;
  if (employeeId === req.profile.id) return true;
  if (isManagerRole(roles)) {
    const report = await prisma.profile.findFirst({
      where: { id: employeeId, managerId: req.profile.id, status: 'active' },
      select: { id: true },
    });
    return !!report;
  }
  return false;
};

const canAccessTeam = (req: any, managerId: number) => {
  if (!req.profile?.id) return false;
  const roles = resolveRoles(req);
  if (isPrivileged(roles)) return true;
  return isManagerRole(roles) && req.profile.id === managerId;
};

const normalizeWeightValue = (value: number | undefined, fallback: number) => {
  if (typeof value !== "number" || Number.isNaN(value)) return fallback;
  if (value > 1) return value / 100;
  return value;
};

const buildWeightConfig = (scoringConfig: Record<string, any>) => {
  const resolved = mergeWithDefaultScoringConfig(scoringConfig ?? {});
  return {
    learningGrowthWeight: normalizeWeightValue(
      resolved?.nonFinancialBreakdown?.learningGrowth,
      0.35
    ),
    customerWeight: normalizeWeightValue(
      resolved?.nonFinancialBreakdown?.customer,
      0.35
    ),
    internalWeight: normalizeWeightValue(
      resolved?.nonFinancialBreakdown?.internal,
      0.3
    ),
    evaluationWeight: normalizeWeightValue(
      resolved?.learningGrowthBreakdown?.evaluation,
      0.5
    ),
    okrWeight: normalizeWeightValue(
      resolved?.learningGrowthBreakdown?.okr,
      0.3
    ),
    feedbackWeight: normalizeWeightValue(
      resolved?.learningGrowthBreakdown?.feedback,
      0.2
    ),
  };
};

const getScoringConfigForEmployee = async (
  employeeId: number,
  evaluationCycleId?: number
) => {
  const profile = await prisma.profile.findUnique({
    where: { id: employeeId },
    select: { departmentId: true },
  });

  const departmentId = profile?.departmentId ?? null;

  if (evaluationCycleId) {
    const deptDefinition = await prisma.evaluationDefinition.findFirst({
      where: {
        status: "published",
        cycleId: evaluationCycleId,
        departmentId,
      },
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      select: { id: true, scoringConfig: true },
    });

    if (deptDefinition) return deptDefinition;

    return prisma.evaluationDefinition.findFirst({
      where: {
        status: "published",
        cycleId: evaluationCycleId,
        departmentId: null,
      },
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      select: { id: true, scoringConfig: true },
    });
  }

  if (departmentId) {
    const deptDefinition = await prisma.evaluationDefinition.findFirst({
      where: { status: "published", departmentId },
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      select: { id: true, scoringConfig: true },
    });

    if (deptDefinition) return deptDefinition;
  }

  return prisma.evaluationDefinition.findFirst({
    where: { status: "published", departmentId: null },
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    select: { id: true, scoringConfig: true },
  });
};

/**
 * Non-Financial Performance Routes
 * Handles training records, quality reviews, knowledge sessions, improvement ideas, and BSC score calculations
 */

// ==================== TRAINING RECORDS ====================

/**
 * POST /training-records - Create a new training record
 */
router.post('/training-records', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { employeeId, courseName, provider, hours, completedAt, certificateUrl, trainingType } = req.body;

    const trainingRecord = {
      id: 0,
      employeeId,
      courseName,
      provider,
      hours: Number(hours || 0),
      completedAt: completedAt ? new Date(completedAt) : null,
      certificateUrl: certificateUrl ?? null,
      trainingType: trainingType || 'external',
      status: 'completed',
    };

    res.json(trainingRecord);
  } catch (error) {
    console.error('Error creating training record:', error);
    res.status(500).json({ error: 'Failed to create training record' });
  }
});

/**
 * GET /training-records/:employeeId - Get all training records for an employee
 */
router.get('/training-records/:employeeId', authMiddleware, async (req: Request, res: Response) => {
  try {
    res.json([]);
  } catch (error) {
    console.error('Error fetching training records:', error);
    res.status(500).json({ error: 'Failed to fetch training records' });
  }
});

/**
 * PUT /training-records/:id - Update a training record
 */
router.put('/training-records/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const trainingRecord = {
      id: Number(id),
      ...updates,
      hours: updates.hours ? Number(updates.hours) : undefined,
      completedAt: updates.completedAt ? new Date(updates.completedAt) : undefined,
    };

    res.json(trainingRecord);
  } catch (error) {
    console.error('Error updating training record:', error);
    res.status(500).json({ error: 'Failed to update training record' });
  }
});

// ==================== KNOWLEDGE SESSIONS ====================

/**
 * POST /knowledge-sessions - Create a new knowledge session
 */
router.post('/knowledge-sessions', authMiddleware, async (req: Request, res: Response) => {
  try {
    const {
      presenterId,
      title,
      topicArea,
      sessionDate,
      durationHours,
      attendeeCount,
      sessionType,
      materialsUrl,
    } = req.body;

    const knowledgeSession = {
      id: 0,
      presenterId,
      title,
      topicArea,
      sessionDate: sessionDate ? new Date(sessionDate) : null,
      durationHours: Number(durationHours || 0),
      attendeeCount: attendeeCount || 0,
      sessionType: sessionType || 'presentation',
      materialsUrl: materialsUrl ?? null,
    };

    res.json(knowledgeSession);
  } catch (error) {
    console.error('Error creating knowledge session:', error);
    res.status(500).json({ error: 'Failed to create knowledge session' });
  }
});

/**
 * GET /knowledge-sessions/:presenterId - Get all knowledge sessions for a presenter
 */
router.get('/knowledge-sessions/:presenterId', authMiddleware, async (req: Request, res: Response) => {
  try {
    res.json([]);
  } catch (error) {
    console.error('Error fetching knowledge sessions:', error);
    res.status(500).json({ error: 'Failed to fetch knowledge sessions' });
  }
});

/**
 * PUT /knowledge-sessions/:id - Update a knowledge session
 */
router.put('/knowledge-sessions/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const session = {
      id: Number(id),
      ...updates,
      durationHours: updates.durationHours ? Number(updates.durationHours) : undefined,
      sessionDate: updates.sessionDate ? new Date(updates.sessionDate) : undefined,
    };

    res.json(session);
  } catch (error) {
    console.error('Error updating knowledge session:', error);
    res.status(500).json({ error: 'Failed to update knowledge session' });
  }
});

// ==================== QUALITY REVIEWS ====================

/**
 * POST /quality-reviews - Create a new quality review
 */
router.post('/quality-reviews', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { 
      jobId,
      employeeId,
      reviewerId,
      accuracyScore,
      completenessScore,
      timelinessScore,
      innovationScore,
      overallScore,
      feedback,
      areasForImprovement,
      strengths,
    } = req.body;

    const qualityReview = {
      id: 0,
      jobId,
      employeeId,
      reviewerId,
      accuracyScore: Number(accuracyScore || 0),
      completenessScore: Number(completenessScore || 0),
      timelinessScore: Number(timelinessScore || 0),
      innovationScore: innovationScore ? Number(innovationScore) : undefined,
      overallScore: Number(overallScore || 0),
      feedback,
      areasForImprovement,
      strengths,
    };

    res.json(qualityReview);
  } catch (error) {
    console.error('Error creating quality review:', error);
    res.status(500).json({ error: 'Failed to create quality review' });
  }
});

/**
 * GET /quality-reviews/:employeeId - Get all quality reviews for an employee
 */
router.get('/quality-reviews/:employeeId', authMiddleware, async (req: Request, res: Response) => {
  try {
    res.json([]);
  } catch (error) {
    console.error('Error fetching quality reviews:', error);
    res.status(500).json({ error: 'Failed to fetch quality reviews' });
  }
});

/**
 * PUT /quality-reviews/:id - Update a quality review
 */
router.put('/quality-reviews/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const review = {
      id: Number(id),
      ...updates,
      accuracyScore: updates.accuracyScore ? Number(updates.accuracyScore) : undefined,
      completenessScore: updates.completenessScore ? Number(updates.completenessScore) : undefined,
      timelinessScore: updates.timelinessScore ? Number(updates.timelinessScore) : undefined,
      innovationScore: updates.innovationScore ? Number(updates.innovationScore) : undefined,
      overallScore: updates.overallScore ? Number(updates.overallScore) : undefined,
    };

    res.json(review);
  } catch (error) {
    console.error('Error updating quality review:', error);
    res.status(500).json({ error: 'Failed to update quality review' });
  }
});

// ==================== IMPROVEMENT IDEAS ====================

/**
 * POST /improvement-ideas - Submit a new improvement idea
 */
router.post('/improvement-ideas', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { submittedBy, title, description, category, priority, impactArea, estimatedSavings } = req.body;

    const idea = {
      id: 0,
      submittedBy,
      title,
      description,
      category,
      priority: priority || 'medium',
      impactArea,
      estimatedSavings: estimatedSavings ? Number(estimatedSavings) : undefined,
      status: 'pending',
    };

    res.json(idea);
  } catch (error) {
    console.error('Error creating improvement idea:', error);
    res.status(500).json({ error: 'Failed to create improvement idea' });
  }
});

/**
 * GET /improvement-ideas - Get all improvement ideas (with optional filters)
 */
router.get('/improvement-ideas', authMiddleware, async (req: Request, res: Response) => {
  try {
    res.json([]);
  } catch (error) {
    console.error('Error fetching improvement ideas:', error);
    res.status(500).json({ error: 'Failed to fetch improvement ideas' });
  }
});

/**
 * PUT /improvement-ideas/:id - Update an improvement idea (e.g., approve/implement)
 */
router.put('/improvement-ideas/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status, feedback, reviewedBy } = req.body;

    const idea = {
      id: Number(id),
      status,
      feedback,
      reviewedBy,
      reviewedAt: status && ['approved', 'implemented', 'rejected'].includes(status)
        ? new Date()
        : null,
    };

    res.json(idea);
  } catch (error) {
    console.error('Error updating improvement idea:', error);
    res.status(500).json({ error: 'Failed to update improvement idea' });
  }
});

// ==================== NON-FINANCIAL PERFORMANCE CALCULATION ====================

/**
 * GET /non-financial-scores/:employeeId - Calculate and retrieve non-financial scores
 */
router.get('/non-financial-scores/:employeeId', authMiddleware, loadProfile, async (req: Request, res: Response) => {
  try {
    const { employeeId } = req.params;
    const { periodStart, periodEnd, evaluationCycleId } = req.query;

    const employeeIdNumber = parseInt(employeeId);
    if (!(await canAccessEmployee(req, employeeIdNumber))) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Default to current year
    const startDate = periodStart ? new Date(periodStart as string) : new Date(new Date().getFullYear(), 0, 1);
    const endDate = periodEnd ? new Date(periodEnd as string) : new Date();

    const definition = await getScoringConfigForEmployee(
      parseInt(employeeId),
      evaluationCycleId ? parseInt(evaluationCycleId as string) : undefined
    );
    const scoringConfig = (definition?.scoringConfig ?? {}) as Record<string, any>;
    const weightConfig = buildWeightConfig(scoringConfig);

    const scores = await nonFinancialPerformanceService.calculateNonFinancialScores(
      employeeIdNumber,
      evaluationCycleId ? parseInt(evaluationCycleId as string) : undefined,
      startDate,
      endDate,
      weightConfig
    );

    res.json({
      ...scores,
      evaluationDefinitionId: definition?.id ?? null,
      weights: {
        learningGrowthWeight: weightConfig.learningGrowthWeight,
        customerWeight: weightConfig.customerWeight,
        internalWeight: weightConfig.internalWeight,
        evaluationWeight: weightConfig.evaluationWeight,
        okrWeight: weightConfig.okrWeight,
        feedbackWeight: weightConfig.feedbackWeight,
      },
    });
  } catch (error) {
    console.error('Error calculating non-financial scores:', error);
    res.status(500).json({ error: 'Failed to calculate non-financial scores' });
  }
});

/**
 * GET /non-financial-breakdown/:employeeId - Get detailed BSC breakdown with all KPIs
 */
router.get('/non-financial-breakdown/:employeeId', authMiddleware, loadProfile, async (req: Request, res: Response) => {
  try {
    const { employeeId } = req.params;
    const { periodStart, periodEnd } = req.query;

    const employeeIdNumber = parseInt(employeeId);
    if (!(await canAccessEmployee(req, employeeIdNumber))) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const startDate = periodStart ? new Date(periodStart as string) : new Date(new Date().getFullYear(), 0, 1);
    const endDate = periodEnd ? new Date(periodEnd as string) : new Date();

    const definition = await getScoringConfigForEmployee(employeeIdNumber);
    const scoringConfig = (definition?.scoringConfig ?? {}) as Record<string, any>;
    const weightConfig = buildWeightConfig(scoringConfig);

    const breakdown = await nonFinancialPerformanceService.getBSCBreakdown(
      employeeIdNumber,
      startDate,
      endDate,
      weightConfig
    );

    res.json({
      ...breakdown,
      evaluationDefinitionId: definition?.id ?? null,
      weights: {
        learningGrowthWeight: weightConfig.learningGrowthWeight,
        customerWeight: weightConfig.customerWeight,
        internalWeight: weightConfig.internalWeight,
        evaluationWeight: weightConfig.evaluationWeight,
        okrWeight: weightConfig.okrWeight,
        feedbackWeight: weightConfig.feedbackWeight,
      },
    });
  } catch (error) {
    console.error('Error fetching BSC breakdown:', error);
    res.status(500).json({ error: 'Failed to fetch BSC breakdown' });
  }
});

/**
 * POST /non-financial-scores/:evaluationId/update - Update employee evaluation with calculated BSC scores
 */
router.post('/non-financial-scores/:evaluationId/update', authMiddleware, loadProfile, async (req: Request, res: Response) => {
  try {
    const { evaluationId } = req.params;
    const employeeIdNumber = Number(req.body?.employeeId ?? 0);
    if (!(await canAccessEmployee(req, employeeIdNumber))) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const scores = await nonFinancialPerformanceService.calculateNonFinancialScores(
      employeeIdNumber,
      req.body?.evaluationCycleId ? Number(req.body.evaluationCycleId) : undefined,
      new Date(new Date().getFullYear(), 0, 1),
      new Date(),
      buildWeightConfig(
        ((await getScoringConfigForEmployee(Number(req.body?.employeeId ?? 0), req.body?.evaluationCycleId ? Number(req.body.evaluationCycleId) : undefined))?.scoringConfig ?? {}) as Record<string, any>
      )
    );

    res.json({
      scores,
      evaluationId: Number(evaluationId),
      message: "Evaluation score update is handled via evaluation assignments."
    });
  } catch (error) {
    console.error('Error updating evaluation with BSC scores:', error);
    res.status(500).json({ error: 'Failed to update evaluation' });
  }
});

/**
 * GET /kpi-scores/:employeeId - Get stored KPI scores from employee_kpi_scores table
 */
router.get('/kpi-scores/:employeeId', authMiddleware, loadProfile, async (req: Request, res: Response) => {
  try {
    const { employeeId } = req.params;
    const { evaluationCycleId } = req.query;

    const employeeIdNumber = parseInt(employeeId);
    if (!(await canAccessEmployee(req, employeeIdNumber))) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const kpiScores = await prisma.employeeKpiScore.findMany({
      where: {
        employeeProfileId: employeeIdNumber,
      },
      orderBy: { calculatedAt: 'desc' }
    });

    res.json(kpiScores);
  } catch (error) {
    console.error('Error fetching KPI scores:', error);
    res.status(500).json({ error: 'Failed to fetch KPI scores' });
  }
});

/**
 * GET /team-non-financial-scores/:managerId - Get non-financial scores for entire team
 */
router.get('/team-non-financial-scores/:managerId', authMiddleware, loadProfile, async (req: Request, res: Response) => {
  try {
    const { managerId } = req.params;
    const { periodStart, periodEnd } = req.query;

    const managerIdNumber = parseInt(managerId);
    if (!canAccessTeam(req, managerIdNumber)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const startDate = periodStart ? new Date(periodStart as string) : new Date(new Date().getFullYear(), 0, 1);
    const endDate = periodEnd ? new Date(periodEnd as string) : new Date();

    // Get all subordinates
    const subordinates = await prisma.profile.findMany({
      where: {
        managerId: managerIdNumber,
        status: 'active'
      },
      select: { id: true }
    });

    // Calculate scores for each team member
    const teamScores = await Promise.all(
      subordinates.map(async (sub) => {
        const definition = await getScoringConfigForEmployee(sub.id);
        const scoringConfig = (definition?.scoringConfig ?? {}) as Record<string, any>;
        const weightConfig = buildWeightConfig(scoringConfig);
        const scores = await nonFinancialPerformanceService.calculateNonFinancialScores(
          sub.id,
          undefined,
          startDate,
          endDate,
          weightConfig
        );
        return {
          employeeId: sub.id,
          ...scores,
          evaluationDefinitionId: definition?.id ?? null,
          weights: {
            learningGrowthWeight: weightConfig.learningGrowthWeight,
            customerWeight: weightConfig.customerWeight,
            internalWeight: weightConfig.internalWeight,
            evaluationWeight: weightConfig.evaluationWeight,
            okrWeight: weightConfig.okrWeight,
            feedbackWeight: weightConfig.feedbackWeight,
          },
        };
      })
    );

    res.json(teamScores);
  } catch (error) {
    console.error('Error fetching team non-financial scores:', error);
    res.status(500).json({ error: 'Failed to fetch team scores' });
  }
});

export default router;
