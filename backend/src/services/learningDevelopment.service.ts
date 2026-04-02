import crypto from "crypto";
import fs from "fs";
import path from "path";
import PDFDocument from "pdfkit";
import {
  CertificateStatus,
  DocumentAccessLevel,
  LearningAssignmentStatus,
  LearningAttendanceStatus,
  LearningPointEventType,
  LearningPointSourceType,
  LearningProgressStatus,
  LearningQuizAttemptStatus,
  LearningQuizQuestionType,
  Prisma,
  TrainingRecordSourceType,
  TrainingRecordStatus,
} from "@prisma/client";
import prisma from "../prisma";
import { buildPublicUploadPath, getUploadDirectory, resolveLocalUploadPath } from "../config/uploads";

type PrismaLike = Prisma.TransactionClient;

export type SubmittedQuizAnswer = {
  questionId: number;
  optionIds?: number[];
  freeTextAnswer?: string | null;
};

export type KnowledgeHubProgressInput = {
  timeSpentSeconds?: number | null;
  scrollPercent?: number | null;
  watchSeconds?: number | null;
  watchPercent?: number | null;
  completed?: boolean | null;
};

const toNumber = (value: unknown) => {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  if (typeof value === "bigint") return Number(value);
  if (value instanceof Prisma.Decimal) return value.toNumber();
  return Number(value) || 0;
};

const clampPercentage = (value: unknown) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  if (parsed < 0) return 0;
  if (parsed > 100) return 100;
  return Math.round(parsed * 100) / 100;
};

const roundPercentage = (value: number) => Math.round(value * 100) / 100;

const sanitizeFileName = (value: string) =>
  String(value || "certificate")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

const withStatusCode = (message: string, statusCode: number) => {
  const error = new Error(message) as Error & { statusCode?: number };
  error.statusCode = statusCode;
  return error;
};

const awardPoints = async (
  tx: PrismaLike,
  input: {
    profileId: number;
    points: number;
    eventType: LearningPointEventType;
    sourceType: LearningPointSourceType;
    sourceId: number;
    awardedByProfileId?: number | null;
    metadata?: Prisma.InputJsonValue | null;
  }
) => {
  const points = Math.trunc(Number(input.points || 0));
  if (points <= 0) return 0;

  try {
    await tx.learningPointLedger.create({
      data: {
        profileId: input.profileId,
        points,
        eventType: input.eventType,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        awardedByProfileId: input.awardedByProfileId ?? null,
        metadata: input.metadata ?? undefined,
      },
    });
    return points;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return 0;
    }
    throw error;
  }
};

const evaluateQuestion = (
  question: {
    id: number;
    questionType: LearningQuizQuestionType;
    options: Array<{ id: number; isCorrect: boolean }>;
  },
  answer: SubmittedQuizAnswer | undefined
) => {
  const selectedOptionIds = Array.from(
    new Set((answer?.optionIds || []).map((value) => Number(value)).filter((value) => value > 0))
  );
  const freeTextAnswer = typeof answer?.freeTextAnswer === "string" ? answer.freeTextAnswer.trim() : "";
  const correctOptionIds = question.options.filter((option) => option.isCorrect).map((option) => option.id);

  let isCorrect = false;
  switch (question.questionType) {
    case LearningQuizQuestionType.single_choice:
    case LearningQuizQuestionType.true_false:
      isCorrect =
        correctOptionIds.length === 1 &&
        selectedOptionIds.length === 1 &&
        selectedOptionIds[0] === correctOptionIds[0];
      break;
    case LearningQuizQuestionType.multiple_choice: {
      const selectedSet = new Set(selectedOptionIds);
      const correctSet = new Set(correctOptionIds);
      isCorrect =
        selectedSet.size === correctSet.size &&
        correctOptionIds.every((optionId) => selectedSet.has(optionId));
      break;
    }
    case LearningQuizQuestionType.short_text:
      isCorrect = freeTextAnswer.length > 0;
      break;
    default:
      isCorrect = false;
  }

  return {
    isCorrect,
    freeTextAnswer: freeTextAnswer || null,
    selectedOptionIds,
  };
};

const createPdfBuffer = async (
  draw: (doc: PDFKit.PDFDocument) => void
): Promise<Buffer> =>
  new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    draw(doc as unknown as PDFKit.PDFDocument);
    doc.end();
  });

const writeDocumentFile = async (fileName: string, buffer: Buffer) => {
  const directory = getUploadDirectory("documents");
  const resolvedName = `${Date.now()}-${sanitizeFileName(fileName)}`;
  const absolutePath = path.join(directory, resolvedName);
  await fs.promises.writeFile(absolutePath, buffer);
  return {
    absolutePath,
    publicPath: buildPublicUploadPath("documents", resolvedName),
    storedName: resolvedName,
  };
};

