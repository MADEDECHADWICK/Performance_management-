import { Router } from "express";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import { requireModuleAccess } from "../middleware/requireModuleAccess";
import prisma from "../prisma";
import { nonFinancialPerformanceService } from "../services/nonFinancialPerformance.service";
import { normalizeWeights, resolveRoleConfig } from "../services/performanceRoleConfig";
import {
  getDashboardModuleCoverageSummary,
  mergeWithDefaultScoringConfig,
  normalizeOperationalBlend,
  normalizePerformanceMix,
  resolveDashboardModuleForContext,
} from "../services/performanceFramework.service";
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

const normalizedWeight = (
  weights: { total: number } & Record<string, number>,
  key: string
) => Number((weights as Record<string, number>)[key] || 0);

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

type ScorePeriod = { startDate: Date; endDate: Date };

const resolvePeriod = async (
  evaluationCycleId: number | undefined,
  defaultStart: Date,
  defaultEnd: Date
): Promise<ScorePeriod> => {
  if (!evaluationCycleId) {
    return { startDate: defaultStart, endDate: defaultEnd };
  }

  const cycle = await prisma.evaluationCycle.findUnique({
    where: { id: evaluationCycleId },
    select: { startDate: true, endDate: true },
  });

  return {
    startDate: cycle?.startDate ?? defaultStart,
    endDate: cycle?.endDate ?? defaultEnd,
  };
};

