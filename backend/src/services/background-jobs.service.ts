/**
 * Background jobs service (Bull v4 compatibility).
 *
 * This keeps the legacy API surface while using typed Bull queue primitives.
 */

import Bull from "bull";
import net from "net";
import nodemailer from "nodemailer";
import { logger, toLogContext } from "../lib/logger";
import { ObservabilityService } from "./observability.service";
import prisma from "../prisma";
import { syncKpiSourceData } from "./kpiCascade.service";

type QueueName =
  | "emails"
  | "reports"
  | "bulk-operations"
  | "data-aggregation";

type RedisConnectionConfig = {
  redis: NonNullable<Bull.QueueOptions["redis"]>;
  host: string;
  port: number;
  urlConfigured: boolean;
};

const DEFAULT_REDIS_PORT = 6379;

interface EmailJob {
  to: string;
  subject: string;
  template: string;
  data: Record<string, unknown>;
}

interface ReportJob {
  reportType: string;
  dateRange?: {
    from: Date;
    to: Date;
  };
  recipients: string[];
  format: "pdf" | "excel" | "csv";
}

interface BulkOperationJob {
  operation: string;
  ids: string[];
  data: unknown;
}

class BackgroundJobsService {
  private queues = new Map<QueueName, Bull.Queue<any>>();
  private emailTransporter: nodemailer.Transporter | null = null;
  private initialized = false;
  private initializing = false;
  private lastInitializedAt: string | null = null;
  private lastInitializationError: string | null = null;
  private readonly workerName = "background_jobs";
  private readonly startupTimeoutMs = 1500;

  private shouldRunBackgroundProcessing() {
    if (process.env.DISABLE_BACKGROUND_JOBS_WORKER === "true") return false;
    if (process.env.NODE_ENV === "test") return false;
    return true;
  }

  private getRedisConfig(): RedisConnectionConfig {
    const redisUrl = String(process.env.REDIS_URL || "").trim();
    if (redisUrl) {
      let parsed: URL;
      try {
        parsed = new URL(redisUrl);
      } catch {
        throw new Error("REDIS_URL must be a valid redis:// or rediss:// URL");
      }

      if (parsed.protocol !== "redis:" && parsed.protocol !== "rediss:") {
        throw new Error("REDIS_URL must use redis:// or rediss://");
      }

      const port = Number(parsed.port || DEFAULT_REDIS_PORT);
      if (!parsed.hostname || !Number.isFinite(port) || port <= 0) {
        throw new Error("REDIS_URL must include a valid Redis host and port");
      }

      return {
        redis: redisUrl,
        host: parsed.hostname,
        port: Math.trunc(port),
        urlConfigured: true,
      };
    }

    const host = process.env.REDIS_HOST || "127.0.0.1";
    const port = Number(process.env.REDIS_PORT || DEFAULT_REDIS_PORT);
    if (!Number.isFinite(port) || port <= 0) {
      throw new Error("REDIS_PORT must be a positive integer");
    }

    return {
      redis: {
        host,
        port: Math.trunc(port),
      },
      host,
      port: Math.trunc(port),
      urlConfigured: false,
    };
  }