const resolveCertificateImagePath = (document?: {
  fileName?: string | null;
  mimeType?: string | null;
} | null) => {
  if (!document?.fileName) return null;

  const mimeType = String(document.mimeType || "").toLowerCase();
  if (!mimeType.startsWith("image/")) return null;

  const localPath = resolveLocalUploadPath("documents", document.fileName);
  return fs.existsSync(localPath) ? localPath : null;
};

const buildDefaultCertificateTemplate = (_trainingName: string) => ({
  name: "Standard Completion Certificate",
  templateDefinition: {
    title: "Certificate of Completion",
    body: 'has successfully completed the training "{{trainingName}}".',
    titleColor: "#0f172a",
    textColor: "#334155",
    accentColor: "#0f766e",
  },
  issuedByLabel: null as string | null,
  backgroundDocument: null as { fileName?: string | null; mimeType?: string | null } | null,
  signatureDocument: null as { fileName?: string | null; mimeType?: string | null } | null,
});

type CertificateTemplateRenderSource = {
  name: string;
  templateDefinition: Prisma.JsonValue | Record<string, unknown> | null;
  issuedByLabel?: string | null;
  backgroundDocument?: { fileName?: string | null; mimeType?: string | null } | null;
  signatureDocument?: { fileName?: string | null; mimeType?: string | null } | null;
};

const getTemplateConfigValue = (
  template: CertificateTemplateRenderSource,
  key: string
) => {
  if (
    template.templateDefinition &&
    typeof template.templateDefinition === "object" &&
    !Array.isArray(template.templateDefinition)
  ) {
    return (template.templateDefinition as Record<string, unknown>)[key];
  }
  return undefined;
};

const getTemplateIssuedByLabel = (
  template: CertificateTemplateRenderSource,
  fallbackLabel: string
) => {
  const configured = String(getTemplateConfigValue(template, "issuedByLabel") || "").trim();
  return configured || template.issuedByLabel || fallbackLabel;
};

const interpolateCertificateText = (
  value: unknown,
  variables: Record<string, string>
) =>
  Object.entries(variables).reduce(
    (output, [key, replacement]) =>
      output.replace(new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, "gi"), replacement),
    String(value || "")
  );

const mapAssignmentStatusToTrainingStatus = (status: LearningAssignmentStatus): TrainingRecordStatus => {
  switch (status) {
    case LearningAssignmentStatus.completed:
      return TrainingRecordStatus.completed;
    case LearningAssignmentStatus.cancelled:
      return TrainingRecordStatus.cancelled;
    case LearningAssignmentStatus.in_progress:
    case LearningAssignmentStatus.overdue:
      return TrainingRecordStatus.in_progress;
    case LearningAssignmentStatus.assigned:
    default:
      return TrainingRecordStatus.planned;
  }
};

const buildTrainerLabel = (assignment: {
  programVersion: {
    provider: string | null;
    externalTrainerName: string | null;
    trainer: { firstName: string; lastName: string } | null;
  };
}) => {
  if (assignment.programVersion.provider) return assignment.programVersion.provider;
  if (assignment.programVersion.externalTrainerName) {
    return assignment.programVersion.externalTrainerName;
  }
  if (assignment.programVersion.trainer) {
    return `${assignment.programVersion.trainer.firstName} ${assignment.programVersion.trainer.lastName}`.trim();
  }
  return "Internal";
};