const calculateAndStoreScore = async (
  profileId: number,
  evaluationCycleId: number | undefined,
  period: ScorePeriod
) => {
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
      role: { select: { name: true } },
    },
  });

  if (!profile) {
    throw new Error("Profile not found");
  }

  const roleConfig = resolveRoleConfig(profile);
  const isMarketingRole =
    roleConfig.role === "marketing" || roleConfig.role === "business_development";
  const financialWeights = normalizeWeights(roleConfig.financial) as {
    total: number;
  } & Record<string, number>;
  const efficiencyWeights = normalizeWeights(roleConfig.efficiency) as {
    total: number;
  } & Record<string, number>;

  const resolveJobScopeIds = async () => {
    if (roleConfig.jobScope === "assigned") {
      const assignments = await prisma.jobStaffAssignment.findMany({
        where: {
          employeeProfileId: profileId,
          assignedAt: { lte: period.endDate },
        },
        select: { jobId: true },
      });
      return assignments.map((assignment) => assignment.jobId);
    }

    const jobWhere: Record<string, any> = {
      createdAt: { lte: period.endDate },
      OR: [{ completionDate: null }, { completionDate: { gte: period.startDate } }],
    };
    if (roleConfig.jobScope === "managed") {
      jobWhere.managerProfileId = profileId;
    }
    if (roleConfig.jobScope === "partnered") {
      jobWhere.partnerProfileId = profileId;
    }

    const jobs = await prisma.job.findMany({
      where: jobWhere,
      select: { id: true },
    });
    return jobs.map((job) => job.id);
  };

  const jobIds = Array.from(new Set(await resolveJobScopeIds()));
  const inScopeJobFilter =
    jobIds.length > 0 ? { jobId: { in: jobIds } } : { jobId: -1 };

  const allocations = await prisma.revenueAllocation.findMany({
    where: {
      ...(roleConfig.jobScope === "assigned"
        ? { employeeProfileId: profileId }
        : inScopeJobFilter),
      allocationMonth: { gte: period.startDate, lte: period.endDate },
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

  const [billableHoursAgg, allocatedHoursAgg] = await Promise.all([
    prisma.timeEntry.aggregate({
      where: {
        ...(roleConfig.jobScope === "assigned"
          ? { employeeProfileId: profileId }
          : inScopeJobFilter),
        billable: true,
        status: "approved",
        dateWorked: { gte: period.startDate, lte: period.endDate },
      },
      _sum: { hours: true },
    }),
    prisma.jobTimeAllocation.aggregate({
      where: {
        ...(roleConfig.jobScope === "assigned"
          ? { employeeProfileId: profileId }
          : { jobCosting: inScopeJobFilter }),
        createdAt: { lte: period.endDate },
      },
      _sum: { allocatedHours: true },
    }),
  ]);

  const billableHours = Number(billableHoursAgg._sum.hours || 0);
  const allocatedHours = Number(allocatedHoursAgg._sum.allocatedHours || 0);
  const utilizationRate = allocatedHours > 0 ? billableHours / allocatedHours : 0;

  const utilizationTargetRaw = Number(profile.utilizationTarget || 0.75);
  const utilizationTarget =
    utilizationTargetRaw > 1 ? utilizationTargetRaw / 100 : utilizationTargetRaw;

  const [wonProposals, departmentTargetAgg, departmentHeadcount, scopedJobFees] = await Promise.all([
    prisma.proposal.findMany({
      where: {
        status: "won",
        wonAt: { gte: period.startDate, lte: period.endDate },
        OR: [
          { createdByProfileId: profileId },
          { assignedPartnerProfileId: profileId },
        ],
      },
      select: {
        clientId: true,
        proposedFee: true,
      },
    }),
    profile.departmentId
      ? prisma.revenueProjection.aggregate({
          _sum: { projectedAmount: true },
          where: {
            departmentId: profile.departmentId,
            monthYear: { gte: period.startDate, lte: period.endDate },
          },
        })
      : Promise.resolve({ _sum: { projectedAmount: 0 } }),
    profile.departmentId
      ? prisma.profile.count({
          where: { departmentId: profile.departmentId, status: "active" },
        })
      : Promise.resolve(0),
    jobIds.length > 0
      ? prisma.job.findMany({
          where: { id: { in: jobIds } },
          select: {
            billingType: true,
            fixedFeeAmount: true,
            jobCosting: { select: { jobFee: true } },
          },
        })
      : Promise.resolve([]),
  ]);

  const wonProposalValue = wonProposals.reduce(
    (sum, proposal) => sum + Number(proposal.proposedFee || 0),
    0
  );
  const wonClientIds = Array.from(new Set(wonProposals.map((proposal) => proposal.clientId)));
  const leadToCashCollected =
    wonClientIds.length > 0
      ? Number(
          (
            await prisma.clientPayment.aggregate({
              _sum: { paymentAmount: true },
              where: {
                clientId: { in: wonClientIds },
                paymentDate: { gte: period.startDate, lte: period.endDate },
              },
            })
          )._sum.paymentAmount || 0
        )
      : 0;
  const leadToCashRate =
    wonProposalValue > 0 ? clamp((leadToCashCollected / wonProposalValue) * 100) : 0;
  const bdRevenue = isMarketingRole ? leadToCashCollected : wonProposalValue;
  const departmentTarget = Number(departmentTargetAgg._sum.projectedAmount || 0);
  const scopedFeeTarget = scopedJobFees.reduce(
    (sum, job) =>
      sum +
      Number(
        job.jobCosting?.jobFee ||
          (job.billingType === "fixed_fee" ? job.fixedFeeAmount : 0) ||
          0
      ),
    0
  );

  const scoringRevenue = isMarketingRole ? leadToCashCollected : revenue;

  let revenueTarget = Number(profile.financialTarget || 0);
  if (revenueTarget <= 0 && departmentTarget > 0) {
    if (roleConfig.jobScope === "assigned") {
      revenueTarget = departmentHeadcount > 0 ? departmentTarget / departmentHeadcount : departmentTarget;
    } else {
      revenueTarget = departmentTarget;
    }
  }
  if (revenueTarget <= 0 && roleConfig.jobScope === "partnered" && scopedFeeTarget > 0) {
    revenueTarget = scopedFeeTarget;
  }
  if (revenueTarget <= 0) {
    revenueTarget = Math.max(scoringRevenue, 1);
  }

  const revenueScore = revenueTarget > 0 ? clamp((scoringRevenue / revenueTarget) * 100) : 0;
  const profitMargin = scoringRevenue > 0 ? netProfit / scoringRevenue : 0;
  const profitScore = clamp(profitMargin * 100);
  const utilizationScore =
    utilizationTarget > 0 ? clamp((utilizationRate / utilizationTarget) * 100) : 0;

  const bdScore = isMarketingRole
    ? revenueTarget > 0
      ? clamp((bdRevenue / revenueTarget) * 100)
      : leadToCashRate
    : departmentTarget > 0
      ? clamp((bdRevenue / departmentTarget) * 100)
      : 0;
  const assignedJobsCount = jobIds.length;

  const completedJobs =
    assignedJobsCount > 0
      ? await prisma.job.findMany({
          where: {
            id: { in: jobIds },
            completionDate: { gte: period.startDate, lte: period.endDate },
          },
          select: { completionDate: true, dueDate: true },
        })
      : [];

  const completedJobsCount = completedJobs.length;
  const jobCompletionScore =
    assignedJobsCount > 0 ? clamp((completedJobsCount / assignedJobsCount) * 100) : 0;

  const completedWithDueDate = completedJobs.filter((job) => job.dueDate);
  const onTimeCount = completedWithDueDate.filter(
    (job) =>
      job.completionDate &&
      job.dueDate &&
      job.completionDate.getTime() <= job.dueDate.getTime()
  ).length;
  const timeToDeliveryScore =
    completedWithDueDate.length > 0
      ? clamp((onTimeCount / completedWithDueDate.length) * 100)
      : 0;

  let financialWeighted =
    financialWeights.total > 0
      ? clamp(
          revenueScore * normalizedWeight(financialWeights, "revenue") +
            profitScore * normalizedWeight(financialWeights, "profit") +
            bdScore * normalizedWeight(financialWeights, "bd")
        )
      : 0;

  const efficiencyWeighted =
    efficiencyWeights.total > 0
      ? clamp(
          utilizationScore * normalizedWeight(efficiencyWeights, "utilization") +
            jobCompletionScore * normalizedWeight(efficiencyWeights, "jobCompletion") +
            timeToDeliveryScore * normalizedWeight(efficiencyWeights, "timeToDelivery")
        )
      : 100;

  const definition = await getScoringConfig(profile.departmentId, evaluationCycleId);
  const scoringConfig = mergeWithDefaultScoringConfig(
    (definition?.scoringConfig ?? {}) as Record<string, any>,
    profile
  );
  const performanceMix = normalizePerformanceMix(scoringConfig?.performanceMix);
  const operationalBlend = normalizeOperationalBlend(scoringConfig?.operationalBlend);

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
      0.7
    ),
    feedbackWeight: normalizeWeightValue(
      scoringConfig?.learningGrowthBreakdown?.feedback,
      0.3
    ),
  };

  const nonFinancialScores = await nonFinancialPerformanceService.calculateNonFinancialScores(
    profileId,
    undefined,
    period.startDate,
    period.endDate,
    weightConfig
  );

  const coreNonFinancialScore = clamp(nonFinancialScores.overallNonFinancialScore);
  const operationalEfficiencyScore = clamp(efficiencyWeighted);
  const nonFinancialWeighted = clamp(
    coreNonFinancialScore * operationalBlend.coreNonFinancial +
      operationalEfficiencyScore * operationalBlend.operationalEfficiency
  );
  const lossPenaltyPercent = normalizeWeightValue(
    scoringConfig?.lossPenaltyPercent,
    0
  );
  const profitabilityPenaltyApplied = netProfit < 0 ? lossPenaltyPercent : 0;
  if (profitabilityPenaltyApplied > 0) {
    financialWeighted = clamp(financialWeighted * (1 - profitabilityPenaltyApplied));
  }
  const totalScore = clamp(
    financialWeighted * performanceMix.financial +
      nonFinancialWeighted * performanceMix.nonFinancial
  );
  const hasFinancialEvidence =
    allocations.length > 0 ||
    billableHours > 0 ||
    allocatedHours > 0 ||
    wonProposals.length > 0 ||
    completedJobsCount > 0;
  const hasNonFinancialEvidence = Object.values(nonFinancialScores.evidence || {}).some(Boolean);
  const hasScorableData = hasFinancialEvidence || hasNonFinancialEvidence;
  const grade = hasScorableData ? gradeFromScore(totalScore) : null;

  const financialWeightMap = {
    revenue: normalizedWeight(financialWeights, "revenue"),
    profit: normalizedWeight(financialWeights, "profit"),
    bd: normalizedWeight(financialWeights, "bd"),
  };
  const financialScoreMap = {
    revenue: revenueScore,
    profit: profitScore,
    bd: bdScore,
  };
  const financialContributionMap = {
    revenue: financialScoreMap.revenue * financialWeightMap.revenue,
    profit: financialScoreMap.profit * financialWeightMap.profit,
    bd: financialScoreMap.bd * financialWeightMap.bd,
  };
  const efficiencyWeightMap = {
    utilization: normalizedWeight(efficiencyWeights, "utilization"),
    jobCompletion: normalizedWeight(efficiencyWeights, "jobCompletion"),
    timeToDelivery: normalizedWeight(efficiencyWeights, "timeToDelivery"),
  };
  const efficiencyScoreMap = {
    utilization: utilizationScore,
    jobCompletion: jobCompletionScore,
    timeToDelivery: timeToDeliveryScore,
  };
  const efficiencyContributionMap = {
    utilization: efficiencyScoreMap.utilization * efficiencyWeightMap.utilization,
    jobCompletion: efficiencyScoreMap.jobCompletion * efficiencyWeightMap.jobCompletion,
    timeToDelivery: efficiencyScoreMap.timeToDelivery * efficiencyWeightMap.timeToDelivery,
  };

  const roleFormula = {
    role: roleConfig.role,
    jobScope: roleConfig.jobScope,
    overallWeights: {
      financial: performanceMix.financial,
      nonFinancial: performanceMix.nonFinancial,
      // Backward-compatible field: efficiency is now a sub-signal inside non-financial.
      efficiency: performanceMix.nonFinancial * operationalBlend.operationalEfficiency,
    },
    nonFinancialOperationalBlend: {
      coreNonFinancial: operationalBlend.coreNonFinancial,
      operationalEfficiency: operationalBlend.operationalEfficiency,
    },
    financial: {
      weights: financialWeightMap,
      scores: financialScoreMap,
      contributions: financialContributionMap,
      inputs: {
        revenue: scoringRevenue,
        allocationRevenue: revenue,
        profit,
        loss,
        netProfit,
        profitMargin,
        bdRevenue,
        wonProposalValue,
        leadToCashCollected,
        leadToCashRate,
      },
      targets: {
        revenueTarget,
      },
    },
    efficiency: {
      weights: efficiencyWeightMap,
      scores: efficiencyScoreMap,
      contributions: efficiencyContributionMap,
      inputs: {
        billableHours,
        allocatedHours,
        utilizationRate,
        assignedJobsCount,
        completedJobsCount,
        onTimeJobsCount: onTimeCount,
      },
      targets: {
        utilizationTarget,
      },
    },
  };

  const frameworkModule = resolveDashboardModuleForContext({
    roles: [profile.role?.name || roleConfig.role],
    positionTitle: profile.positionTitle,
  });
  const frameworkCoverage = getDashboardModuleCoverageSummary(frameworkModule);

  const periodStart = new Date(period.startDate.getFullYear(), period.startDate.getMonth(), 1);
  const existing = await prisma.performanceScore.findFirst({
    where: {
      employeeProfileId: profileId,
      evaluationCycleId: evaluationCycleId ?? null,
      period: periodStart,
    },
    orderBy: { calculatedAt: "desc" },
  });

  const scorePayload = {
    revenueScore,
    profitScore,
    bdScore,
    utilizationScore,
    jobCompletionScore,
    timeToDeliveryScore,
    financialWeighted,
    efficiencyWeighted,
    evaluationScore: 0,
    clientRatingScore: nonFinancialScores.customerSatisfactionScore,
    nonFinancialWeighted,
    totalScore,
    grade,
    scoreBreakdown: {
      revenue: scoringRevenue,
      allocationRevenue: revenue,
      profit,
      loss,
      netProfit,
      profitMargin,
      bdRevenue,
      bdScore,
      wonProposalValue,
      leadToCashCollected,
      leadToCashRate,
      departmentTarget,
      profitabilityPenaltyApplied,
      lossAlert: netProfit < 0,
      billableHours,
      allocatedHours,
      utilizationRate,
      jobCompletionScore,
      timeToDeliveryScore,
      revenueTarget,
      utilizationTarget,
      assignedJobsCount,
      completedJobsCount,
      onTimeJobsCount: onTimeCount,
      jobScope: roleConfig.jobScope,
      role: roleConfig.role,
      financialWeights,
      efficiencyWeights,
      roleFormula,
      evaluationDefinitionId: definition?.id ?? null,
      scoringConfig,
      performanceMix,
      operationalBlend,
      financialWeight: performanceMix.financial,
      nonFinancialWeight: performanceMix.nonFinancial,
      efficiencyWeight:
        performanceMix.nonFinancial * operationalBlend.operationalEfficiency,
      coreNonFinancialScore,
      operationalEfficiencyScore,
      periodStart: period.startDate.toISOString(),
      periodEnd: period.endDate.toISOString(),
      frameworkModule,
      frameworkCoverage,
      hasScorableData,
      dataEvidence: {
        financial: {
          allocations: allocations.length > 0,
          approvedBillableTime: billableHours > 0,
          allocatedHours: allocatedHours > 0,
          wonProposals: wonProposals.length > 0,
          completedJobs: completedJobsCount > 0,
        },
        nonFinancial: nonFinancialScores.evidence,
      },
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
        period: periodStart,
        ...scorePayload,
      },
    });
  }

  return {
    profile,
    period,
    financial: {
      revenue: scoringRevenue,
      profit,
      loss,
      netProfit,
      billableHours,
      allocatedHours,
      utilizationRate,
      revenueScore,
      profitScore,
      bdScore,
      financialWeighted,
    },
    efficiency: {
      utilizationRate,
      utilizationScore,
      jobCompletionScore,
      timeToDeliveryScore,
      efficiencyWeighted,
    },
    scoreBreakdown: scorePayload.scoreBreakdown,
    formula: roleFormula,
    frameworkModule,
    frameworkCoverage,
    nonFinancial: {
      learningGrowthScore: nonFinancialScores.learningGrowthScore,
      customerSatisfactionScore: nonFinancialScores.customerSatisfactionScore,
      internalProcessesScore: nonFinancialScores.internalProcessesScore,
      feedbackScore: nonFinancialScores.feedbackScore,
      coreNonFinancialScore,
      operationalEfficiencyScore,
      overallNonFinancialScore: nonFinancialWeighted,
      weights: {
        learningGrowthWeight: weightConfig.learningGrowthWeight,
        customerWeight: weightConfig.customerWeight,
        internalWeight: weightConfig.internalWeight,
        evaluationWeight: weightConfig.evaluationWeight,
        feedbackWeight: weightConfig.feedbackWeight,
        operationalBlend,
      },
    },
    overall: {
      totalScore,
      grade,
      hasScorableData,
    },
  };
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
    const defaultStart =
      parseDate(req.query.startDate) || new Date(new Date().getFullYear(), 0, 1);
    const defaultEnd = parseDate(req.query.endDate) || new Date();

    const period = await resolvePeriod(evaluationCycleId, defaultStart, defaultEnd);
    const result = await calculateAndStoreScore(profileId, evaluationCycleId, period);

    return res.json(successResponse(result, "Performance score calculated"));
  } catch (error: any) {
    console.error("Error calculating performance score:", error);
    return res.status(500).json(errorResponse("Failed to calculate performance score", 500));
  }
});

