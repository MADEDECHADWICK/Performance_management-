import express, { Request, Response, Router } from 'express';
import prisma from '../prisma';
import { nonFinancialPerformanceService } from '../services/nonFinancialPerformance.service';
import { authMiddleware } from '../middleware/auth';
import { Decimal } from '@prisma/client/runtime/library';

const router = Router();

const normalizeWeightValue = (value: number | undefined, fallback: number) => {
  if (typeof value !== "number" || Number.isNaN(value)) return fallback;
  if (value > 1) return value / 100;
  return value;
};

const buildWeightConfig = (scoringConfig: Record<string, any>) => ({
  learningGrowthWeight: normalizeWeightValue(
    scoringConfig?.nonFinancialBreakdown?.learningGrowth,
    0.35
  ),
  customerWeight: normalizeWeightValue(
    scoringConfig?.nonFinancialBreakdown?.customer,
    0.35
  ),
  internalWeight: normalizeWeightValue(
    scoringConfig?.nonFinancialBreakdown?.internal,
    0.3
  ),
  evaluationWeight: normalizeWeightValue(
    scoringConfig?.learningGrowthBreakdown?.evaluation,
    0.5
  ),
  okrWeight: normalizeWeightValue(
    scoringConfig?.learningGrowthBreakdown?.okr,
    0.3
  ),
  feedbackWeight: normalizeWeightValue(
    scoringConfig?.learningGrowthBreakdown?.feedback,
    0.2
  ),
});

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
    const { employee_id, course_name, provider, hours, completed_at, certificate_url, training_type } = req.body;

    const trainingRecord = {
      id: 0,
      employeeId: employee_id,
      courseName: course_name,
      provider,
      hours: Number(hours || 0),
      completedAt: completed_at ? new Date(completed_at) : null,
      certificateUrl: certificate_url ?? null,
      trainingType: training_type || 'external',
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
      completedAt: updates.completed_at ? new Date(updates.completed_at) : undefined,
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
    const { presenter_id, title, topic_area, session_date, duration_hours, attendee_count, session_type, materials_url } = req.body;

    const knowledgeSession = {
      id: 0,
      presenterId: presenter_id,
      title,
      topicArea: topic_area,
      sessionDate: session_date ? new Date(session_date) : null,
      durationHours: Number(duration_hours || 0),
      attendeeCount: attendee_count || 0,
      sessionType: session_type || 'presentation',
      materialsUrl: materials_url ?? null,
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
      durationHours: updates.duration_hours ? Number(updates.duration_hours) : undefined,
      sessionDate: updates.session_date ? new Date(updates.session_date) : undefined,
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
      job_id, employee_id, reviewer_id, accuracy_score, completeness_score, 
      timeliness_score, innovation_score, overall_score, feedback, areas_for_improvement, strengths 
    } = req.body;

    const qualityReview = {
      id: 0,
      jobId: job_id,
      employeeId: employee_id,
      reviewerId: reviewer_id,
      accuracyScore: Number(accuracy_score || 0),
      completenessScore: Number(completeness_score || 0),
      timelinessScore: Number(timeliness_score || 0),
      innovationScore: innovation_score ? Number(innovation_score) : undefined,
      overallScore: Number(overall_score || 0),
      feedback,
      areasForImprovement: areas_for_improvement,
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
      accuracyScore: updates.accuracy_score ? Number(updates.accuracy_score) : undefined,
      completenessScore: updates.completeness_score ? Number(updates.completeness_score) : undefined,
      timelinessScore: updates.timeliness_score ? Number(updates.timeliness_score) : undefined,
      innovationScore: updates.innovation_score ? Number(updates.innovation_score) : undefined,
      overallScore: updates.overall_score ? Number(updates.overall_score) : undefined,
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
    const { submitted_by, title, description, category, priority, impact_area, estimated_savings } = req.body;

    const idea = {
      id: 0,
      submittedBy: submitted_by,
      title,
      description,
      category,
      priority: priority || 'medium',
      impactArea: impact_area,
      estimatedSavings: estimated_savings ? Number(estimated_savings) : undefined,
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
    const { status, feedback, reviewed_by } = req.body;

    const idea = {
      id: Number(id),
      status,
      feedback,
      reviewedBy: reviewed_by,
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
router.get('/non-financial-scores/:employeeId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { employeeId } = req.params;
    const { periodStart, periodEnd, evaluationCycleId } = req.query;

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
      parseInt(employeeId),
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
router.get('/non-financial-breakdown/:employeeId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { employeeId } = req.params;
    const { periodStart, periodEnd } = req.query;

    const startDate = periodStart ? new Date(periodStart as string) : new Date(new Date().getFullYear(), 0, 1);
    const endDate = periodEnd ? new Date(periodEnd as string) : new Date();

    const definition = await getScoringConfigForEmployee(parseInt(employeeId));
    const scoringConfig = (definition?.scoringConfig ?? {}) as Record<string, any>;
    const weightConfig = buildWeightConfig(scoringConfig);

    const breakdown = await nonFinancialPerformanceService.getBSCBreakdown(
      parseInt(employeeId),
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
router.post('/non-financial-scores/:evaluationId/update', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { evaluationId } = req.params;
    const scores = await nonFinancialPerformanceService.calculateNonFinancialScores(
      Number(req.body?.employeeId ?? 0),
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
router.get('/kpi-scores/:employeeId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { employeeId } = req.params;
    const { evaluationCycleId } = req.query;

    const kpiScores = await prisma.employeeKpiScore.findMany({
      where: {
        employeeProfileId: parseInt(employeeId),
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
router.get('/team-non-financial-scores/:managerId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { managerId } = req.params;
    const { periodStart, periodEnd } = req.query;

    const startDate = periodStart ? new Date(periodStart as string) : new Date(new Date().getFullYear(), 0, 1);
    const endDate = periodEnd ? new Date(periodEnd as string) : new Date();

    // Get all subordinates
    const subordinates = await prisma.profile.findMany({
      where: {
        managerId: parseInt(managerId),
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