export const updateKnowledgeHubProgress = async (input: {
  resourceId: number;
  profileId: number;
  actorProfileId?: number | null;
  progress: KnowledgeHubProgressInput;
}) =>
  prisma.$transaction(async (tx) => {
    const resource = await tx.knowledgeHubResource.findUnique({
      where: { id: input.resourceId },
      select: {
        id: true,
        completionMode: true,
        completionThresholdPercent: true,
        minReadSeconds: true,
        pointsOnCompletion: true,
      },
    });

    if (!resource) {
      throw withStatusCode("Knowledge resource not found", 404);
    }

    const existing = await tx.knowledgeHubResourceProgress.findUnique({
      where: {
        resourceId_profileId: {
          resourceId: input.resourceId,
          profileId: input.profileId,
        },
      },
    });

    const now = new Date();
    const timeSpentSeconds = Math.max(
      existing?.timeSpentSeconds ?? 0,
      Math.max(0, Math.trunc(Number(input.progress.timeSpentSeconds ?? existing?.timeSpentSeconds ?? 0)))
    );
    const scrollPercent = Math.max(
      toNumber(existing?.scrollPercent),
      clampPercentage(input.progress.scrollPercent ?? existing?.scrollPercent ?? 0)
    );
    const watchSeconds = Math.max(
      existing?.watchSeconds ?? 0,
      Math.max(0, Math.trunc(Number(input.progress.watchSeconds ?? existing?.watchSeconds ?? 0)))
    );
    const watchPercent = Math.max(
      toNumber(existing?.watchPercent),
      clampPercentage(input.progress.watchPercent ?? existing?.watchPercent ?? 0)
    );

    const completionThreshold = clampPercentage(resource.completionThresholdPercent ?? 95);
    const minReadSeconds = Math.max(0, Number(resource.minReadSeconds ?? 0));

    const completionTriggered =
      Boolean(input.progress.completed) ||
      (resource.completionMode === "video_end" && watchPercent >= 95) ||
      (resource.completionMode === "watch_percent" && watchPercent >= completionThreshold) ||
      (resource.completionMode === "document_scroll" &&
        scrollPercent >= 100 &&
        timeSpentSeconds >= minReadSeconds);

    const completedAt = existing?.completedAt ?? (completionTriggered ? now : null);
    const status =
      completedAt !== null
        ? LearningProgressStatus.completed
        : timeSpentSeconds > 0 || scrollPercent > 0 || watchSeconds > 0 || watchPercent > 0
          ? LearningProgressStatus.in_progress
          : LearningProgressStatus.not_started;

    const progress = await tx.knowledgeHubResourceProgress.upsert({
      where: {
        resourceId_profileId: {
          resourceId: input.resourceId,
          profileId: input.profileId,
        },
      },
      create: {
        resourceId: input.resourceId,
        profileId: input.profileId,
        status,
        startedAt: now,
        lastInteractedAt: now,
        timeSpentSeconds,
        scrollPercent,
        watchSeconds,
        watchPercent,
        completedAt,
      },
      update: {
        status,
        startedAt: existing?.startedAt ?? now,
        lastInteractedAt: now,
        timeSpentSeconds,
        scrollPercent,
        watchSeconds,
        watchPercent,
        completedAt,
      },
    });

    const pointsAwarded =
      completedAt && !existing?.completedAt
        ? await awardPoints(tx, {
            profileId: input.profileId,
            points: resource.pointsOnCompletion,
            eventType: LearningPointEventType.knowledge_resource_completed,
            sourceType: LearningPointSourceType.knowledge_resource,
            sourceId: resource.id,
            awardedByProfileId: input.actorProfileId ?? null,
            metadata: {
              resourceId: resource.id,
            },
          })
        : 0;

    return {
      progress,
      pointsAwarded,
      completedNow: Boolean(completedAt && !existing?.completedAt),
    };
  });

export const submitKnowledgeHubQuizAttempt = async (input: {
  resourceId: number;
  profileId: number;
  actorProfileId?: number | null;
  answers: SubmittedQuizAnswer[];
}) =>
  prisma.$transaction(async (tx) => {
    const quiz = await tx.knowledgeHubQuiz.findFirst({
      where: {
        resourceId: input.resourceId,
        isActive: true,
      },
      include: {
        questions: {
          orderBy: { displayOrder: "asc" },
          include: {
            options: {
              orderBy: { displayOrder: "asc" },
            },
          },
        },
      },
    });

    if (!quiz) {
      throw withStatusCode("Knowledge quiz not found", 404);
    }

    const existingAttempts = await tx.knowledgeHubQuizAttempt.count({
      where: {
        quizId: quiz.id,
        profileId: input.profileId,
      },
    });

    if (quiz.attemptLimit && existingAttempts >= quiz.attemptLimit) {
      throw withStatusCode("Knowledge quiz attempt limit reached", 400);
    }

    const answersByQuestionId = new Map(input.answers.map((answer) => [Number(answer.questionId), answer]));
    const evaluatedAnswers = quiz.questions.map((question) => {
      const evaluation = evaluateQuestion(question, answersByQuestionId.get(question.id));
      return {
        questionId: question.id,
        ...evaluation,
      };
    });

    const correctAnswers = evaluatedAnswers.filter((answer) => answer.isCorrect).length;
    const questionCount = quiz.questions.length || 1;
    const score = roundPercentage((correctAnswers / questionCount) * 100);
    const passed = score >= toNumber(quiz.passMark);
    const now = new Date();

    const attempt = await tx.knowledgeHubQuizAttempt.create({
      data: {
        quizId: quiz.id,
        profileId: input.profileId,
        attemptNo: existingAttempts + 1,
        score,
        status: passed ? LearningQuizAttemptStatus.passed : LearningQuizAttemptStatus.failed,
        submittedAt: now,
        passedAt: passed ? now : null,
        answers: {
          create: evaluatedAnswers.map((answer) => ({
            questionId: answer.questionId,
            freeTextAnswer: answer.freeTextAnswer,
            isCorrect: answer.isCorrect,
            selectedOptions: answer.selectedOptionIds.length
              ? {
                  create: answer.selectedOptionIds.map((optionId) => ({
                    optionId,
                  })),
                }
              : undefined,
          })),
        },
      },
      include: {
        answers: {
          include: {
            selectedOptions: true,
          },
        },
      },
    });

    const pointsAwarded = passed
      ? await awardPoints(tx, {
          profileId: input.profileId,
          points: quiz.pointsOnPass,
          eventType: LearningPointEventType.knowledge_quiz_passed,
          sourceType: LearningPointSourceType.knowledge_quiz,
          sourceId: quiz.id,
          awardedByProfileId: input.actorProfileId ?? null,
          metadata: {
            resourceId: input.resourceId,
            quizId: quiz.id,
            score,
          },
        })
      : 0;

    return {
      attempt,
      passed,
      score,
      pointsAwarded,
    };
  });

