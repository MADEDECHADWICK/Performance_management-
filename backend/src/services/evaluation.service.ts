import {
  EvaluationAssignmentStatus,
  EvaluationCycleStatus,
  EvaluationCycleType,
  EvaluationQuestionCategory,
  EvaluationRelationship,
  EvaluatorType,
  Prisma,
} from "@prisma/client";
import prisma from "../prisma";
import websocketService from "./websocket.service";
import { NotificationService } from "./notifications.service";
import { createAudit } from "../utils/audit";
import {
  normalizeEvaluationWorkflowConfig,
  resolveEnabledEvaluatorTypes,
} from "./evaluationWorkflow.service";
import {
  DEFAULT_TEMPLATE_NAME,
  DEFAULT_TEMPLATE_QUESTIONS,
  TemplateQuestionSeed,
  asRecord,
  buildAnonymousEvaluatorLabel,
  buildCycleProgress,
  clamp,
  flattenQuestionSource,
  formatProfileName,
  hasManagerPrivileges,
  legacyQuestionPayload,
  mapCycleType,
  mapPerformanceScoreToReport,
  mapRelationshipToEvaluatorType,
  parseDate,
  roundTo,
  toNumber,
  toRoleSet,
} from "./evaluation.service.helpers";

type ServiceAuthContext = {
  userId: number;
  profileId: number;
  roles: string[];
};

type CycleInput = {
  title: string;
  description?: string;
  cycleType?: EvaluationCycleType | string;
  startDate: string | Date;
  endDate: string | Date;
  dueDate?: string | Date | null;
  departmentId?: number | null;
  templateId?: number | null;
  questions?: CycleQuestionInput[];
  enableSelfEvaluation?: boolean;
  enablePeerEvaluation?: boolean;
  enableUpwardEvaluation?: boolean;
  enableDownwardEvaluation?: boolean;
  processAnonymously?: boolean;
  hideFromDashboard?: boolean;
  excludeFromScore?: boolean;
  requireEvaluatorSignature?: boolean;
  requireEvaluateeSignature?: boolean;
  scoringConfig?: Record<string, unknown> | null;
};

type AssignmentInput = {
  evaluateeId: number;
  evaluatorId: number;
  relationship: EvaluationRelationship | string;
  dueDate?: string | Date | null;
};

type EvaluationResponseInput = {
  questionId: number;
  score: number;
  comment?: string;
};

type SubmitEvaluationInput = {
  responses: EvaluationResponseInput[];
  evaluatorComment?: string;
  evaluatorSigned?: boolean;
};

type CycleQuestionInput = {
  text?: string;
  label?: string;
  title?: string;
  category?: EvaluationQuestionCategory | string;
  weight?: number | string;
  order?: number;
};

type WeightedQuestion = {
  id: number;
  category: EvaluationQuestionCategory;
  weight: number;
};

type WeightedResponse = {
  questionId: number;
  score: number;
  comment?: string | null;
};

type ScoreSummary = {
  overall: number;
  byCategory: Record<string, number>;
};

type TemplateWithQuestions = Prisma.EvaluationTemplateGetPayload<{
  include: {
    questionRecords: true;
  };
}>;
type PrismaTx = Prisma.TransactionClient;

const canViewDashboardForProfile = async (
  requestedProfileId: number,
  auth: ServiceAuthContext
) => {
  if (requestedProfileId === auth.profileId) return true;
  const roles = toRoleSet(auth.roles);
  if (roles.has("super_admin") || roles.has("hr")) return true;
  if (!roles.has("manager")) return false;

  const profile = await prisma.profile.findUnique({
    where: { id: requestedProfileId },
    select: { managerId: true },
  });

  return profile?.managerId === auth.profileId;
};

export class EvaluationService {
  private static normalizeQuestionInput(questions?: CycleQuestionInput[]) {
    const normalized = flattenQuestionSource(questions);
    if (!normalized.length) {
      return [];
    }

    return normalized.map((question, index) => ({
      ...question,
      order: index + 1,
    }));
  }

  private static extractTemplateQuestions(template: TemplateWithQuestions | null | undefined) {
    if (!template) return [];

    if (template.questionRecords.length > 0) {
      return template.questionRecords
        .map((question) => ({
          text: question.text,
          category: question.category,
          weight: toNumber(question.weight),
          order: question.order,
        }))
        .sort((left, right) => left.order - right.order);
    }

    return flattenQuestionSource(template.questions).map((question, index) => ({
      ...question,
      order: index + 1,
    }));
  }

  private static async createMaterializedTemplate(
    tx: PrismaTx,
    sourceTemplate: TemplateWithQuestions | null,
    cycleName: string,
    auth: ServiceAuthContext,
    questions: TemplateQuestionSeed[]
  ) {
    const materializedQuestions = questions.length
      ? questions
      : DEFAULT_TEMPLATE_QUESTIONS.map((question) => ({
          text: question.text,
          category: question.category,
          weight: question.weight,
          order: question.order,
        }));

    return tx.evaluationTemplate.create({
      data: {
        name: `${cycleName} Template`,
        description:
          sourceTemplate?.description ||
          `Cycle-specific template for ${cycleName}.`,
        templateType: sourceTemplate?.templateType || "streamlined_360",
        bscCategory: sourceTemplate?.bscCategory || null,
        competencies:
          (sourceTemplate?.competencies as Prisma.InputJsonValue | undefined) ||
          ([] as Prisma.InputJsonValue),
        questions: legacyQuestionPayload(
          materializedQuestions.map((question, index) => ({
            id: index + 1,
            text: question.text,
            category: question.category,
            weight: question.weight,
          }))
        ) as Prisma.InputJsonValue,
        isDefault: false,
        isActive: true,
        createdBy: auth.userId || null,
        questionRecords: {
          create: materializedQuestions.map((question) => ({
            text: question.text,
            category: question.category,
            weight: new Prisma.Decimal(question.weight),
            order: question.order,
          })),
        },
      },
      include: {
        questionRecords: {
          orderBy: { order: "asc" },
        },
      },
    });
  }

  private static async ensureDefaultTemplate(tx: PrismaTx) {
    const existing = await tx.evaluationTemplate.findFirst({
      where: {
        isDefault: true,
        isActive: true,
      },
      include: {
        questionRecords: {
          orderBy: { order: "asc" },
        },
      },
    });

    if (existing) {
      return existing;
    }

    return tx.evaluationTemplate.create({
      data: {
        name: DEFAULT_TEMPLATE_NAME,
        description: "Default streamlined 360-degree evaluation template.",
        templateType: "streamlined_360",
        questions: legacyQuestionPayload(
          DEFAULT_TEMPLATE_QUESTIONS.map((question, index) => ({
            id: index + 1,
            text: question.text,
            category: question.category,
            weight: question.weight,
          }))
        ) as Prisma.InputJsonValue,
        competencies: [] as Prisma.InputJsonValue,
        isDefault: true,
        isActive: true,
        questionRecords: {
          create: DEFAULT_TEMPLATE_QUESTIONS.map((question) => ({
            text: question.text,
            category: question.category,
            weight: new Prisma.Decimal(question.weight),
            order: question.order,
          })),
        },
      },
      include: {
        questionRecords: {
          orderBy: { order: "asc" },
        },
      },
    });
  }