  private getRedisLogContext() {
    try {
      const { host, port, urlConfigured } = this.getRedisConfig();
      return { host, port, urlConfigured };
    } catch (error) {
      return {
        configError: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async ensureRedisReachable() {
    const { host, port } = this.getRedisConfig();

    await new Promise<void>((resolve, reject) => {
      const socket = net.createConnection({ host, port });
      let settled = false;

      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        if (error) {
          reject(error);
          return;
        }
        resolve();
      };

      socket.setTimeout(this.startupTimeoutMs);
      socket.once("connect", () => finish());
      socket.once("timeout", () => {
        finish(new Error(`Redis connection timed out at ${host}:${port}`));
      });
      socket.once("error", (error) => {
        finish(error instanceof Error ? error : new Error(String(error)));
      });
    });
  }

  private async closeQueues() {
    const closeTasks = Array.from(this.queues.values()).map(async (queue) => {
      try {
        await queue.close();
      } catch (error) {
        logger.warn("background_queue_close_failed", toLogContext(error));
      }
    });
    await Promise.all(closeTasks);
    this.queues.clear();
  }

  async initialize() {
    if (this.initialized) return true;
    if (this.initializing) return false;
    const startedAt = Date.now();
    this.initializing = true;

    try {
      if (!this.shouldRunBackgroundProcessing()) {
        this.lastInitializationError = "background_jobs_disabled";
        ObservabilityService.registerWorker(this.workerName, {
          component: "background_jobs",
          enabled: false,
          metadata: {
            reason: "disabled_by_environment",
          },
        });
        ObservabilityService.markWorkerStopped(this.workerName, {
          component: "background_jobs",
          enabled: false,
          metadata: {
            reason: "disabled_by_environment",
          },
        });
        return false;
      }

      this.setupEmailTransporter();
      await this.ensureRedisReachable();
      this.createQueue("emails");
      this.createQueue("reports");
      this.createQueue("bulk-operations");
      this.createQueue("data-aggregation");
      await Promise.all(Array.from(this.queues.values()).map((queue) => queue.isReady()));
      this.startWorkers();
      this.initialized = true;
      this.lastInitializedAt = new Date().toISOString();
      this.lastInitializationError = null;
      ObservabilityService.registerWorker(this.workerName, {
        component: "background_jobs",
        enabled: true,
        metadata: {
          queueNames: Array.from(this.queues.keys()),
        },
      });
      ObservabilityService.markWorkerStarted(this.workerName, {
        component: "background_jobs",
        enabled: true,
        metadata: {
          queueNames: Array.from(this.queues.keys()),
        },
      });
      ObservabilityService.markWorkerSuccess(this.workerName, {
        component: "background_jobs",
        durationMs: Date.now() - startedAt,
        metadata: {
          queueNames: Array.from(this.queues.keys()),
        },
      });
      logger.info("background_jobs_initialized");
      return true;
    } catch (error) {
      this.lastInitializationError = error instanceof Error ? error.message : String(error);
      await this.closeQueues();
      logger.warn("background_jobs_initialization_skipped", {
        ...toLogContext(error),
        component: "background_jobs",
        redis: this.getRedisLogContext(),
      });
      ObservabilityService.registerWorker(this.workerName, {
        component: "background_jobs",
        enabled: false,
        metadata: {
          reason: "redis_unavailable",
          redis: this.getRedisLogContext(),
        },
      });
      ObservabilityService.markWorkerStopped(this.workerName, {
        component: "background_jobs",
        enabled: false,
        metadata: {
          reason: "redis_unavailable",
          redis: this.getRedisLogContext(),
          startupDurationMs: Date.now() - startedAt,
        },
      });
      return false;
    } finally {
      this.initializing = false;
    }
  }

  private createQueue(name: QueueName) {
    const redis = this.getRedisConfig().redis;
    const queue = new Bull(name, {
      redis,
      defaultJobOptions: {
        removeOnComplete: true,
        attempts: 3,
        backoff: { type: "exponential", delay: 2000 },
      },
    });

    queue.on("error", (error) => {
      logger.error("background_queue_error", {
        queue: name,
        ...toLogContext(error),
      });
      if (!this.initialized) return;
      ObservabilityService.markWorkerFailure(this.workerName, error, {
        component: "background_jobs",
        metadata: { queue: name },
      });
    });

    this.queues.set(name, queue);
  }

  private setupEmailTransporter() {
    const host = process.env.SMTP_HOST;
    const port = Number(process.env.SMTP_PORT || 587);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (!host || !user || !pass) {
      this.emailTransporter = null;
      return;
    }

    this.emailTransporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });
  }

  private startWorkers() {
    const emailQueue = this.queues.get("emails");
    if (emailQueue) {
      emailQueue.process(async (job: Bull.Job<EmailJob>) => {
        await this.processEmailJob(job.data);
      });
    }

    const reportQueue = this.queues.get("reports");
    if (reportQueue) {
      reportQueue.process(async (job: Bull.Job<ReportJob>) => {
        await this.processReportJob(job.data);
      });
    }

    const bulkQueue = this.queues.get("bulk-operations");
    if (bulkQueue) {
      bulkQueue.process(async (job: Bull.Job<BulkOperationJob>) => {
        await this.processBulkOperation(job.data);
      });
    }

    const aggregationQueue = this.queues.get("data-aggregation");
    if (aggregationQueue) {
      aggregationQueue.process(async (job: Bull.Job<any>) => {
        await this.processDataAggregation(job.data);
      });
      this.scheduleKpiAutoSync();
    }
  }

  async queueEmail(
    to: string,
    subject: string,
    template: string,
    data: Record<string, unknown>
  ) {
    const queue = this.queues.get("emails");
    if (!queue) throw new Error("Email queue is not initialized");
    return queue.add({ to, subject, template, data });
  }

  async queueReport(
    reportType: string,
    recipients: string[],
    format: "pdf" | "excel" | "csv",
    dateRange?: { from: Date; to: Date }
  ) {
    const queue = this.queues.get("reports");
    if (!queue) throw new Error("Report queue is not initialized");
    return queue.add({ reportType, recipients, format, dateRange });
  }

