/**
 * EvaluationService (Schema v2.1 aligned)
 * Uses EvaluationAssignment as the primary evaluation record.
 */

import { prisma } from '../prisma';
import { createAudit } from '../utils/audit';
import { NotificationService } from './notifications.service';
import { emitWebhook } from './webhook.service';
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

const normalizeRole = (role?: string) => (role || "").toLowerCase().trim();

const isPrivilegedRole = (role?: string) => {
  const normalized = normalizeRole(role);
  return (
    normalized === "admin" ||
    normalized === "super_admin" ||
    normalized === "hr" ||
    normalized === "hr_manager"
  );
};

const isManagerRole = (role?: string) => normalizeRole(role) === "manager";

const notifyRoles = async (
  roleNames: string[],
  templateLabel: string,
  data: Record<string, unknown>,
  payload: { title: string; message: string; link?: string; evaluationDefinitionId?: number },
  auth: AuthContext
) => {
  const profiles = await prisma.profile.findMany({
    where: {
      user: {
        roles: {
          some: {
            role: {
              name: {
                in: roleNames,
              },
            },
          },
        },
      },
    },
    select: { id: true },
  });

  await Promise.all(
    profiles.map((profile) =>
      NotificationService.createFromTemplate(
        {
          recipientProfileId: profile.id,
          label: templateLabel,
          data,
          type: payload.link ? "action" : "info",
          title: payload.title,
          message: payload.message,
          evaluationDefinitionId: payload.evaluationDefinitionId,
          actionRequired: false,
          link: payload.link,
        },
        auth
      )
    )
  );
};

