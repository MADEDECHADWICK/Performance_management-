import prisma from "../prisma";

export interface BSCScores {
  learningGrowthScore: number;
  customerSatisfactionScore: number;
  internalProcessesScore: number;
  overallNonFinancialScore: number;
  feedbackScore: number;
  projectEvaluationScore: number;
  evidence: {
    learningGrowth: boolean;
    feedback: boolean;
    customerSatisfaction: boolean;
    internalProcesses: boolean;
    projectEvaluation: boolean;
  };
}

export interface NonFinancialWeightConfig {
  learningGrowthWeight?: number;
  customerWeight?: number;
  internalWeight?: number;
  evaluationWeight?: number;
  feedbackWeight?: number;
}

export interface ScoreBreakdownItem {
  label: string;
  calculatedValue: number;
  targetValue: number;
  achievementPercentage: number;
  weightPercentage: number;
  weightedScore: number;
}

export interface BSCBreakdown {
  learningGrowth: {
    score: number;
    items: ScoreBreakdownItem[];
  };
  customerSatisfaction: {
    score: number;
    items: ScoreBreakdownItem[];
  };
  internalProcesses: {
    score: number;
    items: ScoreBreakdownItem[];
  };
}

interface ScoreSignal {
  score: number;
  hasData: boolean;
}

const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value));

const normalizeFivePointScore = (value: number) => clamp((value / 5) * 100);

const normalizeUnknownScale = (value: number) => {
  if (value <= 5) return normalizeFivePointScore(value);
  return clamp(value);
};

/**
 * Non-Financial Performance Service
 * Uses available data (evaluations, tasks, client surveys) to estimate BSC scores.
 */
export class NonFinancialPerformanceService {
  async calculateNonFinancialScores(
    employeeId: number,
    _evaluationCycleId?: number,
    periodStart?: Date,
    periodEnd?: Date,
    weights?: NonFinancialWeightConfig
  ): Promise<BSCScores> {
    const start = periodStart || new Date(new Date().getFullYear(), 0, 1);
    const end = periodEnd || new Date();

    const [
      learningGrowthSignal,
      feedbackSignal,
      customerSatisfactionSignal,
      internalProcessesSignal,
      projectEvaluationSignal,
    ] =
      await Promise.all([
        this.calculateLearningGrowthScore(employeeId, start, end),
        this.calculateContinuousFeedbackScore(employeeId, start, end),
        this.calculateCustomerSatisfactionScore(employeeId, start, end),
        this.calculateInternalProcessesScore(employeeId, start, end),
        this.calculateProjectEvaluationScore(employeeId, start, end),
      ]);

    const evaluationScore = learningGrowthSignal.score;
    const feedbackScore = feedbackSignal.score;
    const customerSatisfactionScore = customerSatisfactionSignal.score;
    const internalProcessesScore = internalProcessesSignal.score;
    const projectEvaluationScore = projectEvaluationSignal.score;

    const evalWeight = normalizeWeightValue(weights?.evaluationWeight, 0.7);
    const feedbackWeight = normalizeWeightValue(weights?.feedbackWeight, 0.3);
    const learningTotal = evalWeight + feedbackWeight;
    const evalFactor = learningTotal > 0 ? evalWeight / learningTotal : 0.7;
    const feedbackFactor = learningTotal > 0 ? feedbackWeight / learningTotal : 0.3;

    const learningGrowthScore =
      evaluationScore > 0 && feedbackScore > 0
        ? clamp(evaluationScore * evalFactor + feedbackScore * feedbackFactor)
        : evaluationScore || feedbackScore || 0;

    const learningWeight = normalizeWeightValue(weights?.learningGrowthWeight, 0.35);
    const customerWeight = normalizeWeightValue(weights?.customerWeight, 0.35);
    const internalWeight = normalizeWeightValue(weights?.internalWeight, 0.3);
    const nonFinancialTotal = learningWeight + customerWeight + internalWeight;
    const learningFactor = nonFinancialTotal > 0 ? learningWeight / nonFinancialTotal : 0.35;
    const customerFactor = nonFinancialTotal > 0 ? customerWeight / nonFinancialTotal : 0.35;
    const internalFactor = nonFinancialTotal > 0 ? internalWeight / nonFinancialTotal : 0.3;

    const overallNonFinancialScore = clamp(
      learningGrowthScore * learningFactor +
        customerSatisfactionScore * customerFactor +
        internalProcessesScore * internalFactor
    );

    return {
      learningGrowthScore: Math.round(learningGrowthScore * 100) / 100,
      customerSatisfactionScore: Math.round(customerSatisfactionScore * 100) / 100,
      internalProcessesScore: Math.round(internalProcessesScore * 100) / 100,
      overallNonFinancialScore: Math.round(overallNonFinancialScore * 100) / 100,
      feedbackScore: Math.round(feedbackScore * 100) / 100,
      projectEvaluationScore: Math.round(projectEvaluationScore * 100) / 100,
      evidence: {
        learningGrowth: learningGrowthSignal.hasData,
        feedback: feedbackSignal.hasData,
        customerSatisfaction: customerSatisfactionSignal.hasData,
        internalProcesses: internalProcessesSignal.hasData,
        projectEvaluation: projectEvaluationSignal.hasData,
      },
    };
  }

