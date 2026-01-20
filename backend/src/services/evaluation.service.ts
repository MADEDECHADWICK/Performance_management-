/**
 * Performance Evaluation Service (Phase 5)
 * Complex evaluation calculations and scoring
 */

import { prisma } from '../lib/prisma';

interface AuthContext {
  userId: number;
  profileId: number;
  roleName?: string;
}

interface EvaluationScoreInput {
  evaluatee_profile_id: number;
  evaluator_profile_id: number;
  evaluation_cycle_id: number;
  scores: Record<string, number>; // { category: score }
  comments?: string;
  evaluation_type: string;
}

interface EvaluationAggregationInput {
  evaluatee_profile_id: number;
  evaluation_cycle_id: number;
}

export class EvaluationService {
  /**
   * Submit evaluation with score calculation
   */
  static async submitEvaluation(
    input: EvaluationScoreInput,
    auth: AuthContext
  ) {
    // ✅ VERIFY AUTHORIZATION
    if (
      input.evaluator_profile_id !== auth.profileId &&
      auth.roleName !== 'admin'
    ) {
      throw {
        statusCode: 403,
        message: 'You can only submit your own evaluations',
      };
    }

    // ✅ VERIFY CYCLE EXISTS
    const cycle = await prisma.evaluationCycle.findUnique({
      where: { id: input.evaluation_cycle_id },
    });

    if (!cycle) {
      throw {
        statusCode: 404,
        message: 'Evaluation cycle not found',
      };
    }

    // ✅ VERIFY EVALUATEE EXISTS
    const evaluatee = await prisma.profile.findUnique({
      where: { id: input.evaluatee_profile_id },
    });

    if (!evaluatee) {
      throw {
        statusCode: 404,
        message: 'Evaluatee profile not found',
      };
    }

    // ✅ VALIDATE SCORES
    const validScores = Object.values(input.scores);
    const invalidScores = validScores.filter(
      score => score < 1 || score > 5
    );

    if (invalidScores.length > 0) {
      throw {
        statusCode: 400,
        message: 'All scores must be between 1-5',
      };
    }

    // ✅ CALCULATE AVERAGE SCORE
    const averageScore =
      validScores.reduce((sum, score) => sum + score, 0) / validScores.length;

    // ✅ DETERMINE RATING
    const rating =
      averageScore >= 4.5
        ? 'Excellent'
        : averageScore >= 3.5
          ? 'Good'
          : averageScore >= 2.5
            ? 'Satisfactory'
            : averageScore >= 1.5
              ? 'Needs Improvement'
              : 'Unsatisfactory';

    // ✅ CREATE EVALUATION
    const evaluation = await prisma.evaluation.create({
      data: {
        evaluatee_profile_id: input.evaluatee_profile_id,
        evaluator_profile_id: input.evaluator_profile_id,
        evaluation_cycle_id: input.evaluation_cycle_id,
        scores: input.scores,
        average_score: averageScore,
        rating,
        comments: input.comments || null,
        evaluation_type: input.evaluation_type,
        submitted_at: new Date(),
      },
      include: {
        evaluatee: { select: { id: true, first_name: true, last_name: true } },
        evaluator: { select: { id: true, first_name: true, last_name: true } },
      },
    });

    return evaluation;
  }