export class EvaluationService {
  static async listEvaluations(options: ListOptions, auth: AuthContext) {
    const { page, pageSize, status, type, cycleId } = options;
    const skip = (page - 1) * pageSize;

    const where: any = {};
    if (status) where.status = status;
    if (type) where.evaluatorType = type;
    if (cycleId) where.definition = { cycleId };

    if (!isPrivilegedRole(auth.roleName)) {
      if (isManagerRole(auth.roleName)) {
        const reports = await prisma.profile.findMany({
          where: { managerId: auth.profileId, status: "active" },
          select: { id: true },
        });
        const reportIds = reports.map((report) => report.id);
        where.OR = [
          { evaluateeProfileId: auth.profileId },
          { evaluatorProfileId: auth.profileId },
          { evaluateeProfileId: { in: reportIds } },
        ];
      } else {
        where.OR = [
          { evaluateeProfileId: auth.profileId },
          { evaluatorProfileId: auth.profileId },
        ];
      }
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

    let canView =
      isPrivilegedRole(auth.roleName) ||
      evaluation.evaluateeProfileId === auth.profileId ||
      evaluation.evaluatorProfileId === auth.profileId;

    if (!canView && isManagerRole(auth.roleName)) {
      const evaluatee = await prisma.profile.findUnique({
        where: { id: evaluation.evaluateeProfileId },
        select: { managerId: true },
      });
      canView = evaluatee?.managerId === auth.profileId;
    }

    if (!canView) {
      throw { statusCode: 403, message: 'You do not have permission to view this evaluation' };
    }

    return evaluation;
  }

  static async updateEvaluation(evaluationId: number, input: any, auth: AuthContext) {
    const evaluation = await prisma.evaluationAssignment.findUnique({
      where: { id: evaluationId },
      include: {
        definition: {
          select: {
            status: true,
            requireEvaluatorSignature: true,
            cycle: { select: { status: true } },
          },
        },
      },
    });

    if (!evaluation) {
      throw { statusCode: 404, message: 'Evaluation not found' };
    }

    const privileged = isPrivilegedRole(auth.roleName);

    if (evaluation.evaluatorProfileId !== auth.profileId && !privileged) {
      throw { statusCode: 403, message: 'Only the evaluator can update this evaluation' };
    }

    if (!privileged && evaluation.definition?.status === 'closed') {
      throw { statusCode: 409, message: 'Evaluation definition is closed' };
    }

    if (!privileged && evaluation.definition?.cycle?.status === 'closed') {
      throw { statusCode: 409, message: 'Evaluation cycle is closed' };
    }

    if (!privileged && ['submitted', 'cancelled'].includes(String(evaluation.status))) {
      throw { statusCode: 409, message: 'Submitted evaluations cannot be edited' };
    }

    const updateData: any = {
      responses: input.responses ?? evaluation.responses,
      evaluatorComments: input.evaluatorComments ?? input.comments ?? evaluation.evaluatorComments,
      score: input.score ?? evaluation.score,
      evidenceUrls: input.evidenceUrls ?? evaluation.evidenceUrls,
    };

    if (input.status !== undefined && input.status !== null) {
      const allowedTransitions: Record<string, string[]> = {
        pending: ['in_progress', 'submitted', 'cancelled'],
        in_progress: ['submitted', 'cancelled'],
        submitted: [],
        cancelled: [],
      };

      const nextStatus = String(input.status);
      if (evaluation.status !== nextStatus) {
        const allowed = allowedTransitions[String(evaluation.status)] || [];
        if (!allowed.includes(nextStatus)) {
          throw {
            statusCode: 409,
            message: `Invalid status transition from ${evaluation.status} to ${nextStatus}`,
          };
        }
      }

      if (nextStatus === 'cancelled' && !privileged) {
        throw { statusCode: 403, message: 'Only HR/Admin can cancel evaluations' };
      }

      if (nextStatus === 'submitted') {
        if (evaluation.definition?.requireEvaluatorSignature && !evaluation.evaluatorSigned) {
          throw { statusCode: 409, message: 'Evaluator signature required before submission' };
        }
        updateData.submittedAt = new Date();
        updateData.rejectionReason = null;
      }

      updateData.status = nextStatus;
    }

    const updated = await prisma.evaluationAssignment.update({
      where: { id: evaluationId },
      data: updateData,
      include: {
        evaluator: { select: { id: true, firstName: true, lastName: true } },
        evaluatee: { select: { id: true, firstName: true, lastName: true } },
        definition: { select: { id: true, name: true, cycleId: true } },
      },
    });

    if (updateData.status && updateData.status !== evaluation.status) {
      await createAudit({
        action: 'evaluation_assignment.status_change',
        entity_type: 'evaluation_assignment',
        entity_id: evaluationId,
        user_id: auth.userId,
        metadata: {
          previousStatus: evaluation.status,
          newStatus: updateData.status,
          evaluatorProfileId: evaluation.evaluatorProfileId,
          evaluateeProfileId: evaluation.evaluateeProfileId,
        },
      });
    }

    if (updateData.status === 'submitted' && evaluation.status !== 'submitted') {
      const templateData = {
        assignmentId: updated.id,
        evaluationDefinitionId: updated.evaluationDefinitionId,
        evaluatorProfileId: updated.evaluatorProfileId,
        evaluateeProfileId: updated.evaluateeProfileId,
        evaluatorName: updated.evaluator
          ? `${updated.evaluator.firstName} ${updated.evaluator.lastName}`
          : "Evaluator",
        evaluateeName: updated.evaluatee
          ? `${updated.evaluatee.firstName} ${updated.evaluatee.lastName}`
          : "Evaluatee",
      };

      await NotificationService.createFromTemplate(
        {
          recipientProfileId: updated.evaluateeProfileId,
          label: "evaluation.submitted.evaluatee",
          data: templateData,
          type: "action",
          title: "Evaluation submitted",
          message: "An evaluation has been submitted and is awaiting your acknowledgement.",
          evaluationDefinitionId: updated.evaluationDefinitionId,
          actionRequired: true,
          link: `/evaluations/${updated.id}`,
        },
        auth
      );

      await notifyRoles(
        ["hr", "hr_manager"],
        "evaluation.submitted.hr",
        templateData,
        {
          title: "Evaluation submitted",
          message: "A submitted evaluation is available for calibration review.",
          link: "/calibration",
          evaluationDefinitionId: updated.evaluationDefinitionId,
        },
        auth
      );

      await emitWebhook("evaluation.submitted", {
        assignmentId: updated.id,
        evaluateeProfileId: updated.evaluateeProfileId,
        evaluatorProfileId: updated.evaluatorProfileId,
        evaluationDefinitionId: updated.evaluationDefinitionId,
        status: updated.status,
      });
    }

    return updated;
  }

  static async submitEvaluation(evaluationId: number, auth: AuthContext) {
    const evaluation = await prisma.evaluationAssignment.findUnique({
      where: { id: evaluationId },
      include: {
        definition: {
          select: {
            status: true,
            requireEvaluatorSignature: true,
            cycle: { select: { status: true } },
          },
        },
      },
    });

    if (!evaluation) {
      throw { statusCode: 404, message: 'Evaluation not found' };
    }

    const privileged = isPrivilegedRole(auth.roleName);

    if (evaluation.evaluatorProfileId !== auth.profileId && !privileged) {
      throw { statusCode: 403, message: 'Only the evaluator can submit this evaluation' };
    }

    if (['submitted', 'cancelled'].includes(String(evaluation.status))) {
      throw { statusCode: 409, message: `Cannot submit evaluation in status '${evaluation.status}'.` };
    }

    if (!privileged && evaluation.definition?.status === 'closed') {
      throw { statusCode: 409, message: 'Evaluation definition is closed' };
    }

    if (!privileged && evaluation.definition?.cycle?.status === 'closed') {
      throw { statusCode: 409, message: 'Evaluation cycle is closed' };
    }

    if (evaluation.definition?.requireEvaluatorSignature && !evaluation.evaluatorSigned) {
      throw { statusCode: 409, message: 'Evaluator signature required before submission' };
    }

    const updated = await prisma.evaluationAssignment.update({
      where: { id: evaluationId },
      data: {
        status: 'submitted',
        submittedAt: new Date(),
        rejectionReason: null,
      },
      include: {
        evaluator: { select: { id: true, firstName: true, lastName: true } },
        evaluatee: { select: { id: true, firstName: true, lastName: true } },
        definition: { select: { id: true, name: true, cycleId: true } },
      },
    });

    const templateData = {
      assignmentId: updated.id,
      evaluationDefinitionId: updated.evaluationDefinitionId,
      evaluatorProfileId: updated.evaluatorProfileId,
      evaluateeProfileId: updated.evaluateeProfileId,
      evaluatorName: updated.evaluator
        ? `${updated.evaluator.firstName} ${updated.evaluator.lastName}`
        : "Evaluator",
      evaluateeName: updated.evaluatee
        ? `${updated.evaluatee.firstName} ${updated.evaluatee.lastName}`
        : "Evaluatee",
    };

    await createAudit({
      action: 'evaluation_assignment.submitted',
      entity_type: 'evaluation_assignment',
      entity_id: evaluationId,
      user_id: auth.userId,
      metadata: {
        evaluatorProfileId: evaluation.evaluatorProfileId,
        evaluateeProfileId: evaluation.evaluateeProfileId,
      },
    });

    await NotificationService.createFromTemplate(
      {
        recipientProfileId: updated.evaluateeProfileId,
        label: "evaluation.submitted.evaluatee",
        data: templateData,
        type: "action",
        title: "Evaluation submitted",
        message: "An evaluation has been submitted and is awaiting your acknowledgement.",
        evaluationDefinitionId: updated.evaluationDefinitionId,
        actionRequired: true,
        link: `/evaluations/${updated.id}`,
      },
      auth
    );

    await notifyRoles(
      ["hr", "hr_manager"],
      "evaluation.submitted.hr",
      templateData,
      {
        title: "Evaluation submitted",
        message: "A submitted evaluation is available for calibration review.",
        link: "/calibration",
        evaluationDefinitionId: updated.evaluationDefinitionId,
      },
      auth
    );

    await emitWebhook("evaluation.submitted", {
      assignmentId: updated.id,
      evaluateeProfileId: updated.evaluateeProfileId,
      evaluatorProfileId: updated.evaluatorProfileId,
      evaluationDefinitionId: updated.evaluationDefinitionId,
      status: updated.status,
    });

    return updated;
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

    if (evaluation.status !== 'submitted') {
      throw { statusCode: 409, message: 'Only submitted evaluations can be approved' };
    }

    const updated = await prisma.evaluationAssignment.update({
      where: { id: evaluationId },
      data: {
        evaluatorSigned: true,
        evaluatorSignedAt: new Date(),
        status: evaluation.status,
      },
      include: {
        evaluator: { select: { id: true, firstName: true, lastName: true } },
        evaluatee: { select: { id: true, firstName: true, lastName: true } },
        definition: { select: { id: true, name: true, cycleId: true } },
      },
    });

    const templateData = {
      assignmentId: updated.id,
      evaluationDefinitionId: updated.evaluationDefinitionId,
      evaluatorProfileId: updated.evaluatorProfileId,
      evaluateeProfileId: updated.evaluateeProfileId,
      evaluatorName: updated.evaluator
        ? `${updated.evaluator.firstName} ${updated.evaluator.lastName}`
        : "Evaluator",
      evaluateeName: updated.evaluatee
        ? `${updated.evaluatee.firstName} ${updated.evaluatee.lastName}`
        : "Evaluatee",
    };

    await createAudit({
      action: 'evaluation_assignment.approved',
      entity_type: 'evaluation_assignment',
      entity_id: evaluationId,
      user_id: auth.userId,
      metadata: {
        evaluatorProfileId: evaluation.evaluatorProfileId,
        evaluateeProfileId: evaluation.evaluateeProfileId,
      },
    });

    await NotificationService.createFromTemplate(
      {
        recipientProfileId: updated.evaluateeProfileId,
        label: "evaluation.signed.evaluatee",
        data: templateData,
        type: "info",
        title: "Evaluation signed",
        message: "Your evaluator has signed the evaluation.",
        evaluationDefinitionId: updated.evaluationDefinitionId,
        actionRequired: false,
        link: `/evaluations/${updated.id}`,
      },
      auth
    );

    await notifyRoles(
      ["hr", "hr_manager"],
      "evaluation.signed.hr",
      templateData,
      {
        title: "Evaluation signed",
        message: "An evaluator has signed an evaluation.",
        link: "/calibration",
        evaluationDefinitionId: updated.evaluationDefinitionId,
      },
      auth
    );

    await emitWebhook("evaluation.signed", {
      assignmentId: updated.id,
      evaluateeProfileId: updated.evaluateeProfileId,
      evaluatorProfileId: updated.evaluatorProfileId,
      evaluationDefinitionId: updated.evaluationDefinitionId,
    });

    return updated;
  }

  static async getEvaluationsByCycle(cycleId: number, auth: AuthContext) {
    const where: any = { definition: { cycleId } };
    if (!isPrivilegedRole(auth.roleName)) {
      if (isManagerRole(auth.roleName)) {
        const reports = await prisma.profile.findMany({
          where: { managerId: auth.profileId, status: "active" },
          select: { id: true },
        });
        const reportIds = reports.map((report) => report.id);
        where.OR = [
          { evaluateeProfileId: auth.profileId },
          { evaluatorProfileId: auth.profileId },
          { evaluateeProfileId: { in: reportIds } },
        ];
      } else {
        where.OR = [
          { evaluateeProfileId: auth.profileId },
          { evaluatorProfileId: auth.profileId },
        ];
      }
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
