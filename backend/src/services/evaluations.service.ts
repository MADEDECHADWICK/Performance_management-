/**
 * EvaluationService (Prisma Schema v2.1 aligned)
 */

import { prisma } from '../prisma';

interface AuthContext {
  userId: number;
  profileId: number;
  roleName?: string;
}

interface ListOptions {
  page: number;
  pageSize: number;
  status?: string;
  type?: string;
  cycleId?: number;
}

export class EvaluationService {
  /**
   * List evaluations with access control
   */
  static async listEvaluations(options: ListOptions, auth: AuthContext) {
    const { page, pageSize, status, type, cycleId } = options;
    const skip = (page - 1) * pageSize;

    const where: any = {};

    if (status) where.status = status;
    if (type) where.evaluation_type = type;
    if (cycleId) where.evaluation_cycle_id = cycleId;

    // Access control
    if (!['admin', 'manager'].includes(auth.roleName || '')) {
      // Employees see their own evaluations or as evaluators
      where.OR = [
        { evaluatee_profile_id: auth.profileId },
        { evaluator_profile_id: auth.profileId },
      ];
    }

    const [evaluations, total] = await Promise.all([
      prisma.evaluation.findMany({
        where,
        include: {
          evaluatee: { select: { id: true, first_name: true, last_name: true } },
          evaluator: { select: { id: true, first_name: true, last_name: true } },
          cycle: { select: { id: true, name: true } },
        },
        skip,
        take: pageSize,
        orderBy: { created_at: 'desc' },
      }),
      prisma.evaluation.count({ where }),
    ]);

    return { evaluations, total };
  }

  /**
   * Create new evaluation
   */
  static async createEvaluation(input: any, auth: AuthContext) {
    const {
      evaluatee_profile_id,
      evaluator_profile_id,
      evaluation_cycle_id,
      evaluation_type,
    } = input;

    // ✅ VERIFY EVALUATEE EXISTS
    const evaluatee = await prisma.profile.findUnique({
      where: { id: evaluatee_profile_id },
    });

    if (!evaluatee) {
      throw {
        statusCode: 404,
        message: 'Evaluatee not found',
      };
    }

    // ✅ VERIFY EVALUATOR EXISTS
    const evaluator = await prisma.profile.findUnique({
      where: { id: evaluator_profile_id },
    });

    if (!evaluator) {
      throw {
        statusCode: 404,
        message: 'Evaluator not found',
      };
    }

    // ✅ VERIFY CYCLE EXISTS
    if (evaluation_cycle_id) {
      const cycle = await prisma.evaluationCycle.findUnique({
        where: { id: evaluation_cycle_id },
      });

      if (!cycle) {
        throw {
          statusCode: 404,
          message: 'Evaluation cycle not found',
        };
      }
    }

    // ✅ PREVENT SELF-EVALUATION
    if (evaluatee_profile_id === evaluator_profile_id) {
      throw {
        statusCode: 400,
        message: 'Cannot evaluate yourself',
      };
    }

    const evaluation = await prisma.evaluation.create({
      data: {
        evaluatee_profile_id,
        evaluator_profile_id,
        evaluation_cycle_id: evaluation_cycle_id || null,
        evaluation_type: evaluation_type || 'peer',
        status: 'draft',
        created_at: new Date(),
      },
      include: {
        evaluatee: { select: { id: true, first_name: true, last_name: true } },
        evaluator: { select: { id: true, first_name: true, last_name: true } },
      },
    });

    return evaluation;
  }

  /**
   * Get specific evaluation
   */
  static async getEvaluation(evaluationId: number, auth: AuthContext) {
    const evaluation = await prisma.evaluation.findUnique({
      where: { id: evaluationId },
      include: {
        evaluatee: {
          select: { id: true, first_name: true, last_name: true, email: true },
        },
        evaluator: {
          select: { id: true, first_name: true, last_name: true },
        },
        cycle: { select: { id: true, name: true } },
      },
    });

    if (!evaluation) {
      throw {
        statusCode: 404,
        message: 'Evaluation not found',
      };
    }

    // ✅ VERIFY ACCESS
    const canView =
      auth.roleName === 'admin' ||
      auth.roleName === 'manager' ||
      evaluation.evaluatee_profile_id === auth.profileId ||
      evaluation.evaluator_profile_id === auth.profileId;

    if (!canView) {
      throw {
        statusCode: 403,
        message: 'You do not have permission to view this evaluation',
      };
    }

    return evaluation;
  }

