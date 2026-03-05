import prisma from "../prisma";
import websocketService from "./websocket.service";

interface OutboxState {
  notificationId: number;
  status: string;
  attempt: number;
  maxAttempts: number;
  nextAttemptAt: Date;
  lastError?: string;
}

interface ReplayAuthContext {
  userId: number;
  profileId: number;
  roleName?: string;
}

const OUTBOX_ENTITY = "NotificationOutbox";
const DISPATCH_ENTITY = "NotificationDispatch";
const OUTBOX_LEADER_LOCK_CLASS_ID = 48193;
const OUTBOX_LEADER_LOCK_OBJECT_ID = 1;
const OUTBOX_LEADER_LOCK_TIMEOUT_MS = 2 * 60 * 1000;

const toPositiveInt = (value: unknown): number | null => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.trunc(parsed);
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  Object.prototype.toString.call(value) === "[object Object]";

const parseOutboxState = (row: any): OutboxState | null => {
  if (!row) return null;
  const notificationId = toPositiveInt(row.entityId);
  if (!notificationId) return null;

  const metadata = isObject(row.metadata) ? row.metadata : {};
  const attempt = toPositiveInt(metadata.attempt) ?? 0;
  const maxAttempts = toPositiveInt(metadata.maxAttempts) ?? 5;
  const nextAttemptRaw = String(metadata.nextAttemptAt || row.createdAt?.toISOString() || "");
  const parsedNext = new Date(nextAttemptRaw);
  const nextAttemptAt = Number.isNaN(parsedNext.getTime()) ? row.createdAt : parsedNext;

  return {
    notificationId,
    status: String(row.toStatus || "queued"),
    attempt,
    maxAttempts,
    nextAttemptAt,
    lastError: metadata.lastError ? String(metadata.lastError) : undefined,
  };
};

const buildNextAttemptAt = (attempt: number) => {
  const delaySeconds = Math.min(15 * 60, Math.max(30, Math.pow(2, Math.max(0, attempt)) * 15));
  return new Date(Date.now() + delaySeconds * 1000);
};

const parseDispatchMetadata = (metadata: unknown) => {
  if (!isObject(metadata)) return {};
  return metadata;
};

class NotificationOutboxServiceClass {
  private workerTimer: NodeJS.Timeout | null = null;
  private processing = false;
  private pollIntervalMs = 5000;
  private batchSize = 50;

  private shouldRunBackgroundProcessing() {
    if (process.env.DISABLE_NOTIFICATION_OUTBOX_WORKER === "true") return false;
    if (process.env.NODE_ENV === "test") return false;
    return true;
  }

  startWorker(options?: { pollIntervalMs?: number; batchSize?: number }) {
    if (!this.shouldRunBackgroundProcessing()) return;
    if (this.workerTimer) return;
    this.pollIntervalMs = options?.pollIntervalMs ?? this.pollIntervalMs;
    this.batchSize = options?.batchSize ?? this.batchSize;

    this.workerTimer = setInterval(() => {
      void this.processDueJobs(this.batchSize);
    }, this.pollIntervalMs);
    this.workerTimer.unref();
  }

  stopWorker() {
    if (!this.workerTimer) return;
    clearInterval(this.workerTimer);
    this.workerTimer = null;
  }

  requestImmediateProcessing() {
    if (!this.shouldRunBackgroundProcessing()) return;
    setTimeout(() => {
      void this.processDueJobs(this.batchSize);
    }, 0).unref();
  }

  private async latestOutboxStates(limit = 2000) {
    const rows = await prisma.statusTransition.findMany({
      where: {
        entityType: OUTBOX_ENTITY,
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        entityId: true,
        toStatus: true,
        createdAt: true,
        metadata: true,
      },
    });

    const latestByNotificationId = new Map<number, any>();
    for (const row of rows) {
      const notificationId = toPositiveInt(row.entityId);
      if (!notificationId) continue;
      if (!latestByNotificationId.has(notificationId)) {
        latestByNotificationId.set(notificationId, row);
      }
    }

    return Array.from(latestByNotificationId.values())
      .map((row) => parseOutboxState(row))
      .filter((state): state is OutboxState => Boolean(state));
  }