  private static async ensureCycleDefinition(
    tx: PrismaTx,
    cycleId: number,
    auth: ServiceAuthContext,
    options?: Pick<
      CycleInput,
      | "templateId"
      | "questions"
      | "dueDate"
      | "enableSelfEvaluation"
      | "enablePeerEvaluation"
      | "enableUpwardEvaluation"
      | "enableDownwardEvaluation"
      | "processAnonymously"
      | "hideFromDashboard"
      | "excludeFromScore"
      | "requireEvaluatorSignature"
      | "requireEvaluateeSignature"
      | "scoringConfig"
    >
  ) {
    const existing = await tx.evaluationDefinition.findFirst({
      where: { cycleId },
      include: {
        template: {
          include: {
            questionRecords: {
              orderBy: { order: "asc" },
            },
          },
        },
      },
      orderBy: { id: "asc" },
    });

    if (existing) {
      return existing;
    }

    const cycle = await tx.evaluationCycle.findUnique({
      where: { id: cycleId },
      select: {
        id: true,
        cycleName: true,
        description: true,
        departmentId: true,
        endDate: true,
      },
      });

      if (!cycle) {
        throw { statusCode: 404, message: "Evaluation cycle not found" };
      }

    let template: TemplateWithQuestions;
    if (options?.templateId) {
      const selectedTemplate = await tx.evaluationTemplate.findUnique({
        where: { id: options.templateId },
        include: {
          questionRecords: {
            orderBy: { order: "asc" },
          },
        },
      });

      if (!selectedTemplate || !selectedTemplate.isActive) {
        throw { statusCode: 404, message: "Selected evaluation template not found" };
      }

      const templateQuestions = this.extractTemplateQuestions(selectedTemplate);
      if (!templateQuestions.length) {
        throw {
          statusCode: 409,
          message: "Selected evaluation template does not contain any questions",
        };
      }

      const customQuestions = this.normalizeQuestionInput(options.questions);
      template =
        customQuestions.length > 0 || selectedTemplate.questionRecords.length === 0
          ? await this.createMaterializedTemplate(
              tx,
              selectedTemplate,
              cycle.cycleName,
              auth,
              customQuestions.length > 0 ? customQuestions : templateQuestions
            )
          : selectedTemplate;
    } else {
      const customQuestions = this.normalizeQuestionInput(options?.questions);
      if (customQuestions.length > 0) {
        template = await this.createMaterializedTemplate(
          tx,
          null,
          cycle.cycleName,
          auth,
          customQuestions
        );
      } else {
        template = await this.ensureDefaultTemplate(tx);
      }
    }

    const resolvedDueDate = options?.dueDate
      ? parseDate(options.dueDate, "dueDate")
      : cycle.endDate;
    const definitionFlags = {
      enableSelfEvaluation: options?.enableSelfEvaluation ?? true,
      enablePeerEvaluation: options?.enablePeerEvaluation ?? true,
      enableUpwardEvaluation: options?.enableUpwardEvaluation ?? true,
      enableDownwardEvaluation: options?.enableDownwardEvaluation ?? true,
      processAnonymously: Boolean(options?.processAnonymously),
      hideFromDashboard: Boolean(options?.hideFromDashboard),
      excludeFromScore: Boolean(options?.excludeFromScore),
      requireEvaluatorSignature: Boolean(options?.requireEvaluatorSignature),
      requireEvaluateeSignature: Boolean(options?.requireEvaluateeSignature),
    };
    const enabledEvaluatorTypes = resolveEnabledEvaluatorTypes(definitionFlags);
    const scoringConfigInput = asRecord(options?.scoringConfig);
    const scoringConfig = {
      ...scoringConfigInput,
      streamlined: true,
      source: "evaluation_service",
      evaluationWorkflow: normalizeEvaluationWorkflowConfig(
        scoringConfigInput.evaluationWorkflow,
        enabledEvaluatorTypes,
        resolvedDueDate ? resolvedDueDate.toISOString() : null
      ),
    };

    return tx.evaluationDefinition.create({
      data: {
        cycleId: cycle.id,
        departmentId: cycle.departmentId,
        templateId: template.id,
        name: `${cycle.cycleName} Default Definition`,
        description: cycle.description || "Default streamlined evaluation definition",
        dueDate: resolvedDueDate,
        status: "published",
        createdByProfileId: auth.profileId,
        ...definitionFlags,
        questions: legacyQuestionPayload(
          template.questionRecords.map((question) => ({
            id: question.id,
            text: question.text,
            category: question.category,
            weight: toNumber(question.weight),
          }))
        ) as Prisma.InputJsonValue,
        scoringConfig: scoringConfig as Prisma.InputJsonValue,
      },
      include: {
        template: {
          include: {
            questionRecords: {
              orderBy: { order: "asc" },
            },
          },
        },
      },
    });
  }

  static computeWeightedScore(
    responses: WeightedResponse[],
    questions: WeightedQuestion[]
  ): ScoreSummary {
    if (!responses.length || !questions.length) {
      return {
        overall: 0,
        byCategory: {},
      };
    }

    const questionMap = new Map(questions.map((question) => [question.id, question]));
    let weightedSum = 0;
    let totalWeight = 0;

    const categoryScores = new Map<string, { weightedSum: number; totalWeight: number }>();

    responses.forEach((response) => {
      const question = questionMap.get(response.questionId);
      if (!question) return;

      const score = clamp(toNumber(response.score), 1, 5);
      weightedSum += score * question.weight;
      totalWeight += question.weight;

      const category = String(question.category);
      const current = categoryScores.get(category) || { weightedSum: 0, totalWeight: 0 };
      current.weightedSum += score * question.weight;
      current.totalWeight += question.weight;
      categoryScores.set(category, current);
    });

    const byCategory = Object.fromEntries(
      Array.from(categoryScores.entries()).map(([category, value]) => [
        category,
        value.totalWeight > 0 ? roundTo(value.weightedSum / value.totalWeight) : 0,
      ])
    );

    return {
      overall: totalWeight > 0 ? roundTo(weightedSum / totalWeight) : 0,
      byCategory,
    };
  }

  static normalizeToRating(score: number) {
    const normalized = roundTo(score, 2);
    if (normalized >= 4.5) return "Outstanding";
    if (normalized >= 3.5) return "Exceeds Expectations";
    if (normalized >= 2.5) return "Meets Expectations";
    if (normalized >= 1.5) return "Needs Improvement";
    return "Unsatisfactory";
  }

  static async createCycle(input: CycleInput, auth: ServiceAuthContext) {
    if (!hasManagerPrivileges(auth.roles)) {
      throw { statusCode: 403, message: "Only HR, managers, or administrators can create cycles" };
    }

    const title = String(input.title || "").trim();
    if (!title) {
      throw { statusCode: 400, message: "title is required" };
    }

    const startDate = parseDate(input.startDate, "startDate");
    const endDate = parseDate(input.endDate, "endDate");
    if (endDate <= startDate) {
      throw { statusCode: 400, message: "endDate must be after startDate" };
    }

    const cycle = await prisma.$transaction(async (tx) => {
      const created = await tx.evaluationCycle.create({
        data: {
          cycleName: title,
          description: input.description || null,
          cycleType: mapCycleType(input.cycleType),
          startDate,
          endDate,
          status: EvaluationCycleStatus.draft,
          departmentId: input.departmentId || null,
          createdByProfileId: auth.profileId,
        },
      });

      await this.ensureCycleDefinition(tx, created.id, auth, {
        dueDate: input.dueDate,
        templateId: input.templateId,
        questions: input.questions,
        enableSelfEvaluation: input.enableSelfEvaluation,
        enablePeerEvaluation: input.enablePeerEvaluation,
        enableUpwardEvaluation: input.enableUpwardEvaluation,
        enableDownwardEvaluation: input.enableDownwardEvaluation,
        processAnonymously: input.processAnonymously,
        hideFromDashboard: input.hideFromDashboard,
        excludeFromScore: input.excludeFromScore,
        requireEvaluatorSignature: input.requireEvaluatorSignature,
        requireEvaluateeSignature: input.requireEvaluateeSignature,
        scoringConfig: input.scoringConfig,
      });
      return created;
    });

    await NotificationService.dispatchEvent(
      {
        eventType: "evaluation.cycle.created",
        title: "Evaluation cycle created",
        message: `${title} has been created and is ready for setup.`,
        canonicalRoute: "/evaluations/cycles",
        targetEntityType: "EvaluationCycle",
        targetEntityId: cycle.id,
        requiredPermission: "module.evaluations.read",
        rolePolicies: [
          {
            roles: ["hr"],
            fallbackRoles: ["super_admin"],
          },
        ],
      },
      auth
    );

    await createAudit({
      action: "evaluation_cycle_created",
      entity_type: "EvaluationCycle",
      entity_id: cycle.id,
      user_id: auth.userId,
      metadata: {
        actorProfileId: auth.profileId,
        cycleName: cycle.cycleName,
      } as Prisma.InputJsonValue,
    });

    return this.getCycleById(cycle.id, auth);
  }

