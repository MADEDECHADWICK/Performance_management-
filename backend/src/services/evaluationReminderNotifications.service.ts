import { EvaluationAssignmentStatus, EvaluationCycleStatus } from "@prisma/client";
import prisma from "../prisma";
import { logger, toLogContext } from "../lib/logger";
import { ObservabilityService } from "./observability.service";
import { NotificationService } from "./notifications.service";

const REMINDER_POLL_INTERVAL_MS = 60 * 60 * 1000;
const REMINDER_SWEEP_TX_TIMEOUT_MS = 10 * 60 * 1000;
const REMINDER_LOCK_CLASS_ID = 48194;
const REMINDER_LOCK_OBJECT_ID = 1;
const DUE_SOON_WINDOW_DAYS = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

type ReminderCadence = "daily" | "weekly" | "custom";

const asRecord = (value: unknown): Record<string, any> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};

const formatProfileName = (profile?: { firstName?: string | null; lastName?: string | null } | null) =>
  [profile?.firstName, profile?.lastName].filter(Boolean).join(" ").trim() || "employee";

const isoDate = (date: Date) => date.toISOString().slice(0, 10);

const startOfWeekStamp = (date: Date) => {
  const copy = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = copy.getUTCDay() || 7;
  copy.setUTCDate(copy.getUTCDate() - day + 1);
  return isoDate(copy);
};

const cadenceBucket = (cadence: ReminderCadence, now: Date) => {
  if (cadence === "daily") return isoDate(now);
  if (cadence === "custom") return `three-day-${Math.floor(now.getTime() / (MS_PER_DAY * 3))}`;
  return `week-${startOfWeekStamp(now)}`;
};

const readReminderConfig = (scoringConfig: unknown) => {
  const config = asRecord(scoringConfig);
  const workflow = asRecord(config.evaluationWorkflow || config.evaluation_workflow);
  const cadence = String(workflow.reminderCadence || workflow.reminder_cadence || "weekly");

  return {
    remindersEnabled:
      workflow.remindersEnabled === undefined && workflow.reminders_enabled === undefined
        ? true
        : Boolean(workflow.remindersEnabled ?? workflow.reminders_enabled),
    cadence:
      cadence === "daily" || cadence === "custom" ? (cadence as ReminderCadence) : "weekly",
  };
};

class EvaluationReminderNotificationServiceClass {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private pollIntervalMs = REMINDER_POLL_INTERVAL_MS;
  private readonly workerName = "evaluation_reminder_notifications";

  startWorker(options?: { pollIntervalMs?: number }) {
    if (this.timer) return;

    const requestedInterval = Number(options?.pollIntervalMs || 0);
    this.pollIntervalMs =
      Number.isFinite(requestedInterval) && requestedInterval > 0
        ? requestedInterval
        : REMINDER_POLL_INTERVAL_MS;

    ObservabilityService.registerWorker(this.workerName, {
      component: "evaluations",
      enabled: true,
      pollIntervalMs: this.pollIntervalMs,
      staleAfterMs: Math.max(this.pollIntervalMs * 2, 60_000),
    });
    ObservabilityService.markWorkerStarted(this.workerName, {
      component: "evaluations",
      enabled: true,
      pollIntervalMs: this.pollIntervalMs,
      staleAfterMs: Math.max(this.pollIntervalMs * 2, 60_000),
    });

    this.timer = setInterval(() => {
      void this.runSweep();
    }, this.pollIntervalMs);
    this.timer.unref();

    setTimeout(() => {
      void this.runSweep();
    }, 0).unref();
  }

  stopWorker() {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
    ObservabilityService.markWorkerStopped(this.workerName, {
      component: "evaluations",
      enabled: true,
    });
  }

  async runSweep(limit = 500) {
    if (this.running) return;
    this.running = true;
    const startedAt = Date.now();
    ObservabilityService.markWorkerHeartbeat(this.workerName, {
      component: "evaluations",
      metadata: { limit },
    });

    try {
      const scannedAssignments = await this.runSweepWithDistributedLock(limit);
      ObservabilityService.markWorkerSuccess(this.workerName, {
        component: "evaluations",
        durationMs: Date.now() - startedAt,
        metadata: {
          limit,
          scannedAssignments,
        },
      });
    } catch (error) {
      logger.error("evaluation_reminder_sweep_failed", toLogContext(error));
      ObservabilityService.markWorkerFailure(this.workerName, error, {
        component: "evaluations",
        durationMs: Date.now() - startedAt,
        metadata: { limit },
      });
    } finally {
      this.running = false;
    }
  }