  /**
   * Update evaluation
   */
  static async updateEvaluation(
    evaluationId: number,
    input: any,
    auth: AuthContext
  ) {
    const evaluation = await prisma.evaluation.findUnique({
      where: { id: evaluationId },
    });

    if (!evaluation) {
      throw {
        statusCode: 404,
        message: 'Evaluation not found',
      };
    }

    // ✅ VERIFY ONLY EVALUATOR CAN UPDATE
    if (evaluation.evaluator_profile_id !== auth.profileId && auth.roleName !== 'admin') {
      throw {
        statusCode: 403,
        message: 'Only the evaluator can update this evaluation',
      };
    }

    // ✅ VERIFY STATUS - can only update draft
    if (evaluation.status !== 'draft') {
      throw {
        statusCode: 400,
        message: `Cannot update evaluation with status: ${evaluation.status}`,
      };
    }

    // ✅ WHITELIST FIELDS
    const allowedFields = ['overall_rating', 'comments', 'strengths', 'improvements'];

    const updateData: Record<string, any> = {};

    for (const field of allowedFields) {
      if (field in input) {
        updateData[field] = input[field];
      }
    }

    const updated = await prisma.evaluation.update({
      where: { id: evaluationId },
      data: {
        ...updateData,
        updated_at: new Date(),
      },
      include: {
        evaluatee: { select: { id: true, first_name: true, last_name: true } },
        evaluator: { select: { id: true, first_name: true, last_name: true } },
      },
    });

    return updated;
  }

  /**
   * Submit evaluation
   */
  static async submitEvaluation(evaluationId: number, auth: AuthContext) {
    const evaluation = await prisma.evaluation.findUnique({
      where: { id: evaluationId },
    });

    if (!evaluation) {
      throw {
        statusCode: 404,
        message: 'Evaluation not found',
      };
    }

    // ✅ VERIFY ONLY EVALUATOR CAN SUBMIT
    if (evaluation.evaluator_profile_id !== auth.profileId && auth.roleName !== 'admin') {
      throw {
        statusCode: 403,
        message: 'Only the evaluator can submit this evaluation',
      };
    }

    // ✅ VERIFY STATUS
    if (evaluation.status !== 'draft') {
      throw {
        statusCode: 400,
        message: `Cannot submit evaluation with status: ${evaluation.status}`,
      };
    }

    const updated = await prisma.evaluation.update({
      where: { id: evaluationId },
      data: {
        status: 'submitted',
        submitted_at: new Date(),
        updated_at: new Date(),
      },
      include: {
        evaluatee: { select: { id: true, first_name: true, last_name: true } },
        evaluator: { select: { id: true, first_name: true, lastName: true } },
      },
    });

    return updated;
  }

  /**
   * Approve evaluation (manager only)
   */
  static async approveEvaluation(evaluationId: number, auth: AuthContext) {
    // ✅ VERIFY AUTHORIZATION
    if (!['admin', 'manager'].includes(auth.roleName || '')) {
      throw {
        statusCode: 403,
        message: 'Only managers/admins can approve evaluations',
      };
    }

    const evaluation = await prisma.evaluation.findUnique({
      where: { id: evaluationId },
    });

    if (!evaluation) {
      throw {
        statusCode: 404,
        message: 'Evaluation not found',
      };
    }

    // ✅ VERIFY STATUS
    if (evaluation.status !== 'submitted') {
      throw {
        statusCode: 400,
        message: `Cannot approve evaluation with status: ${evaluation.status}`,
      };
    }

    const updated = await prisma.evaluation.update({
      where: { id: evaluationId },
      data: {
        status: 'approved',
        approved_at: new Date(),
        updated_at: new Date(),
      },
      include: {
        evaluatee: { select: { id: true, first_name: true, last_name: true } },
        evaluator: { select: { id: true, first_name: true, last_name: true } },
      },
    });

    return updated;
  }

  /**
   * Get evaluations for a cycle
   */
  static async getEvaluationsByCycle(cycleId: number, auth: AuthContext) {
    // ✅ VERIFY CYCLE EXISTS
    const cycle = await prisma.evaluationCycle.findUnique({
      where: { id: cycleId },
    });

    if (!cycle) {
      throw {
        statusCode: 404,
        message: 'Evaluation cycle not found',
      };
    }

    const evaluations = await prisma.evaluation.findMany({
      where: { evaluation_cycle_id: cycleId },
      include: {
        evaluatee: { select: { id: true, first_name: true, last_name: true } },
        evaluator: { select: { id: true, first_name: true, last_name: true } },
      },
      orderBy: { created_at: 'desc' },
    });

    return evaluations;
  }

  /**
   * Get evaluation scores/ratings
   */
  static async getEvaluationScores(evaluationId: number, auth: AuthContext) {
    const evaluation = await prisma.evaluation.findUnique({
      where: { id: evaluationId },
    });

    if (!evaluation) {
      throw {
        statusCode: 404,
        message: 'Evaluation not found',
      };
    }

    // ✅ VERIFY ACCESS
    const canView =
      auth.roleName === 'admin' ||
      auth.roleName === 'manager' ||
      evaluation.evaluatee_profile_id === auth.profileId ||
      evaluation.evaluator_profile_id === auth.profileId;

    if (!canView) {
      throw {
        statusCode: 403,
        message: 'You do not have permission to view these scores',
      };
    }

    return {
      evaluationId,
      overallRating: evaluation.overall_rating,
      comments: evaluation.comments,
      strengths: evaluation.strengths,
      improvements: evaluation.improvements,
      status: evaluation.status,
    };
  }
}
