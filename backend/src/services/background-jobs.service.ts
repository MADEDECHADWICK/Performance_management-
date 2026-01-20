/**
 * Background Jobs Service
 * 
 * Manages async tasks using Bull (Redis-based job queue):
 * - Email notifications
 * - Scheduled reports
 * - Bulk operations
 * - Data aggregation
 */

import { Queue, Worker, QueueEvents } from 'bull';
import nodemailer from 'nodemailer';

interface JobData {
  [key: string]: any;
}

interface EmailJob {
  to: string;
  subject: string;
  template: string;
  data: Record<string, any>;
}

interface ReportJob {
  reportType: string;
  dateRange?: {
    from: Date;
    to: Date;
  };
  recipients: string[];
  format: 'pdf' | 'excel' | 'csv';
}

interface BulkOperationJob {
  operation: string;
  ids: string[];
  data: any;
}

class BackgroundJobsService {
  private queues: Map<string, Queue> = new Map();
  private workers: Map<string, Worker> = new Map();
  private emailTransporter: nodemailer.Transporter | null = null;

  /**
   * Initialize job service and queues
   */
  async initialize() {
    try {
      // Setup email transporter
      this.setupEmailTransporter();

      // Create queues
      this.createQueue('emails');
      this.createQueue('reports');
      this.createQueue('bulk-operations');
      this.createQueue('data-aggregation');
      this.createQueue('notifications');

      // Start workers
      this.startWorkers();

      console.log('✅ Background jobs service initialized');
      return true;
    } catch (error) {
      console.error('❌ Background jobs initialization failed:', error);
      return false;
    }
  }

  /**
   * Create a job queue
   */
  private createQueue(name: string) {
    const queue = new Queue(name, {
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
      },
    });

    queue.on('error', (error) => {
      console.error(`Queue error (${name}):`, error);
    });