  async processDueJobs(limit = 50) {
    if (this.processing) return;
    this.processing = true;

    try {
      await this.processDueJobsWithDistributedLock(limit);
    } finally {
      this.processing = false;
    }
  }

  private async processDueJobsWithDistributedLock(limit: number) {
    await prisma.$transaction(
      async (tx) => {
        const lockRows = await tx.$queryRaw<Array<{ locked: boolean }>>`
          SELECT pg_try_advisory_xact_lock(
            CAST(${OUTBOX_LEADER_LOCK_CLASS_ID} AS integer),
            CAST(${OUTBOX_LEADER_LOCK_OBJECT_ID} AS integer)
          ) AS locked
        `;
        const isLeader = Boolean(lockRows?.[0]?.locked);
        if (!isLeader) return;

        // Keep this transaction open while processing, so only one app instance
        // owns the outbox worker lease during this polling cycle.
        await this.processDueJobsUnlocked(limit);
      },
      {
        maxWait: 2_000,
        timeout: OUTBOX_LEADER_LOCK_TIMEOUT_MS,
      }
    );
  }

  private async processDueJobsUnlocked(limit = 50) {
    const now = new Date();
    const eligibleStatuses = new Set(["queued", "retry_scheduled", "replayed"]);
    const latestStates = await this.latestOutboxStates();
    const due = latestStates
      .filter((state) => eligibleStatuses.has(state.status))
      .filter((state) => state.nextAttemptAt.getTime() <= now.getTime())
      .slice(0, limit);

    for (const state of due) {
      await this.processOne(state);
    }
  }

  private async processOne(state: OutboxState) {
    const notification = await prisma.notification.findUnique({
      where: { id: state.notificationId },
      select: {
        id: true,
        profileId: true,
        type: true,
        title: true,
        message: true,
        actionRequired: true,
        link: true,
        isRead: true,
        jobId: true,
        clientId: true,
        evaluationDefinitionId: true,
        timeEntryId: true,
        workflowAssignmentId: true,
      },
    });

    if (!notification) {
      await this.recordOutboxState(state.notificationId, state.status, "dead_letter", {
        attempt: state.attempt + 1,
        maxAttempts: state.maxAttempts,
        nextAttemptAt: new Date().toISOString(),
        lastError: "notification_missing",
      });
      return;
    }

    const dispatchLog = await prisma.statusTransition.findFirst({
      where: {
        entityType: DISPATCH_ENTITY,
        entityId: state.notificationId,
      },
      orderBy: { createdAt: "desc" },
      select: { metadata: true },
    });
    const contract = parseDispatchMetadata(dispatchLog?.metadata);

    await this.recordOutboxState(state.notificationId, state.status, "processing", {
      attempt: state.attempt,
      maxAttempts: state.maxAttempts,
      nextAttemptAt: state.nextAttemptAt.toISOString(),
      lastError: null,
    });

    try {
      const sequenceId = websocketService.notifyUser(String(notification.profileId), {
        id: notification.id,
        type: notification.type,
        title: notification.title,
        message: notification.message,
        actionRequired: notification.actionRequired,
        link: notification.link,
        isRead: notification.isRead,
        eventType: contract.eventType,
        priority: contract.priority,
        targetEntityType: contract.targetEntityType,
        targetEntityId: contract.targetEntityId,
        canonicalRoute: contract.canonicalRoute,
        actions: contract.actions,
        requiredPermission: contract.requiredPermission,
      });

      await this.recordOutboxState(state.notificationId, "processing", "delivered", {
        attempt: state.attempt + 1,
        maxAttempts: state.maxAttempts,
        nextAttemptAt: new Date().toISOString(),
        sequenceId,
        channel: "websocket",
      });
    } catch (error: any) {
      const nextAttempt = state.attempt + 1;
      const lastError = String(error?.message || "delivery_failed");

      if (nextAttempt >= state.maxAttempts) {
        await this.recordOutboxState(state.notificationId, "processing", "dead_letter", {
          attempt: nextAttempt,
          maxAttempts: state.maxAttempts,
          nextAttemptAt: new Date().toISOString(),
          lastError,
        });
        await prisma.statusTransition.create({
          data: {
            entityType: DISPATCH_ENTITY,
            entityId: state.notificationId,
            fromStatus: "processing",
            toStatus: "dead_letter",
            changedByProfileId: null,
            reason: "delivery_failed_max_retries",
            metadata: {
              attempt: nextAttempt,
              maxAttempts: state.maxAttempts,
              lastError,
              channel: "websocket",
            } as any,
          },
        });
      } else {
        const nextAttemptAt = buildNextAttemptAt(nextAttempt);
        await this.recordOutboxState(state.notificationId, "processing", "retry_scheduled", {
          attempt: nextAttempt,
          maxAttempts: state.maxAttempts,
          nextAttemptAt: nextAttemptAt.toISOString(),
          lastError,
        });
        await prisma.statusTransition.create({
          data: {
            entityType: DISPATCH_ENTITY,
            entityId: state.notificationId,
            fromStatus: "processing",
            toStatus: "failed",
            changedByProfileId: null,
            reason: "delivery_failed_retry_scheduled",
            metadata: {
              attempt: nextAttempt,
              maxAttempts: state.maxAttempts,
              nextAttemptAt: nextAttemptAt.toISOString(),
              lastError,
              channel: "websocket",
            } as any,
          },
        });
      }
    }
  }