const syncTrainingRecordForAssignment = async (tx: PrismaLike, assignmentId: number) => {
  const assignment = await tx.learningAssignment.findUnique({
    where: { id: assignmentId },
    include: {
      employee: {
        select: {
          id: true,
          departmentId: true,
        },
      },
      programVersion: {
        include: {
          program: {
            select: {
              departmentId: true,
            },
          },
          trainer: {
            select: {
              firstName: true,
              lastName: true,
            },
          },
        },
      },
      certificate: {
        include: {
          document: {
            select: {
              filePath: true,
            },
          },
        },
      },
    },
  });

  if (!assignment) {
    throw withStatusCode("Learning assignment not found", 404);
  }

  const trainingStatus = mapAssignmentStatusToTrainingStatus(assignment.status);
  const provider = buildTrainerLabel(assignment);

  await tx.trainingRecord.upsert({
    where: {
      learningAssignmentId: assignmentId,
    },
    create: {
      employeeProfileId: assignment.employeeProfileId,
      createdByProfileId: assignment.assignedByProfileId,
      departmentId:
        assignment.employee?.departmentId ??
        assignment.programVersion.program.departmentId ??
        null,
      courseName: assignment.programVersion.title,
      trainingType: assignment.programVersion.trainingType,
      status: trainingStatus,
      deliveryMode: assignment.programVersion.deliveryMode,
      startDate: assignment.startedAt ?? assignment.createdAt,
      endDate: assignment.completedAt,
      provider,
      cost: assignment.programVersion.cost,
      completionPercentage: assignment.progressPercent,
      certificateUrl: assignment.certificate?.document?.filePath ?? null,
      sourceType: TrainingRecordSourceType.learning_assignment,
      learningAssignmentId: assignmentId,
      notes: assignment.programVersion.description,
    },
    update: {
      employeeProfileId: assignment.employeeProfileId,
      createdByProfileId: assignment.assignedByProfileId,
      departmentId:
        assignment.employee?.departmentId ??
        assignment.programVersion.program.departmentId ??
        null,
      courseName: assignment.programVersion.title,
      trainingType: assignment.programVersion.trainingType,
      status: trainingStatus,
      deliveryMode: assignment.programVersion.deliveryMode,
      startDate: assignment.startedAt ?? assignment.createdAt,
      endDate: assignment.completedAt,
      provider,
      cost: assignment.programVersion.cost,
      completionPercentage: assignment.progressPercent,
      certificateUrl: assignment.certificate?.document?.filePath ?? null,
      sourceType: TrainingRecordSourceType.learning_assignment,
      notes: assignment.programVersion.description,
    },
  });
};