  static async getAssignmentDirectory(auth: ServiceAuthContext) {
    if (!hasManagerPrivileges(auth.roles)) {
      throw { statusCode: 403, message: "Only HR, managers, or administrators can access the evaluation directory" };
    }

    const peopleWhere = hasManagerPrivileges(auth.roles) && !toRoleSet(auth.roles).has("manager")
      ? { status: "active" as const }
      : {
          status: "active" as const,
          OR: [{ id: auth.profileId }, { managerId: auth.profileId }],
        };

      const [people, departments] = await Promise.all([
        prisma.profile.findMany({
          where: peopleWhere,
          select: {
            id: true,
            firstName: true,
            lastName: true,
            managerId: true,
            positionTitle: true,
            role: {
              select: {
                name: true,
              },
            },
            department: {
              select: { id: true, name: true },
            },
        },
        orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      }),
      prisma.department.findMany({
        orderBy: { name: "asc" },
      }),
    ]);

    return {
      employees: people.map((person) => ({
        id: person.id,
        firstName: person.firstName,
        lastName: person.lastName,
        managerId: person.managerId,
        positionTitle: person.positionTitle || person.role?.name || null,
        department: person.department,
      })),
      departments,
    };
  }

  static async getMyCycles(auth: ServiceAuthContext) {
    const where = hasManagerPrivileges(auth.roles)
      ? {}
      : {
          OR: [
            {
              assignments: {
                some: {
                  evaluatorProfileId: auth.profileId,
                },
              },
            },
            {
              assignments: {
                some: {
                  evaluateeProfileId: auth.profileId,
                },
              },
            },
          ],
        };

    const cycles = await prisma.evaluationCycle.findMany({
      where,
      include: {
        department: {
          select: { id: true, name: true },
        },
        assignments: {
          include: {
            evaluatee: {
              select: {
                id: true,
                department: {
                  select: { id: true, name: true },
                },
              },
            },
          },
        },
      },
      orderBy: { startDate: "desc" },
    });

    return cycles.map((cycle) => ({
      id: cycle.id,
      title: cycle.cycleName,
      description: cycle.description,
      cycleType: cycle.cycleType,
      startDate: cycle.startDate,
      endDate: cycle.endDate,
      status: cycle.status,
      department: cycle.department,
      ...buildCycleProgress(cycle.assignments),
    }));
  }

