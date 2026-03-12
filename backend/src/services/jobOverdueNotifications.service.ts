import prisma from "../prisma";
import { NotificationService } from "./notifications.service";
import { logger, toLogContext } from "../lib/logger";
import { ObservabilityService } from "./observability.service";

type OverduePriority = "medium" | "high" | "critical";

type OverdueTier = {
  level: number;
  minDaysOverdue: number;
  priority: OverduePriority;
  includeAssignedStaff: boolean;
  includeFinance: boolean;
  includeHr: boolean;
  includeGmp: boolean;
};

const OVERDUE_TIERS: OverdueTier[] = [
  {
    level: 1,
    minDaysOverdue: 1,
    priority: "medium",
    includeAssignedStaff: true,
    includeFinance: false,
    includeHr: false,
    includeGmp: false,
  },
  {
    level: 2,
    minDaysOverdue: 3,
    priority: "high",
    includeAssignedStaff: false,
    includeFinance: true,
    includeHr: false,
    includeGmp: false,
  },
  {
    level: 3,
    minDaysOverdue: 7,
    priority: "high",
    includeAssignedStaff: false,
    includeFinance: true,
    includeHr: true,
    includeGmp: false,
  },
  {
    level: 4,
    minDaysOverdue: 14,
    priority: "critical",
    includeAssignedStaff: false,
    includeFinance: true,
    includeHr: true,
    includeGmp: true,
  },
];

const OVERDUE_POLL_INTERVAL_MS = 30 * 60 * 1000;
const OVERDUE_SWEEP_TX_TIMEOUT_MS = 10 * 60 * 1000;
const OVERDUE_LOCK_CLASS_ID = 48192;
const OVERDUE_LOCK_OBJECT_ID = 1;

const daysOverdue = (dueDate: Date, now = new Date()) => {
  const diffMs = now.getTime() - dueDate.getTime();
  if (diffMs <= 0) return 0;
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
};

class JobOverdueNotificationServiceClass {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private pollIntervalMs = OVERDUE_POLL_INTERVAL_MS;
  private readonly workerName = "job_overdue_notifications";

  startWorker(options?: { pollIntervalMs?: number }) {
    if (this.timer) return;

    const requestedInterval = Number(options?.pollIntervalMs || 0);
    this.pollIntervalMs =
      Number.isFinite(requestedInterval) && requestedInterval > 0
        ? requestedInterval
        : OVERDUE_POLL_INTERVAL_MS;

    ObservabilityService.registerWorker(this.workerName, {
      component: "jobs",
      enabled: true,
      pollIntervalMs: this.pollIntervalMs,
      staleAfterMs: Math.max(this.pollIntervalMs * 2, 60_000),
    });
    ObservabilityService.markWorkerStarted(this.workerName, {
      component: "jobs",
      enabled: true,
      pollIntervalMs: this.pollIntervalMs,
      staleAfterMs: Math.max(this.pollIntervalMs * 2, 60_000),
    });

    this.timer = setInterval(() => {
      void this.runSweep();
    }, this.pollIntervalMs);
    this.timer.unref();

    // Run once on startup to avoid waiting for first interval.
    setTimeout(() => {
      void this.runSweep();
    }, 0).unref();
  }

  stopWorker() {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
    ObservabilityService.markWorkerStopped(this.workerName, {
      component: "jobs",
      enabled: true,
    });
  }