export const recalculateLearningAssignment = async (tx: PrismaLike, assignmentId: number) => {
  const assignment = await tx.learningAssignment.findUnique({
    where: { id: assignmentId },
    include: {
      programVersion: {
        include: {
          modules: {
            orderBy: { sequenceNo: "asc" },
          },
          sessions: {
            orderBy: { startsAt: "asc" },
          },
          quizzes: {
            where: { isActive: true },
            select: {
              id: true,
              isMandatory: true,
            },
          },
        },
      },
      moduleProgressEntries: true,
      attendanceRecords: true,
      quizAttempts: {
        where: {
          status: LearningQuizAttemptStatus.passed,
        },
        select: {
          quizId: true,
        },
      },
      impactAssessmentTask: true,
    },
  });

  if (!assignment) {
    throw withStatusCode("Learning assignment not found", 404);
  }

  const requiredModules = assignment.programVersion.modules.filter((module) => module.required);
  const requiredSessions = assignment.programVersion.sessions.filter((session) => session.attendanceRequired);
  const mandatoryQuizzes = assignment.programVersion.quizzes.filter((quiz) => quiz.isMandatory);

  const completedModuleIds = new Set(
    assignment.moduleProgressEntries
      .filter((progress) => progress.status === LearningProgressStatus.completed || progress.completedAt)
      .map((progress) => progress.moduleId)
  );
  const attendedSessionIds = new Set(
    assignment.attendanceRecords
      .filter((record) => record.attendanceStatus === LearningAttendanceStatus.attended)
      .map((record) => record.sessionId)
  );
  const passedQuizIds = new Set(assignment.quizAttempts.map((attempt) => attempt.quizId));

  const totalCheckpoints =
    requiredModules.length + requiredSessions.length + mandatoryQuizzes.length;
  const completedCheckpoints =
    requiredModules.filter((module) => completedModuleIds.has(module.id)).length +
    requiredSessions.filter((session) => attendedSessionIds.has(session.id)).length +
    mandatoryQuizzes.filter((quiz) => passedQuizIds.has(quiz.id)).length;

  const progressPercent =
    totalCheckpoints > 0 ? roundPercentage((completedCheckpoints / totalCheckpoints) * 100) : 100;

  const anyStarted =
    Boolean(assignment.startedAt) ||
    assignment.moduleProgressEntries.some(
      (progress) =>
        progress.startedAt ||
        progress.lastInteractedAt ||
        toNumber(progress.completionPercent) > 0 ||
        toNumber(progress.watchPercent) > 0 ||
        toNumber(progress.scrollPercent) > 0
    ) ||
    assignment.attendanceRecords.some((record) => record.attendanceStatus !== LearningAttendanceStatus.invited) ||
    assignment.quizAttempts.length > 0;

  const readyToComplete = totalCheckpoints === 0 || completedCheckpoints >= totalCheckpoints;
  const previousStatus = assignment.status;
  const previousCompletedAt = assignment.completedAt;
  const now = new Date();

  let status = assignment.status;
  if (readyToComplete) {
    status = LearningAssignmentStatus.completed;
  } else if (assignment.dueAt && assignment.dueAt.getTime() < now.getTime()) {
    status = LearningAssignmentStatus.overdue;
  } else if (anyStarted) {
    status = LearningAssignmentStatus.in_progress;
  } else {
    status = LearningAssignmentStatus.assigned;
  }

  const updated = await tx.learningAssignment.update({
    where: { id: assignmentId },
    data: {
      progressPercent,
      status,
      startedAt: assignment.startedAt ?? (anyStarted ? now : null),
      completedAt: readyToComplete ? assignment.completedAt ?? now : null,
    },
  });

  if (readyToComplete && !assignment.impactAssessmentTask && assignment.managerProfileId) {
    const delayDays = Math.max(0, assignment.programVersion.impactAssessmentDelayDays ?? 0);
    await tx.impactAssessmentTask.create({
      data: {
        assignmentId,
        managerProfileId: assignment.managerProfileId,
        dueAt: new Date(now.getTime() + delayDays * 24 * 60 * 60 * 1000),
      },
    });
  }

  await syncTrainingRecordForAssignment(tx, assignmentId);

  return {
    assignment: updated,
    completedNow: Boolean(updated.completedAt && !previousCompletedAt),
    statusChanged: updated.status !== previousStatus,
  };
};