  /**
   * Get aggregated evaluation scores for employee
   */
  static async getAggregatedEvaluationScores(
    input: EvaluationAggregationInput,
    auth: AuthContext
  ) {
    // ✅ VERIFY AUTHORIZATION
    if (
      input.evaluatee_profile_id !== auth.profileId &&
      auth.roleName !== 'admin'
    ) {
      throw {
        statusCode: 403,
        message: 'You can only view your own evaluations',
      };
    }

    const evaluations = await prisma.evaluation.findMany({
      where: {
        evaluatee_profile_id: input.evaluatee_profile_id,
        evaluation_cycle_id: input.evaluation_cycle_id,
      },
      include: {
        evaluator: { select: { id: true, first_name: true, last_name: true } },
      },
    });

    if (evaluations.length === 0) {
      throw {
        statusCode: 404,
        message: 'No evaluations found for this cycle',
      };
    }

    // ✅ AGGREGATE SCORES
    const allScores = evaluations.flatMap(e => Object.values(e.scores));
    const overallAverageScore =
      allScores.reduce((sum, score) => sum + score, 0) / allScores.length;

    // ✅ CALCULATE BY EVALUATOR TYPE
    const byEvaluatorType: Record<string, any> = {};

    evaluations.forEach(eval => {
      const type = eval.evaluation_type;
      if (!byEvaluatorType[type]) {
        byEvaluatorType[type] = {
          count: 0,
          scores: [],
          averageScore: 0,
        };
      }
      byEvaluatorType[type].count++;
      byEvaluatorType[type].scores.push(eval.average_score);
    });

    // ✅ CALCULATE AVERAGES FOR EACH TYPE
    Object.keys(byEvaluatorType).forEach(type => {
      const scores = byEvaluatorType[type].scores;
      byEvaluatorType[type].averageScore =
        scores.reduce((sum, s) => sum + s, 0) / scores.length;
    });

    // ✅ DETERMINE OVERALL RATING
    const overallRating =
      overallAverageScore >= 4.5
        ? 'Excellent'
        : overallAverageScore >= 3.5
          ? 'Good'
          : overallAverageScore >= 2.5
            ? 'Satisfactory'
            : overallAverageScore >= 1.5
              ? 'Needs Improvement'
              : 'Unsatisfactory';

    return {
      evaluateeId: input.evaluatee_profile_id,
      cycleId: input.evaluation_cycle_id,
      summary: {
        totalEvaluators: evaluations.length,
        overallAverageScore: overallAverageScore.toFixed(2),
        overallRating,
      },
      byEvaluatorType,
      individualEvaluations: evaluations.map(e => ({
        evaluatorName: `${e.evaluator.first_name} ${e.evaluator.last_name}`,
        evaluationType: e.evaluation_type,
        averageScore: e.average_score.toFixed(2),
        rating: e.rating,
        scores: e.scores,
        comments: e.comments,
      })),
      trend: {
        lowestScore: Math.min(...allScores),
        highestScore: Math.max(...allScores),
        standardDeviation: this.calculateStandardDeviation(allScores),
      },
    };
  }

