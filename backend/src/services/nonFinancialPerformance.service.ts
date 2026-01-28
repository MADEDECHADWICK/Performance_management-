import prisma from "../prisma";

export interface BSCScores {
  learningGrowthScore: number;
  customerSatisfactionScore: number;
  internalProcessesScore: number;
  overallNonFinancialScore: number;
  okrScore: number;
  feedbackScore: number;
  projectEvaluationScore: number;
}

export interface NonFinancialWeightConfig {
  learningGrowthWeight?: number;
  customerWeight?: number;
  internalWeight?: number;
  evaluationWeight?: number;
  okrWeight?: number;
  feedbackWeight?: number;
}

export interface KPIResult {
  kpiName: string;
  calculatedValue: number;
  targetValue: number;
  achievementPercentage: number;
  weightPercentage: number;
  weightedScore: number;
}

export interface BSCBreakdown {
  learningGrowth: {
    score: number;
    kpis: KPIResult[];
  };
  customerSatisfaction: {
    score: number;
    kpis: KPIResult[];
  };
  internalProcesses: {
    score: number;
    kpis: KPIResult[];
  };
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

    const [evaluationScore, okrScore, feedbackScore, customerSatisfactionScore, internalProcessesScore, projectEvaluationScore] =
      await Promise.all([
        this.calculateLearningGrowthScore(employeeId, start, end),
        this.calculateOkrScore(employeeId, start, end),
        this.calculateContinuousFeedbackScore(employeeId, start, end),
        this.calculateCustomerSatisfactionScore(employeeId, start, end),
        this.calculateInternalProcessesScore(employeeId, start, end),
        this.calculateProjectEvaluationScore(employeeId, start, end),
      ]);

    const evalWeight = normalizeWeightValue(weights?.evaluationWeight, 0.5);
    const okrWeight = normalizeWeightValue(weights?.okrWeight, 0.3);
    const feedbackWeight = normalizeWeightValue(weights?.feedbackWeight, 0.2);
    const learningTotal = evalWeight + okrWeight + feedbackWeight;
    const evalFactor = learningTotal > 0 ? evalWeight / learningTotal : 0.5;
    const okrFactor = learningTotal > 0 ? okrWeight / learningTotal : 0.3;
    const feedbackFactor = learningTotal > 0 ? feedbackWeight / learningTotal : 0.2;

