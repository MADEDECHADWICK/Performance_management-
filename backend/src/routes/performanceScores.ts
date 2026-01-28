import { Router } from "express";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import prisma from "../prisma";
import { nonFinancialPerformanceService } from "../services/nonFinancialPerformance.service";
import { errorResponse, successResponse } from "../utils/response";

const router = Router();

const parseDate = (value: unknown) => {
  if (typeof value !== "string") return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
};

const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value));

const normalizeWeightValue = (value: number | undefined, fallback: number) => {
  if (typeof value !== "number" || Number.isNaN(value)) return fallback;
  if (value > 1) return value / 100;
  return value;
};

const getScoringConfig = async (
  departmentId?: number | null,
  evaluationCycleId?: number
) => {
  if (evaluationCycleId) {
    const cycleDept = await prisma.evaluationDefinition.findFirst({
      where: {
        status: "published",
        departmentId: departmentId ?? null,
        cycleId: evaluationCycleId,
      },
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      select: { id: true, scoringConfig: true, departmentId: true, cycleId: true },
    });
    if (cycleDept) return cycleDept;

    const cycleDefault = await prisma.evaluationDefinition.findFirst({
      where: { status: "published", departmentId: null, cycleId: evaluationCycleId },
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      select: { id: true, scoringConfig: true, departmentId: true, cycleId: true },
    });
    if (cycleDefault) return cycleDefault;
  }

  if (!departmentId) {
    return prisma.evaluationDefinition.findFirst({
      where: { status: "published", departmentId: null },
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      select: { id: true, scoringConfig: true, departmentId: true, cycleId: true },
    });
  }

  const departmentDefinition = await prisma.evaluationDefinition.findFirst({
    where: { status: "published", departmentId },
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    select: { id: true, scoringConfig: true, departmentId: true, cycleId: true },
  });

  if (departmentDefinition) {
    return departmentDefinition;
  }

  return prisma.evaluationDefinition.findFirst({
    where: { status: "published", departmentId: null },
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    select: { id: true, scoringConfig: true, departmentId: true, cycleId: true },
  });
};

const gradeFromScore = (score: number) => {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "E";
};