  /**
   * Get evaluation comparison across employees
   */
  static async getEvaluationComparison(
    cycleId: number,
    departmentId?: number,
    auth: AuthContext
  ) {
    // ✅ VERIFY AUTHORIZATION
    if (!['admin', 'manager'].includes(auth.roleName || '')) {
      throw {
        statusCode: 403,
        message: 'Only admins/managers can view comparisons',
      };
    }

    const where: any = { evaluation_cycle_id: cycleId };

    if (departmentId) {
      where.evaluatee = { department_id: departmentId };
    }

    const evaluations = await prisma.evaluation.findMany({
      where,
      include: {
        evaluatee: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
            department_id: true,
          },
        },
      },
    });

    // ✅ GROUP BY EVALUATEE
    const byEmployee: Record<number, any> = {};

    evaluations.forEach(eval => {
      const employeeId = eval.evaluatee_profile_id;
      if (!byEmployee[employeeId]) {
        byEmployee[employeeId] = {
          name: `${eval.evaluatee.first_name} ${eval.evaluatee.last_name}`,
          evaluations: [],
        };
      }
      byEmployee[employeeId].evaluations.push({
        score: eval.average_score,
        rating: eval.rating,
        type: eval.evaluation_type,
      });
    });

    // ✅ CALCULATE AVERAGES
    const summary = Object.entries(byEmployee).map(([employeeId, data]) => {
      const scores = data.evaluations.map((e: any) => e.score);
      const avgScore = scores.reduce((a: number, b: number) => a + b, 0) / scores.length;

      return {
        employeeId: parseInt(employeeId),
        employeeName: data.name,
        evaluationCount: data.evaluations.length,
        averageScore: avgScore.toFixed(2),
        rating:
          avgScore >= 4.5
            ? 'Excellent'
            : avgScore >= 3.5
              ? 'Good'
              : avgScore >= 2.5
                ? 'Satisfactory'
                : 'Needs Improvement',
      };
    });

    return {
      cycleId,
      departmentId: departmentId || 'All',
      totalEmployees: Object.keys(byEmployee).length,
      summary: summary.sort(
        (a, b) => parseFloat(b.averageScore) - parseFloat(a.averageScore)
      ),
      statistics: {
        averageScore: (
          summary.reduce((sum, e) => sum + parseFloat(e.averageScore), 0) /
          summary.length
        ).toFixed(2),
        highestScore: Math.max(...summary.map(e => parseFloat(e.averageScore))),
        lowestScore: Math.min(...summary.map(e => parseFloat(e.averageScore))),
        topPerformers: summary.slice(0, 5),
        needsImprovement: summary.filter(
          e => e.rating === 'Needs Improvement' || e.rating === 'Satisfactory'
        ),
      },
    };
  }

  /**
   * Get KPI achievement against evaluations
   */
  static async getKPIVsEvaluationAnalysis(
    employeeId: number,
    cycleId: number,
    auth: AuthContext
  ) {
    // ✅ VERIFY AUTHORIZATION
    if (employeeId !== auth.profileId && auth.roleName !== 'admin') {
      throw {
        statusCode: 403,
        message: 'You can only view your own analysis',
      };
    }

    // ✅ GET EVALUATIONS
    const evaluations = await prisma.evaluation.findMany({
      where: {
        evaluatee_profile_id: employeeId,
        evaluation_cycle_id: cycleId,
      },
    });

    // ✅ GET KPI ASSIGNMENTS
    const kpiAssignments = await prisma.kpiAssignment.findMany({
      where: { employee_profile_id: employeeId },
      include: {
        kpi: true,
        performances: true,
      },
    });

    // ✅ CALCULATE METRICS
    const avgEvaluationScore =
      evaluations.length > 0
        ? evaluations.reduce((sum, e) => sum + e.average_score, 0) /
          evaluations.length
        : 0;

    const kpiAchievements = kpiAssignments.map(assignment => {
      const performances = assignment.performances || [];
      const achieved = performances.filter(
        p => p.actual_value >= assignment.kpi.target_value
      ).length;

      return {
        kpiName: assignment.kpi.name,
        target: assignment.kpi.target_value,
        achieved: achieved / Math.max(performances.length, 1),
        performances: performances.length,
      };
    });

    const averageKPIAchievement =
      kpiAchievements.length > 0
        ? kpiAchievements.reduce((sum, k) => sum + k.achieved, 0) /
          kpiAchievements.length
        : 0;

    return {
      employee: { id: employeeId },
      cycle: { id: cycleId },
      evaluation: {
        count: evaluations.length,
        averageScore: avgEvaluationScore.toFixed(2),
      },
      kpiPerformance: {
        assignmentCount: kpiAssignments.length,
        averageAchievement: (averageKPIAchievement * 100).toFixed(2) + '%',
        kpis: kpiAchievements,
      },
      correlation: {
        evaluationScore: avgEvaluationScore.toFixed(2),
        kpiAchievement: (averageKPIAchievement * 100).toFixed(2) + '%',
        alignment:
          Math.abs(
            avgEvaluationScore - averageKPIAchievement * 5
          ) < 1
            ? 'Strong'
            : 'Moderate',
      },
    };
  }

  /**
   * Generate performance improvement plan
   */
  static async generatePerformanceImprovementPlan(
    employeeId: number,
    cycleId: number,
    auth: AuthContext
  ) {
    // ✅ VERIFY AUTHORIZATION
    if (!['admin', 'manager'].includes(auth.roleName || '')) {
      throw {
        statusCode: 403,
        message: 'Only managers/admins can generate PIP',
      };
    }

    // ✅ GET EVALUATION DATA
    const evaluations = await prisma.evaluation.findMany({
      where: {
        evaluatee_profile_id: employeeId,
        evaluation_cycle_id: cycleId,
      },
    });

    if (evaluations.length === 0) {
      throw {
        statusCode: 404,
        message: 'No evaluations found for this employee',
      };
    }

    // ✅ IDENTIFY WEAK AREAS
    const scoreFrequency: Record<string, number[]> = {};

    evaluations.forEach(eval => {
      Object.entries(eval.scores).forEach(([category, score]) => {
        if (!scoreFrequency[category]) {
          scoreFrequency[category] = [];
        }
        scoreFrequency[category].push(score as number);
      });
    });

    const weakAreas = Object.entries(scoreFrequency)
      .map(([category, scores]) => ({
        category,
        averageScore:
          scores.reduce((a, b) => a + b, 0) / scores.length,
      }))
      .filter(area => area.averageScore < 3)
      .sort((a, b) => a.averageScore - b.averageScore);

    const pip = await prisma.performanceImprovementPlan.create({
      data: {
        employee_profile_id: employeeId,
        evaluation_cycle_id: cycleId,
        weak_areas: weakAreas,
        start_date: new Date(),
        expected_end_date: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days
        status: 'active',
        created_by_profile_id: auth.profileId,
      },
    });

    return {
      pipId: pip.id,
      employee: { id: employeeId },
      weakAreas,
      timeline: {
        startDate: pip.start_date,
        expectedEndDate: pip.expected_end_date,
        duration: '90 days',
      },
      recommendations: weakAreas.map(area => ({
        area: area.category,
        action: `Focus on improving ${area.category}`,
        timeline: '30 days',
      })),
    };
  }

  /**
   * Helper: Calculate standard deviation
   */
  private static calculateStandardDeviation(values: number[]): number {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const squaredDifferences = values.map(value => Math.pow(value - mean, 2));
    const variance =
      squaredDifferences.reduce((a, b) => a + b, 0) / values.length;
    return Math.sqrt(variance);
  }
}