  static async getCycleById(cycleId: number, auth: ServiceAuthContext) {
    const cycle = await prisma.evaluationCycle.findUnique({
      where: { id: cycleId },
      include: {
        department: {
          select: { id: true, name: true },
        },
        definitions: {
          include: {
            template: {
              include: {
                questionRecords: {
                  orderBy: { order: "asc" },
                },
              },
            },
          },
          orderBy: { id: "asc" },
        },
        assignments: {
          include: {
            evaluator: {
              select: { id: true, firstName: true, lastName: true },
            },
            evaluatee: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                department: {
                  select: { id: true, name: true },
                },
              },
            },
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!cycle) {
      throw { statusCode: 404, message: "Evaluation cycle not found" };
    }

    if (!hasManagerPrivileges(auth.roles)) {
      const visible = cycle.assignments.some(
        (assignment) =>
          assignment.evaluatorProfileId === auth.profileId ||
          assignment.evaluateeProfileId === auth.profileId
      );
      if (!visible) {
        throw { statusCode: 403, message: "You do not have access to this cycle" };
      }
    }

    const primaryDefinition = cycle.definitions[0] || null;

    return {
      id: cycle.id,
      title: cycle.cycleName,
      description: cycle.description,
      cycleType: cycle.cycleType,
      startDate: cycle.startDate,
      endDate: cycle.endDate,
      status: cycle.status,
      department: cycle.department,
      template:
        primaryDefinition?.template
          ? {
              id: primaryDefinition.template.id,
              name: primaryDefinition.template.name,
              description: primaryDefinition.template.description,
              questions: primaryDefinition.template.questionRecords.map((question) => ({
                id: question.id,
                text: question.text,
                category: question.category,
                weight: toNumber(question.weight),
                order: question.order,
              })),
            }
          : null,
      definition: primaryDefinition
        ? {
            id: primaryDefinition.id,
            dueDate: primaryDefinition.dueDate,
            enableSelfEvaluation: primaryDefinition.enableSelfEvaluation,
            enablePeerEvaluation: primaryDefinition.enablePeerEvaluation,
            enableUpwardEvaluation: primaryDefinition.enableUpwardEvaluation,
            enableDownwardEvaluation: primaryDefinition.enableDownwardEvaluation,
            processAnonymously: primaryDefinition.processAnonymously,
            hideFromDashboard: primaryDefinition.hideFromDashboard,
            excludeFromScore: primaryDefinition.excludeFromScore,
            requireEvaluatorSignature: primaryDefinition.requireEvaluatorSignature,
            requireEvaluateeSignature: primaryDefinition.requireEvaluateeSignature,
            scoringConfig: primaryDefinition.scoringConfig,
            enabledEvaluatorTypes: resolveEnabledEvaluatorTypes(primaryDefinition as Record<string, any>),
          }
        : null,
      assignments: cycle.assignments.map((assignment) => ({
        id: assignment.id,
        cycleId: assignment.cycleId || cycle.id,
        evaluateeId: assignment.evaluateeProfileId,
        evaluatorId: assignment.evaluatorProfileId,
        relationship: assignment.relationship || assignment.evaluatorType,
        status: assignment.status,
        dueDate: assignment.dueDate,
        submittedAt: assignment.submittedAt,
        evaluator: assignment.evaluator,
        evaluatee: assignment.evaluatee,
      })),
      ...buildCycleProgress(cycle.assignments),
    };
  }

  static async assignEvaluators(
    cycleId: number,
    assignments: AssignmentInput[],
    auth: ServiceAuthContext
  ) {
    if (!hasManagerPrivileges(auth.roles)) {
      throw { statusCode: 403, message: "Only HR, managers, or administrators can assign evaluators" };
    }

    if (!Array.isArray(assignments) || assignments.length === 0) {
      throw { statusCode: 400, message: "assignments must contain at least one evaluator assignment" };
    }

    const cycle = await prisma.evaluationCycle.findUnique({
      where: { id: cycleId },
      select: {
        id: true,
        cycleName: true,
        status: true,
      },
    });

    if (!cycle) {
      throw { statusCode: 404, message: "Evaluation cycle not found" };
    }

    if (cycle.status === "closed") {
      throw { statusCode: 409, message: "Closed cycles cannot receive new assignments" };
    }

    const createdAssignments = await prisma.$transaction(async (tx) => {
      const definition = await this.ensureCycleDefinition(tx, cycleId, auth);
      const payload = assignments.map((assignment) => {
        const relationship = String(assignment.relationship || "manager")
          .trim()
          .toLowerCase() as EvaluationRelationship;

        return {
          cycleId,
          evaluationDefinitionId: definition.id,
          evaluatorProfileId: Number(assignment.evaluatorId),
          evaluateeProfileId: Number(assignment.evaluateeId),
          evaluatorType: mapRelationshipToEvaluatorType(relationship),
          relationship,
          dueDate: assignment.dueDate ? parseDate(assignment.dueDate, "dueDate") : null,
          status: EvaluationAssignmentStatus.pending,
        };
      });

      await tx.evaluationAssignment.createMany({
        data: payload,
        skipDuplicates: true,
      });

      return tx.evaluationAssignment.findMany({
        where: {
          cycleId,
          OR: payload.map((item) => ({
            evaluatorProfileId: item.evaluatorProfileId,
            evaluateeProfileId: item.evaluateeProfileId,
            evaluatorType: item.evaluatorType,
          })),
        },
        include: {
          evaluator: {
            select: { id: true, firstName: true, lastName: true },
          },
          evaluatee: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
        orderBy: { createdAt: "desc" },
      });
    });

    await Promise.all(
      createdAssignments.map(async (assignment) => {
        websocketService.emitToUser(String(assignment.evaluatorProfileId), "evaluation:assigned", {
          assignmentId: assignment.id,
          cycleId,
          relationship: assignment.relationship || assignment.evaluatorType,
          evaluateeId: assignment.evaluateeProfileId,
        });

        await NotificationService.dispatchEvent(
          {
            eventType: "evaluation.assignment.created",
            title: "New evaluation assigned",
            message: `You have been assigned to evaluate ${assignment.evaluatee.firstName} ${assignment.evaluatee.lastName}.`,
            canonicalRoute: `/evaluations/assignments/${assignment.id}`,
            targetEntityType: "EvaluationAssignment",
            targetEntityId: assignment.id,
            requiredPermission: "module.evaluations.read",
            recipientProfileIds: [assignment.evaluatorProfileId],
          },
          auth
        );
      })
    );

    await createAudit({
      action: "evaluation_assignments_created",
      entity_type: "EvaluationCycle",
      entity_id: cycleId,
      user_id: auth.userId,
      metadata: {
        actorProfileId: auth.profileId,
        assignmentCount: createdAssignments.length,
      } as Prisma.InputJsonValue,
    });

    return {
      cycleId,
      count: createdAssignments.length,
      assignments: createdAssignments.map((assignment) => ({
        id: assignment.id,
        cycleId: assignment.cycleId || cycleId,
        evaluateeId: assignment.evaluateeProfileId,
        evaluatorId: assignment.evaluatorProfileId,
        relationship: assignment.relationship || assignment.evaluatorType,
        dueDate: assignment.dueDate,
        status: assignment.status,
        evaluator: assignment.evaluator,
        evaluatee: assignment.evaluatee,
      })),
    };
  }

  static async getAssignmentById(assignmentId: number, auth: ServiceAuthContext) {
    const assignment = await prisma.evaluationAssignment.findUnique({
      where: { id: assignmentId },
      include: {
        cycle: {
          select: {
            id: true,
            cycleName: true,
            description: true,
            cycleType: true,
            startDate: true,
            endDate: true,
            status: true,
          },
        },
        evaluator: {
          select: { id: true, firstName: true, lastName: true },
        },
        evaluatee: {
          select: { id: true, firstName: true, lastName: true },
        },
        definition: {
          include: {
            template: {
              include: {
                questionRecords: {
                  orderBy: { order: "asc" },
                },
              },
            },
          },
        },
        responseRecords: {
          orderBy: { questionId: "asc" },
        },
      },
    });

    if (!assignment) {
      throw { statusCode: 404, message: "Evaluation assignment not found" };
    }

    const isOwner =
      assignment.evaluatorProfileId === auth.profileId ||
      assignment.evaluateeProfileId === auth.profileId;
    if (!isOwner && !hasManagerPrivileges(auth.roles)) {
      throw { statusCode: 403, message: "You do not have access to this assignment" };
    }

    const isEvaluator = assignment.evaluatorProfileId === auth.profileId;
    const isEvaluatee = assignment.evaluateeProfileId === auth.profileId;
    const effectiveCycleId = assignment.cycleId || assignment.definition.cycleId || null;
    const scoringConfig = asRecord(assignment.definition.scoringConfig);
    const workflowConfig = asRecord(scoringConfig.evaluationWorkflow);
    const effectiveDueDate =
      assignment.dueDate || assignment.definition.dueDate || assignment.cycle?.endDate || null;
    const viewerSeesEvaluatorIdentity =
      !assignment.definition.processAnonymously ||
      isEvaluator ||
      hasManagerPrivileges(auth.roles);
    const latestScore =
      effectiveCycleId &&
      assignment.status === "submitted" &&
      (isEvaluatee || hasManagerPrivileges(auth.roles))
        ? await prisma.performanceScore.findFirst({
            where: {
              evaluationCycleId: effectiveCycleId,
              employeeProfileId: assignment.evaluateeProfileId,
            },
            orderBy: { calculatedAt: "desc" },
          })
        : null;

    const questions =
      assignment.definition.template?.questionRecords.map((question) => ({
        id: question.id,
        text: question.text,
        category: question.category,
        weight: toNumber(question.weight),
        order: question.order,
      })) || [];

    const scoreReport = latestScore ? mapPerformanceScoreToReport(latestScore) : null;

    return {
      id: assignment.id,
      cycleId: effectiveCycleId,
      evaluateeId: assignment.evaluateeProfileId,
      evaluatorId: assignment.evaluatorProfileId,
      relationship: assignment.relationship || assignment.evaluatorType,
      status: assignment.status,
      dueDate: assignment.dueDate,
      submittedAt: assignment.submittedAt,
      cycle: assignment.cycle
        ? {
            id: assignment.cycle.id,
            title: assignment.cycle.cycleName,
            description: assignment.cycle.description,
            cycleType: assignment.cycle.cycleType,
            startDate: assignment.cycle.startDate,
            endDate: assignment.cycle.endDate,
            status: assignment.cycle.status,
          }
        : null,
      evaluator: viewerSeesEvaluatorIdentity ? assignment.evaluator : null,
      evaluatee: assignment.evaluatee,
      definition: {
        id: assignment.definition.id,
        dueDate: assignment.definition.dueDate,
        processAnonymously: assignment.definition.processAnonymously,
        hideFromDashboard: assignment.definition.hideFromDashboard,
        excludeFromScore: assignment.definition.excludeFromScore,
        requireEvaluatorSignature: assignment.definition.requireEvaluatorSignature,
        requireEvaluateeSignature: assignment.definition.requireEvaluateeSignature,
        scoringConfig: assignment.definition.scoringConfig,
      },
      workflow: {
        dueDate: effectiveDueDate,
        isOverdue:
          Boolean(effectiveDueDate) &&
          assignment.status !== "submitted" &&
          Boolean(effectiveDueDate && effectiveDueDate < new Date()),
        cancelIfPastDue: Boolean(scoringConfig.cancelIfPastDue),
        reminderCadence: workflowConfig.reminderCadence || null,
      },
      viewerContext: {
        isEvaluator,
        isEvaluatee,
        canSubmit: isEvaluator && ["pending", "in_progress"].includes(String(assignment.status)),
        canAcknowledge:
          isEvaluatee &&
          assignment.status === "submitted" &&
          assignment.definition.requireEvaluateeSignature &&
          !assignment.evaluateeAcknowledged,
        canViewScoreReport: Boolean(scoreReport),
      },
      anonymity: {
        processAnonymously: assignment.definition.processAnonymously,
        viewerSeesEvaluatorIdentity,
        evaluatorLabel: viewerSeesEvaluatorIdentity
          ? formatProfileName(assignment.evaluator)
          : buildAnonymousEvaluatorLabel(String(assignment.relationship || assignment.evaluatorType)),
      },
      signatureStatus: {
        evaluatorSigned: assignment.evaluatorSigned,
        evaluatorSignedAt: assignment.evaluatorSignedAt,
        evaluateeAcknowledged: assignment.evaluateeAcknowledged,
        evaluateeAcknowledgedAt: assignment.evaluateeAcknowledgedAt,
      },
      template: assignment.definition.template
        ? {
            id: assignment.definition.template.id,
            name: assignment.definition.template.name,
            description: assignment.definition.template.description,
            questions,
          }
        : null,
      responses: assignment.responseRecords.map((response) => ({
        questionId: response.questionId,
        score: response.score,
        comment: response.comment,
      })),
      submissionSummary: {
        evaluatorComment: assignment.evaluatorComments,
        submittedAt: assignment.submittedAt,
        evaluatorSigned: assignment.evaluatorSigned,
        evaluateeAcknowledged: assignment.evaluateeAcknowledged,
      },
      scoreReport,
    };
  }

  static async submitEvaluation(
    assignmentId: number,
    input: SubmitEvaluationInput | EvaluationResponseInput[],
    auth: ServiceAuthContext
  ) {
    const payload = Array.isArray(input) ? { responses: input } : input || { responses: [] };
    const responses = Array.isArray(payload.responses) ? payload.responses : [];
    if (!Array.isArray(responses) || responses.length === 0) {
      throw { statusCode: 400, message: "responses must contain at least one answer" };
    }

    const assignment = await prisma.evaluationAssignment.findUnique({
      where: { id: assignmentId },
      include: {
        cycle: {
          select: {
            id: true,
            status: true,
          },
        },
        definition: {
          include: {
            template: {
              include: {
                questionRecords: {
                  orderBy: { order: "asc" },
                },
              },
            },
          },
        },
        evaluator: {
          select: { id: true, firstName: true, lastName: true },
        },
        evaluatee: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    if (!assignment) {
      throw { statusCode: 404, message: "Evaluation assignment not found" };
    }

    if (
      assignment.evaluatorProfileId !== auth.profileId &&
      !hasManagerPrivileges(auth.roles)
    ) {
      throw { statusCode: 403, message: "Only the assigned evaluator can submit this evaluation" };
    }

    if (assignment.status === "submitted") {
      throw { statusCode: 409, message: "This evaluation has already been submitted" };
    }

    const scoringConfig = asRecord(assignment.definition.scoringConfig);
    const effectiveDueDate = assignment.dueDate || assignment.definition.dueDate || null;
    if (Boolean(scoringConfig.cancelIfPastDue) && effectiveDueDate && effectiveDueDate < new Date()) {
      throw {
        statusCode: 409,
        message: "This evaluation expired on its due date and can no longer be submitted",
      };
    }

    if (assignment.cycle?.status === "closed") {
      throw { statusCode: 409, message: "This cycle is closed" };
    }

    const questions = assignment.definition.template?.questionRecords || [];
    if (!questions.length) {
      throw { statusCode: 409, message: "No evaluation questions are configured for this assignment" };
    }

    const questionMap = new Map(questions.map((question) => [question.id, question]));
    const uniqueQuestionIds = new Set<number>();
    const normalizedResponses = responses.map((response) => {
      const questionId = Number(response.questionId);
      const question = questionMap.get(questionId);
      if (!question) {
        throw {
          statusCode: 400,
          message: `questionId ${questionId} does not belong to this assignment template`,
        };
      }

      if (uniqueQuestionIds.has(questionId)) {
        throw { statusCode: 400, message: `questionId ${questionId} is duplicated` };
      }
      uniqueQuestionIds.add(questionId);

      const score = toNumber(response.score);
      if (score < 1 || score > 5) {
        throw { statusCode: 400, message: `score for question ${questionId} must be between 1 and 5` };
      }

      return {
        questionId,
        score: roundTo(score, 2),
        comment: response.comment?.trim() || null,
      };
    });

    const scoreSummary = this.computeWeightedScore(
      normalizedResponses,
      questions.map((question) => ({
        id: question.id,
        category: question.category,
        weight: toNumber(question.weight),
      }))
    );
    const evaluatorComment = payload.evaluatorComment?.trim() || null;
    const evaluatorSigned = Boolean(payload.evaluatorSigned);

    if (assignment.definition.requireEvaluatorSignature && !evaluatorSigned) {
      throw {
        statusCode: 409,
        message: "Evaluator signature is required before submission",
      };
    }

    await prisma.$transaction(async (tx) => {
      await tx.evaluationResponse.deleteMany({
        where: { assignmentId },
      });

      await tx.evaluationResponse.createMany({
        data: normalizedResponses.map((response) => ({
          assignmentId,
          questionId: response.questionId,
          score: Math.round(response.score),
          comment: response.comment,
        })),
      });

      await tx.evaluationAssignment.update({
        where: { id: assignmentId },
        data: {
          status: EvaluationAssignmentStatus.submitted,
          submittedAt: new Date(),
          score: new Prisma.Decimal(scoreSummary.overall),
          responses: normalizedResponses as unknown as Prisma.InputJsonValue,
          evaluatorComments: evaluatorComment,
          evaluatorSigned: evaluatorSigned || assignment.evaluatorSigned,
          evaluatorSignedAt:
            evaluatorSigned || assignment.evaluatorSigned
              ? assignment.evaluatorSignedAt || new Date()
              : null,
        },
      });
    });

    const effectiveCycleId = assignment.cycleId || assignment.definition.cycleId;
    if (!effectiveCycleId) {
      throw { statusCode: 409, message: "Assignment is missing a cycle association" };
    }

    const scoreReport = assignment.definition.excludeFromScore
      ? null
      : await this.aggregateScores(effectiveCycleId, assignment.evaluateeProfileId);

    websocketService.emitToUser(String(assignment.evaluateeProfileId), "evaluation:submitted", {
      assignmentId,
      cycleId: effectiveCycleId,
      evaluatorId: assignment.evaluatorProfileId,
      evaluateeId: assignment.evaluateeProfileId,
    });

    await NotificationService.dispatchEvent(
      {
        eventType: "evaluation.assignment.submitted",
        title: "Evaluation submitted",
        message: assignment.definition.processAnonymously
          ? "A new evaluation has been submitted for you."
          : `${assignment.evaluator.firstName} ${assignment.evaluator.lastName} submitted your evaluation.`,
        canonicalRoute: "/evaluations",
        targetEntityType: "EvaluationAssignment",
        targetEntityId: assignmentId,
        requiredPermission: "module.evaluations.read",
        recipientProfileIds: [assignment.evaluateeProfileId],
      },
      auth
    );

    await createAudit({
      action: "evaluation_assignment_submitted",
      entity_type: "EvaluationAssignment",
      entity_id: assignmentId,
      user_id: auth.userId,
      metadata: {
        actorProfileId: auth.profileId,
        cycleId: effectiveCycleId,
        evaluateeProfileId: assignment.evaluateeProfileId,
      } as Prisma.InputJsonValue,
    });

    const assignmentDetail = await this.getAssignmentById(assignmentId, auth);

    return {
      ...assignmentDetail,
      scoreReport,
    };
  }

  static async acknowledgeEvaluation(assignmentId: number, auth: ServiceAuthContext) {
    const assignment = await prisma.evaluationAssignment.findUnique({
      where: { id: assignmentId },
      include: {
        definition: {
          select: {
            cycleId: true,
            requireEvaluateeSignature: true,
          },
        },
        evaluator: {
          select: { id: true, firstName: true, lastName: true },
        },
        evaluatee: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    if (!assignment) {
      throw { statusCode: 404, message: "Evaluation assignment not found" };
    }

    const isEvaluatee = assignment.evaluateeProfileId === auth.profileId;
    if (!isEvaluatee && !hasManagerPrivileges(auth.roles)) {
      throw { statusCode: 403, message: "Only the evaluated employee can acknowledge this evaluation" };
    }

    if (assignment.status !== "submitted") {
      throw { statusCode: 409, message: "Only submitted evaluations can be acknowledged" };
    }

    if (
      !assignment.definition.requireEvaluateeSignature &&
      !hasManagerPrivileges(auth.roles)
    ) {
      throw { statusCode: 409, message: "This evaluation does not require acknowledgement" };
    }

    if (!assignment.evaluateeAcknowledged) {
      await prisma.evaluationAssignment.update({
        where: { id: assignmentId },
        data: {
          evaluateeAcknowledged: true,
          evaluateeAcknowledgedAt: new Date(),
        },
      });

      websocketService.emitToUser(String(assignment.evaluatorProfileId), "evaluation:acknowledged", {
        assignmentId,
        cycleId: assignment.cycleId || assignment.definition.cycleId,
        evaluatorId: assignment.evaluatorProfileId,
        evaluateeId: assignment.evaluateeProfileId,
      });

      await NotificationService.dispatchEvent(
        {
          eventType: "evaluation.assignment.acknowledged",
          title: "Evaluation acknowledged",
          message: `${formatProfileName(assignment.evaluatee)} acknowledged the evaluation.`,
          canonicalRoute: `/evaluations/assignments/${assignmentId}`,
          targetEntityType: "EvaluationAssignment",
          targetEntityId: assignmentId,
          requiredPermission: "module.evaluations.read",
          recipientProfileIds: [assignment.evaluatorProfileId],
        },
        auth
      );

      await createAudit({
        action: "evaluation_assignment_acknowledged",
        entity_type: "EvaluationAssignment",
        entity_id: assignmentId,
        user_id: auth.userId,
        metadata: {
          actorProfileId: auth.profileId,
          evaluateeProfileId: assignment.evaluateeProfileId,
          evaluatorProfileId: assignment.evaluatorProfileId,
        } as Prisma.InputJsonValue,
      });
    }

    return this.getAssignmentById(assignmentId, auth);
  }

  static async aggregateScores(cycleId: number, evaluateeId: number) {
    const cycle = await prisma.evaluationCycle.findUnique({
      where: { id: cycleId },
      select: {
        id: true,
        endDate: true,
      },
    });

    if (!cycle) {
      throw { statusCode: 404, message: "Evaluation cycle not found" };
    }

    const assignments = await prisma.evaluationAssignment.findMany({
      where: {
        cycleId,
        evaluateeProfileId: evaluateeId,
        status: EvaluationAssignmentStatus.submitted,
      },
      include: {
        definition: {
          select: {
            excludeFromScore: true,
          },
        },
        responseRecords: {
          include: {
            question: true,
          },
        },
      },
    });

    const includedAssignments = assignments.filter((assignment) => !assignment.definition.excludeFromScore);

    if (!includedAssignments.length) {
      return null;
    }

    const allResponses = includedAssignments.flatMap((assignment) =>
      assignment.responseRecords.map((response) => ({
        questionId: response.questionId,
        score: response.score,
        comment: response.comment,
      }))
    );

    const allQuestions = includedAssignments.flatMap((assignment) =>
      assignment.responseRecords.map((response) => ({
        id: response.questionId,
        category: response.question.category,
        weight: toNumber(response.question.weight),
      }))
    );

    const weighted = this.computeWeightedScore(allResponses, allQuestions);
    const report = await this.generateScoreReport(
      cycleId,
      evaluateeId,
      includedAssignments,
      weighted
    );

    websocketService.emitToUser(String(evaluateeId), "evaluation:scored", {
      cycleId,
      evaluateeId,
      overall: report.overall,
      ratingBand: report.ratingBand,
    });

    return report;
  }

  private static async generateScoreReport(
    cycleId: number,
    evaluateeId: number,
    assignments: Array<{
      relationship: EvaluationRelationship | null;
      evaluatorType: EvaluatorType;
      responseRecords: Array<{
        questionId: number;
        score: number;
        comment: string | null;
        question: {
          category: EvaluationQuestionCategory;
          weight: Prisma.Decimal;
        };
      }>;
    }>,
    weighted: ScoreSummary
  ) {
    const [kpis, goals, cycle] = await Promise.all([
      prisma.kpi.findMany({
        where: {
          ownerProfileId: evaluateeId,
          deletedAt: null,
        },
      }),
      prisma.developmentGoal.findMany({
        where: {
          employeeProfileId: evaluateeId,
        },
      }),
      prisma.evaluationCycle.findUnique({
        where: { id: cycleId },
        select: { endDate: true },
      }),
    ]);

    const weightedKpiScore = (() => {
      if (!kpis.length) return 0;

      const totals = kpis.map((kpi) => {
        const target = toNumber(kpi.targetValue);
        const actual = toNumber(kpi.actualValue);
        const completion = target > 0 ? clamp((actual / target) * 100, 0, 150) : 0;
        const weight = toNumber(kpi.weight) || 1;
        return { completion, weight };
      });

      const totalWeight = totals.reduce((sum, item) => sum + item.weight, 0);
      const weightedSum = totals.reduce(
        (sum, item) => sum + item.completion * item.weight,
        0
      );
      return totalWeight > 0 ? roundTo(weightedSum / totalWeight) : 0;
    })();

    const developmentGoalProgress = goals.length
      ? roundTo(
          goals.reduce((sum, goal) => sum + toNumber(goal.currentProgress), 0) / goals.length
        )
      : 0;

    const relationshipScores = assignments.reduce<Record<string, number[]>>((acc, assignment) => {
      const relationshipKey = String(
        assignment.relationship || assignment.evaluatorType || "manager"
      ).toLowerCase();

      const relationshipScore = this.computeWeightedScore(
        assignment.responseRecords.map((response) => ({
          questionId: response.questionId,
          score: response.score,
          comment: response.comment,
        })),
        assignment.responseRecords.map((response) => ({
          id: response.questionId,
          category: response.question.category,
          weight: toNumber(response.question.weight),
        }))
      ).overall;

      acc[relationshipKey] = acc[relationshipKey] || [];
      acc[relationshipKey].push(relationshipScore);
      return acc;
    }, {});

    const averageByRelationship = Object.fromEntries(
      Object.entries(relationshipScores).map(([key, values]) => [
        key,
        values.length
          ? roundTo(values.reduce((sum, value) => sum + value, 0) / values.length)
          : 0,
      ])
    );

    const peerAverage = averageByRelationship.peer || 0;
    const managerAverage = averageByRelationship.manager || 0;
    const peerVsManagerVariance = roundTo(Math.abs(peerAverage - managerAverage));

    const evaluationScore100 = roundTo(weighted.overall * 20);
    const totalScore = roundTo(
      evaluationScore100 * 0.7 + weightedKpiScore * 0.2 + developmentGoalProgress * 0.1
    );
    const ratingBand = this.normalizeToRating(weighted.overall);
    const period = cycle?.endDate || new Date();

    const scoreBreakdown = {
      weightedOverall: weighted.overall,
      byCategory: weighted.byCategory,
      ratingBand,
      kpiCompletionPercent: weightedKpiScore,
      developmentGoalProgress,
      peerVsManagerVariance,
      averageByRelationship,
      assignmentCount: assignments.length,
    };

    await prisma.performanceScore.upsert({
      where: {
        employeeProfileId_evaluationCycleId_period: {
          employeeProfileId: evaluateeId,
          evaluationCycleId: cycleId,
          period,
        },
      },
      update: {
        evaluationScore: new Prisma.Decimal(evaluationScore100),
        kpiScore: new Prisma.Decimal(weightedKpiScore),
        nonFinancialWeighted: new Prisma.Decimal(evaluationScore100),
        totalScore: new Prisma.Decimal(totalScore),
        grade: ratingBand,
        scoreBreakdown: scoreBreakdown as Prisma.InputJsonValue,
        calculatedAt: new Date(),
      },
      create: {
        employeeProfileId: evaluateeId,
        evaluationCycleId: cycleId,
        period,
        revenueScore: new Prisma.Decimal(0),
        profitScore: new Prisma.Decimal(0),
        bdScore: new Prisma.Decimal(0),
        utilizationScore: new Prisma.Decimal(0),
        jobCompletionScore: new Prisma.Decimal(0),
        timeToDeliveryScore: new Prisma.Decimal(0),
        financialWeighted: new Prisma.Decimal(0),
        efficiencyWeighted: new Prisma.Decimal(0),
        evaluationScore: new Prisma.Decimal(evaluationScore100),
        kpiScore: new Prisma.Decimal(weightedKpiScore),
        clientRatingScore: new Prisma.Decimal(0),
        nonFinancialWeighted: new Prisma.Decimal(evaluationScore100),
        totalScore: new Prisma.Decimal(totalScore),
        grade: ratingBand,
        scoreBreakdown: scoreBreakdown as Prisma.InputJsonValue,
      },
    });

    return {
      cycleId,
      evaluateeId,
      overall: weighted.overall,
      byCategory: weighted.byCategory,
      ratingBand,
      kpiCompletionPercent: weightedKpiScore,
      developmentGoalProgress,
      peerVsManagerVariance,
      averageByRelationship,
      totalScore,
    };
  }

  static async getCycleResults(cycleId: number, auth: ServiceAuthContext) {
    if (!hasManagerPrivileges(auth.roles)) {
      throw { statusCode: 403, message: "Only HR, managers, or administrators can view cycle results" };
    }

    const cycle = await prisma.evaluationCycle.findUnique({
      where: { id: cycleId },
      include: {
        definitions: {
          select: {
            id: true,
            dueDate: true,
            processAnonymously: true,
            hideFromDashboard: true,
            excludeFromScore: true,
            requireEvaluatorSignature: true,
            requireEvaluateeSignature: true,
            scoringConfig: true,
          },
          orderBy: { id: "asc" },
        },
        assignments: {
          include: {
            evaluatee: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                department: {
                  select: { id: true, name: true },
                },
              },
            },
            evaluator: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
              },
            },
            definition: {
              select: {
                processAnonymously: true,
                requireEvaluatorSignature: true,
                requireEvaluateeSignature: true,
              },
            },
            responseRecords: {
              where: {
                comment: {
                  not: null,
                },
              },
              include: {
                question: {
                  select: {
                    text: true,
                    category: true,
                  },
                },
              },
              orderBy: { questionId: "asc" },
            },
          },
        },
      },
    });

    if (!cycle) {
      throw { statusCode: 404, message: "Evaluation cycle not found" };
    }

    const scores = await prisma.performanceScore.findMany({
      where: {
        evaluationCycleId: cycleId,
      },
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            department: {
              select: { id: true, name: true },
            },
          },
        },
      },
      orderBy: { totalScore: "desc" },
    });

    const primaryDefinition = cycle.definitions[0] || null;
    const ratingDistribution = scores.reduce<Record<string, number>>((acc, score) => {
      const key = String(score.grade || "Unrated");
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    const signatureSummary = {
      evaluatorSignedCount: cycle.assignments.filter((assignment) => assignment.evaluatorSigned).length,
      evaluateeAcknowledgedCount: cycle.assignments.filter((assignment) => assignment.evaluateeAcknowledged)
        .length,
      requiredEvaluatorSignatures: cycle.assignments.filter(
        (assignment) => assignment.definition.requireEvaluatorSignature
      ).length,
      requiredEvaluateeAcknowledgements: cycle.assignments.filter(
        (assignment) => assignment.definition.requireEvaluateeSignature
      ).length,
    };

    return {
      id: cycle.id,
      title: cycle.cycleName,
      description: cycle.description,
      cycleType: cycle.cycleType,
      startDate: cycle.startDate,
      endDate: cycle.endDate,
      status: cycle.status,
      definition: primaryDefinition
        ? {
            id: primaryDefinition.id,
            dueDate: primaryDefinition.dueDate,
            processAnonymously: primaryDefinition.processAnonymously,
            hideFromDashboard: primaryDefinition.hideFromDashboard,
            excludeFromScore: primaryDefinition.excludeFromScore,
            requireEvaluatorSignature: primaryDefinition.requireEvaluatorSignature,
            requireEvaluateeSignature: primaryDefinition.requireEvaluateeSignature,
            scoringConfig: primaryDefinition.scoringConfig,
          }
        : null,
      ratingDistribution,
      signatureSummary,
      ...buildCycleProgress(cycle.assignments),
      results: scores.map((score) => {
        const employeeAssignments = cycle.assignments.filter(
          (assignment) => assignment.evaluateeProfileId === score.employeeProfileId
        );
        const employeeScoreReport = mapPerformanceScoreToReport(score);
        const anonymous = Boolean(
          primaryDefinition?.processAnonymously ||
            employeeAssignments.some((assignment) => assignment.definition.processAnonymously)
        );
        const relationshipCounters = new Map<string, number>();
        const commentHighlights = employeeAssignments
          .flatMap((assignment) =>
            assignment.responseRecords.map((response) => {
              const relationship = String(
                assignment.relationship || assignment.evaluatorType || "manager"
              ).toLowerCase();
              const nextIndex = (relationshipCounters.get(relationship) || 0) + 1;
              relationshipCounters.set(relationship, nextIndex);
              return {
                id: `${assignment.id}-${response.question.text}-${nextIndex}`,
                questionText: response.question.text,
                relationship,
                evaluatorLabel: anonymous
                  ? buildAnonymousEvaluatorLabel(relationship, nextIndex)
                  : formatProfileName(assignment.evaluator),
                comment: response.comment || "",
              };
            })
          )
          .filter((comment) => comment.comment.trim().length > 0)
          .slice(0, 5);

        return {
          performanceScoreId: score.id,
          evaluateeId: score.employeeProfileId,
          employee: score.employee,
          overallScore: toNumber(score.evaluationScore) / 20,
          totalScore: toNumber(score.totalScore),
          ratingBand: score.grade,
          scoreBreakdown: score.scoreBreakdown,
          scoreReport: employeeScoreReport,
          assignmentSummary: {
            total: employeeAssignments.length,
            submitted: employeeAssignments.filter((assignment) => assignment.status === "submitted").length,
            pending: employeeAssignments.filter((assignment) => assignment.status !== "submitted").length,
            completionPercent: employeeAssignments.length
              ? roundTo(
                  (employeeAssignments.filter((assignment) => assignment.status === "submitted").length /
                    employeeAssignments.length) *
                    100
                )
              : 0,
          },
          signatureStatus: {
            evaluatorSignedCount: employeeAssignments.filter((assignment) => assignment.evaluatorSigned)
              .length,
            evaluateeAcknowledgedCount: employeeAssignments.filter(
              (assignment) => assignment.evaluateeAcknowledged
            ).length,
            requiredEvaluatorSignatures: employeeAssignments.filter(
              (assignment) => assignment.definition.requireEvaluatorSignature
            ).length,
            requiredEvaluateeAcknowledgements: employeeAssignments.filter(
              (assignment) => assignment.definition.requireEvaluateeSignature
            ).length,
          },
          commentHighlights,
        };
      }),
    };
  }

  static async getMyPendingEvaluations(auth: ServiceAuthContext) {
    const assignments = await prisma.evaluationAssignment.findMany({
      where: {
        evaluatorProfileId: auth.profileId,
        status: {
          in: ["pending", "in_progress"],
        },
      },
      include: {
        cycle: {
          select: {
            id: true,
            cycleName: true,
            endDate: true,
            status: true,
          },
        },
        evaluatee: {
          select: { id: true, firstName: true, lastName: true },
        },
        definition: {
          include: {
            template: {
              include: {
                questionRecords: true,
              },
            },
          },
        },
      },
      orderBy: [
        { dueDate: "asc" },
        { createdAt: "desc" },
      ],
    });

    return assignments.map((assignment) => ({
      id: assignment.id,
      cycleId: assignment.cycleId || assignment.definition.cycleId,
      evaluateeId: assignment.evaluateeProfileId,
      evaluatorId: assignment.evaluatorProfileId,
      relationship: assignment.relationship || assignment.evaluatorType,
      status: assignment.status,
      dueDate: assignment.dueDate,
      submittedAt: assignment.submittedAt,
      evaluatee: assignment.evaluatee,
      cycle: assignment.cycle
        ? {
            id: assignment.cycle.id,
            title: assignment.cycle.cycleName,
            endDate: assignment.cycle.endDate,
            status: assignment.cycle.status,
          }
        : null,
      questionCount: assignment.definition.template?.questionRecords.length || 0,
    }));
  }

  static async getEmployeeDashboard(requestedProfileId: number, auth: ServiceAuthContext) {
    const allowed = await canViewDashboardForProfile(requestedProfileId, auth);
    if (!allowed) {
      throw { statusCode: 403, message: "You do not have access to this dashboard" };
    }

    const [pendingEvaluations, kpis, okrs, goals, feedback, checkIns] = await Promise.all([
      prisma.evaluationAssignment.findMany({
        where: {
          evaluatorProfileId: requestedProfileId,
          status: { in: ["pending", "in_progress"] },
        },
        include: {
          cycle: {
            select: {
              id: true,
              cycleName: true,
              endDate: true,
            },
          },
          evaluatee: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
        orderBy: { dueDate: "asc" },
        take: 10,
      }),
      prisma.kpi.findMany({
        where: {
          ownerProfileId: requestedProfileId,
          deletedAt: null,
        },
        orderBy: { dueDate: "asc" },
      }),
      prisma.okr.findMany({
        where: {
          ownerProfileId: requestedProfileId,
        },
        orderBy: { updatedAt: "desc" },
      }),
      prisma.developmentGoal.findMany({
        where: {
          employeeProfileId: requestedProfileId,
        },
        orderBy: { targetCompletion: "asc" },
      }),
      prisma.feedback.findMany({
        where: {
          recipientProfileId: requestedProfileId,
        },
        include: {
          giver: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
      prisma.checkIn.findMany({
        where: {
          employeeProfileId: requestedProfileId,
        },
        include: {
          manager: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
        orderBy: { scheduledAt: "asc" },
        take: 10,
      }),
    ]);

    const kpisByStatus = kpis.reduce<Record<string, number>>((acc, kpi) => {
      const key = String(kpi.progressStatus || "on_track");
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    const okrsByStatus = okrs.reduce<Record<string, number>>((acc, okr) => {
      const key = String(okr.status || "on_track");
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    const goalsByStatus = goals.reduce<Record<string, number>>((acc, goal) => {
      const key = String(goal.planStatus || "not_started");
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    return {
      userId: requestedProfileId,
      pendingEvaluations: pendingEvaluations.map((assignment) => ({
        id: assignment.id,
        cycleId: assignment.cycleId || assignment.evaluationDefinitionId,
        evaluateeId: assignment.evaluateeProfileId,
        relationship: assignment.relationship || assignment.evaluatorType,
        status: assignment.status,
        dueDate: assignment.dueDate,
        cycle: assignment.cycle
          ? {
              id: assignment.cycle.id,
              title: assignment.cycle.cycleName,
              endDate: assignment.cycle.endDate,
            }
          : null,
        evaluatee: assignment.evaluatee,
      })),
      kpiSummary: {
        total: kpis.length,
        byStatus: kpisByStatus,
        items: kpis.map((kpi) => ({
          id: kpi.id,
          title: kpi.name,
          description: kpi.description,
          target: toNumber(kpi.targetValue),
          actual: toNumber(kpi.actualValue),
          unit: kpi.measurementUnit,
          weight: toNumber(kpi.weight),
          status: kpi.progressStatus,
          dueDate: kpi.dueDate,
        })),
      },
      okrSummary: {
        total: okrs.length,
        byStatus: okrsByStatus,
        items: okrs,
      },
      developmentGoalSummary: {
        total: goals.length,
        byStatus: goalsByStatus,
        items: goals.map((goal) => ({
          id: goal.id,
          title: goal.goalTitle,
          description: goal.goalDescription,
          progress: toNumber(goal.currentProgress),
          targetDate: goal.targetCompletion,
          status: goal.planStatus,
          linkedKpiId: goal.linkedKpiId,
        })),
      },
      recentFeedback: feedback.map((item) => ({
        id: item.id,
        giverId: item.giverProfileId,
        receiverId: item.recipientProfileId,
        jobId: item.jobId,
        feedbackType: item.feedbackType,
        message: item.message || item.content,
        isPrivate: item.isPrivate,
        visibility: item.visibility,
        createdAt: item.createdAt,
        giver: item.isAnonymous
          ? { id: 0, firstName: "Anonymous", lastName: "" }
          : item.giver,
      })),
      upcomingCheckIns: checkIns.map((checkIn) => ({
        id: checkIn.id,
        managerId: checkIn.managerProfileId,
        employeeId: checkIn.employeeProfileId,
        scheduledAt: checkIn.scheduledAt,
        completedAt: checkIn.completedAt,
        notes: checkIn.notes,
        actionItems: checkIn.actionItems,
        status: checkIn.status,
        manager: checkIn.manager,
      })),
    };
  }
}

export default EvaluationService;