router.post(
  "/recalculate",
  authMiddleware,
  requireModuleAccess("reports", "admin"),
  async (req: AuthRequest, res) => {
    try {
      const evaluationCycleId = req.body?.evaluationCycleId
        ? Number(req.body.evaluationCycleId)
        : undefined;
      const defaultStart =
        parseDate(req.body?.startDate) || new Date(new Date().getFullYear(), 0, 1);
      const defaultEnd = parseDate(req.body?.endDate) || new Date();
      const period = await resolvePeriod(evaluationCycleId, defaultStart, defaultEnd);

      const profileIds = Array.isArray(req.body?.profileIds)
        ? req.body.profileIds.map((id: any) => Number(id)).filter((id: number) => id > 0)
        : [];

      const targets =
        profileIds.length > 0
          ? profileIds
          : (
              await prisma.profile.findMany({
                where: { status: "active" },
                select: { id: true },
              })
            ).map((profile) => profile.id);

      const results = [];
      for (const id of targets) {
        try {
          const data = await calculateAndStoreScore(id, evaluationCycleId, period);
          results.push({
            profileId: id,
            success: true,
            totalScore: data.overall.totalScore,
            grade: data.overall.grade,
          });
        } catch (err: any) {
          results.push({
            profileId: id,
            success: false,
            error: err?.message || "Failed to recalculate",
          });
        }
      }

      return res.json(
        successResponse(
          { count: results.length, results, period },
          "Performance scores recalculated"
        )
      );
    } catch (error: any) {
      console.error("Error recalculating performance scores:", error);
      return res.status(500).json(errorResponse("Failed to recalculate scores", 500));
    }
  }
);


export default router;