export const submitLearningQuizAttempt = async (input: {
  quizId: number;
  assignmentId: number;
  actorProfileId?: number | null;
  answers: SubmittedQuizAnswer[];
}) =>
  prisma.$transaction(async (tx) => {
    const assignment = await tx.learningAssignment.findUnique({
      where: { id: input.assignmentId },
      select: {
        id: true,
        employeeProfileId: true,
        programVersionId: true,
      },
    });

    if (!assignment) {
      throw withStatusCode("Learning assignment not found", 404);
    }

    const quiz = await tx.learningQuiz.findFirst({
      where: {
        id: input.quizId,
        isActive: true,
        programVersionId: assignment.programVersionId,
      },
      include: {
        questions: {
          orderBy: { displayOrder: "asc" },
          include: {
            options: {
              orderBy: { displayOrder: "asc" },
            },
          },
        },
      },
    });

    if (!quiz) {
      throw withStatusCode("Learning quiz not found", 404);
    }

    const existingAttempts = await tx.learningQuizAttempt.count({
      where: {
        quizId: quiz.id,
        assignmentId: assignment.id,
      },
    });

    if (quiz.attemptLimit && existingAttempts >= quiz.attemptLimit) {
      throw withStatusCode("Learning quiz attempt limit reached", 400);
    }

    const answersByQuestionId = new Map(input.answers.map((answer) => [Number(answer.questionId), answer]));
    const evaluatedAnswers = quiz.questions.map((question) => {
      const evaluation = evaluateQuestion(question, answersByQuestionId.get(question.id));
      return {
        questionId: question.id,
        ...evaluation,
      };
    });

    const correctAnswers = evaluatedAnswers.filter((answer) => answer.isCorrect).length;
    const questionCount = quiz.questions.length || 1;
    const score = roundPercentage((correctAnswers / questionCount) * 100);
    const passed = score >= toNumber(quiz.passMark);
    const now = new Date();

    const attempt = await tx.learningQuizAttempt.create({
      data: {
        quizId: quiz.id,
        assignmentId: assignment.id,
        attemptNo: existingAttempts + 1,
        score,
        status: passed ? LearningQuizAttemptStatus.passed : LearningQuizAttemptStatus.failed,
        submittedAt: now,
        passedAt: passed ? now : null,
        answers: {
          create: evaluatedAnswers.map((answer) => ({
            questionId: answer.questionId,
            freeTextAnswer: answer.freeTextAnswer,
            isCorrect: answer.isCorrect,
            selectedOptions: answer.selectedOptionIds.length
              ? {
                  create: answer.selectedOptionIds.map((optionId) => ({
                    optionId,
                  })),
                }
              : undefined,
          })),
        },
      },
    });

    const pointsAwarded = passed
      ? await awardPoints(tx, {
          profileId: assignment.employeeProfileId,
          points: quiz.pointsOnPass,
          eventType: LearningPointEventType.training_quiz_passed,
          sourceType: LearningPointSourceType.learning_quiz,
          sourceId: quiz.id,
          awardedByProfileId: input.actorProfileId ?? null,
          metadata: {
            assignmentId: assignment.id,
            quizId: quiz.id,
            score,
          },
        })
      : 0;

    const assignmentState = await recalculateLearningAssignment(tx, assignment.id);

    return {
      attempt,
      score,
      passed,
      pointsAwarded,
      assignment: assignmentState.assignment,
      completedNow: assignmentState.completedNow,
    };
  });

export const submitTrainingFeedbackEntry = async (input: {
  assignmentId: number;
  actorProfileId: number;
  overallRating: number;
  contentRating: number;
  deliveryRating: number;
  relevanceRating: number;
  comment?: string | null;
}) =>
  prisma.$transaction(async (tx) => {
    const assignment = await tx.learningAssignment.findUnique({
      where: { id: input.assignmentId },
      include: {
        programVersion: {
          select: {
            feedbackPoints: true,
            trainerProfileId: true,
          },
        },
      },
    });

    if (!assignment) {
      throw withStatusCode("Learning assignment not found", 404);
    }

    const feedback = await tx.trainingFeedback.create({
      data: {
        assignmentId: assignment.id,
        trainerProfileId: assignment.programVersion.trainerProfileId,
        overallRating: input.overallRating,
        contentRating: input.contentRating,
        deliveryRating: input.deliveryRating,
        relevanceRating: input.relevanceRating,
        comment: input.comment?.trim() || null,
        pointsAwarded: 0,
      },
    });

    const eligiblePoints =
      feedback.comment && assignment.programVersion.feedbackPoints > 0
        ? assignment.programVersion.feedbackPoints
        : 0;
    const pointsAwarded = await awardPoints(tx, {
      profileId: assignment.employeeProfileId,
      points: eligiblePoints,
      eventType: LearningPointEventType.training_feedback_submitted,
      sourceType: LearningPointSourceType.training_feedback,
      sourceId: feedback.id,
      awardedByProfileId: input.actorProfileId,
      metadata: {
        assignmentId: assignment.id,
        feedbackId: feedback.id,
      },
    });

    const updatedFeedback =
      pointsAwarded > 0
        ? await tx.trainingFeedback.update({
            where: { id: feedback.id },
            data: {
              pointsAwarded,
            },
          })
        : feedback;

    return {
      feedback: updatedFeedback,
      pointsAwarded,
    };
  });