router.get("/me", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const profileId = req.user?.profileId;
    if (!profileId) {
      return res.status(401).json(errorResponse("Profile not found for user", 401));
    }

    const evaluationCycleId = req.query.evaluationCycleId
      ? Number(req.query.evaluationCycleId)
      : undefined;
    let startDate =
      parseDate(req.query.startDate) || new Date(new Date().getFullYear(), 0, 1);
    let endDate = parseDate(req.query.endDate) || new Date();

    const profile = await prisma.profile.findUnique({
      where: { id: profileId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        positionTitle: true,
        financialTarget: true,
        utilizationTarget: true,
        departmentId: true,
      },
    });

    if (!profile) {
      return res.status(404).json(errorResponse("Profile not found", 404));
    }

    if (evaluationCycleId) {
      const cycle = await prisma.evaluationCycle.findUnique({
        where: { id: evaluationCycleId },
        select: { startDate: true, endDate: true },
      });
      if (cycle?.startDate) {
        startDate = cycle.startDate;
      }
      if (cycle?.endDate) {
        endDate = cycle.endDate;
      }
    }

    const allocations = await prisma.revenueAllocation.findMany({
      where: {
        employeeProfileId: profileId,
        allocationMonth: { gte: startDate, lte: endDate },
      },
      select: {
        allocatedAmount: true,
        employeeProfit: true,
        employeeLoss: true,
      },
    });

    const revenue = allocations.reduce(
      (sum, item) => sum + Number(item.allocatedAmount || 0),
      0
    );
    const profit = allocations.reduce(
      (sum, item) => sum + Number(item.employeeProfit || 0),
      0
    );
    const loss = allocations.reduce(
      (sum, item) => sum + Number(item.employeeLoss || 0),
      0
    );
    const netProfit = profit - loss;

    const billableHoursAgg = await prisma.timeEntry.aggregate({
      where: {
        employeeProfileId: profileId,
        billable: true,
        dateWorked: { gte: startDate, lte: endDate },
      },
      _sum: { hours: true },
    });

    const allocatedHoursAgg = await prisma.jobTimeAllocation.aggregate({
      where: { employeeProfileId: profileId },
      _sum: { allocatedHours: true },
    });

    const billableHours = Number(billableHoursAgg._sum.hours || 0);
    const allocatedHours = Number(allocatedHoursAgg._sum.allocatedHours || 0);
    const utilizationRate = allocatedHours > 0 ? billableHours / allocatedHours : 0;

    const utilizationTargetRaw = Number(profile.utilizationTarget || 0.75);
    const utilizationTarget =
      utilizationTargetRaw > 1 ? utilizationTargetRaw / 100 : utilizationTargetRaw;

    const revenueTarget = Number(profile.financialTarget || 0);

    const revenueScore =
      revenueTarget > 0 ? clamp((revenue / revenueTarget) * 100) : 0;
    const profitMargin = revenue > 0 ? netProfit / revenue : 0;
    const profitScore = clamp(profitMargin * 100);
    const utilizationScore =
      utilizationTarget > 0 ? clamp((utilizationRate / utilizationTarget) * 100) : 0;

    let financialWeighted = clamp(
      revenueScore * 0.5 + profitScore * 0.3 + utilizationScore * 0.2
    );

    const definition = await getScoringConfig(profile.departmentId, evaluationCycleId);
    const scoringConfig = (definition?.scoringConfig ?? {}) as Record<string, any>;
    const nonFinancialWeight = normalizeWeightValue(
      scoringConfig.nonFinancialWeight,
      0.3
    );
    const financialWeight = normalizeWeightValue(scoringConfig.financialWeight, 0.7);

    const weightConfig = {
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
    };

    const nonFinancialScores = await nonFinancialPerformanceService.calculateNonFinancialScores(
      profileId,
      undefined,
      startDate,
      endDate,
      weightConfig
    );

      const nonFinancialWeighted = clamp(nonFinancialScores.overallNonFinancialScore);
    const lossPenaltyPercent = normalizeWeightValue(
      scoringConfig?.lossPenaltyPercent,
      0
    );
    const profitabilityPenaltyApplied = netProfit < 0 ? lossPenaltyPercent : 0;
    if (profitabilityPenaltyApplied > 0) {
      financialWeighted = clamp(financialWeighted * (1 - profitabilityPenaltyApplied));
    }
    const totalScore = clamp(
      financialWeighted * financialWeight + nonFinancialWeighted * nonFinancialWeight
    );
    const grade = gradeFromScore(totalScore);

    const period = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
    const existing = await prisma.performanceScore.findFirst({
      where: {
        employeeProfileId: profileId,
        evaluationCycleId: evaluationCycleId ?? null,
        period,
      },
      orderBy: { calculatedAt: "desc" },
    });

    const scorePayload = {
      revenueScore,
      profitScore,
      utilizationScore,
      financialWeighted,
      evaluationScore: 0,
      kpiScore: 0,
      clientRatingScore: nonFinancialScores.customerSatisfactionScore,
      nonFinancialWeighted,
      totalScore,
      grade,
      scoreBreakdown: {
        revenue,
        profit,
        loss,
        netProfit,
        profitMargin,
        profitabilityPenaltyApplied,
        lossAlert: netProfit < 0,
        billableHours,
        allocatedHours,
        utilizationRate,
        revenueTarget,
        utilizationTarget,
        okrScore: nonFinancialScores.okrScore,
        evaluationDefinitionId: definition?.id ?? null,
        scoringConfig,
        financialWeight,
        nonFinancialWeight,
        periodStart: startDate.toISOString(),
        periodEnd: endDate.toISOString(),
      },
    };

    if (existing) {
      await prisma.performanceScore.update({
        where: { id: existing.id },
        data: scorePayload,
      });
    } else {
      await prisma.performanceScore.create({
        data: {
          employeeProfileId: profileId,
          evaluationCycleId: evaluationCycleId ?? null,
          period,
          ...scorePayload,
        },
      });
    }

    return res.json(
      successResponse(
        {
          profile,
          period: { startDate, endDate },
          financial: {
            revenue,
            profit,
            loss,
            netProfit,
            billableHours,
            allocatedHours,
            utilizationRate,
            revenueScore,
            profitScore,
            utilizationScore,
            financialWeighted,
          },
          nonFinancial: {
            learningGrowthScore: nonFinancialScores.learningGrowthScore,
            customerSatisfactionScore: nonFinancialScores.customerSatisfactionScore,
            internalProcessesScore: nonFinancialScores.internalProcessesScore,
            okrScore: nonFinancialScores.okrScore,
            feedbackScore: nonFinancialScores.feedbackScore,
            overallNonFinancialScore: nonFinancialScores.overallNonFinancialScore,
            weights: {
              learningGrowthWeight: weightConfig.learningGrowthWeight,
              customerWeight: weightConfig.customerWeight,
              internalWeight: weightConfig.internalWeight,
              evaluationWeight: weightConfig.evaluationWeight,
              okrWeight: weightConfig.okrWeight,
              feedbackWeight: weightConfig.feedbackWeight,
            },
          },
          overall: {
            totalScore,
            grade,
          },
        },
        "Performance score calculated"
      )
    );
  } catch (error: any) {
    console.error("Error calculating performance score:", error);
    return res.status(500).json(errorResponse("Failed to calculate performance score", 500));
  }
});

export default router;