  async queueBulkOperation(operation: string, ids: string[], data: unknown) {
    const queue = this.queues.get("bulk-operations");
    if (!queue) throw new Error("Bulk operation queue is not initialized");
    return queue.add({ operation, ids, data });
  }

  async queueDataAggregation(aggregationType: string, filters?: unknown) {
    const queue = this.queues.get("data-aggregation");
    if (!queue) throw new Error("Data aggregation queue is not initialized");
    return queue.add({ type: aggregationType, filters: filters || null });
  }

  private async processEmailJob(data: EmailJob): Promise<void> {
    if (!this.emailTransporter) {
      logger.warn("email_job_skipped", {
        reason: "email_transporter_not_configured",
      });
      return;
    }

    const html = this.renderEmailTemplate(data.template, data.data);
    await this.emailTransporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: data.to,
      subject: data.subject,
      html,
    });
  }

  private async processReportJob(data: ReportJob): Promise<void> {
    logger.info("processing_report_job", {
      reportType: data.reportType,
      recipients: data.recipients.length,
      format: data.format,
    });
  }

  private async processBulkOperation(data: BulkOperationJob): Promise<void> {
    logger.info("processing_bulk_operation", {
      operation: data.operation,
      count: data.ids.length,
    });
  }

  private async processDataAggregation(data: any): Promise<void> {
    const jobType = data?.type || "unknown";
    logger.info("processing_aggregation_job", { type: jobType });

    if (jobType === "kpi_sync") {
      await this.runKpiAutoSync();
    }
  }

  private async runKpiAutoSync(): Promise<void> {
    try {
      // Find all active (open or draft) periods
      const periods = await prisma.balancedScorecardMeasurementPeriod.findMany({
        where: { status: { in: ["draft", "active", "open", "review"] as any } },
        select: { id: true, label: true },
      });

      for (const period of periods) {
        try {
          const result = await syncKpiSourceData(period.id);
          logger.info("kpi_auto_sync_period", { periodId: period.id, label: period.label, ...result });
        } catch (err) {
          logger.warn("kpi_auto_sync_period_failed", { periodId: period.id, ...toLogContext(err) });
        }
      }
    } catch (err) {
      logger.error("kpi_auto_sync_failed", toLogContext(err));
    }
  }

  private scheduleKpiAutoSync() {
    const aggregationQueue = this.queues.get("data-aggregation");
    if (!aggregationQueue) return;
    // Repeating job: every 6 hours
    aggregationQueue.add(
      { type: "kpi_sync" },
      { repeat: { cron: "0 */6 * * *" }, jobId: "kpi-auto-sync" }
    ).catch(() => { /* ignore scheduling errors */ });
  }

  private renderEmailTemplate(template: string, data: Record<string, unknown>): string {
    const payload = Object.entries(data).reduce((html, [key, value]) => {
      return html.replace(new RegExp(`{{\\s*${key}\\s*}}`, "g"), String(value ?? ""));
    }, template);
    return payload;
  }

  async getJobStats(queueName: QueueName) {
    const queue = this.queues.get(queueName);
    if (!queue) throw new Error(`Queue "${queueName}" is not initialized`);
    return queue.getJobCounts();
  }

  async getAllQueueStats() {
    const names: QueueName[] = [
      "emails",
      "reports",
      "bulk-operations",
      "data-aggregation",
    ];
    const result: Record<string, Bull.JobCounts> = {};
    await Promise.all(
      names.map(async (name) => {
        const queue = this.queues.get(name);
        if (!queue) return;
        result[name] = await queue.getJobCounts();
      })
    );
    return result;
  }

  async clearQueue(queueName: QueueName) {
    const queue = this.queues.get(queueName);
    if (!queue) throw new Error(`Queue "${queueName}" is not initialized`);

    await queue.empty();
    await queue.clean(0, "completed");
    await queue.clean(0, "failed");
    await queue.clean(0, "delayed");
    return true;
  }

  async shutdown() {
    await this.closeQueues();
    this.initialized = false;
    this.initializing = false;
    ObservabilityService.markWorkerStopped(this.workerName, {
      component: "background_jobs",
      enabled: true,
    });
  }

  getRuntimeState() {
    return {
      initialized: this.initialized,
      queueNames: Array.from(this.queues.keys()),
      emailTransportConfigured: Boolean(this.emailTransporter),
      lastInitializedAt: this.lastInitializedAt,
      lastInitializationError: this.lastInitializationError,
      redis: this.getRedisLogContext(),
    };
  }
}

export default new BackgroundJobsService();