export const awardAttendancePoints = async (input: {
  assignmentId: number;
  sessionId: number;
  employeeProfileId: number;
  points: number;
  actorProfileId?: number | null;
}) =>
  prisma.$transaction(async (tx) =>
    awardPoints(tx, {
      profileId: input.employeeProfileId,
      points: input.points,
      eventType: LearningPointEventType.training_attendance_confirmed,
      sourceType: LearningPointSourceType.learning_session,
      sourceId: input.sessionId,
      awardedByProfileId: input.actorProfileId ?? null,
      metadata: {
        assignmentId: input.assignmentId,
        sessionId: input.sessionId,
      },
    })
  );

export const issueCertificateIfEligible = async (input: {
  assignmentId: number;
  actorProfileId?: number | null;
}) => {
  const assignment = await prisma.learningAssignment.findUnique({
    where: { id: input.assignmentId },
    include: {
      employee: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          employeeId: true,
        },
      },
      programVersion: {
        include: {
          program: {
            select: {
              title: true,
            },
          },
          trainer: {
            select: {
              firstName: true,
              lastName: true,
            },
          },
          certificateTemplates: {
            orderBy: [{ isDefault: "desc" }, { id: "asc" }],
            include: {
              backgroundDocument: true,
              signatureDocument: true,
            },
          },
        },
      },
      certificate: true,
      trainingFeedback: {
        select: {
          id: true,
        },
      },
    },
  });

  if (!assignment) {
    throw withStatusCode("Learning assignment not found", 404);
  }

  if (assignment.certificate) {
    return assignment.certificate;
  }
  if (assignment.status !== LearningAssignmentStatus.completed || !assignment.trainingFeedback) {
    return null;
  }
  if (!assignment.employee) {
    return null;
  }

  const trainingName = assignment.programVersion.program.title || assignment.programVersion.title;
  const existingTemplate = assignment.programVersion.certificateTemplates[0] ?? null;
  const fallbackTemplate = buildDefaultCertificateTemplate(trainingName);
  const globalTemplate =
    existingTemplate === null
      ? await prisma.globalCertificateTemplate.findFirst({
          where: {
            key: "default",
            isActive: true,
          },
          orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
          include: {
            backgroundDocument: true,
            signatureDocument: true,
          },
        })
      : null;
  const template: CertificateTemplateRenderSource =
    existingTemplate ??
    globalTemplate ??
    fallbackTemplate;
  const certificateNumber = `CERT-${assignment.id}-${Date.now()}`;
  const verificationCode = crypto.randomBytes(8).toString("hex").toUpperCase();
  const learnerName = `${assignment.employee.firstName} ${assignment.employee.lastName}`.trim();
  const completionDate = (assignment.completedAt ?? new Date()).toLocaleDateString();
  const backgroundImagePath = resolveCertificateImagePath(template.backgroundDocument);
  const signatureImagePath = resolveCertificateImagePath(template.signatureDocument);
  const templateVariables = {
    trainingName,
    learnerName,
    completionDate,
    employeeId: assignment.employee.employeeId || "",
  };
  const titleText = interpolateCertificateText(
    getTemplateConfigValue(template, "title") || "Certificate of Completion",
    templateVariables
  );
  const bodyText = interpolateCertificateText(
    getTemplateConfigValue(template, "body") ||
      `has successfully completed the training "${trainingName}".`,
    templateVariables
  );
  const titleColor = String(getTemplateConfigValue(template, "titleColor") || "#0f172a");
  const textColor = String(getTemplateConfigValue(template, "textColor") || "#334155");
  const accentColor = String(getTemplateConfigValue(template, "accentColor") || "#0f766e");
  const issuedBy = getTemplateIssuedByLabel(template, buildTrainerLabel(assignment));

  const pdfBuffer = await createPdfBuffer((doc) => {
    doc.info.Title = `${trainingName} Certificate`;
    doc.info.Author = "BSC System";
    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;
    const contentWidth = pageWidth - 144;
    const contentLeft = 72;

    if (backgroundImagePath) {
      try {
        doc.image(backgroundImagePath, 0, 0, { width: pageWidth, height: pageHeight });
      } catch {
        doc
          .save()
          .rect(24, 24, pageWidth - 48, pageHeight - 48)
          .lineWidth(2)
          .strokeColor(accentColor)
          .stroke()
          .restore();
      }
    } else {
      doc
        .save()
        .rect(24, 24, pageWidth - 48, pageHeight - 48)
        .lineWidth(2)
        .strokeColor(accentColor)
        .stroke()
        .restore();
    }

    doc.fillColor(titleColor).font("Helvetica-Bold").fontSize(28).text(titleText, contentLeft, 96, {
      align: "center",
      width: contentWidth,
    });

    doc.fillColor(textColor).font("Helvetica").fontSize(13).text("This certifies that", contentLeft, 170, {
      align: "center",
      width: contentWidth,
    });

    doc.fillColor(titleColor).font("Helvetica-Bold").fontSize(24).text(learnerName, contentLeft, 214, {
      align: "center",
      width: contentWidth,
    });

    doc.fillColor(textColor).font("Helvetica").fontSize(13).text(bodyText, contentLeft, 276, {
      align: "center",
      width: contentWidth,
    });

    doc.font("Helvetica").fontSize(12).text(
      `Training: ${trainingName}\nCompletion Date: ${completionDate}${
        assignment.employee.employeeId ? `\nEmployee ID: ${assignment.employee.employeeId}` : ""
      }`,
      contentLeft,
      368,
      {
        align: "center",
        width: contentWidth,
      }
    );

    if (signatureImagePath) {
      try {
        doc.image(signatureImagePath, pageWidth / 2 - 70, pageHeight - 210, {
          fit: [140, 60],
          align: "center",
        });
      } catch {
        // Ignore invalid image assets and fall back to text-only signature section.
      }
    }

    doc
      .save()
      .moveTo(pageWidth / 2 - 120, pageHeight - 120)
      .lineTo(pageWidth / 2 + 120, pageHeight - 120)
      .lineWidth(1)
      .strokeColor(accentColor)
      .stroke()
      .restore();

    doc.fillColor(textColor).font("Helvetica").fontSize(11).text(issuedBy, contentLeft, pageHeight - 112, {
      align: "center",
      width: contentWidth,
    });
    doc.text(`Certificate No: ${certificateNumber}`, contentLeft, pageHeight - 78, {
      align: "center",
      width: contentWidth,
    });
    doc.text(`Verification Code: ${verificationCode}`, contentLeft, pageHeight - 60, {
      align: "center",
      width: contentWidth,
    });
  });

  const storedFile = await writeDocumentFile(
    `${trainingName}-certificate-${learnerName}.pdf`,
    pdfBuffer
  );

  return prisma.$transaction(async (tx) => {
    const freshAssignment = await tx.learningAssignment.findUnique({
      where: { id: input.assignmentId },
      include: {
        certificate: true,
      },
    });

    if (!freshAssignment) {
      throw withStatusCode("Learning assignment not found", 404);
    }

    if (freshAssignment.certificate || freshAssignment.status !== LearningAssignmentStatus.completed) {
      return freshAssignment.certificate;
    }
    if (!assignment.trainingFeedback) {
      return null;
    }

    let certificateTemplateId = existingTemplate?.id ?? null;
    let globalCertificateTemplateId = globalTemplate?.id ?? null;

    if (!certificateTemplateId && !globalCertificateTemplateId) {
      const storedGlobalTemplate = await tx.globalCertificateTemplate.findFirst({
        where: {
          key: "default",
          isActive: true,
        },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      });

      if (storedGlobalTemplate) {
        globalCertificateTemplateId = storedGlobalTemplate.id;
      } else {
        const createdGlobalTemplate = await tx.globalCertificateTemplate.create({
          data: {
            key: "default",
            name: fallbackTemplate.name,
            templateDefinition: fallbackTemplate.templateDefinition as Prisma.InputJsonValue,
            issuedByLabel: fallbackTemplate.issuedByLabel,
            isActive: true,
            createdByProfileId: input.actorProfileId ?? null,
            updatedByProfileId: input.actorProfileId ?? null,
          },
        });
        globalCertificateTemplateId = createdGlobalTemplate.id;
      }
    }

    const document = await tx.document.create({
      data: {
        fileName: path.basename(storedFile.storedName),
        filePath: storedFile.publicPath,
        fileSize: pdfBuffer.length,
        mimeType: "application/pdf",
        documentType: "training_certificate",
        entityType: "LearningAssignment",
        entityId: input.assignmentId,
        accessLevel: DocumentAccessLevel.employee,
        description: `${trainingName} certificate for ${learnerName}`,
        uploadedBy: input.actorProfileId ?? null,
      },
    });

    const certificate = await tx.issuedCertificate.create({
      data: {
        assignmentId: input.assignmentId,
        certificateTemplateId,
        globalCertificateTemplateId,
        documentId: document.id,
        certificateNumber,
        verificationCode,
        status: CertificateStatus.issued,
      },
    });

    await syncTrainingRecordForAssignment(tx, input.assignmentId);
    return certificate;
  });
};