  async getBSCBreakdown(
    employeeId: number,
    periodStart: Date,
    periodEnd: Date,
    weights?: NonFinancialWeightConfig
  ): Promise<BSCBreakdown> {
    const [
      learningGrowthSignal,
      feedbackSignal,
      customerSatisfactionSignal,
      internalProcessesSignal,
    ] =
      await Promise.all([
        this.calculateLearningGrowthScore(employeeId, periodStart, periodEnd),
        this.calculateContinuousFeedbackScore(employeeId, periodStart, periodEnd),
        this.calculateCustomerSatisfactionScore(employeeId, periodStart, periodEnd),
        this.calculateInternalProcessesScore(employeeId, periodStart, periodEnd),
      ]);

    const evaluationScore = learningGrowthSignal.score;
    const feedbackScore = feedbackSignal.score;
    const customerSatisfactionScore = customerSatisfactionSignal.score;
    const internalProcessesScore = internalProcessesSignal.score;

    const evalWeight = normalizeWeightValue(weights?.evaluationWeight, 0.7);
    const feedbackWeight = normalizeWeightValue(weights?.feedbackWeight, 0.3);
    const learningTotal = evalWeight + feedbackWeight;
    const evalFactor = learningTotal > 0 ? evalWeight / learningTotal : 0.7;
    const feedbackFactor = learningTotal > 0 ? feedbackWeight / learningTotal : 0.3;

    const learningGrowthScore =
      evaluationScore > 0 && feedbackScore > 0
        ? clamp(evaluationScore * evalFactor + feedbackScore * feedbackFactor)
        : evaluationScore || feedbackScore || 0;

    return {
      learningGrowth: {
        score: learningGrowthScore,
        items: [],
      },
      customerSatisfaction: {
        score: customerSatisfactionScore,
        items: [],
      },
      internalProcesses: {
        score: internalProcessesScore,
        items: [],
      },
    };
  }

  private async calculateLearningGrowthScore(
    employeeId: number,
    periodStart: Date,
    periodEnd: Date
  ): Promise<ScoreSignal> {
    const [evaluationResult, projectResult] = await Promise.all([
      prisma.evaluationAssignment.aggregate({
        _avg: { score: true },
        _count: { id: true },
        where: {
          evaluateeProfileId: employeeId,
          submittedAt: { not: null },
          createdAt: { gte: periodStart, lte: periodEnd },
        },
      }),
      prisma.projectEvaluation.aggregate({
        _avg: { overallScore: true },
        _count: { id: true },
        where: {
          evaluateeProfileId: employeeId,
          status: "submitted",
          createdAt: { gte: periodStart, lte: periodEnd },
        },
      }),
    ]);

    const evalScore = evaluationResult._count.id
      ? normalizeUnknownScale(Number(evaluationResult._avg.score || 0))
      : 0;
    const projectScore = projectResult._count.id
      ? normalizeUnknownScale(Number(projectResult._avg.overallScore || 0))
      : 0;
    const hasData = evaluationResult._count.id > 0 || projectResult._count.id > 0;

    if (evalScore && projectScore) {
      return {
        score: clamp(evalScore * 0.5 + projectScore * 0.5),
        hasData,
      };
    }
    return {
      score: evalScore || projectScore || 0,
      hasData,
    };
  }