  async runSweep(limit = 500) {
    if (this.running) return;
    this.running = true;
    const startedAt = Date.now();
    ObservabilityService.markWorkerHeartbeat(this.workerName, {
      component: "jobs",
      metadata: { limit },
    });

    try {
      const scannedJobs = await this.runSweepWithDistributedLock(limit);
      ObservabilityService.markWorkerSuccess(this.workerName, {
        component: "jobs",
        durationMs: Date.now() - startedAt,
        metadata: {
          limit,
          scannedJobs,
        },
      });
    } catch (error) {
      logger.error("job_overdue_sweep_failed", toLogContext(error));
      ObservabilityService.markWorkerFailure(this.workerName, error, {
        component: "jobs",
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
            CAST(${OVERDUE_LOCK_CLASS_ID} AS integer),
            CAST(${OVERDUE_LOCK_OBJECT_ID} AS integer)
          ) AS locked
        `;
        const isLeader = Boolean(lockRows?.[0]?.locked);
        if (!isLeader) return 0;

        // Keep this transaction open while the sweep runs so the advisory lock is held
        // for the entire overdue scan/dispatch window across all instances.
        return this.runSweepUnlocked(limit);
      },
      {
        maxWait: 2_000,
        timeout: OVERDUE_SWEEP_TX_TIMEOUT_MS,
      }
    );
  }

  private async runSweepUnlocked(limit = 500) {
    const now = new Date();
    const jobs = await prisma.job.findMany({
      where: {
        dueDate: { lt: now },
        status: { notIn: ["completed", "cancelled"] },
      },
      select: {
        id: true,
        jobName: true,
        dueDate: true,
        departmentId: true,
        clientId: true,
        managerProfileId: true,
        partnerProfileId: true,
      },
      orderBy: { dueDate: "asc" },
      take: limit,
    });

    if (!jobs.length) return 0;

    const jobIds = jobs.map((job) => job.id);
    const assignments = await prisma.jobStaffAssignment.findMany({
      where: { jobId: { in: jobIds } },
      select: {
        jobId: true,
        employeeProfileId: true,
      },
    });

    const staffByJob = new Map<number, number[]>();
    assignments.forEach((assignment) => {
      const list = staffByJob.get(assignment.jobId) || [];
      list.push(assignment.employeeProfileId);
      staffByJob.set(assignment.jobId, list);
    });

    for (const job of jobs) {
      if (!job.dueDate) continue;

      const overdueDays = daysOverdue(job.dueDate, now);
      if (overdueDays <= 0) continue;

      for (const tier of OVERDUE_TIERS) {
        if (overdueDays < tier.minDaysOverdue) continue;
        await this.dispatchTier(job, overdueDays, tier, staffByJob.get(job.id) || []);
      }
    }

    return jobs.length;
  }

  private async dispatchTier(
    job: {
      id: number;
      jobName: string;
      dueDate: Date | null;
      departmentId: number | null;
      clientId: number | null;
      managerProfileId: number | null;
      partnerProfileId: number | null;
    },
    overdueDays: number,
    tier: OverdueTier,
    assignedStaffProfileIds: number[]
  ) {
    const ownerProfileIds = [job.managerProfileId, job.partnerProfileId];
    const recipientProfileIds = tier.includeAssignedStaff ? assignedStaffProfileIds : [];

    const rolePolicies: Array<{
      roles: string[];
      departmentId?: number | null;
      fallbackRoles?: string[];
    }> = [];

    if (tier.includeFinance) {
      rolePolicies.push({
        roles: ["finance", "finance_manager"],
        departmentId: job.departmentId ?? undefined,
        fallbackRoles: ["finance", "finance_manager"],
      });
    }
    if (tier.includeHr) {
      rolePolicies.push({
        roles: ["hr", "super_admin"],
      });
    }
    if (tier.includeGmp) {
      rolePolicies.push({
        roles: ["gmp"],
      });
    }

    const dueDateStamp = job.dueDate
      ? new Date(job.dueDate).toISOString().slice(0, 10)
      : "none";
    const eventKey = `job.overdue.l${tier.level}:${job.id}:${dueDateStamp}`;

    await NotificationService.dispatchEvent(
      {
        eventType: `job.overdue.level_${tier.level}`,
        type: tier.priority === "critical" ? "escalation" : "warning",
        priority: tier.priority,
        title: `Job overdue (${overdueDays}d): ${job.jobName}`,
        message: `This job is overdue by ${overdueDays} day(s). Please review timeline, staffing, and next actions.`,
        actionRequired: true,
        canonicalRoute: `/jobs/${job.id}`,
        actions: [
          {
            id: "view_job",
            label: "View job",
            endpoint: `/jobs/${job.id}`,
            method: "GET",
          },
          {
            id: "view_timesheets",
            label: "View timesheets",
            endpoint: `/timesheets?tab=by-job&jobId=${job.id}`,
            method: "GET",
          },
        ],
        requiredPermission: "module.jobs.read",
        targetEntityType: "Job",
        targetEntityId: job.id,
        jobId: job.id,
        clientId: job.clientId ?? undefined,
        ownerProfileIds,
        recipientProfileIds,
        rolePolicies,
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

export const JobOverdueNotificationService = new JobOverdueNotificationServiceClass();