  private async runSweepWithDistributedLock(limit: number) {
    return prisma.$transaction(
      async (tx) => {
        const lockRows = await tx.$queryRaw<Array<{ locked: boolean }>>`
          SELECT pg_try_advisory_xact_lock(
            CAST(${REMINDER_LOCK_CLASS_ID} AS integer),
            CAST(${REMINDER_LOCK_OBJECT_ID} AS integer)
          ) AS locked
        `;
        const isLeader = Boolean(lockRows?.[0]?.locked);
        if (!isLeader) return 0;

        return this.runSweepUnlocked(limit);
      },
      {
        maxWait: 2_000,
        timeout: REMINDER_SWEEP_TX_TIMEOUT_MS,
      }
    );
  }

  private async runSweepUnlocked(limit = 500) {
    const now = new Date();
    const assignments = await prisma.evaluationAssignment.findMany({
      where: {
        status: {
          in: [EvaluationAssignmentStatus.pending, EvaluationAssignmentStatus.in_progress],
        },
        cycle: {
          is: {
            status: EvaluationCycleStatus.active,
          },
        },
      },
      include: {
        evaluator: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        evaluatee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        definition: {
          select: {
            id: true,
            dueDate: true,
            scoringConfig: true,
          },
        },
        cycle: {
          select: {
            id: true,
            cycleName: true,
            endDate: true,
          },
        },
      },
      orderBy: [{ dueDate: "asc" }, { id: "asc" }],
      take: limit,
    });

    for (const assignment of assignments) {
      const dueDate = assignment.dueDate || assignment.definition.dueDate || assignment.cycle?.endDate;
      if (!dueDate) continue;

      const dueAt = new Date(dueDate);
      if (Number.isNaN(dueAt.getTime())) continue;

      const config = readReminderConfig(assignment.definition.scoringConfig);
      if (!config.remindersEnabled) continue;

      const msUntilDue = dueAt.getTime() - now.getTime();
      const daysUntilDue = Math.ceil(msUntilDue / MS_PER_DAY);
      const daysOverdue = Math.max(0, Math.floor((now.getTime() - dueAt.getTime()) / MS_PER_DAY));
      if (daysUntilDue > DUE_SOON_WINDOW_DAYS) continue;

      await this.dispatchAssignmentReminder(
        assignment,
        dueAt,
        daysUntilDue,
        daysOverdue,
        config.cadence,
        now
      );
    }

    return assignments.length;
  }

  private async dispatchAssignmentReminder(
    assignment: {
      id: number;
      evaluatorProfileId: number;
      relationship: string | null;
      evaluatorType: string;
      evaluator: { id: number; firstName: string | null; lastName: string | null };
      evaluatee: { id: number; firstName: string | null; lastName: string | null };
      definition: { id: number };
      cycle: { id: number; cycleName: string } | null;
    },
    dueAt: Date,
    daysUntilDue: number,
    daysOverdue: number,
    cadence: ReminderCadence,
    now: Date
  ) {
    const dueStamp = isoDate(dueAt);
    const bucket = cadenceBucket(cadence, now);
    const eventKey = `evaluation.assignment.reminder:${assignment.id}:${dueStamp}:${bucket}`;
    const evaluateeName = formatProfileName(assignment.evaluatee);
    const cycleName = assignment.cycle?.cycleName || "evaluation cycle";
    const isOverdue = daysOverdue > 0;
    const dueText = isOverdue
      ? `overdue by ${daysOverdue} day(s)`
      : daysUntilDue <= 0
        ? "due today"
        : `due in ${daysUntilDue} day(s)`;

    await NotificationService.dispatchEvent(
      {
        eventType: "evaluation.assignment.reminder",
        type: isOverdue ? "warning" : "action",
        priority: isOverdue ? "high" : "medium",
        title: isOverdue
          ? `Evaluation overdue: ${evaluateeName}`
          : `Evaluation reminder: ${evaluateeName}`,
        message: `Your ${assignment.relationship || assignment.evaluatorType} evaluation for ${evaluateeName} in ${cycleName} is ${dueText}.`,
        actionRequired: true,
        dueDate: dueAt,
        canonicalRoute: `/evaluations/assignments/${assignment.id}`,
        actions: [
          {
            id: "open_evaluation",
            label: "Open evaluation",
            endpoint: `/evaluations/assignments/${assignment.id}`,
            method: "GET",
          },
        ],
        requiredPermission: "module.evaluations.read",
        targetEntityType: "EvaluationAssignment",
        targetEntityId: assignment.id,
        evaluationDefinitionId: assignment.definition.id,
        ownerProfileIds: [assignment.evaluatorProfileId],
        eventId: eventKey,
        deduplicationKey: eventKey,
      },
      {
        userId: 0,
        profileId: 0,
        roleName: "system",
      }
    );
  }
}

export const EvaluationReminderNotificationService =
  new EvaluationReminderNotificationServiceClass();
