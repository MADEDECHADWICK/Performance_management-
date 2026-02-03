/**
 * EvaluationService (Schema v2.1 aligned)
 * Uses EvaluationAssignment as the primary evaluation record.
 */

import { prisma } from '../prisma';
import { EvaluationAssignmentStatus } from '@prisma/client';

interface AuthContext {
  userId: number;
  profileId: number;
  roleName?: string;
}

interface ListOptions {
  page: number;
  pageSize: number;
  status?: EvaluationAssignmentStatus;
  type?: string;
  cycleId?: number;
}

export class EvaluationService {
  static async listEvaluations(options: ListOptions, auth: AuthContext) {
    const { page, pageSize, status, type, cycleId } = options;
    const skip = (page - 1) * pageSize;

    const where: any = {};
    if (status) where.status = status;
    if (type) where.evaluatorType = type;
    if (cycleId) where.definition = { cycleId };

    if (!['admin', 'manager', 'hr', 'hr_manager', 'super_admin'].includes(auth.roleName || '')) {
      where.OR = [
        { evaluateeProfileId: auth.profileId },
        { evaluatorProfileId: auth.profileId },
      ];
    }

    const [evaluations, total] = await Promise.all([
      prisma.evaluationAssignment.findMany({
        where,
        include: {
          evaluator: { select: { id: true, firstName: true, lastName: true } },
          evaluatee: { select: { id: true, firstName: true, lastName: true } },
          definition: { select: { id: true, name: true, cycleId: true } },
        },
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.evaluationAssignment.count({ where }),
    ]);

    return { evaluations, total };
  }

  static async createEvaluation(input: any, auth: AuthContext) {
    const evaluationDefinitionId =
      input.evaluationDefinitionId ?? input.evaluation_definition_id ?? input.definitionId;
    const evaluatorProfileId =
      input.evaluatorProfileId ?? input.evaluator_profile_id ?? auth.profileId;
    const evaluateeProfileId =
      input.evaluateeProfileId ?? input.evaluatee_profile_id;
    const evaluatorType = input.evaluatorType ?? input.evaluation_type ?? 'manager';

    if (!evaluationDefinitionId || !evaluateeProfileId) {
      throw { statusCode: 400, message: 'evaluationDefinitionId and evaluateeProfileId are required' };
    }

    const evaluation = await prisma.evaluationAssignment.create({
      data: {
        evaluationDefinitionId,
        evaluatorProfileId,
        evaluateeProfileId,
        evaluatorType,
        status: 'pending',
      },
      include: {
        evaluator: { select: { id: true, firstName: true, lastName: true } },
        evaluatee: { select: { id: true, firstName: true, lastName: true } },
        definition: { select: { id: true, name: true, cycleId: true } },
      },
    });

    return evaluation;
  }

  static async getEvaluation(evaluationId: number, auth: AuthContext) {
    const evaluation = await prisma.evaluationAssignment.findUnique({
      where: { id: evaluationId },
      include: {
        evaluator: { select: { id: true, firstName: true, lastName: true } },
        evaluatee: { select: { id: true, firstName: true, lastName: true } },
        definition: { select: { id: true, name: true, cycleId: true } },
      },
    });

    if (!evaluation) {
      throw { statusCode: 404, message: 'Evaluation not found' };
    }

    const canView =
      ['admin', 'manager', 'hr', 'hr_manager', 'super_admin'].includes(auth.roleName || '') ||
      evaluation.evaluateeProfileId === auth.profileId ||
      evaluation.evaluatorProfileId === auth.profileId;

    if (!canView) {
      throw { statusCode: 403, message: 'You do not have permission to view this evaluation' };
    }

    return evaluation;
  }

  static async updateEvaluation(evaluationId: number, input: any, auth: AuthContext) {
    const evaluation = await prisma.evaluationAssignment.findUnique({
      where: { id: evaluationId },
    });

    if (!evaluation) {
      throw { statusCode: 404, message: 'Evaluation not found' };
    }

    if (evaluation.evaluatorProfileId !== auth.profileId && auth.roleName !== 'admin') {
      throw { statusCode: 403, message: 'Only the evaluator can update this evaluation' };
    }

    const updateData: any = {
      responses: input.responses ?? evaluation.responses,
      evaluatorComments: input.evaluatorComments ?? input.comments ?? evaluation.evaluatorComments,
      score: input.score ?? evaluation.score,
      evidenceUrls: input.evidenceUrls ?? evaluation.evidenceUrls,
      status: input.status ?? evaluation.status,
    };

    return prisma.evaluationAssignment.update({
      where: { id: evaluationId },
      data: updateData,
      include: {
        evaluator: { select: { id: true, firstName: true, lastName: true } },
        evaluatee: { select: { id: true, firstName: true, lastName: true } },
        definition: { select: { id: true, name: true, cycleId: true } },
      },
    });
  }

  static async submitEvaluation(evaluationId: number, auth: AuthContext) {
    const evaluation = await prisma.evaluationAssignment.findUnique({
      where: { id: evaluationId },
    });

    if (!evaluation) {
      throw { statusCode: 404, message: 'Evaluation not found' };
    }

    if (evaluation.evaluatorProfileId !== auth.profileId && auth.roleName !== 'admin') {
      throw { statusCode: 403, message: 'Only the evaluator can submit this evaluation' };
    }

    return prisma.evaluationAssignment.update({
      where: { id: evaluationId },
      data: {
        status: 'submitted',
        submittedAt: new Date(),
      },
      include: {
        evaluator: { select: { id: true, firstName: true, lastName: true } },
        evaluatee: { select: { id: true, firstName: true, lastName: true } },
        definition: { select: { id: true, name: true, cycleId: true } },
      },
    });
  }

  static async approveEvaluation(evaluationId: number, auth: AuthContext) {
    if (!['admin', 'manager', 'hr', 'hr_manager', 'super_admin'].includes(auth.roleName || '')) {
      throw { statusCode: 403, message: 'Only managers/admins can approve evaluations' };
    }

    const evaluation = await prisma.evaluationAssignment.findUnique({
      where: { id: evaluationId },
    });

    if (!evaluation) {
      throw { statusCode: 404, message: 'Evaluation not found' };
    }

    return prisma.evaluationAssignment.update({
      where: { id: evaluationId },
      data: {
        evaluatorSigned: true,
        evaluatorSignedAt: new Date(),
        status: evaluation.status === 'submitted' ? 'submitted' : evaluation.status,
      },
      include: {
        evaluator: { select: { id: true, firstName: true, lastName: true } },
        evaluatee: { select: { id: true, firstName: true, lastName: true } },
        definition: { select: { id: true, name: true, cycleId: true } },
      },
    });
  }

  static async getEvaluationsByCycle(cycleId: number, auth: AuthContext) {
    const where: any = { definition: { cycleId } };
    if (!['admin', 'manager', 'hr', 'hr_manager', 'super_admin'].includes(auth.roleName || '')) {
      where.OR = [
        { evaluateeProfileId: auth.profileId },
        { evaluatorProfileId: auth.profileId },
      ];
    }

    return prisma.evaluationAssignment.findMany({
      where,
      include: {
        evaluator: { select: { id: true, firstName: true, lastName: true } },
        evaluatee: { select: { id: true, firstName: true, lastName: true } },
        definition: { select: { id: true, name: true, cycleId: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  static async getEvaluationScores(evaluationId: number, auth: AuthContext) {
    const evaluation = await this.getEvaluation(evaluationId, auth);
    return {
      id: evaluation.id,
      score: evaluation.score ?? null,
      responses: evaluation.responses ?? null,
      evaluatorComments: evaluation.evaluatorComments ?? null,
    };
  }
}