  private async recordOutboxState(
    notificationId: number,
    fromStatus: string,
    toStatus: string,
    metadata: Record<string, unknown>
  ) {
    await prisma.statusTransition.create({
      data: {
        entityType: OUTBOX_ENTITY,
        entityId: notificationId,
        fromStatus,
        toStatus,
        changedByProfileId: null,
        reason: "notification_outbox",
        metadata: metadata as any,
      },
    });
  }

  async replayDeadLetter(notificationId: number, auth: ReplayAuthContext) {
    const latestStates = await this.latestOutboxStates();
    const state = latestStates.find((item) => item.notificationId === notificationId);
    if (!state) {
      throw { statusCode: 404, message: "Outbox record not found for notification" };
    }
    if (state.status !== "dead_letter") {
      throw { statusCode: 400, message: "Notification is not in dead-letter state" };
    }

    await prisma.statusTransition.create({
      data: {
        entityType: OUTBOX_ENTITY,
        entityId: notificationId,
        fromStatus: "dead_letter",
        toStatus: "replayed",
        changedByProfileId: auth.profileId || null,
        reason: "manual_replay",
        metadata: {
          attempt: state.attempt,
          maxAttempts: state.maxAttempts,
          nextAttemptAt: new Date().toISOString(),
          replayedByUserId: auth.userId,
          replayedByProfileId: auth.profileId,
        } as any,
      },
    });

    await prisma.statusTransition.create({
      data: {
        entityType: DISPATCH_ENTITY,
        entityId: notificationId,
        fromStatus: "dead_letter",
        toStatus: "replayed",
        changedByProfileId: auth.profileId || null,
        reason: "manual_replay",
        metadata: {
          replayedByUserId: auth.userId,
          replayedByProfileId: auth.profileId,
          roleName: auth.roleName,
        } as any,
      },
    });

    this.requestImmediateProcessing();
    return { notificationId, replayQueued: true };
  }

  async getOutboxSummary() {
    const states = await this.latestOutboxStates();
    const counts: Record<string, number> = {};
    states.forEach((state) => {
      counts[state.status] = (counts[state.status] || 0) + 1;
    });

    const deadLetters = states
      .filter((state) => state.status === "dead_letter")
      .slice(0, 100)
      .map((state) => ({
        notificationId: state.notificationId,
        attempt: state.attempt,
        maxAttempts: state.maxAttempts,
        lastError: state.lastError,
      }));

    return {
      totalTracked: states.length,
      counts,
      deadLetters,
    };
  }
}

export const NotificationOutboxService = new NotificationOutboxServiceClass();