    const hasEvalOrOkr = evaluationScore > 0 || okrScore > 0;
    const learningGrowthScore = hasEvalOrOkr
      ? clamp(
          evaluationScore * evalFactor +
            okrScore * okrFactor +
            feedbackScore * feedbackFactor
        )
      : feedbackScore || evaluationScore || okrScore;

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
      okrScore: Math.round(okrScore * 100) / 100,
      feedbackScore: Math.round(feedbackScore * 100) / 100,
      projectEvaluationScore: Math.round(projectEvaluationScore * 100) / 100,
    };
  }

  async getBSCBreakdown(
    employeeId: number,
    periodStart: Date,
    periodEnd: Date,
    weights?: NonFinancialWeightConfig
  ): Promise<BSCBreakdown> {
    const [evaluationScore, okrScore, feedbackScore, customerSatisfactionScore, internalProcessesScore] =
      await Promise.all([
        this.calculateLearningGrowthScore(employeeId, periodStart, periodEnd),
        this.calculateOkrScore(employeeId, periodStart, periodEnd),
        this.calculateContinuousFeedbackScore(employeeId, periodStart, periodEnd),
        this.calculateCustomerSatisfactionScore(employeeId, periodStart, periodEnd),
        this.calculateInternalProcessesScore(employeeId, periodStart, periodEnd),
      ]);

    const evalWeight = normalizeWeightValue(weights?.evaluationWeight, 0.5);
    const okrWeight = normalizeWeightValue(weights?.okrWeight, 0.3);
    const feedbackWeight = normalizeWeightValue(weights?.feedbackWeight, 0.2);
    const learningTotal = evalWeight + okrWeight + feedbackWeight;
    const evalFactor = learningTotal > 0 ? evalWeight / learningTotal : 0.5;
    const okrFactor = learningTotal > 0 ? okrWeight / learningTotal : 0.3;
    const feedbackFactor = learningTotal > 0 ? feedbackWeight / learningTotal : 0.2;

    const hasEvalOrOkr = evaluationScore > 0 || okrScore > 0;
    const learningGrowthScore = hasEvalOrOkr
      ? clamp(
          evaluationScore * evalFactor +
            okrScore * okrFactor +
            feedbackScore * feedbackFactor
        )
      : feedbackScore || evaluationScore || okrScore;

    return {
      learningGrowth: {
        score: learningGrowthScore,
        kpis: [],
      },
      customerSatisfaction: {
        score: customerSatisfactionScore,
        kpis: [],
      },
      internalProcesses: {
        score: internalProcessesScore,
        kpis: [],
      },
    };
  }

  private async calculateLearningGrowthScore(
    employeeId: number,
    periodStart: Date,
    periodEnd: Date
  ): Promise<number> {
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

    if (evalScore && projectScore) {
      return clamp(evalScore * 0.5 + projectScore * 0.5);
    }
    return evalScore || projectScore || 0;
  }

  private async calculateProjectEvaluationScore(
    employeeId: number,
    periodStart: Date,
    periodEnd: Date
  ): Promise<number> {
    const result = await prisma.projectEvaluation.aggregate({
      _avg: { overallScore: true },
      _count: { id: true },
      where: {
        evaluateeProfileId: employeeId,
        status: "submitted",
        createdAt: { gte: periodStart, lte: periodEnd },
      },
    });

    return result._count.id
      ? normalizeUnknownScale(Number(result._avg.overallScore || 0))
      : 0;
  }

  private async calculateOkrScore(
    employeeId: number,
    periodStart: Date,
    periodEnd: Date
  ): Promise<number> {
    const objectives = await prisma.okrObjective.findMany({
      where: {
        ownerProfileId: employeeId,
        approvalStatus: "approved",
        OR: [
          { startDate: null, endDate: null },
          {
            startDate: { lte: periodEnd },
            endDate: { gte: periodStart },
          },
        ],
      },
      include: { keyResults: true },
    });

    if (objectives.length === 0) return 0;

    const objectiveScores = objectives.map((objective) => {
      const keyResults = objective.keyResults || [];
      if (keyResults.length === 0) return 0;

      const totalWeight = keyResults.reduce(
        (sum, kr) => sum + Number(kr.weight || 0),
        0
      );
      const normalizedTotalWeight = totalWeight > 0 ? totalWeight : keyResults.length;

      const weightedProgress = keyResults.reduce((sum, kr) => {
        const target = Number(kr.targetValue || 0);
        if (target <= 0) return sum;
        const current = Number(kr.currentValue || 0);
        const progress = clamp((current / target) * 100);
        const weight = totalWeight > 0 ? Number(kr.weight || 0) : 1;
        return sum + progress * weight;
      }, 0);

      return clamp(weightedProgress / normalizedTotalWeight);
    });

    const avgObjectiveScore =
      objectiveScores.reduce((sum, score) => sum + score, 0) / objectiveScores.length;
    return clamp(avgObjectiveScore);
  }

  private async calculateCustomerSatisfactionScore(
    employeeId: number,
    periodStart: Date,
    periodEnd: Date
  ): Promise<number> {
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

    if (surveys.length === 0) return 0;

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

    return clamp(ratingScore * 0.7 + recommendScore * 0.3);
  }

  private async calculateContinuousFeedbackScore(
    employeeId: number,
    periodStart: Date,
    periodEnd: Date
  ): Promise<number> {
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

    if (totalFeedback === 0) return 0;

    const volumeScore = clamp((totalFeedback / 4) * 100);
    const resolutionRate = clamp((resolvedFeedback / totalFeedback) * 100);

    return clamp(volumeScore * 0.7 + resolutionRate * 0.3);
  }

  private async calculateInternalProcessesScore(
    employeeId: number,
    periodStart: Date,
    periodEnd: Date
  ): Promise<number> {
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

    if (totalTasks === 0) return 100;

    return clamp((completedTasks / totalTasks) * 100);
  }
}

const normalizeWeightValue = (value: number | undefined, fallback: number) => {
  if (value === undefined || value === null) return fallback;
  if (value > 1) return value / 100;
  return value;
};

export const nonFinancialPerformanceService = new NonFinancialPerformanceService();