  private async calculateProjectEvaluationScore(
    employeeId: number,
    periodStart: Date,
    periodEnd: Date
  ): Promise<ScoreSignal> {
    const result = await prisma.projectEvaluation.aggregate({
      _avg: { overallScore: true },
      _count: { id: true },
      where: {
        evaluateeProfileId: employeeId,
        status: "submitted",
        createdAt: { gte: periodStart, lte: periodEnd },
      },
    });

    return {
      score: result._count.id
        ? normalizeUnknownScale(Number(result._avg.overallScore || 0))
        : 0,
      hasData: result._count.id > 0,
    };
  }

  private async calculateCustomerSatisfactionScore(
    employeeId: number,
    periodStart: Date,
    periodEnd: Date
  ): Promise<ScoreSignal> {
    const surveys = await prisma.clientSatisfactionSurvey.findMany({
      where: {
        completedAt: { not: null },
        createdAt: { gte: periodStart, lte: periodEnd },
        job: {
          staffing: {
            some: {
              employeeProfileId: employeeId,
            },
          },
        },
      },
      select: {
        overallSatisfaction: true,
        wouldRecommend: true,
      },
    });

    if (surveys.length === 0) {
      return { score: 0, hasData: false };
    }

    const ratings = surveys
      .map((survey) => survey.overallSatisfaction)
      .filter((value): value is number => value !== null && value !== undefined);
    const avgRating =
      ratings.length > 0 ? ratings.reduce((sum, value) => sum + value, 0) / ratings.length : 0;

    const recommendResponses = surveys.filter((survey) => survey.wouldRecommend !== null);
    const recommendRate =
      recommendResponses.length > 0
        ? recommendResponses.filter((survey) => survey.wouldRecommend === true).length /
          recommendResponses.length
        : 0;

    const ratingScore = avgRating > 0 ? normalizeFivePointScore(avgRating) : 0;
    const recommendScore = clamp(recommendRate * 100);

    return {
      score: clamp(ratingScore * 0.7 + recommendScore * 0.3),
      hasData: true,
    };
  }

  private async calculateContinuousFeedbackScore(
    employeeId: number,
    periodStart: Date,
    periodEnd: Date
  ): Promise<ScoreSignal> {
    const [totalFeedback, resolvedFeedback] = await Promise.all([
      prisma.feedback.count({
        where: {
          recipientProfileId: employeeId,
          createdAt: { gte: periodStart, lte: periodEnd },
        },
      }),
      prisma.feedback.count({
        where: {
          recipientProfileId: employeeId,
          status: { in: ["reviewed", "resolved"] },
          createdAt: { gte: periodStart, lte: periodEnd },
        },
      }),
    ]);

    if (totalFeedback === 0) {
      return { score: 0, hasData: false };
    }

    const volumeScore = clamp((totalFeedback / 4) * 100);
    const resolutionRate = clamp((resolvedFeedback / totalFeedback) * 100);

    return {
      score: clamp(volumeScore * 0.7 + resolutionRate * 0.3),
      hasData: true,
    };
  }

  private async calculateInternalProcessesScore(
    employeeId: number,
    periodStart: Date,
    periodEnd: Date
  ): Promise<ScoreSignal> {
    const [totalTasks, completedTasks] = await Promise.all([
      prisma.task.count({
        where: {
          assignedToProfileId: employeeId,
          createdAt: { gte: periodStart, lte: periodEnd },
        },
      }),
      prisma.task.count({
        where: {
          assignedToProfileId: employeeId,
          status: "completed",
          updatedAt: { gte: periodStart, lte: periodEnd },
        },
      }),
    ]);

    // No assigned tasks means there is no execution data to score yet.
    if (totalTasks === 0) {
      return { score: 0, hasData: false };
    }

    return {
      score: clamp((completedTasks / totalTasks) * 100),
      hasData: true,
    };
  }
}

const normalizeWeightValue = (value: number | undefined, fallback: number) => {
  if (value === undefined || value === null) return fallback;
  if (value > 1) return value / 100;
  return value;
};

export const nonFinancialPerformanceService = new NonFinancialPerformanceService();
