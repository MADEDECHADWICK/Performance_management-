/**
 * Legacy evaluation analytics compatibility service.
 *
 * Uses current schema entities (EvaluationAssignment, KPI assignments)
 * while preserving historical method names.
 */

import { prisma } from "../prisma";

interface AuthContext {
  userId: number;
  profileId: number;
  roleName?: string;
}

interface EvaluationScoreInput {
  evaluateeProfileId: number;
  evaluatorProfileId: number;
  evaluationCycleId: number;
  scores: Record<string, number>;
  comments?: string;
  evaluationType: string;
}

interface EvaluationAggregationInput {
  evaluateeProfileId: number;
  evaluationCycleId: number;
}

const privilegedRoles = new Set(["admin", "super_admin", "hr", "hr_manager"]);

const normalizeRole = (value?: string) => String(value || "").toLowerCase().trim();

const toNumber = (value: unknown): number => {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (typeof value === "object" && value && "toString" in value) {
    const parsed = Number(String(value));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

export class EvaluationService {
  static async submitEvaluation(input: EvaluationScoreInput, auth: AuthContext) {
    const role = normalizeRole(auth.roleName);
    if (
      input.evaluatorProfileId !== auth.profileId &&
      !privilegedRoles.has(role)
    ) {
      throw {
        statusCode: 403,
        message: "You can only submit your own evaluations",
      };
    }

    const definition = await prisma.evaluationDefinition.findFirst({
      where: { cycleId: input.evaluationCycleId },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    });

    if (!definition) {
      throw {
        statusCode: 404,
        message: "No evaluation definition found for the requested cycle",
      };
    }

    const scoreValues = Object.values(input.scores || {}).map((value) => toNumber(value));
    const averageScore =
      scoreValues.length > 0
        ? scoreValues.reduce((sum, value) => sum + value, 0) / scoreValues.length
        : 0;

    const evaluation = await prisma.evaluationAssignment.create({
      data: {
        evaluationDefinitionId: definition.id,
        evaluatorProfileId: input.evaluatorProfileId,
        evaluateeProfileId: input.evaluateeProfileId,
        evaluatorType: input.evaluationType as any,
        responses: input.scores as any,
        evaluatorComments: input.comments || null,
        score: averageScore,
        status: "submitted",
        submittedAt: new Date(),
      },
      include: {
        evaluatee: { select: { id: true, firstName: true, lastName: true } },
        evaluator: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    return evaluation;
  }

  static async getAggregatedEvaluationScores(
    input: EvaluationAggregationInput,
    auth: AuthContext
  ) {
    const role = normalizeRole(auth.roleName);
    const canViewOwn = input.evaluateeProfileId === auth.profileId;
    const canViewAll = privilegedRoles.has(role) || role === "manager";
    if (!canViewOwn && !canViewAll) {
      throw {
        statusCode: 403,
        message: "You can only view your own evaluations",
      };
    }

    const evaluations = await prisma.evaluationAssignment.findMany({
      where: {
        evaluateeProfileId: input.evaluateeProfileId,
        definition: { cycleId: input.evaluationCycleId },
      },
      include: {
        evaluator: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!evaluations.length) {
      throw {
        statusCode: 404,
        message: "No evaluations found for this cycle",
      };
    }

    const scores = evaluations.map((evaluation) => toNumber(evaluation.score));
    const overallAverage =
      scores.reduce((sum, value) => sum + value, 0) / Math.max(scores.length, 1);

    const byEvaluatorType: Record<
      string,
      { count: number; scores: number[]; averageScore: number }
    > = {};

    evaluations.forEach((evaluation) => {
      const type = String(evaluation.evaluatorType || "unknown");
      if (!byEvaluatorType[type]) {
        byEvaluatorType[type] = { count: 0, scores: [], averageScore: 0 };
      }
      byEvaluatorType[type].count += 1;
      byEvaluatorType[type].scores.push(toNumber(evaluation.score));
    });

    Object.keys(byEvaluatorType).forEach((type) => {
      const values = byEvaluatorType[type].scores;
      byEvaluatorType[type].averageScore =
        values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
    });

    return {
      evaluateeId: input.evaluateeProfileId,
      cycleId: input.evaluationCycleId,
      summary: {
        totalEvaluators: evaluations.length,
        overallAverageScore: Number(overallAverage.toFixed(2)),
        overallRating:
          overallAverage >= 4.5
            ? "Excellent"
            : overallAverage >= 3.5
              ? "Good"
              : overallAverage >= 2.5
                ? "Satisfactory"
                : "Needs Improvement",
      },
      byEvaluatorType,
      individualEvaluations: evaluations.map((evaluation) => ({
        evaluatorName: `${evaluation.evaluator.firstName} ${evaluation.evaluator.lastName}`.trim(),
        evaluationType: evaluation.evaluatorType,
        averageScore: Number(toNumber(evaluation.score).toFixed(2)),
        comments: evaluation.evaluatorComments,
      })),
      trend: {
        lowestScore: Math.min(...scores),
        highestScore: Math.max(...scores),
        standardDeviation: this.calculateStandardDeviation(scores),
      },
    };
  }

  static async getEvaluationComparison(
    cycleId: number,
    departmentId: number | undefined,
    auth: AuthContext
  ) {
    const role = normalizeRole(auth.roleName);
    if (!["admin", "super_admin", "manager", "hr", "hr_manager"].includes(role)) {
      throw {
        statusCode: 403,
        message: "Only admins/managers can view comparisons",
      };
    }

    const evaluations = await prisma.evaluationAssignment.findMany({
      where: {
        definition: { cycleId },
        ...(departmentId ? { evaluatee: { departmentId } } : {}),
      },
      include: {
        evaluatee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const byEmployee = new Map<
      number,
      { employeeName: string; scores: number[]; count: number }
    >();

    evaluations.forEach((evaluation) => {
      const existing = byEmployee.get(evaluation.evaluateeProfileId) || {
        employeeName: `${evaluation.evaluatee.firstName} ${evaluation.evaluatee.lastName}`.trim(),
        scores: [],
        count: 0,
      };
      existing.scores.push(toNumber(evaluation.score));
      existing.count += 1;
      byEmployee.set(evaluation.evaluateeProfileId, existing);
    });

    const summary = Array.from(byEmployee.entries())
      .map(([employeeId, info]) => {
        const averageScore =
          info.scores.reduce((sum, value) => sum + value, 0) /
          Math.max(info.scores.length, 1);
        return {
          employeeId,
          employeeName: info.employeeName,
          evaluationCount: info.count,
          averageScore: Number(averageScore.toFixed(2)),
          rating:
            averageScore >= 4.5
              ? "Excellent"
              : averageScore >= 3.5
                ? "Good"
                : averageScore >= 2.5
                  ? "Satisfactory"
                  : "Needs Improvement",
        };
      })
      .sort((a, b) => b.averageScore - a.averageScore);

    return {
      cycleId,
      departmentId: departmentId || "All",
      totalEmployees: summary.length,
      summary,
      statistics: {
        averageScore:
          summary.length > 0
            ? Number(
                (
                  summary.reduce((sum, item) => sum + item.averageScore, 0) / summary.length
                ).toFixed(2)
              )
            : 0,
        highestScore: summary.length ? Math.max(...summary.map((item) => item.averageScore)) : 0,
        lowestScore: summary.length ? Math.min(...summary.map((item) => item.averageScore)) : 0,
      },
    };
  }

  static async getKPIVsEvaluationAnalysis(
    employeeId: number,
    cycleId: number,
    auth: AuthContext
  ) {
    const role = normalizeRole(auth.roleName);
    if (employeeId !== auth.profileId && !privilegedRoles.has(role) && role !== "manager") {
      throw {
        statusCode: 403,
        message: "You can only view your own analysis",
      };
    }

    const evaluations = await prisma.evaluationAssignment.findMany({
      where: {
        evaluateeProfileId: employeeId,
        definition: { cycleId },
      },
      select: {
        score: true,
        evaluatorType: true,
        evaluatorComments: true,
      },
    });

    const assignments = await prisma.employeeKpiAssignment.findMany({
      where: { employeeProfileId: employeeId },
      include: {
        kpi: {
          select: {
            id: true,
            name: true,
            measurementUnit: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 30,
    });

    const averageEvaluationScore =
      evaluations.length > 0
        ? evaluations.reduce((sum, evaluation) => sum + toNumber(evaluation.score), 0) /
          evaluations.length
        : 0;

    const kpiAchievements = assignments.map((assignment) => {
      const target = toNumber(assignment.targetValue);
      const achieved = toNumber(assignment.achievedValue);
      const achievementPercent = target > 0 ? (achieved / target) * 100 : 0;
      return {
        kpiId: assignment.kpiId,
        kpiName: assignment.kpi.name,
        unit: assignment.kpi.measurementUnit,
        target,
        achieved,
        achievementPercent: Number(achievementPercent.toFixed(2)),
      };
    });

    return {
      employeeId,
      cycleId,
      averageEvaluationScore: Number(averageEvaluationScore.toFixed(2)),
      evaluationCount: evaluations.length,
      kpiCount: kpiAchievements.length,
      kpiAchievements,
    };
  }

  static async generatePerformanceImprovementPlan(
    employeeId: number,
    cycleId: number,
    auth: AuthContext
  ) {
    const role = normalizeRole(auth.roleName);
    if (!["admin", "super_admin", "manager", "hr", "hr_manager"].includes(role)) {
      throw {
        statusCode: 403,
        message: "Only admins/managers can generate improvement plans",
      };
    }

    const analysis = await this.getKPIVsEvaluationAnalysis(employeeId, cycleId, auth);
    const weakAreas = analysis.kpiAchievements.filter(
      (item) => item.achievementPercent < 70
    );

    const createdAt = new Date();
    const expectedEndDate = new Date(createdAt);
    expectedEndDate.setDate(createdAt.getDate() + 90);

    return {
      pipId: `PIP-${employeeId}-${cycleId}-${createdAt.getTime()}`,
      employee: { id: employeeId },
      weakAreas,
      timeline: {
        startDate: createdAt,
        expectedEndDate,
        duration: "90 days",
      },
      recommendations: weakAreas.map((area) => ({
        area: area.kpiName,
        action: `Improve KPI performance for "${area.kpiName}" to at least 70%`,
        timeline: "30 days",
      })),
    };
  }

  private static calculateStandardDeviation(values: number[]): number {
    if (!values.length) return 0;
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const squaredDiffs = values.map((value) => Math.pow(value - mean, 2));
    const variance = squaredDiffs.reduce((sum, value) => sum + value, 0) / values.length;
    return Math.sqrt(variance);
  }
}
