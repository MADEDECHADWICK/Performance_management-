/**
 * Background jobs service (Bull v4 compatibility).
 *
 * This keeps the legacy API surface while using typed Bull queue primitives.
 */

import Bull from "bull";
import nodemailer from "nodemailer";
import { logger, toLogContext } from "../lib/logger";
import { ObservabilityService } from "./observability.service";

type QueueName =
  | "emails"
  | "reports"
  | "bulk-operations"
  | "data-aggregation"
  | "notifications";

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
  private lastInitializedAt: string | null = null;
  private lastInitializationError: string | null = null;
  private readonly workerName = "background_jobs";

  async initialize() {
    if (this.initialized) return true;
    const startedAt = Date.now();

    try {
      this.setupEmailTransporter();
      this.createQueue("emails");
      this.createQueue("reports");
      this.createQueue("bulk-operations");
      this.createQueue("data-aggregation");
      this.createQueue("notifications");
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
      logger.error("background_jobs_initialization_failed", toLogContext(error));
      ObservabilityService.markWorkerFailure(this.workerName, error, {
        component: "background_jobs",
        durationMs: Date.now() - startedAt,
      });
      return false;
    }
  }

  private createQueue(name: QueueName) {
    const queue = new Bull(name, {
      redis: {
        host: process.env.REDIS_HOST || "127.0.0.1",
        port: Number(process.env.REDIS_PORT || 6379),
      },
      defaultJobOptions: {
        removeOnComplete: true,
        attempts: 3,
      },
    });

    queue.on("error", (error) => {
      logger.error("background_queue_error", {
        queue: name,
        ...toLogContext(error),
      });
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
    logger.info("processing_aggregation_job", {
      type: data?.type || "unknown",
    });
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
      "notifications",
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
    const closeTasks = Array.from(this.queues.values()).map((queue) => queue.close());
    await Promise.all(closeTasks);
    this.queues.clear();
    this.initialized = false;
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
    };
  }
}

export default new BackgroundJobsService();