    this.queues.set(name, queue);
  }

  /**
   * Setup email transporter
   */
  private setupEmailTransporter() {
    this.emailTransporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'localhost',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  /**
   * Start job workers
   */
  private startWorkers() {
    // Email worker
    const emailWorker = new Worker(
      'emails',
      async (job) => {
        return this.processEmailJob(job.data as EmailJob);
      },
      {
        connection: {
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT || '6379'),
        },
      }
    );

    emailWorker.on('completed', (job) => {
      console.log(`✅ Email job completed: ${job.id}`);
    });

    emailWorker.on('failed', (job, error) => {
      console.error(`❌ Email job failed: ${job?.id}`, error);
    });

    this.workers.set('emails', emailWorker);

    // Report worker
    const reportWorker = new Worker(
      'reports',
      async (job) => {
        return this.processReportJob(job.data as ReportJob);
      },
      {
        connection: {
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT || '6379'),
        },
      }
    );

    reportWorker.on('completed', (job) => {
      console.log(`✅ Report job completed: ${job.id}`);
    });

    this.workers.set('reports', reportWorker);

    // Bulk operations worker
    const bulkWorker = new Worker(
      'bulk-operations',
      async (job) => {
        return this.processBulkOperation(job.data as BulkOperationJob);
      },
      {
        connection: {
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT || '6379'),
        },
      }
    );

    bulkWorker.on('completed', (job) => {
      console.log(`✅ Bulk operation completed: ${job.id}`);
    });

    this.workers.set('bulk-operations', bulkWorker);

    // Data aggregation worker
    const aggregationWorker = new Worker(
      'data-aggregation',
      async (job) => {
        return this.processDataAggregation(job.data);
      },
      {
        connection: {
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT || '6379'),
        },
      }
    );

    this.workers.set('data-aggregation', aggregationWorker);
  }

  /**
   * Queue email job
   */
  async queueEmail(to: string, subject: string, template: string, data: any) {
    try {
      const queue = this.queues.get('emails');
      if (!queue) throw new Error('Email queue not initialized');

      const job = await queue.add(
        { to, subject, template, data },
        {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
          removeOnComplete: true,
        }
      );

      return job.id;
    } catch (error) {
      console.error('Failed to queue email:', error);
      throw error;
    }
  }

  /**
   * Queue report generation job
   */
  async queueReport(
    reportType: string,
    recipients: string[],
    format: 'pdf' | 'excel' | 'csv' = 'pdf',
    dateRange?: { from: Date; to: Date }
  ) {
    try {
      const queue = this.queues.get('reports');
      if (!queue) throw new Error('Reports queue not initialized');

      const job = await queue.add(
        {
          reportType,
          recipients,
          format,
          dateRange,
        },
        {
          attempts: 2,
          backoff: {
            type: 'exponential',
            delay: 5000,
          },
          removeOnComplete: true,
        }
      );

      return job.id;
    } catch (error) {
      console.error('Failed to queue report:', error);
      throw error;
    }
  }

  /**
   * Queue bulk operation
   */
  async queueBulkOperation(operation: string, ids: string[], data: any) {
    try {
      const queue = this.queues.get('bulk-operations');
      if (!queue) throw new Error('Bulk operations queue not initialized');

      const job = await queue.add(
        { operation, ids, data },
        {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 3000,
          },
        }
      );

      return job.id;
    } catch (error) {
      console.error('Failed to queue bulk operation:', error);
      throw error;
    }
  }

  /**
   * Queue data aggregation job
   */
  async queueDataAggregation(aggregationType: string, filters?: any) {
    try {
      const queue = this.queues.get('data-aggregation');
      if (!queue) throw new Error('Data aggregation queue not initialized');

      const job = await queue.add(
        {
          type: aggregationType,
          filters,
        },
        {
          repeat: {
            pattern: '0 2 * * *', // Daily at 2 AM
          },
        }
      );

      return job.id;
    } catch (error) {
      console.error('Failed to queue data aggregation:', error);
      throw error;
    }
  }

  /**
   * Process email job
   */
  private async processEmailJob(data: EmailJob): Promise<void> {
    try {
      if (!this.emailTransporter) {
        throw new Error('Email transporter not configured');
      }

      const htmlContent = this.renderEmailTemplate(data.template, data.data);

      const mailOptions = {
        from: process.env.SMTP_FROM || 'noreply@bsc-system.com',
        to: data.to,
        subject: data.subject,
        html: htmlContent,
      };

      await this.emailTransporter.sendMail(mailOptions);
      console.log(`📧 Email sent to ${data.to}`);
    } catch (error) {
      console.error('Email processing error:', error);
      throw error;
    }
  }

  /**
   * Process report generation job
   */
  private async processReportJob(data: ReportJob): Promise<void> {
    try {
      console.log(`📊 Generating ${data.format} report: ${data.reportType}`);

      // Simulate report generation
      // In production, call actual report service
      for (const recipient of data.recipients) {
        await this.queueEmail(
          recipient,
          `Your ${data.reportType} Report`,
          'report',
          {
            reportType: data.reportType,
            format: data.format,
          }
        );
      }
    } catch (error) {
      console.error('Report processing error:', error);
      throw error;
    }
  }

  /**
   * Process bulk operation
   */
  private async processBulkOperation(data: BulkOperationJob): Promise<void> {
    try {
      console.log(
        `🔄 Processing bulk ${data.operation} for ${data.ids.length} items`
      );

      // Process in batches of 100
      const batchSize = 100;
      for (let i = 0; i < data.ids.length; i += batchSize) {
        const batch = data.ids.slice(i, i + batchSize);
        // Simulate processing
        console.log(`Processing batch ${Math.floor(i / batchSize) + 1}`);
      }

      console.log(`✅ Bulk ${data.operation} completed`);
    } catch (error) {
      console.error('Bulk operation error:', error);
      throw error;
    }
  }

  /**
   * Process data aggregation
   */
  private async processDataAggregation(data: any): Promise<void> {
    try {
      console.log(`📈 Running data aggregation: ${data.type}`);

      // Simulate aggregation based on type
      switch (data.type) {
        case 'daily-budget-summary':
          console.log('Aggregating daily budget summary...');
          break;
        case 'weekly-revenue-report':
          console.log('Aggregating weekly revenue...');
          break;
        case 'performance-metrics':
          console.log('Aggregating performance metrics...');
          break;
        default:
          console.log(`Unknown aggregation type: ${data.type}`);
      }
    } catch (error) {
      console.error('Data aggregation error:', error);
      throw error;
    }
  }

  /**
   * Render email template
   */
  private renderEmailTemplate(template: string, data: any): string {
    let html = '';

    switch (template) {
      case 'budget-alert':
        html = `
          <h2>Budget Alert</h2>
          <p>Your budget has reached ${data.utilization}% utilization.</p>
          <p>Department: ${data.departmentName}</p>
        `;
        break;
      case 'evaluation-reminder':
        html = `
          <h2>Evaluation Reminder</h2>
          <p>You have pending evaluations to complete.</p>
          <p>Deadline: ${data.deadline}</p>
        `;
        break;
      case 'report':
        html = `
          <h2>Your ${data.reportType} Report</h2>
          <p>Your requested report in ${data.format} format is ready.</p>
          <p><a href="${data.downloadUrl}">Download Report</a></p>
        `;
        break;
      case 'daily-digest':
        html = `
          <h2>Daily Digest</h2>
          <p>Here's your daily summary:</p>
          <ul>
            <li>${data.newNotifications} new notifications</li>
            <li>${data.pendingApprovals} pending approvals</li>
            <li>${data.kpiUpdates} KPI updates</li>
          </ul>
        `;
        break;
      default:
        html = `<p>${data.message || 'Notification'}</p>`;
    }

    return html;
  }

  /**
   * Get job stats
   */
  async getJobStats(queueName: string) {
    try {
      const queue = this.queues.get(queueName);
      if (!queue) return null;

      const [active, waiting, completed, failed] = await Promise.all([
        queue.getActiveCount(),
        queue.getWaitingCount(),
        queue.getCompletedCount(),
        queue.getFailedCount(),
      ]);

      return { active, waiting, completed, failed };
    } catch (error) {
      console.error('Failed to get job stats:', error);
      return null;
    }
  }

  /**
   * Get all queue stats
   */
  async getAllQueueStats() {
    const stats: Record<string, any> = {};

    for (const [name] of this.queues) {
      stats[name] = await this.getJobStats(name);
    }

    return stats;
  }

  /**
   * Clear queue
   */
  async clearQueue(queueName: string) {
    try {
      const queue = this.queues.get(queueName);
      if (!queue) throw new Error(`Queue ${queueName} not found`);

      await queue.clean(0, 10000); // Remove all completed jobs
      console.log(`✅ Queue ${queueName} cleared`);
    } catch (error) {
      console.error('Failed to clear queue:', error);
      throw error;
    }
  }

  /**
   * Shutdown job service
   */
  async shutdown() {
    try {
      for (const [name, worker] of this.workers) {
        await worker.close();
        console.log(`Closed worker: ${name}`);
      }

      for (const [name, queue] of this.queues) {
        await queue.close();
        console.log(`Closed queue: ${name}`);
      }

      console.log('✅ Background jobs service shutdown');
    } catch (error) {
      console.error('Error shutting down background jobs:', error);
    }
  }
}

export default new BackgroundJobsService();
