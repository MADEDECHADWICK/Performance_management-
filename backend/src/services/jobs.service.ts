/**
 * JobService
 * 
 * Business logic for job management:
 * - CRUD operations
 * - Access control (manager, partner, admin)
 * - Team assignments & staffing
 * - Costing & budget calculations
 * - Profitability analysis
 * - Time entry aggregation
 * - Job status workflows
 */

import PDFDocument from 'pdfkit';
import prisma from '../prisma';
import { NotificationService } from './notifications.service';
import { createAudit } from '../utils/audit';
import { JobInvoiceStatus, JobStatus, Prisma, TaskStatus } from '@prisma/client';
import { createClientSurveyForJobCompletion } from './surveyRouting.service';
import { storeGeneratedUploadBuffer } from '../config/uploads';

export interface JobMilestoneInput {
  title: string;
  targetPercent: number;
  dueDate?: Date | string;
  requirements?: string;
  assignedToProfileId?: number;
}

export interface JobCreateInput {
  jobName: string;
  description?: string;
  clientId?: number;
  departmentId?: number;
  partnerProfileId?: number;
  managerProfileId: number;
  billingType: 'hourly' | 'fixed_fee';
  fixedFeeAmount?: number;
  budgetHours?: number;
  engagementLetterId?: number;
  startDate?: Date;
  dueDate?: Date;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  milestones?: JobMilestoneInput[];
}

export interface JobCreateFromOnboardingInput {
  jobName?: string;
  description?: string;
  departmentId?: number;
  partnerProfileId?: number;
  managerProfileId: number;
  budgetHours?: number;
  startDate?: Date;
  dueDate?: Date;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  milestones?: JobMilestoneInput[];
}

export interface JobUpdateInput {
  jobName?: string;
  description?: string;
  status?: JobStatus;
  dueDate?: Date;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  billingType?: 'hourly' | 'fixed_fee';
  fixedFeeAmount?: number;
  budgetHours?: number;
}

export interface JobStaffAssignmentInput {
  employeeProfileId: number;
  assignedRoleId: number;
  assignedHourlyRate?: number;
  roleOnJob?: string;
}

export interface JobStaffAssignmentUpdateInput {
  assignedRoleId?: number;
  assignedHourlyRate?: number;
  roleOnJob?: string;
}

export interface JobCostingInput {
  jobFee: number;
  allocations: Array<{
    employeeProfileId: number;
    roleId: number;
    allocatedHours: number;
    hourlyRate?: number;
    billable?: boolean;
    taskDescription?: string;
  }>;
  notes?: string;
  capEnforced?: boolean;
  allowOverage?: boolean;
  maxOveragePercent?: number;
  submitForApproval?: boolean;
  partnerApprove?: boolean;
  milestones?: JobMilestoneInput[];
}

export interface JobCostingReviewInput {
  decision: 'approved' | 'rejected';
  reviewNotes?: string;
}

type NormalizedJobMilestone = {
  title: string;
  targetPercent: number;
  dueDate?: Date;
  requirements?: string;
  assignedToProfileId?: number;
  orderIndex: number;
};

type MilestoneTaskMetadata = {
  targetPercent: number;
  requirements?: string | null;
  orderIndex?: number;
};

type EngagementLetterUploaderProfile = {
  user?: {
    roles?: Array<{
      role?: {
        name?: string | null;
      } | null;
    }> | null;
  } | null;
  role?: {
    name?: string | null;
  } | null;
  positionTitle?: string | null;
};

type JobCreationEngagementLetter = {
  id: number;
  status: string;
  clientId: number;
  documentId: number | null;
  feeAmount: unknown;
  currency?: string | null;
  jobTitle?: string | null;
  engagementType?: string | null;
  startDate?: Date | null;
  endDate?: Date | null;
  uploadedByProfileId?: number | null;
  uploadedBy?: EngagementLetterUploaderProfile | null;
};

export interface JobInvoiceMilestoneTrackingItem {
  taskId: number;
  title: string;
  targetPercent: number;
  dueDate: Date | null;
  requirements: string | null;
  assignedToProfileId: number | null;
  conditionStatus: TaskStatus;
  conditionCompleted: boolean;
  milestoneAmount: number;
  expectedCumulativeAmount: number;
  amountRemainingToMilestone: number;
  milestonePaid: boolean;
  readyForInvoice: boolean;
  invoiceNumberSuggestion: string;
  linkedInvoice: JobInvoiceSummaryItem | null;
}

export interface JobInvoiceMilestoneTrackingSummary {
  jobId: number;
  jobCode: string | null;
  jobName: string;
  feeAmount: number;
  collectedAmount: number;
  outstandingAmount: number;
  milestoneCount: number;
  completedConditionCount: number;
  nextReadyMilestone: JobInvoiceMilestoneTrackingItem | null;
  milestones: JobInvoiceMilestoneTrackingItem[];
}

export interface JobInvoiceSummaryItem {
  id: number;
  invoiceNumber: string;
  title: string;
  status: JobInvoiceStatus;
  currency: string;
  expectedPercent: number | null;
  totalAmount: number;
  amountPaid: number;
  amountOutstanding: number;
  dueDate: Date | null;
  issuedAt: Date | null;
  generatedAt: Date | null;
  milestoneTaskId: number | null;
  milestoneTitle: string | null;
  document: {
    id: number;
    fileName: string;
    filePath: string;
  } | null;
  paymentApplications: Array<{
    clientPaymentId: number;
    appliedAmount: number;
    appliedAt: Date;
    paymentDate: Date | null;
    referenceNumber: string | null;
  }>;
  lines: Array<{
    id: number;
    description: string;
    lineType: string;
    quantity: number;
    unitPrice: number;
    lineAmount: number;
  }>;
}

export interface JobCommercialSummary {
  totals: {
    expectedFeeAmount: number;
    approvedBilledAmount: number;
    collectedAmount: number;
    outstandingAmount: number;
    costToDate: number;
    profitToDate: number;
    marginPercent: number;
    invoiceCount: number;
    overdueInvoiceCount: number;
  };
  invoices: JobInvoiceSummaryItem[];
}

const coerceDate = (value?: unknown): Date | undefined => {
  if (!value) return undefined;
  if (value instanceof Date) return value;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
};

const JOB_MILESTONE_META_PREFIX = '[[RG_JOB_MILESTONE]]';

const roundCurrency = (value: number) =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const sanitizeGeneratedFileName = (value: string) =>
  String(value || 'document')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_');

const createPdfBuffer = async (
  draw: (doc: PDFKit.PDFDocument) => void
): Promise<Buffer> =>
  new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    draw(doc as unknown as PDFKit.PDFDocument);
    doc.end();
  });

const writeGeneratedDocumentFile = async (fileName: string, buffer: Buffer) =>
  storeGeneratedUploadBuffer({
    bucket: 'documents',
    fileName: sanitizeGeneratedFileName(fileName),
    buffer,
    mimeType: 'application/pdf',
  });

const normalizeDocumentType = (value: unknown) =>
  String(value || '')
    .toLowerCase()
    .replace(/[\s_-]+/g, '');

type WorkflowDocumentRequirement = {
  key: string;
  label: string;
  matches: string[];
};

const STAGE_DOCUMENT_REQUIREMENTS: Partial<
  Record<JobStatus, WorkflowDocumentRequirement[]>
> = {
  in_progress: [
    {
      key: 'work_plan',
      label: 'Work plan document',
      matches: ['workplan', 'jobworkplan', 'workplandocument', 'workpaper'],
    },
    {
      key: 'budget',
      label: 'Budget document',
      matches: ['budget', 'jobbudget', 'approvedbudget', 'budgetplan'],
    },
  ],
  completed: [
    {
      key: 'work_plan',
      label: 'Work plan document',
      matches: ['workplan', 'jobworkplan', 'workplandocument', 'workpaper'],
    },
    {
      key: 'budget',
      label: 'Budget document',
      matches: ['budget', 'jobbudget', 'approvedbudget', 'budgetplan'],
    },
    {
      key: 'draft_report',
      label: 'Draft report document',
      matches: ['draftreport', 'jobdraftreport', 'reportdraft'],
    },
    {
      key: 'final_report',
      label: 'Final report document',
      matches: [
        'finalreport',
        'jobreportfinal',
        'reportfinal',
        'auditreport',
        'managementletter',
        'deliverable',
      ],
    },
  ],
};

const documentTypeMatchesRequirement = (
  documentType: unknown,
  requirement: WorkflowDocumentRequirement
) => {
  const normalized = normalizeDocumentType(documentType);
  return requirement.matches.some((token) => normalized.includes(token));
};

export interface ListJobsOptions {
  page: number;
  pageSize: number;
  filters?: {
    status?: string | string[];
    clientId?: number;
    departmentId?: number;
    partnerProfileId?: number;
    managerProfileId?: number;
    priority?: string;
    dateFrom?: Date;
    dateTo?: Date;
  };
  sort?: {
    field?: string;
    order?: 'asc' | 'desc';
  };
}

export interface AuthContext {
  userId: number;
  profileId: number;
  roles?: string[];
}

class JobService {
  private buildTrackingPath(jobId: number) {
    return `/jobs/${jobId}/tracking`;
  }

  private normalizeRoleName(role?: string) {
    return String(role || '')
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, '_');
  }

  private roleSet(roles?: string[]) {
    return new Set((roles || []).map((role) => this.normalizeRoleName(role)));
  }

  private isMarketingProfile(profile?: EngagementLetterUploaderProfile | null) {
    const roleTokens = [
      ...(profile?.user?.roles || []).map((assignment) => assignment?.role?.name || ''),
      profile?.role?.name || '',
      profile?.positionTitle || '',
    ]
      .map((value) => this.normalizeRoleName(value))
      .filter(Boolean);

    return roleTokens.some(
      (token) => token === 'marketing' || token.includes('marketing') || token.includes('business_development')
    );
  }

  private assertMarketingSubmittedEngagementLetter(engagementLetter: JobCreationEngagementLetter) {
    if (!engagementLetter.uploadedByProfileId || !this.isMarketingProfile(engagementLetter.uploadedBy)) {
      throw new Error(
        'Engagement letter must be uploaded by marketing before HR can create the job'
      );
    }
  }

  private withDerivedOverdueStatus<T extends { dueDate?: Date | null; status: JobStatus }>(job: T) {
    const now = new Date();
    const isOverdue =
      Boolean(job.dueDate) &&
      new Date(job.dueDate as Date).getTime() < now.getTime() &&
      !['completed', 'cancelled'].includes(String(job.status));

    // IMPLEMENTED: Overdue job auto-flagging — expose computed overdue state without mutating persisted lifecycle status.
    return {
      ...job,
      isOverdue,
      effectiveStatus: isOverdue ? 'overdue' : job.status,
    };
  }

  private async getWorkflowDocumentsForJob(jobId: number) {
    return prisma.document.findMany({
      where: {
        entityId: jobId,
        OR: [{ entityType: 'Job' }, { entityType: 'job' }],
      },
      select: { id: true, documentType: true },
    });
  }

  private async getMissingStageDocuments(
    jobId: number,
    targetStatus: JobStatus
  ): Promise<WorkflowDocumentRequirement[]> {
    const required = STAGE_DOCUMENT_REQUIREMENTS[targetStatus] || [];
    if (!required.length) return [];

    const uploaded = await this.getWorkflowDocumentsForJob(jobId);

    return required.filter(
      (requirement) =>
        !uploaded.some((doc) =>
          documentTypeMatchesRequirement(doc.documentType, requirement)
        )
    );
  }

  private async recordJobCostingStatusTransition(
    tx: any,
    input: {
      jobCostingId: number;
      jobId: number;
      fromStatus: string;
      toStatus: string;
      changedByProfileId: number;
      reason?: string | null;
      metadata?: Record<string, unknown>;
    }
  ) {
    await tx.statusTransition.create({
      data: {
        entityType: 'JobCosting',
        entityId: input.jobCostingId,
        fromStatus: input.fromStatus,
        toStatus: input.toStatus,
        changedByProfileId: input.changedByProfileId,
        reason: input.reason || null,
        metadata: input.metadata ?? undefined,
        jobId: input.jobId,
        jobCostingId: input.jobCostingId,
      },
    });
  }

  private normalizeMilestonesInput(
    milestones?: JobMilestoneInput[]
  ): NormalizedJobMilestone[] {
    if (!Array.isArray(milestones) || milestones.length === 0) {
      return [];
    }

    if (milestones.length > 20) {
      throw new Error('A maximum of 20 milestones is allowed per job.');
    }

    const normalized: NormalizedJobMilestone[] = milestones.map((milestone, index) => {
      const title = String(milestone?.title || '').trim();
      if (!title) {
        throw new Error(`Milestone #${index + 1} requires a title.`);
      }

      const targetPercent = Number(milestone?.targetPercent);
      if (!Number.isFinite(targetPercent) || targetPercent <= 0 || targetPercent > 100) {
        throw new Error(
          `Milestone "${title}" has an invalid targetPercent. Use a value between 1 and 100.`
        );
      }

      const dueDate = coerceDate(milestone?.dueDate);
      const requirements = String(milestone?.requirements || '').trim() || undefined;
      let assignedToProfileId: number | undefined;
      if (
        milestone?.assignedToProfileId !== undefined &&
        milestone?.assignedToProfileId !== null &&
        String(milestone?.assignedToProfileId).trim() !== ''
      ) {
        const parsedAssignee = Number(milestone?.assignedToProfileId);
        if (!Number.isFinite(parsedAssignee) || parsedAssignee <= 0) {
          throw new Error(
            `Milestone "${title}" has an invalid assignedToProfileId. Use a valid employee profile id.`
          );
        }
        assignedToProfileId = Math.trunc(parsedAssignee);
      }

      return {
        title,
        targetPercent: roundCurrency(targetPercent),
        dueDate,
        requirements,
        assignedToProfileId,
        orderIndex: index + 1,
      };
    });

    const percentSet = new Set<number>();
    for (const milestone of normalized) {
      if (percentSet.has(milestone.targetPercent)) {
        throw new Error(
          `Duplicate milestone percentage detected: ${milestone.targetPercent}%.`
        );
      }
      percentSet.add(milestone.targetPercent);
    }

    if (!percentSet.has(100)) {
      throw new Error(
        'Milestones must include a final 100% payment point.'
      );
    }

    return normalized.sort((a, b) => {
      if (a.targetPercent === b.targetPercent) {
        return a.orderIndex - b.orderIndex;
      }
      return a.targetPercent - b.targetPercent;
    });
  }

  private buildMilestoneTaskDescription(milestone: NormalizedJobMilestone) {
    const metadata: MilestoneTaskMetadata = {
      targetPercent: milestone.targetPercent,
      requirements: milestone.requirements || null,
      orderIndex: milestone.orderIndex,
    };
    const metadataLine = `${JOB_MILESTONE_META_PREFIX}${JSON.stringify(metadata)}`;
    if (!milestone.requirements) {
      return metadataLine;
    }
    return `${metadataLine}\n${milestone.requirements}`;
  }

  private parseMilestoneTask(task: {
    id: number;
    title: string;
    description: string | null;
    status: TaskStatus;
    dueDate: Date | null;
    assignedToProfileId?: number | null;
  }) {
    const description = String(task.description || '');
    if (!description.startsWith(JOB_MILESTONE_META_PREFIX)) {
      return null;
    }

    const metadataWithBody = description.slice(JOB_MILESTONE_META_PREFIX.length);
    const firstNewline = metadataWithBody.indexOf('\n');
    const metadataRaw =
      firstNewline === -1
        ? metadataWithBody.trim()
        : metadataWithBody.slice(0, firstNewline).trim();
    const fallbackRequirements =
      firstNewline === -1
        ? ''
        : metadataWithBody.slice(firstNewline + 1).trim();

    try {
      const metadata = JSON.parse(metadataRaw) as MilestoneTaskMetadata;
      const targetPercent = Number(metadata?.targetPercent);
      if (!Number.isFinite(targetPercent) || targetPercent <= 0 || targetPercent > 100) {
        return null;
      }

      const requirements =
        String(metadata?.requirements || '').trim() || fallbackRequirements || null;
      const orderIndex = Number(metadata?.orderIndex || 0) || 0;

      return {
        taskId: task.id,
        title: task.title,
        targetPercent: roundCurrency(targetPercent),
        dueDate: task.dueDate,
        requirements,
        assignedToProfileId: task.assignedToProfileId ?? null,
        conditionStatus: task.status,
        conditionCompleted: task.status === 'completed',
        orderIndex,
      };
    } catch (_error) {
      return null;
    }
  }

  private buildInvoiceNumberSuggestion(
    jobCode: string | null | undefined,
    jobId: number,
    targetPercent: number
  ) {
    const baseCode = String(jobCode || `JOB-${jobId}`)
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '');
    const pct = String(Math.round(targetPercent)).padStart(3, '0');
    return `INV-${baseCode}-${pct}`;
  }

  private resolveJobFeeForTracking(job: {
    billingType: 'hourly' | 'fixed_fee';
    fixedFeeAmount: unknown;
    jobCosting?: { jobFee: unknown } | null;
  }) {
    const costingFee = Number(job.jobCosting?.jobFee || 0);
    if (costingFee > 0) return roundCurrency(costingFee);
    if (job.billingType === 'fixed_fee') {
      return roundCurrency(Number(job.fixedFeeAmount || 0));
    }
    return 0;
  }

  private async ensureDefaultJobInvoiceTemplate(
    tx: Prisma.TransactionClient,
    createdByProfileId?: number | null
  ) {
    const existing = await tx.jobInvoiceTemplate.findFirst({
      where: { isDefault: true },
      orderBy: { id: 'asc' },
    });

    if (existing) {
      return existing;
    }

    return tx.jobInvoiceTemplate.create({
      data: {
        name: 'Standard Job Invoice',
        description: 'Default milestone billing template',
        subjectLine: 'Invoice {{invoiceNumber}} - {{jobName}}',
        isDefault: true,
        createdByProfileId: createdByProfileId ?? null,
        templateDefinition: {
          heading: 'RONALDS LLP',
          title: 'Tax Invoice',
          subtitle: 'Professional services milestone billing',
          footer: 'Please remit payment to Ronalds LLP using the invoice number as reference.',
        },
      },
    });
  }

  private resolveJobInvoiceStatus(input: {
    currentStatus?: JobInvoiceStatus;
    totalAmount: number;
    amountPaid: number;
    dueDate?: Date | null;
    issuedAt?: Date | null;
  }): JobInvoiceStatus {
    if (input.currentStatus === 'void') return 'void';
    if (input.totalAmount > 0 && input.amountPaid + 0.0001 >= input.totalAmount) return 'paid';
    if (input.amountPaid > 0) return 'partially_paid';
    if (input.issuedAt) {
      if (input.dueDate && input.dueDate.getTime() < Date.now()) {
        return 'overdue';
      }
      return 'issued';
    }
    return 'draft';
  }

  private serializeJobInvoice(invoice: any): JobInvoiceSummaryItem {
    return {
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      title: invoice.title,
      status: invoice.status,
      currency: invoice.currency || 'KES',
      expectedPercent:
        invoice.expectedPercent === null || invoice.expectedPercent === undefined
          ? null
          : Number(invoice.expectedPercent),
      totalAmount: roundCurrency(Number(invoice.totalAmount || 0)),
      amountPaid: roundCurrency(Number(invoice.amountPaid || 0)),
      amountOutstanding: roundCurrency(Number(invoice.amountOutstanding || 0)),
      dueDate: invoice.dueDate ?? null,
      issuedAt: invoice.issuedAt ?? null,
      generatedAt: invoice.generatedAt ?? null,
      milestoneTaskId: invoice.milestoneTaskId ?? null,
      milestoneTitle: invoice.milestoneTask?.title || null,
      document: invoice.document
        ? {
            id: invoice.document.id,
            fileName: invoice.document.fileName,
            filePath: invoice.document.filePath,
          }
        : null,
      paymentApplications: Array.isArray(invoice.paymentApplications)
        ? invoice.paymentApplications.map((application: any) => ({
            clientPaymentId: application.clientPaymentId,
            appliedAmount: roundCurrency(Number(application.appliedAmount || 0)),
            appliedAt: application.appliedAt,
            paymentDate: application.clientPayment?.paymentDate ?? null,
            referenceNumber: application.clientPayment?.referenceNumber ?? null,
          }))
        : [],
      lines: Array.isArray(invoice.lines)
        ? invoice.lines.map((line: any) => ({
            id: line.id,
            description: line.description,
            lineType: String(line.lineType || 'service_fee'),
            quantity: Number(line.quantity || 0),
            unitPrice: roundCurrency(Number(line.unitPrice || 0)),
            lineAmount: roundCurrency(Number(line.lineAmount || 0)),
          }))
        : [],
    };
  }

  private async syncJobInvoicePaymentState(
    tx: Prisma.TransactionClient,
    jobInvoiceId: number
  ) {
    const invoice = await tx.jobInvoice.findUnique({
      where: { id: jobInvoiceId },
      include: {
        paymentApplications: {
          select: { appliedAmount: true, appliedAt: true },
        },
      },
    });

    if (!invoice) {
      throw new Error('Invoice not found');
    }

    const amountPaid = roundCurrency(
      invoice.paymentApplications.reduce(
        (sum, application) => sum + Number(application.appliedAmount || 0),
        0
      )
    );
    const totalAmount = roundCurrency(Number(invoice.totalAmount || 0));
    const amountOutstanding = roundCurrency(Math.max(0, totalAmount - amountPaid));
    const nextStatus = this.resolveJobInvoiceStatus({
      currentStatus: invoice.status,
      totalAmount,
      amountPaid,
      dueDate: invoice.dueDate,
      issuedAt: invoice.issuedAt,
    });

    const updated = await tx.jobInvoice.update({
      where: { id: jobInvoiceId },
      data: {
        amountPaid,
        amountOutstanding,
        status: nextStatus,
        paidAt: nextStatus === 'paid' ? new Date() : null,
      },
      include: {
        milestoneTask: { select: { id: true, title: true } },
        document: { select: { id: true, fileName: true, filePath: true } },
        lines: {
          orderBy: { sortOrder: 'asc' },
        },
        paymentApplications: {
          include: {
            clientPayment: {
              select: {
                id: true,
                paymentDate: true,
                referenceNumber: true,
              },
            },
          },
          orderBy: { appliedAt: 'asc' },
        },
      },
    });

    if (invoice.status !== nextStatus) {
      await tx.jobInvoiceStatusHistory.create({
        data: {
          jobInvoiceId,
          fromStatus: invoice.status,
          toStatus: nextStatus,
          notes:
            nextStatus === 'paid'
              ? 'Invoice fully settled by applied payment(s).'
              : nextStatus === 'partially_paid'
                ? 'Invoice partially settled by applied payment(s).'
                : nextStatus === 'overdue'
                  ? 'Invoice is overdue based on due date.'
                  : 'Invoice payment state recalculated.',
        },
      });
    }

    return updated;
  }

  private async generateJobInvoiceDocument(
    tx: Prisma.TransactionClient,
    jobInvoiceId: number
  ) {
    const invoice = await tx.jobInvoice.findUnique({
      where: { id: jobInvoiceId },
      include: {
        job: {
          select: {
            id: true,
            jobName: true,
            jobCode: true,
          },
        },
        client: {
          select: {
            id: true,
            clientName: true,
          },
        },
        template: true,
        lines: {
          orderBy: { sortOrder: 'asc' },
        },
        document: {
          select: {
            id: true,
            fileName: true,
            filePath: true,
          },
        },
      },
    });

    if (!invoice) {
      throw new Error('Invoice not found');
    }

    const templateDefinition =
      invoice.template?.templateDefinition &&
      typeof invoice.template.templateDefinition === 'object' &&
      !Array.isArray(invoice.template.templateDefinition)
        ? (invoice.template.templateDefinition as Record<string, unknown>)
        : {};

    const heading = String(templateDefinition.heading || 'RONALDS LLP');
    const title = String(templateDefinition.title || 'Tax Invoice');
    const subtitle = String(
      templateDefinition.subtitle || 'Professional services milestone billing'
    );
    const footer = String(
      templateDefinition.footer ||
        'Please remit payment using the invoice number as the payment reference.'
    );

    const pdfBuffer = await createPdfBuffer((doc) => {
      doc.fontSize(20).fillColor('#0f172a').text(heading, { align: 'left' });
      doc.moveDown(0.5);
      doc.fontSize(16).fillColor('#2563eb').text(title, { align: 'left' });
      doc.moveDown(0.25);
      doc.fontSize(10).fillColor('#475569').text(subtitle);
      doc.moveDown(1.5);

      doc.fontSize(10).fillColor('#0f172a');
      doc.text(`Invoice Number: ${invoice.invoiceNumber}`);
      doc.text(`Client: ${invoice.client.clientName}`);
      doc.text(`Job: ${invoice.job.jobName}${invoice.job.jobCode ? ` (${invoice.job.jobCode})` : ''}`);
      doc.text(`Status: ${String(invoice.status).replace(/_/g, ' ')}`);
      doc.text(
        `Issued: ${invoice.issuedAt ? invoice.issuedAt.toLocaleDateString() : 'Draft pending issue'}`
      );
      doc.text(`Due: ${invoice.dueDate ? invoice.dueDate.toLocaleDateString() : 'On receipt'}`);
      doc.moveDown(1);

      doc.fontSize(11).fillColor('#0f172a').text('Invoice lines', { underline: true });
      doc.moveDown(0.5);

      invoice.lines.forEach((line) => {
        doc
          .fontSize(10)
          .fillColor('#0f172a')
          .text(
            `${line.description}  x${Number(line.quantity || 0).toFixed(2)} @ ${roundCurrency(
              Number(line.unitPrice || 0)
            ).toLocaleString()}`
          );
        doc
          .fontSize(10)
          .fillColor('#475569')
          .text(`${invoice.currency} ${roundCurrency(Number(line.lineAmount || 0)).toLocaleString()}`, {
            align: 'right',
          });
        doc.moveDown(0.35);
      });

      doc.moveDown(1);
      doc.fontSize(11).fillColor('#0f172a').text(`Subtotal: ${invoice.currency} ${roundCurrency(Number(invoice.subtotalAmount || 0)).toLocaleString()}`, { align: 'right' });
      doc.fontSize(11).fillColor('#0f172a').text(`Tax: ${invoice.currency} ${roundCurrency(Number(invoice.taxAmount || 0)).toLocaleString()}`, { align: 'right' });
      doc.fontSize(13).fillColor('#0f172a').text(`Total: ${invoice.currency} ${roundCurrency(Number(invoice.totalAmount || 0)).toLocaleString()}`, { align: 'right' });
      doc.moveDown(1.5);
      doc.fontSize(9).fillColor('#64748b').text(footer, {
        align: 'left',
      });
    });

    const fileName = `${invoice.invoiceNumber}.pdf`;
    const stored = await writeGeneratedDocumentFile(fileName, pdfBuffer);

    let documentId = invoice.document?.id ?? null;
    if (documentId) {
      await tx.document.update({
        where: { id: documentId },
        data: {
          fileName: stored.storedName,
          filePath: stored.publicPath,
          fileSize: pdfBuffer.length,
          mimeType: 'application/pdf',
          documentType: 'job_invoice',
          entityType: 'job_invoice',
          entityId: invoice.id,
          description: `Generated invoice ${invoice.invoiceNumber}`,
        },
      });
    } else {
      const createdDocument = await tx.document.create({
        data: {
          fileName: stored.storedName,
          filePath: stored.publicPath,
          fileSize: pdfBuffer.length,
          mimeType: 'application/pdf',
          documentType: 'job_invoice',
          entityType: 'job_invoice',
          entityId: invoice.id,
          description: `Generated invoice ${invoice.invoiceNumber}`,
        },
      });
      documentId = createdDocument.id;
    }

    await tx.jobInvoice.update({
      where: { id: invoice.id },
      data: {
        documentId,
        generatedAt: new Date(),
      },
    });

    return documentId;
  }

  private async createMilestoneTasksForJob(
    jobId: number,
    milestones: NormalizedJobMilestone[],
    defaultAssigneeProfileId?: number | null,
    dbClient: any = prisma
  ) {
    if (!milestones.length) return;

    await dbClient.task.createMany({
      data: milestones.map((milestone) => ({
        jobId,
        title: milestone.title,
        description: this.buildMilestoneTaskDescription(milestone),
        assignedToProfileId: milestone.assignedToProfileId ?? defaultAssigneeProfileId ?? null,
        estimatedHours: null,
        billable: false,
        status: 'pending',
        priority: 'medium',
        dueDate: milestone.dueDate ?? null,
      })),
    });
  }

  private async syncMilestoneTasksForJob(
    jobId: number,
    milestones: NormalizedJobMilestone[],
    defaultAssigneeProfileId?: number | null,
    dbClient: any = prisma
  ) {
    const existingTasks = await dbClient.task.findMany({
      where: {
        jobId,
        description: { startsWith: JOB_MILESTONE_META_PREFIX },
      },
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        dueDate: true,
        assignedToProfileId: true,
      },
    });

    const existingMilestones = existingTasks
      .map((task: any) => {
        const parsed = this.parseMilestoneTask(task);
        if (!parsed) return null;
        return { task, parsed };
      })
      .filter((item: any): item is { task: any; parsed: ReturnType<JobService["parseMilestoneTask"]> } => Boolean(item));

    const existingByPercent = new Map<number, { task: any; parsed: any }>();
    existingMilestones.forEach((item: { task: any; parsed: any }) => {
      if (!existingByPercent.has(item.parsed.targetPercent)) {
        existingByPercent.set(item.parsed.targetPercent, item);
      }
    });

    const nextPercents = new Set(milestones.map((milestone) => milestone.targetPercent));
    const removedMilestones = existingMilestones.filter(
      (item: { task: any; parsed: any }) => !nextPercents.has(item.parsed.targetPercent)
    );

    const blockedRemoval = removedMilestones.find(
      (item: { task: any; parsed: any }) => item.task.status !== 'pending'
    );
    if (blockedRemoval) {
      throw new Error(
        `Cannot remove milestone "${blockedRemoval.task.title}" after execution has started on it.`
      );
    }

    if (removedMilestones.length > 0) {
      await dbClient.task.deleteMany({
        where: {
          id: { in: removedMilestones.map((item: { task: any; parsed: any }) => item.task.id) },
        },
      });
    }

    for (const milestone of milestones) {
      const nextAssignee = milestone.assignedToProfileId ?? defaultAssigneeProfileId ?? null;
      const nextDescription = this.buildMilestoneTaskDescription(milestone);
      const existing = existingByPercent.get(milestone.targetPercent);

      if (!existing) {
        await dbClient.task.create({
          data: {
            jobId,
            title: milestone.title,
            description: nextDescription,
            assignedToProfileId: nextAssignee,
            estimatedHours: null,
            billable: false,
            status: 'pending',
            priority: 'medium',
            dueDate: milestone.dueDate ?? null,
          },
        });
        continue;
      }

      const existingDueDate = existing.task.dueDate
        ? new Date(existing.task.dueDate).toISOString().slice(0, 10)
        : null;
      const nextDueDate = milestone.dueDate
        ? new Date(milestone.dueDate).toISOString().slice(0, 10)
        : null;
      const hasStructuralChange =
        existing.task.title !== milestone.title ||
        String(existing.task.description || '') !== nextDescription ||
        existingDueDate !== nextDueDate ||
        (existing.task.assignedToProfileId ?? null) !== nextAssignee;

      if (existing.task.status !== 'pending' && hasStructuralChange) {
        throw new Error(
          `Cannot change milestone "${existing.task.title}" after work has started on it.`
        );
      }

      await dbClient.task.update({
        where: { id: existing.task.id },
        data: {
          title: milestone.title,
          description: nextDescription,
          assignedToProfileId: nextAssignee,
          dueDate: milestone.dueDate ?? null,
        },
      });
    }
  }

  private async notifyInvoiceReadyForMilestone(
    jobId: number,
    milestone: JobInvoiceMilestoneTrackingItem,
    authContext?: AuthContext
  ) {
    const alreadyNotified = await prisma.statusTransition.findFirst({
      where: {
        entityType: 'JobInvoiceMilestone',
        entityId: milestone.taskId,
        toStatus: 'ready_notified',
      },
      select: { id: true },
    });

    if (alreadyNotified) {
      return;
    }

    const job = await prisma.job.findUnique({
      where: { id: jobId },
      select: {
        id: true,
        jobName: true,
        jobCode: true,
        managerProfileId: true,
        partnerProfileId: true,
      },
    });

    if (!job) {
      return;
    }

    const financeProfiles = await prisma.profile.findMany({
      where: {
        user: {
          roles: {
            some: {
              role: { name: { in: ['finance', 'finance_manager'] } },
            },
          },
        },
      },
      select: { id: true },
    });

    const recipients = new Set<number>();
    financeProfiles.forEach((profile) => recipients.add(profile.id));
    if (job.managerProfileId) recipients.add(job.managerProfileId);
    if (job.partnerProfileId) recipients.add(job.partnerProfileId);

    const invoiceAmount = roundCurrency(milestone.milestoneAmount);
    const changedByProfileId =
      authContext?.profileId && authContext.profileId > 0
        ? authContext.profileId
        : job.managerProfileId ?? null;
    const notificationMessage = [
      `Milestone ${milestone.targetPercent}% is complete for "${job.jobName}".`,
      `Invoice ${milestone.invoiceNumberSuggestion} is ready for issuance.`,
      `Amount due: KES ${invoiceAmount.toLocaleString()}.`,
    ].join(' ');

    await Promise.all(
      Array.from(recipients).map((recipientProfileId) =>
        NotificationService.createNotification(
          {
            recipientProfileId,
            type: 'action',
            title: `Invoice milestone ready: ${job.jobCode || job.jobName}`,
            message: notificationMessage,
            actionRequired: true,
            jobId: job.id,
            link: `/finance-collections`,
          },
          {
            userId: authContext?.userId ?? 0,
            profileId: changedByProfileId ?? 0,
            roleName: authContext?.roles?.[0] ?? 'system',
          }
        )
      )
    );

    await prisma.statusTransition.create({
      data: {
        entityType: 'JobInvoiceMilestone',
        entityId: milestone.taskId,
        jobId: job.id,
        fromStatus: 'condition_completed',
        toStatus: 'ready_notified',
        changedByProfileId,
        reason: 'Invoice readiness notification sent automatically',
        metadata: {
          targetPercent: milestone.targetPercent,
          milestoneAmount: invoiceAmount,
          expectedCumulativeAmount: milestone.expectedCumulativeAmount,
          invoiceNumberSuggestion: milestone.invoiceNumberSuggestion,
        },
      },
    });
  }

  private async completeFinalMilestoneOnJobCompletion(
    jobId: number,
    authContext?: AuthContext
  ) {
    const tracking = await this.getJobInvoiceMilestoneTracking(jobId);
    if (!tracking.milestones.length) {
      return;
    }

    const finalMilestone = tracking.milestones.reduce((latest, current) => {
      if (!latest) return current;
      if (current.targetPercent > latest.targetPercent) return current;
      return latest;
    }, null as JobInvoiceMilestoneTrackingItem | null);

    if (!finalMilestone || finalMilestone.conditionCompleted) {
      return;
    }

    await prisma.task.update({
      where: { id: finalMilestone.taskId },
      data: { status: 'completed' },
    });

    const refreshed = await this.getJobInvoiceMilestoneTracking(jobId);
    const refreshedFinal = refreshed.milestones.find(
      (milestone) => milestone.taskId === finalMilestone.taskId
    );

    if (refreshedFinal?.readyForInvoice) {
      await this.notifyInvoiceReadyForMilestone(jobId, refreshedFinal, authContext);
    }
  }

  private buildNotificationAuth(authContext?: AuthContext) {
    return {
      userId: authContext?.userId ?? 0,
      profileId: authContext?.profileId ?? 0,
      roleName: authContext?.roles?.[0] ?? "system",
    };
  }

  private async notifyJobCreatedEvent(
    job: {
      id: number;
      jobName: string;
      clientId?: number | null;
      departmentId?: number | null;
      managerProfileId?: number | null;
      partnerProfileId?: number | null;
      client?: { clientName?: string | null } | null;
    },
    authContext: AuthContext
  ) {
    await NotificationService.dispatchEvent(
      {
        eventType: "job.created",
        type: "action",
        priority: "high",
        title: `Job created: ${job.jobName}`,
        message: `A new job has been created for ${job.client?.clientName || "a client"}.`,
        actionRequired: true,
        canonicalRoute: `/jobs/${job.id}`,
        actions: [
          {
            id: "view_job",
            label: "View job",
            endpoint: `/jobs/${job.id}`,
            method: "GET",
          },
        ],
        requiredPermission: "module.jobs.read",
        targetEntityType: "Job",
        targetEntityId: job.id,
        jobId: job.id,
        clientId: job.clientId ?? undefined,
        ownerProfileIds: [job.managerProfileId, job.partnerProfileId],
        rolePolicies: [
          {
            roles: ["finance", "finance_manager"],
            departmentId: job.departmentId ?? undefined,
            fallbackRoles: ["finance", "finance_manager"],
          },
          { roles: ["gmp"] },
          { roles: ["marketing"] },
        ],
        eventId: `job.created:${job.id}`,
        deduplicationKey: `job.created:${job.id}`,
      },
      this.buildNotificationAuth(authContext)
    );
  }

  private async notifyManagerSetupRequired(
    job: {
      id: number;
      jobName: string;
      clientId?: number | null;
      managerProfileId?: number | null;
    },
    authContext: AuthContext
  ) {
    if (!job.managerProfileId) {
      return;
    }

    const setupRoute = this.buildTrackingPath(job.id);

    await NotificationService.createNotification(
      {
        recipientProfileId: job.managerProfileId,
        type: 'action',
        title: `Manager setup required: ${job.jobName}`,
        message:
          `HR completed the initial setup for "${job.jobName}". ` +
          'Complete costing and milestones before the team starts work.',
        actionRequired: true,
        jobId: job.id,
        clientId: job.clientId ?? undefined,
        link: setupRoute,
        eventType: 'job.manager_setup_required',
        priority: 'high',
        targetEntityType: 'Job',
        targetEntityId: job.id,
        canonicalRoute: setupRoute,
        actions: [
          {
            id: 'complete_job_setup',
            label: 'Complete setup',
            endpoint: setupRoute,
            method: 'GET',
          },
        ],
        requiredPermission: 'module.jobs.read',
        eventId: `job.manager_setup_required:${job.id}`,
        deduplicationKey: `job.manager_setup_required:${job.id}`,
      },
      this.buildNotificationAuth(authContext)
    );
  }

  private async notifyJobCompletedEvent(
    job: {
      id: number;
      jobName: string;
      clientId?: number | null;
      departmentId?: number | null;
      managerProfileId?: number | null;
      partnerProfileId?: number | null;
      client?: { clientName?: string | null } | null;
    },
    authContext?: AuthContext
  ) {
    const staffAssignments = await prisma.jobStaffAssignment.findMany({
      where: { jobId: job.id },
      select: { employeeProfileId: true },
    });

    await NotificationService.dispatchEvent(
      {
        eventType: "job.completed",
        type: "info",
        priority: "medium",
        title: `Job completed: ${job.jobName}`,
        message: `Job "${job.jobName}" has been marked complete.`,
        actionRequired: false,
        canonicalRoute: `/jobs/${job.id}`,
        actions: [
          {
            id: "view_job_summary",
            label: "View summary",
            endpoint: `/jobs/${job.id}`,
            method: "GET",
          },
        ],
        requiredPermission: "module.jobs.read",
        targetEntityType: "Job",
        targetEntityId: job.id,
        jobId: job.id,
        clientId: job.clientId ?? undefined,
        ownerProfileIds: [job.managerProfileId, job.partnerProfileId],
        recipientProfileIds: staffAssignments.map((item) => item.employeeProfileId),
        rolePolicies: [
          {
            roles: ["finance", "finance_manager"],
            departmentId: job.departmentId ?? undefined,
            fallbackRoles: ["finance", "finance_manager"],
          },
          { roles: ["gmp"] },
          { roles: ["marketing"] },
        ],
        eventId: `job.completed:${job.id}`,
        deduplicationKey: `job.completed:${job.id}`,
      },
      this.buildNotificationAuth(authContext)
    );
  }

  /**
   * Create a new job
   * 
   * Access: Manager (creates their own), Partner (assigned to partner), Admin
   */
  async createJob(input: JobCreateInput, authContext: AuthContext) {
    // Authorization: manager creating their own job, or admin
    const isAdmin = authContext.roles?.includes('super_admin');
    const isHr = authContext.roles?.includes('hr');
    const normalizedMilestones = this.normalizeMilestonesInput(input.milestones);

    if (!isAdmin && !isHr) {
      throw new Error('Not authorized to create jobs');
    }

    if (!input.engagementLetterId) {
      throw new Error('Engagement letter is required for job creation');
    }

    let resolvedClientId = input.clientId;

    const engagementLetter = await prisma.engagementLetter.findUnique({
      where: { id: input.engagementLetterId },
      select: {
        id: true,
        status: true,
        clientId: true,
        documentId: true,
        feeAmount: true,
        currency: true,
        jobTitle: true,
        engagementType: true,
        uploadedByProfileId: true,
        uploadedBy: {
          select: {
            positionTitle: true,
            role: { select: { name: true } },
            user: {
              select: {
                roles: {
                  select: {
                    role: { select: { name: true } },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!engagementLetter) {
      throw new Error('Engagement letter not found');
    }

    if (engagementLetter.status !== 'approved') {
      throw new Error('Engagement letter must be approved before job creation');
    }

    if (resolvedClientId && resolvedClientId !== engagementLetter.clientId) {
      throw new Error('Engagement letter does not match clientId');
    }

    if (!engagementLetter.feeAmount) {
      throw new Error('Engagement letter must include a fee amount');
    }

    if (!engagementLetter.documentId) {
      throw new Error('Engagement letter must have an uploaded signed document before job creation');
    }

    this.assertMarketingSubmittedEngagementLetter(engagementLetter);

    const onboarding = await prisma.clientOnboarding.findFirst({
      where: { engagementLetterId: engagementLetter.id },
      select: { id: true, status: true, jobId: true },
    });

    if (!onboarding) {
      throw new Error('Client onboarding is required before job creation');
    }

    if (!['approved', 'client_created'].includes(onboarding.status)) {
      throw new Error('Client onboarding must be approved before job creation');
    }

    if (onboarding.jobId) {
      throw new Error('Job already created for this engagement letter');
    }

    resolvedClientId = engagementLetter.clientId;

    const billingType = 'fixed_fee';
    const fixedFeeAmount = Number(engagementLetter.feeAmount);

    const job = await prisma.job.create({
      data: {
        jobName: input.jobName,
        description: input.description,
        clientId: resolvedClientId,
        departmentId: input.departmentId,
        partnerProfileId: input.partnerProfileId,
        managerProfileId: input.managerProfileId,
        billingType,
        fixedFeeAmount,
        currency: engagementLetter.currency || 'KES',
        budgetHours: input.budgetHours || 0,
        engagementLetterId: input.engagementLetterId,
        startDate: coerceDate(input.startDate),
        dueDate: coerceDate(input.dueDate),
        priority: input.priority || 'medium',
        status: 'planned',
      },
      include: {
        client: { select: { id: true, clientName: true } },
        manager: { select: { id: true, firstName: true, lastName: true } },
        partner: { select: { id: true, firstName: true, lastName: true } },
        department: { select: { id: true, name: true } },
      },
    });

    if (input.engagementLetterId) {
      await prisma.clientOnboarding.updateMany({
        where: { engagementLetterId: input.engagementLetterId },
        data: {
          jobId: job.id,
          status: 'job_created',
        },
      });
    }

    await this.createMilestoneTasksForJob(
      job.id,
      normalizedMilestones,
      job.managerProfileId ?? null
    );

    await this.notifyJobCreatedEvent(job, authContext);

    return job;
  }

  /**
   * Create a new job from a client onboarding record (HR queue)
   */
  async createJobFromOnboarding(
    clientOnboardingId: number,
    input: JobCreateFromOnboardingInput,
    authContext: AuthContext
  ) {
    const normalizedMilestones = this.normalizeMilestonesInput(input.milestones);
    const isAdmin = authContext.roles?.includes('super_admin');
    const isHr = authContext.roles?.includes('hr');

    if (!isAdmin && !isHr) {
      throw new Error('Not authorized to create jobs from onboarding');
    }

    const onboarding = await prisma.clientOnboarding.findUnique({
      where: { id: clientOnboardingId },
      include: {
        engagementLetter: {
          select: {
            id: true,
            status: true,
            clientId: true,
            documentId: true,
            feeAmount: true,
            currency: true,
            jobTitle: true,
            startDate: true,
            endDate: true,
            uploadedByProfileId: true,
            uploadedBy: {
              select: {
                positionTitle: true,
                role: { select: { name: true } },
                user: {
                  select: {
                    roles: {
                      select: {
                        role: { select: { name: true } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        client: { select: { id: true, clientName: true } },
        department: { select: { id: true, name: true } },
      },
    });

    if (!onboarding) {
      throw new Error('Client onboarding not found');
    }

    if (onboarding.jobId) {
      throw new Error('Job already created for this onboarding');
    }

    if (!['approved', 'client_created'].includes(onboarding.status)) {
      throw new Error('Client onboarding must be approved before job creation');
    }

    const engagementLetter = onboarding.engagementLetter;
    if (!engagementLetter) {
      throw new Error('Engagement letter is required for job creation');
    }

    if (engagementLetter.status !== 'approved') {
      throw new Error('Engagement letter must be approved before job creation');
    }

    if (!engagementLetter.feeAmount) {
      throw new Error('Engagement letter must include a fee amount');
    }

    if (!engagementLetter.documentId) {
      throw new Error('Engagement letter must have an uploaded signed document before job creation');
    }

    this.assertMarketingSubmittedEngagementLetter(engagementLetter);

    const jobName = input.jobName?.trim() || engagementLetter.jobTitle?.trim();
    if (!jobName) {
      throw new Error('Job name is required');
    }

    const billingType = 'fixed_fee';
    const fixedFeeAmount = Number(engagementLetter.feeAmount);

    const job = await prisma.$transaction(async (tx) => {
      const created = await tx.job.create({
        data: {
          jobName,
          description: input.description,
          clientId: onboarding.clientId ?? engagementLetter.clientId,
          departmentId: input.departmentId ?? onboarding.departmentId,
          partnerProfileId: input.partnerProfileId,
          managerProfileId: input.managerProfileId,
          billingType,
          fixedFeeAmount,
          currency: engagementLetter.currency || 'KES',
          budgetHours: input.budgetHours || 0,
          engagementLetterId: engagementLetter.id,
          startDate: coerceDate(input.startDate) ?? engagementLetter.startDate ?? undefined,
          dueDate: coerceDate(input.dueDate) ?? engagementLetter.endDate ?? undefined,
          priority: input.priority || 'medium',
          status: 'planned',
        },
        include: {
          client: { select: { id: true, clientName: true } },
          manager: { select: { id: true, firstName: true, lastName: true } },
          partner: { select: { id: true, firstName: true, lastName: true } },
          department: { select: { id: true, name: true } },
        },
      });

      await tx.clientOnboarding.update({
        where: { id: onboarding.id },
        data: {
          jobId: created.id,
          status: 'job_created',
        },
      });

      await this.createMilestoneTasksForJob(
        created.id,
        normalizedMilestones,
        created.managerProfileId ?? null,
        tx
      );

      return created;
    });

    await this.notifyJobCreatedEvent(job, authContext);

    return job;
  }

  /**
   * List jobs with pagination & filtering
   * 
   * Access control:
   * - Admin: see all jobs
   * - Manager: see jobs they manage or are assigned to
   * - Partner: see jobs assigned to them
   * - Employee: see jobs they have staff assignments on
   */
  async listJobs(options: ListJobsOptions, authContext: AuthContext) {
    const { page, pageSize, filters = {}, sort = {} } = options;
    const skip = (page - 1) * pageSize;
    if (!Number.isFinite(authContext.profileId) || Number(authContext.profileId) <= 0) {
      throw { statusCode: 401, message: 'Profile is required for job access' };
    }
    const normalizeRole = (role?: string) =>
      String(role || '')
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, '_');
    const roleSet = new Set((authContext.roles || []).map((role) => normalizeRole(role)));
    const isAdmin =
      roleSet.has('super_admin') ||
      roleSet.has('hr') ||
      roleSet.has('gmp') ||
      roleSet.has('finance');

    // Build where clause based on access control
    let whereClause: any = {};

    if (!isAdmin) {
      const isManager = roleSet.has('manager');
      const isPartner = roleSet.has('partner');

      if (isManager || isPartner) {
        // Manager/Partner sees jobs where they are manager or partner
        whereClause.OR = [
          { managerProfileId: authContext.profileId },
          { partnerProfileId: authContext.profileId },
          // Also see jobs via staff assignments
          {
            staffing: {
              some: {
                employeeProfileId: authContext.profileId,
              },
            },
          },
        ];
      } else {
        // Regular employee only sees jobs they're assigned to
        whereClause.staffing = {
          some: {
            employeeProfileId: authContext.profileId,
          },
        };
      }
    }

    const appendAndCondition = (current: any, condition: any) => {
      if (!current || Object.keys(current).length === 0) return condition;
      if (current.AND) {
        return { ...current, AND: [...current.AND, condition] };
      }
      return { AND: [current, condition] };
    };

    // Apply filters
    if (filters.status) {
      const statuses = (Array.isArray(filters.status) ? filters.status : [filters.status])
        .map((value) => String(value || '').trim().toLowerCase())
        .filter(Boolean);
      const includeOverdue = statuses.includes('overdue');
      const concreteStatuses = statuses.filter((value) => value !== 'overdue');

      if (includeOverdue) {
        const overdueCondition = {
          dueDate: { lt: new Date() },
          status: { notIn: ['completed', 'cancelled'] },
        };

        if (concreteStatuses.length > 0) {
          whereClause = appendAndCondition(whereClause, {
            OR: [{ status: { in: concreteStatuses } }, overdueCondition],
          });
        } else {
          whereClause = appendAndCondition(whereClause, overdueCondition);
        }
      } else if (concreteStatuses.length > 0) {
        if (concreteStatuses.length === 1) {
          whereClause = appendAndCondition(whereClause, { status: concreteStatuses[0] });
        } else {
          whereClause = appendAndCondition(whereClause, { status: { in: concreteStatuses } });
        }
      }
    }
    if (filters.clientId) whereClause.clientId = filters.clientId;
    if (filters.departmentId) whereClause.departmentId = filters.departmentId;
    if (filters.partnerProfileId) whereClause.partnerProfileId = filters.partnerProfileId;
    if (filters.managerProfileId) whereClause.managerProfileId = filters.managerProfileId;
    if (filters.priority) whereClause.priority = String(filters.priority).toLowerCase();

    if (filters.dateFrom || filters.dateTo) {
      whereClause.startDate = {};
      if (filters.dateFrom) whereClause.startDate.gte = filters.dateFrom;
      if (filters.dateTo) whereClause.startDate.lte = filters.dateTo;
    }

    // Build orderBy
    const orderBy: any = {};
    if (sort.field) {
      orderBy[sort.field] = sort.order || 'asc';
    } else {
      orderBy.createdAt = 'desc';
    }

    const [jobs, total] = await Promise.all([
      prisma.job.findMany({
        where: whereClause,
        skip,
        take: pageSize,
        orderBy,
        include: {
          client: { select: { id: true, clientName: true } },
          manager: { select: { id: true, firstName: true, lastName: true } },
          partner: { select: { id: true, firstName: true, lastName: true } },
          department: { select: { id: true, name: true } },
          staffing: {
            include: {
              employee: { select: { id: true, firstName: true, lastName: true } },
              role: { select: { id: true, name: true } },
            },
          },
          jobCosting: {
            select: {
              id: true,
              jobFee: true,
              budgetCap: true,
              totalEstimatedCost: true,
              allocatedCost: true,
              remainingBudget: true,
            },
          },
          timeEntries: {
            select: {
              status: true,
              hours: true,
              billable: true,
              billableAmount: true,
              costAmount: true,
            },
          },
          payments: {
            select: {
              paymentAmount: true,
            },
          },
          requisitionRequests: {
            select: {
              status: true,
              amount: true,
            },
          },
          invoices: {
            select: {
              status: true,
              totalAmount: true,
              amountOutstanding: true,
              dueDate: true,
            },
          },
        },
      }),
      prisma.job.count({ where: whereClause }),
    ]);

    return {
      jobs: jobs.map((job) => {
        const activeTimeEntries = job.timeEntries.filter((entry) =>
          ['pending', 'submitted', 'approved'].includes(String(entry.status))
        );
        const approvedTimeEntries = job.timeEntries.filter(
          (entry) => String(entry.status) === 'approved'
        );
        const totalBillableHours = roundCurrency(
          activeTimeEntries
            .filter((entry) => entry.billable)
            .reduce((sum, entry) => sum + Number(entry.hours || 0), 0)
        );
        const approvedBilledAmount = roundCurrency(
          approvedTimeEntries.reduce((sum, entry) => sum + Number(entry.billableAmount || 0), 0)
        );
        const laborCostToDate = roundCurrency(
          activeTimeEntries.reduce((sum, entry) => sum + Number(entry.costAmount || 0), 0)
        );
        const approvedRequisitionCost = roundCurrency(
          job.requisitionRequests
            .filter((item) => String(item.status) === 'approved')
            .reduce((sum, item) => sum + Number(item.amount || 0), 0)
        );
        const costToDate = roundCurrency(laborCostToDate + approvedRequisitionCost);
        const expectedFeeAmount = this.resolveJobFeeForTracking(job as any);
        const collectedAmount = roundCurrency(
          job.payments.reduce((sum, payment) => sum + Number(payment.paymentAmount || 0), 0)
        );
        const outstandingAmount = roundCurrency(Math.max(0, expectedFeeAmount - collectedAmount));
        const profitToDate = roundCurrency(approvedBilledAmount - costToDate);
        const marginPercent =
          approvedBilledAmount > 0
            ? Number(((profitToDate / approvedBilledAmount) * 100).toFixed(2))
            : 0;
        const openInvoices = job.invoices.filter(
          (invoice) => invoice.status !== 'paid' && invoice.status !== 'void'
        );
        const nextInvoiceAmount = roundCurrency(
          Number(
            [...openInvoices].sort((left, right) => {
              const leftTime = left.dueDate ? new Date(left.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
              const rightTime = right.dueDate ? new Date(right.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
              return leftTime - rightTime;
            })[0]?.amountOutstanding || 0
          )
        );

        return {
          ...this.withDerivedOverdueStatus(job as any),
          trackingPath: this.buildTrackingPath(job.id),
          operationsMetrics: {
            billableHours: totalBillableHours,
            approvedBilledAmount,
            collectedAmount,
            outstandingAmount,
            costToDate,
            profitToDate,
            marginPercent,
            nextInvoiceAmount,
            overdueInvoiceCount: job.invoices.filter((invoice) => invoice.status === 'overdue').length,
          },
        };
      }),
      total,
    };
  }

  /**
   * Get single job with full details
   */
  async getJobById(jobId: number, include?: string[]) {
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      include: {
        client: { select: { id: true, clientName: true } },
        manager: { select: { id: true, firstName: true, lastName: true, user: { select: { email: true } } } },
        partner: { select: { id: true, firstName: true, lastName: true, user: { select: { email: true } } } },
        department: { select: { id: true, name: true } },
        staffing: include?.includes('staffing') ? {
          include: {
            employee: { select: { id: true, firstName: true, lastName: true, user: { select: { email: true } } } },
            role: { select: { id: true, name: true } },
          },
        } : false,
        jobCosting: include?.includes('costing'),
        timeEntries: include?.includes('timeEntries') ? {
          select: {
            id: true,
            hours: true,
            billable: true,
            status: true,
            dateWorked: true,
            employeeProfileId: true,
          },
        } : false,
        tasks: include?.includes('tasks'),
        engagementLetter: {
          select: {
            id: true,
            jobTitle: true,
            status: true,
            document: { select: { id: true, fileName: true, filePath: true } },
          },
        },
      } as any,
    });

    if (!job) {
      throw { statusCode: 404, message: 'Job not found' };
    }

    return this.withDerivedOverdueStatus(job as any);
  }

  async getJobInvoiceMilestoneTracking(
    jobId: number
  ): Promise<JobInvoiceMilestoneTrackingSummary> {
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      select: {
        id: true,
        jobCode: true,
        jobName: true,
        billingType: true,
        fixedFeeAmount: true,
        jobCosting: {
          select: { jobFee: true },
        },
        payments: {
          select: { paymentAmount: true },
        },
        tasks: {
          select: {
            id: true,
            title: true,
            description: true,
            assignedToProfileId: true,
            status: true,
            dueDate: true,
          },
        },
      },
    });

    if (!job) {
      throw new Error('Job not found');
    }

    const linkedInvoices = (
      await prisma.jobInvoice.findMany({
        where: {
          jobId,
          status: { not: 'void' },
        },
        include: {
          milestoneTask: { select: { id: true, title: true } },
          document: { select: { id: true, fileName: true, filePath: true } },
          lines: {
            orderBy: { sortOrder: 'asc' },
          },
          paymentApplications: {
            include: {
              clientPayment: {
                select: {
                  id: true,
                  paymentDate: true,
                  referenceNumber: true,
                },
              },
            },
            orderBy: { appliedAt: 'asc' },
          },
        },
        orderBy: [{ createdAt: 'desc' }],
      })
    ).map((invoice) => this.serializeJobInvoice(invoice));

    const invoiceByMilestone = new Map<number, JobInvoiceSummaryItem>();
    linkedInvoices.forEach((invoice) => {
      if (invoice.milestoneTaskId) {
        invoiceByMilestone.set(invoice.milestoneTaskId, invoice);
      }
    });

    const parsedMilestones = job.tasks
      .map((task) => this.parseMilestoneTask(task as any))
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .sort((a, b) => {
        if (a.targetPercent === b.targetPercent) {
          if (a.orderIndex === b.orderIndex) {
            return a.taskId - b.taskId;
          }
          return a.orderIndex - b.orderIndex;
        }
        return a.targetPercent - b.targetPercent;
      });

    const feeAmount = this.resolveJobFeeForTracking(job as any);
    const collectedAmount = roundCurrency(
      job.payments.reduce(
        (sum, payment) => sum + Number(payment.paymentAmount || 0),
        0
      )
    );

    let previousExpected = 0;
    const milestones: JobInvoiceMilestoneTrackingItem[] = parsedMilestones.map(
      (milestone, index) => {
        const linkedInvoice = invoiceByMilestone.get(milestone.taskId) || null;
        const expectedCumulativeAmount = roundCurrency(
          (feeAmount * milestone.targetPercent) / 100
        );
        const milestoneAmount = roundCurrency(
          Math.max(0, expectedCumulativeAmount - previousExpected)
        );
        const milestonePaid = collectedAmount + 0.0001 >= expectedCumulativeAmount;
        const previousMilestonesPaid =
          index === 0 || collectedAmount + 0.0001 >= previousExpected;
        const readyForInvoice =
          milestone.conditionCompleted &&
          !milestonePaid &&
          !linkedInvoice &&
          previousMilestonesPaid;
        const amountRemainingToMilestone = roundCurrency(
          Math.max(0, expectedCumulativeAmount - collectedAmount)
        );

        const item: JobInvoiceMilestoneTrackingItem = {
          taskId: milestone.taskId,
          title: milestone.title,
          targetPercent: milestone.targetPercent,
          dueDate: milestone.dueDate ?? null,
          requirements: milestone.requirements || null,
          assignedToProfileId: milestone.assignedToProfileId ?? null,
          conditionStatus: milestone.conditionStatus,
          conditionCompleted: milestone.conditionCompleted,
          milestoneAmount,
          expectedCumulativeAmount,
          amountRemainingToMilestone,
          milestonePaid,
          readyForInvoice,
          invoiceNumberSuggestion: this.buildInvoiceNumberSuggestion(
            job.jobCode,
            job.id,
            milestone.targetPercent
          ),
          linkedInvoice,
        };

        previousExpected = expectedCumulativeAmount;
        return item;
      }
    );

    const completedConditionCount = milestones.filter(
      (milestone) => milestone.conditionCompleted
    ).length;
    const nextReadyMilestone =
      milestones.find((milestone) => milestone.readyForInvoice) || null;
    const outstandingAmount = roundCurrency(Math.max(0, feeAmount - collectedAmount));

    return {
      jobId: job.id,
      jobCode: job.jobCode,
      jobName: job.jobName,
      feeAmount,
      collectedAmount,
      outstandingAmount,
      milestoneCount: milestones.length,
      completedConditionCount,
      nextReadyMilestone,
      milestones,
    };
  }

  async getJobCommercialSummary(jobId: number): Promise<JobCommercialSummary> {
    const [tracking, invoices] = await Promise.all([
      this.getJobInvoiceMilestoneTracking(jobId),
      this.listJobInvoices(jobId),
    ]);

    return {
      totals: {
        expectedFeeAmount: tracking.feeAmount,
        approvedBilledAmount: 0,
        collectedAmount: tracking.collectedAmount,
        outstandingAmount: tracking.outstandingAmount,
        costToDate: 0,
        profitToDate: 0,
        marginPercent: 0,
        invoiceCount: invoices.length,
        overdueInvoiceCount: invoices.filter((invoice) => invoice.status === 'overdue').length,
      },
      invoices,
    };
  }

  async listJobInvoices(jobId: number): Promise<JobInvoiceSummaryItem[]> {
    const invoices = await prisma.jobInvoice.findMany({
      where: { jobId },
      include: {
        milestoneTask: { select: { id: true, title: true } },
        document: { select: { id: true, fileName: true, filePath: true } },
        lines: {
          orderBy: { sortOrder: 'asc' },
        },
        paymentApplications: {
          include: {
            clientPayment: {
              select: {
                id: true,
                paymentDate: true,
                referenceNumber: true,
              },
            },
          },
          orderBy: { appliedAt: 'asc' },
        },
      },
      orderBy: [{ createdAt: 'desc' }],
    });

    return invoices.map((invoice) => this.serializeJobInvoice(invoice));
  }

  async createJobInvoiceDraftForMilestone(
    jobId: number,
    milestoneTaskId: number,
    authContext?: AuthContext
  ): Promise<JobInvoiceSummaryItem> {
    if (authContext) {
      const roleSet = this.roleSet(authContext.roles);
      const accessJob = await prisma.job.findUnique({
        where: { id: jobId },
        select: {
          managerProfileId: true,
          partnerProfileId: true,
        },
      });

      const isAuthorized =
        roleSet.has('super_admin') ||
        roleSet.has('hr') ||
        roleSet.has('gmp') ||
        roleSet.has('finance') ||
        accessJob?.managerProfileId === authContext.profileId ||
        accessJob?.partnerProfileId === authContext.profileId;

      if (!isAuthorized) {
        throw new Error('Not authorized to generate an invoice for this job');
      }
    }

    const tracking = await this.getJobInvoiceMilestoneTracking(jobId);
    const milestone = tracking.milestones.find((item) => item.taskId === milestoneTaskId);

    if (!milestone) {
      throw new Error('Milestone not found for this job');
    }

    if (!milestone.conditionCompleted) {
      throw new Error('Milestone condition must be completed before generating an invoice');
    }

    if (milestone.milestonePaid) {
      throw new Error('This milestone is already fully paid');
    }

    if (milestone.linkedInvoice && milestone.linkedInvoice.status !== 'void') {
      return milestone.linkedInvoice;
    }

    const generatedInvoice = await prisma.$transaction(async (tx) => {
      const existing = await tx.jobInvoice.findFirst({
        where: {
          jobId,
          milestoneTaskId,
          status: { not: 'void' },
        },
        include: {
          milestoneTask: { select: { id: true, title: true } },
          document: { select: { id: true, fileName: true, filePath: true } },
          lines: {
            orderBy: { sortOrder: 'asc' },
          },
          paymentApplications: {
            include: {
              clientPayment: {
                select: {
                  id: true,
                  paymentDate: true,
                  referenceNumber: true,
                },
              },
            },
            orderBy: { appliedAt: 'asc' },
          },
        },
      });

      if (existing) {
        return existing;
      }

      const job = await tx.job.findUnique({
        where: { id: jobId },
        select: {
          id: true,
          clientId: true,
          jobName: true,
          jobCode: true,
          currency: true,
        },
      });

      if (!job?.clientId) {
        throw new Error('A client-linked job is required before generating an invoice');
      }

      const template = await this.ensureDefaultJobInvoiceTemplate(
        tx,
        authContext?.profileId ?? null
      );
      const issueDueDate = milestone.dueDate
        ? new Date(milestone.dueDate)
        : new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

      const invoice = await tx.jobInvoice.create({
        data: {
          jobId,
          clientId: job.clientId,
          milestoneTaskId,
          jobInvoiceTemplateId: template.id,
          generatedByProfileId: authContext?.profileId ?? null,
          invoiceNumber: milestone.invoiceNumberSuggestion,
          title: `${job.jobName} - ${milestone.targetPercent}% milestone invoice`,
          description: milestone.requirements || `Billing milestone at ${milestone.targetPercent}%`,
          status: 'draft',
          currency: job.currency || 'KES',
          expectedPercent: milestone.targetPercent,
          subtotalAmount: milestone.milestoneAmount,
          totalAmount: milestone.milestoneAmount,
          amountOutstanding: milestone.milestoneAmount,
          dueDate: issueDueDate,
          notes: milestone.requirements || null,
        },
      });

      await tx.jobInvoiceLine.create({
        data: {
          jobInvoiceId: invoice.id,
          lineType: 'milestone_fee',
          description: `${milestone.targetPercent}% milestone billing - ${milestone.title}`,
          quantity: new Prisma.Decimal(1),
          unitPrice: new Prisma.Decimal(milestone.milestoneAmount),
          lineAmount: new Prisma.Decimal(milestone.milestoneAmount),
          sortOrder: 1,
          metadata: {
            milestoneTaskId,
            targetPercent: milestone.targetPercent,
          },
        },
      });

      await tx.jobInvoiceStatusHistory.create({
        data: {
          jobInvoiceId: invoice.id,
          fromStatus: null,
          toStatus: 'draft',
          changedByProfileId: authContext?.profileId ?? null,
          notes: 'Draft invoice auto-generated from completed billing milestone.',
        },
      });

      return tx.jobInvoice.findUniqueOrThrow({
        where: { id: invoice.id },
        include: {
          milestoneTask: { select: { id: true, title: true } },
          document: { select: { id: true, fileName: true, filePath: true } },
          lines: {
            orderBy: { sortOrder: 'asc' },
          },
          paymentApplications: {
            include: {
              clientPayment: {
                select: {
                  id: true,
                  paymentDate: true,
                  referenceNumber: true,
                },
              },
            },
            orderBy: { appliedAt: 'asc' },
          },
        },
      });
    });

    return this.serializeJobInvoice(generatedInvoice);
  }

  async issueJobInvoice(
    jobId: number,
    invoiceId: number,
    authContext: AuthContext
  ): Promise<JobInvoiceSummaryItem> {
    const roleSet = this.roleSet(authContext.roles);
    const invoice = await prisma.jobInvoice.findFirst({
      where: { id: invoiceId, jobId },
      select: {
        id: true,
        status: true,
        issuedAt: true,
        dueDate: true,
        amountPaid: true,
        totalAmount: true,
        job: {
          select: {
            managerProfileId: true,
            partnerProfileId: true,
          },
        },
      },
    });

    if (!invoice) {
      throw new Error('Invoice not found for this job');
    }

    const isFinance =
      roleSet.has('finance') ||
      roleSet.has('super_admin') ||
      roleSet.has('hr') ||
      roleSet.has('gmp');
    const isJobOwner =
      invoice.job.managerProfileId === authContext.profileId ||
      invoice.job.partnerProfileId === authContext.profileId;

    if (!isFinance && !isJobOwner) {
      throw new Error('Not authorized to issue this invoice');
    }

    const updatedInvoice = await prisma.$transaction(async (tx) => {
      const nextStatus = this.resolveJobInvoiceStatus({
        currentStatus: invoice.status,
        totalAmount: Number(invoice.totalAmount || 0),
        amountPaid: Number(invoice.amountPaid || 0),
        dueDate: invoice.dueDate,
        issuedAt: new Date(),
      });

      await tx.jobInvoice.update({
        where: { id: invoiceId },
        data: {
          issuedByProfileId: authContext.profileId,
          issuedAt: new Date(),
          status: nextStatus,
        },
      });

      await tx.jobInvoiceStatusHistory.create({
        data: {
          jobInvoiceId: invoiceId,
          fromStatus: invoice.status,
          toStatus: nextStatus,
          changedByProfileId: authContext.profileId,
          notes: 'Invoice issued for client billing.',
        },
      });

      await this.generateJobInvoiceDocument(tx, invoiceId);
      return this.syncJobInvoicePaymentState(tx, invoiceId);
    });

    return this.serializeJobInvoice(updatedInvoice);
  }

  async applyClientPaymentToInvoice(
    tx: Prisma.TransactionClient,
    input: {
      invoiceId: number;
      clientPaymentId: number;
      appliedAmount: number;
      appliedByProfileId?: number | null;
      notes?: string | null;
    }
  ) {
    if (input.appliedAmount <= 0) {
      return null;
    }

    await tx.jobInvoicePaymentApplication.upsert({
      where: {
        jobInvoiceId_clientPaymentId: {
          jobInvoiceId: input.invoiceId,
          clientPaymentId: input.clientPaymentId,
        },
      },
      update: {
        appliedAmount: input.appliedAmount,
        appliedAt: new Date(),
        appliedByProfileId: input.appliedByProfileId ?? null,
        notes: input.notes ?? null,
      },
      create: {
        jobInvoiceId: input.invoiceId,
        clientPaymentId: input.clientPaymentId,
        appliedAmount: input.appliedAmount,
        appliedByProfileId: input.appliedByProfileId ?? null,
        notes: input.notes ?? null,
      },
    });

    return this.syncJobInvoicePaymentState(tx, input.invoiceId);
  }

  async notifyNextReadyInvoiceMilestone(jobId: number, authContext?: AuthContext) {
    const tracking = await this.getJobInvoiceMilestoneTracking(jobId);
    if (tracking.nextReadyMilestone) {
      await this.createJobInvoiceDraftForMilestone(
        jobId,
        tracking.nextReadyMilestone.taskId,
        authContext
      );
      await this.notifyInvoiceReadyForMilestone(
        jobId,
        tracking.nextReadyMilestone,
        authContext
      );
    }
    return tracking;
  }

  async updateInvoiceMilestoneStatus(
    jobId: number,
    milestoneTaskId: number,
    status: TaskStatus,
    authContext: AuthContext
  ) {
    const job = await this.getJobById(jobId);

    const roleSet = new Set((authContext.roles || []).map((role) => role.toLowerCase()));
    const isAdmin =
      roleSet.has('super_admin') ||
      roleSet.has('hr') ||
      roleSet.has('gmp');
    const isJobManager = job.managerProfileId === authContext.profileId;
    const isPartner = job.partnerProfileId === authContext.profileId;

    if (!isAdmin && !isJobManager && !isPartner) {
      throw new Error('Not authorized to update invoice milestones for this job');
    }

    const allowedStatuses: TaskStatus[] = [
      'pending',
      'in_progress',
      'blocked',
      'completed',
      'cancelled',
    ];
    if (!allowedStatuses.includes(status)) {
      throw new Error(`Invalid milestone status: ${status}`);
    }

    const task = await prisma.task.findFirst({
      where: { id: milestoneTaskId, jobId },
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        dueDate: true,
      },
    });

    if (!task) {
      throw new Error('Milestone task not found for this job');
    }

    const parsed = this.parseMilestoneTask(task as any);
    if (!parsed) {
      throw new Error('Selected task is not a billing milestone');
    }

    const updatedTask = await prisma.task.update({
      where: { id: milestoneTaskId },
      data: { status },
      select: {
        id: true,
        jobId: true,
        title: true,
        description: true,
        status: true,
        dueDate: true,
        updatedAt: true,
      },
    });

    const tracking = await this.getJobInvoiceMilestoneTracking(jobId);
    const updatedMilestone = tracking.milestones.find(
      (milestone) => milestone.taskId === milestoneTaskId
    );

    if (status === 'completed' && updatedMilestone?.readyForInvoice) {
      await this.createJobInvoiceDraftForMilestone(jobId, milestoneTaskId, authContext);
      await this.notifyInvoiceReadyForMilestone(
        jobId,
        updatedMilestone,
        authContext
      );
    }

    return {
      milestoneTask: updatedTask,
      tracking,
    };
  }

  /**
   * Update job
   * 
   * Access: Manager (own jobs), Admin
   */
  async updateJob(jobId: number, input: JobUpdateInput, authContext: AuthContext) {
    const job = await this.getJobById(jobId);

    // Authorization: own job or admin
    const isAdmin = authContext.roles?.includes('super_admin');
    if (!isAdmin && job.managerProfileId !== authContext.profileId) {
      throw new Error('Not authorized to update this job');
    }

    if (input.status !== undefined) {
      // Keep status transitions inside updateJobStatus so workflow gates always run.
      throw {
        statusCode: 400,
        message: 'Use PATCH /jobs/:jobId/status to update status with workflow validation',
      };
    }

    const updated = await prisma.job.update({
      where: { id: jobId },
      data: input,
      include: {
        client: { select: { id: true, clientName: true } },
        manager: { select: { id: true, firstName: true, lastName: true } },
        partner: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    return updated;
  }

  /**
   * Update job status
   * 
   * Rules:
   * - planned → in_progress
   * - in_progress → on_hold, completed
   * - on_hold → in_progress, cancelled
   * - completed → (final state)
   */
  async updateJobStatus(
    jobId: number,
    status: JobStatus,
    reason?: string,
    authContext?: AuthContext,
    options?: {
      allowIncompleteTasksOverride?: boolean;
    }
  ) {
    const job = await this.getJobById(jobId, ['costing']);

    // Validate status transition
    const validTransitions: Record<JobStatus, JobStatus[]> = {
      planned: ['in_progress', 'cancelled'],
      in_progress: ['on_hold', 'completed', 'cancelled'],
      on_hold: ['in_progress', 'cancelled'],
      completed: [],
      cancelled: [],
    };

    const currentStatus = job.status as JobStatus;
    if (!validTransitions[currentStatus]?.includes(status)) {
      throw new Error(`Cannot transition from ${currentStatus} to ${status}`);
    }

    // Authorization
    const isAdmin = authContext?.roles?.includes('super_admin');
    const isJobManager = job.managerProfileId === authContext?.profileId;
    const isPartner = job.partnerProfileId === authContext?.profileId;

    if (!isAdmin && !isJobManager && !isPartner) {
      throw new Error('Not authorized to update job status');
    }

    if (job.status === 'planned' && status === 'in_progress') {
      if (!job.teamAssigned) {
        throw new Error('Cannot move to in-progress until team assignment is completed.');
      }
      if (!job.costingCompleted || !job.jobCosting) {
        throw new Error('Cannot move to in-progress until job costing is completed.');
      }
      if (job.jobCosting.costingStatus !== 'approved') {
        // IMPLEMENTED: Partner approval gate before execution — in-progress now requires approved job costing.
        throw new Error(
          'Cannot move to in-progress until partner approves job costing, work plan, and budget.'
        );
      }
    }

    const missingStageDocuments = await this.getMissingStageDocuments(
      jobId,
      status
    );

    if (missingStageDocuments.length > 0) {
      const stageName = status.replace(/_/g, ' ');
      const missingLabels = missingStageDocuments.map((item) => item.label);
      // CONFIRMED: Final report upload gate on completion — stage document checks already block completion when required reports are missing.
      throw new Error(
        `Cannot move this job to ${stageName} until these documents are uploaded: ${missingLabels.join(
          ', '
        )}.`
      );
    }

    let incompleteTasks: Array<{ id: number; title: string; status: string }> = [];
    if (status === 'completed') {
      incompleteTasks = await prisma.task.findMany({
        where: {
          jobId,
          status: { notIn: ['completed', 'cancelled'] },
        },
        select: { id: true, title: true, status: true },
        orderBy: { id: 'asc' },
      });

      const allowIncompleteTasksOverride = Boolean(options?.allowIncompleteTasksOverride);
      if (incompleteTasks.length > 0 && !allowIncompleteTasksOverride) {
        const pendingTitles = incompleteTasks
          .slice(0, 8)
          .map((task) => `"${task.title}"`)
          .join(', ');
        // IMPLEMENTED: Task-completion gate on job closure — completion now blocks until tasks complete unless manager/partner explicitly overrides.
        throw new Error(
          `Cannot complete job with ${incompleteTasks.length} incomplete task(s): ${pendingTitles}. Set allowIncompleteTasksOverride=true and provide reason to override.`
        );
      }

      if (incompleteTasks.length > 0 && !String(reason || '').trim()) {
        throw new Error(
          'A completion override reason is required when closing a job with incomplete tasks.'
        );
      }
    }

    // Record status transition
    await prisma.statusTransition.create({
      data: {
        entityType: 'Job',
        entityId: jobId,
        jobId,
        fromStatus: job.status,
        toStatus: status,
        reason: reason || null,
        changedByProfileId: authContext?.profileId!,
        metadata:
          status === 'completed'
            ? {
                incompleteTaskOverrideApplied: incompleteTasks.length > 0,
                incompleteTaskCount: incompleteTasks.length,
                incompleteTaskIds: incompleteTasks.map((task) => task.id),
              }
            : undefined,
      },
    });

    const updated = await prisma.job.update({
      where: { id: jobId },
      data: {
        status,
        completionDate: status === 'completed' ? new Date() : job.completionDate,
      },
      include: {
        manager: { select: { id: true, firstName: true, lastName: true } },
        partner: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    if (status === 'completed') {
      await this.completeFinalMilestoneOnJobCompletion(jobId, authContext);

      try {
        const syntheticAuth = {
          user: {
            userId: authContext?.userId ?? 0,
            profileId: authContext?.profileId ?? 0,
          },
          profile: {
            id: authContext?.profileId ?? 0,
            role: { name: authContext?.roles?.[0] ?? 'system' },
          },
        } as any;

        // IMPLEMENTED: Client satisfaction survey post-job trigger — when a job is marked complete, create a one-time tokenized survey if one does not already exist.
        await createClientSurveyForJobCompletion(jobId, syntheticAuth, 30);
      } catch (surveyError) {
        console.error(`Failed to auto-create client survey for completed job ${jobId}:`, surveyError);
      }

      await this.notifyJobCompletedEvent(
        {
          id: job.id,
          jobName: job.jobName,
          clientId: job.clientId ?? undefined,
          departmentId: job.departmentId ?? undefined,
          managerProfileId: job.managerProfileId ?? undefined,
          partnerProfileId: job.partnerProfileId ?? undefined,
          client: job.client,
        },
        authContext
      );
    }

    return updated;
  }

  /**
   * Delete job (soft or hard based on status)
   */
  async deleteJob(jobId: number, authContext: AuthContext) {
    const job = await this.getJobById(jobId);

    // Authorization
    const isAdmin = authContext.roles?.includes('super_admin');
    if (!isAdmin && job.managerProfileId !== authContext.profileId) {
      throw new Error('Not authorized to delete this job');
    }

    // Don't allow deletion of completed/in-progress jobs
    if (['in_progress', 'completed'].includes(job.status)) {
      throw new Error(`Cannot delete job in status: ${job.status}`);
    }

    await prisma.job.delete({
      where: { id: jobId },
    });

    return { id: jobId, deleted: true };
  }

  /**
   * Assign employee to job
   * 
   * Creates JobStaffAssignment
   */
  async assignJobTeam(
    jobId: number,
    input: JobStaffAssignmentInput,
    authContext: AuthContext
  ) {
    const job = await this.getJobById(jobId);

    // HR owns intake staffing; managers/partners can still adjust staffing later.
    const roleSet = new Set((authContext.roles || []).map((role) => String(role || '').toLowerCase()));
    const isAdmin = roleSet.has('super_admin') || roleSet.has('hr') || roleSet.has('gmp');
    const isJobManager = job.managerProfileId === authContext.profileId;
    const isPartner = job.partnerProfileId === authContext.profileId;

    if (!isAdmin && !isJobManager && !isPartner) {
      throw new Error('Not authorized to assign team to this job');
    }

    // Check for duplicate assignment
    const existing = await prisma.jobStaffAssignment.findFirst({
      where: { jobId, employeeProfileId: input.employeeProfileId },
    });

    if (existing) {
      throw new Error('Employee already assigned to this job');
    }

    const role = await prisma.positionRole.findUnique({
      where: { id: input.assignedRoleId },
      select: { id: true, name: true, billingRate: true },
    });

    if (!role) {
      throw new Error('Assigned role not found');
    }

    let assignedHourlyRate = Number(input.assignedHourlyRate ?? 0);

    if (!assignedHourlyRate || assignedHourlyRate <= 0) {
      assignedHourlyRate = Number(role.billingRate || 0);
    }

    if (!assignedHourlyRate || assignedHourlyRate <= 0) {
      throw new Error('Assigned hourly rate is required and must be > 0');
    }

    const roleSnapshot = {
      id: role.id,
      name: role.name,
      billingRate: Number(role.billingRate || 0),
      costRate: Number(role.billingRate || 0),
      assignedHourlyRate,
    };

    const assignment = await prisma.jobStaffAssignment.create({
      data: {
        jobId,
        employeeProfileId: input.employeeProfileId,
        assignedRoleId: input.assignedRoleId,
        assignedHourlyRate,
        roleSnapshot,
        roleOnJob: input.roleOnJob,
        assignedByProfileId: authContext.profileId,
        assignedAt: new Date(),
      },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true } },
        role: { select: { id: true, name: true } },
      },
    });

    // Update job.teamAssigned flag
    const hasStaff = await prisma.jobStaffAssignment.count({ where: { jobId } });
    if (hasStaff > 0) {
      await prisma.job.update({
        where: { id: jobId },
        data: { teamAssigned: true },
      });
    }

    // Ensure each newly assigned employee has at least one actionable to-do for this job.
    const existingTodo = await prisma.task.findFirst({
      where: {
        jobId,
        assignedToProfileId: assignment.employeeProfileId,
      },
      select: { id: true },
    });

    if (!existingTodo) {
      await prisma.task.create({
        data: {
          jobId,
          title: `Assigned job: ${job.jobName}`,
          description:
            "Auto-created from staffing assignment. Start tracking time in Timesheets and update this to-do as work progresses.",
          assignedToProfileId: assignment.employeeProfileId,
          status: 'pending',
          priority: 'medium',
          billable: true,
          dueDate: job.dueDate ?? undefined,
        },
      });
    }

    await NotificationService.createNotification(
      {
        recipientProfileId: assignment.employeeProfileId,
        type: 'action',
        title: `Assigned to job: ${job.jobName}`,
        message: 'You have been added to a new job. Open Timesheets to start tracking time when ready.',
        actionRequired: true,
        jobId: job.id,
        link: `/timesheets?jobId=${job.id}`,
      },
      {
        userId: authContext.userId,
        profileId: authContext.profileId,
        roleName: authContext.roles?.[0],
      }
    );

    if (hasStaff > 0) {
      await this.notifyManagerSetupRequired(job, authContext);
    }

    return assignment;
  }

  /**
   * Create or update job costing and allocations
   */
  async upsertJobCosting(
    jobId: number,
    input: JobCostingInput,
    authContext: AuthContext
  ) {
    const job = (await this.getJobById(jobId, ['costing'])) as any;
    const normalizedMilestones = this.normalizeMilestonesInput(input.milestones);
    const previousCostingStatus = job.jobCosting?.costingStatus
      ? String(job.jobCosting.costingStatus)
      : null;

    const roleSet = new Set((authContext.roles || []).map((role) => role.toLowerCase()));
    const isAdmin = roleSet.has('super_admin') || roleSet.has('gmp');
    const isJobManager = job.managerProfileId === authContext.profileId;
    const isPartner = job.partnerProfileId === authContext.profileId;
    const partnerApprove = Boolean(input.partnerApprove);
    const canEditCosting = isAdmin || isJobManager;
    const canPartnerApprove = isPartner || isAdmin;

    if (!canEditCosting && !(partnerApprove && canPartnerApprove)) {
      throw new Error('Not authorized to update job costing');
    }

    if (!Array.isArray(input.allocations) || input.allocations.length === 0) {
      throw new Error('Allocations are required');
    }

    const roleIds = Array.from(new Set(input.allocations.map((alloc) => alloc.roleId)));
    const roles = await prisma.positionRole.findMany({
      where: { id: { in: roleIds } },
      select: { id: true, name: true, billingRate: true, costRate: true },
    });

    if (roles.length !== roleIds.length) {
      throw new Error('One or more allocation roles are invalid');
    }

    const allocationEmployeeIds = Array.from(
      new Set(input.allocations.map((alloc) => alloc.employeeProfileId))
    );
    const staffAssignments = await prisma.jobStaffAssignment.findMany({
      where: { jobId, employeeProfileId: { in: allocationEmployeeIds } },
      select: {
        employeeProfileId: true,
        assignedHourlyRate: true,
      },
    });
    const assignmentRateMap = new Map<number, number>(
      staffAssignments.map((assignment) => [
        assignment.employeeProfileId,
        Number(assignment.assignedHourlyRate || 0),
      ])
    );

    const roleRateMap = new Map<number, number>(
      roles.map((role) => [role.id, Number(role.billingRate)])
    );
    const roleCostRateMap = new Map<number, number>(
      roles.map((role) => [role.id, Number(role.costRate)])
    );
    const allocationData = input.allocations.map((alloc, index) => {
      const fallbackAssignmentRate = assignmentRateMap.get(alloc.employeeProfileId) ?? 0;
      const fallbackRoleRate = roleRateMap.get(alloc.roleId) ?? 0;
      const rate = Number(
        alloc.hourlyRate ?? (fallbackAssignmentRate > 0 ? fallbackAssignmentRate : fallbackRoleRate)
      );
      const hours = Number(alloc.allocatedHours);
      if (!Number.isFinite(hours) || hours <= 0) {
        throw new Error(`Allocation #${index + 1} has invalid allocatedHours`);
      }
      if (!Number.isFinite(rate) || rate <= 0) {
        throw new Error(
          `Allocation #${index + 1} has invalid hourlyRate. Provide a rate or configure role/staff rates.`
        );
      }
      const fallbackCostRate = roleCostRateMap.get(alloc.roleId) ?? 0;
      const costRate = fallbackCostRate > 0 ? fallbackCostRate : rate;
      const estimatedCost = hours * costRate;

      return {
        employeeProfileId: alloc.employeeProfileId,
        roleId: alloc.roleId,
        allocatedHours: hours,
        hourlyRate: rate,
        estimatedCost,
        billable: alloc.billable ?? true,
        taskDescription: alloc.taskDescription,
      };
    });

    const uniqueAllocationKeys = new Set<string>();
    for (const allocation of allocationData) {
      const key = `${allocation.employeeProfileId}:${allocation.roleId}`;
      if (uniqueAllocationKeys.has(key)) {
        throw new Error(
          `Duplicate allocation detected for employee ${allocation.employeeProfileId} and role ${allocation.roleId}`
        );
      }
      uniqueAllocationKeys.add(key);
    }

    const totalEstimatedHours = allocationData.reduce(
      (sum, alloc) => sum + Number(alloc.allocatedHours),
      0
    );
    const totalEstimatedBillable = allocationData.reduce(
      (sum, alloc) => sum + Number(alloc.allocatedHours) * Number(alloc.hourlyRate),
      0
    );
    const totalEstimatedCost = allocationData.reduce(
      (sum, alloc) => sum + Number(alloc.estimatedCost),
      0
    );

    const existingAssignments = await prisma.jobStaffAssignment.findMany({
      where: { jobId, employeeProfileId: { in: allocationEmployeeIds } },
      select: { employeeProfileId: true },
    });
    const assignedSet = new Set(existingAssignments.map((item) => item.employeeProfileId));
    const unassignedIds = allocationEmployeeIds.filter((id) => !assignedSet.has(id));
    if (unassignedIds.length > 0) {
      const unassignedProfiles = await prisma.profile.findMany({
        where: { id: { in: unassignedIds } },
        select: { id: true, firstName: true, lastName: true, positionTitle: true },
      });
      const unassignedLabels = unassignedProfiles.map((profile) => {
        const name = `${profile.firstName ?? ''} ${profile.lastName ?? ''}`.trim();
        const role = profile.positionTitle ? ` (${profile.positionTitle})` : '';
        return `${name || `Profile ${profile.id}`}${role}`;
      });
      throw new Error(
        `Allocations include unassigned staff. Assign them to the job before costing: ${unassignedLabels.join(
          ', '
        )}`
      );
    }

    const inputFee = Number(input.jobFee || 0);
    const baseJobFee =
      inputFee > 0
        ? inputFee
        : Number(job.jobCosting?.jobFee || 0) ||
          (job.billingType === 'fixed_fee' ? Number(job.fixedFeeAmount || 0) : 0);

    if (!baseJobFee || baseJobFee <= 0) {
      throw new Error('Job fee is required before saving costing');
    }

    const allowOverage = input.allowOverage ?? false;
    const maxOveragePercentRaw = input.maxOveragePercent ?? 0.2;
    const maxOveragePercent = Number(maxOveragePercentRaw);
    const maxAllowedCost = allowOverage
      ? baseJobFee * (1 + Math.max(0, maxOveragePercent))
      : baseJobFee;

    if (totalEstimatedBillable > maxAllowedCost) {
      if (job.managerProfileId) {
        await NotificationService.createNotification(
          {
            recipientProfileId: job.managerProfileId,
            type: 'warning',
            title: 'Job costing exceeds fee cap',
            message: `Allocated budget (${totalEstimatedBillable.toFixed(2)}) exceeds allowed fee (${maxAllowedCost.toFixed(2)}) for "${job.jobName}".`,
            actionRequired: true,
            jobId: job.id,
            link: this.buildTrackingPath(job.id),
          },
          {
            userId: authContext.userId,
            profileId: authContext.profileId,
            roleName: authContext.roles?.[0],
          }
        );
      }
      if (job.partnerProfileId) {
        await NotificationService.createNotification(
          {
            recipientProfileId: job.partnerProfileId,
            type: 'warning',
            title: 'Job costing exceeds fee cap',
            message: `Allocated budget (${totalEstimatedBillable.toFixed(2)}) exceeds allowed fee (${maxAllowedCost.toFixed(2)}) for "${job.jobName}".`,
            actionRequired: true,
            jobId: job.id,
            link: this.buildTrackingPath(job.id),
          },
          {
            userId: authContext.userId,
            profileId: authContext.profileId,
            roleName: authContext.roles?.[0],
          }
        );
      }
      throw new Error(
        `Allocated budget exceeds job fee. Allowed: ${maxAllowedCost.toFixed(2)}, allocated: ${totalEstimatedBillable.toFixed(2)}`
      );
    }

    const jobFee = baseJobFee;
    const remainingBudget = jobFee - totalEstimatedBillable;
    const submitForApproval = input.submitForApproval !== false;
    const now = new Date();

    if (submitForApproval) {
      const missingPartnerReviewDocs = await this.getMissingStageDocuments(jobId, 'in_progress');
      if (missingPartnerReviewDocs.length > 0) {
        throw new Error(
          `Upload required documents before submitting costing: ${missingPartnerReviewDocs
            .map((item) => item.label)
            .join(', ')}`
        );
      }
    }

    let nextCostingStatus: 'draft' | 'submitted' | 'partner_review' | 'approved' = 'draft';
    let approvedByPartnerProfileId: number | null = null;
    let approvedAt: Date | null = null;

    if (partnerApprove && !canPartnerApprove) {
      throw new Error('Only partner/admin can approve job costing');
    }

    if (partnerApprove && canPartnerApprove) {
      // IMPLEMENTED: Costing approval before execution — costing can be explicitly partner-approved and is required for in-progress transition.
      nextCostingStatus = 'approved';
      approvedByPartnerProfileId = authContext.profileId;
      approvedAt = now;
    } else if (isJobManager && submitForApproval) {
      nextCostingStatus = 'submitted';
    } else if (canPartnerApprove && submitForApproval) {
      nextCostingStatus = 'partner_review';
    }

    const result = await prisma.$transaction(async (tx) => {
      const costing = await tx.jobCosting.upsert({
        where: { jobId },
        create: {
          jobId,
          managerProfileId: job.managerProfileId || authContext.profileId,
          jobFee,
          currency: job.currency || 'KES',
          allocatedCost: totalEstimatedBillable,
          remainingBudget,
          totalEstimatedHours,
          totalEstimatedCost,
          costingStatus: nextCostingStatus,
          approvedByPartnerProfileId,
          approvedAt,
          notes: input.notes,
        },
        update: {
          jobFee,
          currency: job.currency || 'KES',
          allocatedCost: totalEstimatedBillable,
          remainingBudget,
          totalEstimatedHours,
          totalEstimatedCost,
          costingStatus: nextCostingStatus,
          approvedByPartnerProfileId,
          approvedAt,
          notes: input.notes,
        },
      });

      const effectivePreviousStatus = previousCostingStatus || 'draft';
      if (!job.jobCosting || effectivePreviousStatus !== nextCostingStatus) {
        await this.recordJobCostingStatusTransition(tx, {
          jobCostingId: costing.id,
          jobId,
          fromStatus: effectivePreviousStatus,
          toStatus: nextCostingStatus,
          changedByProfileId: authContext.profileId,
          metadata: {
            totalEstimatedHours,
            totalEstimatedCost,
            jobFee,
          },
        });
      }

      await tx.jobTimeAllocation.deleteMany({ where: { jobCostingId: costing.id } });
      await tx.jobTimeAllocation.createMany({
        data: allocationData.map((alloc) => ({
          ...alloc,
          jobCostingId: costing.id,
        })),
      });

      await tx.budgetCap.upsert({
        where: { jobCostingId: costing.id },
        create: {
          jobCostingId: costing.id,
          totalAllocatedHours: totalEstimatedHours,
          capEnforced: input.capEnforced ?? true,
          allowOverage,
          maxOveragePercent,
        },
        update: {
          totalAllocatedHours: totalEstimatedHours,
          capEnforced: input.capEnforced ?? true,
          allowOverage,
          maxOveragePercent,
        },
      });

      if (input.milestones) {
        await this.syncMilestoneTasksForJob(
          jobId,
          normalizedMilestones,
          job.managerProfileId || authContext.profileId,
          tx
        );
      }

      await tx.job.update({
        where: { id: jobId },
        data: {
          costingCompleted: true,
          budgetHours: totalEstimatedHours,
        },
      });

      const costingResult = await tx.jobCosting.findUnique({
        where: { id: costing.id },
        include: { allocations: true, budgetCap: true },
      });
      return { costingResult };
    });

    await createAudit({
      action: `job_costing_updated:job_${jobId}`,
      entity_type: 'job',
      entity_id: jobId,
      user_id: authContext.userId,
      metadata: {
        jobId,
        totalEstimatedHours,
        totalEstimatedCost,
        jobFee,
        allowOverage,
        maxOveragePercent,
        costingStatus: nextCostingStatus,
        partnerApproved: partnerApprove,
      },
    });

    if (nextCostingStatus === 'submitted' && job.partnerProfileId) {
      await NotificationService.createNotification(
        {
          recipientProfileId: job.partnerProfileId,
          type: 'action',
          title: `Job costing submitted for approval: ${job.jobName}`,
          message: `Manager submitted job costing, work plan, and budget for "${job.jobName}". Partner approval is required before execution.`,
          actionRequired: true,
          jobId: job.id,
          link: this.buildTrackingPath(job.id),
        },
        {
          userId: authContext.userId,
          profileId: authContext.profileId,
          roleName: authContext.roles?.[0],
        }
      );
    }

    if (nextCostingStatus === 'approved' && job.managerProfileId) {
      await NotificationService.createNotification(
        {
          recipientProfileId: job.managerProfileId,
          type: 'info',
          title: `Job costing approved: ${job.jobName}`,
          message: `Partner approved costing for "${job.jobName}". The job can now move to in-progress.`,
          actionRequired: false,
          jobId: job.id,
          link: this.buildTrackingPath(job.id),
        },
        {
          userId: authContext.userId,
          profileId: authContext.profileId,
          roleName: authContext.roles?.[0],
        }
      );
    }

    return result.costingResult;
  }

  async reviewJobCosting(
    jobId: number,
    input: JobCostingReviewInput,
    authContext: AuthContext
  ) {
    const job = (await this.getJobById(jobId, ['costing'])) as any;
    const roleSet = new Set((authContext.roles || []).map((role) => role.toLowerCase()));
    const isAdmin = roleSet.has('super_admin') || roleSet.has('gmp');
    const isAssignedPartner = job.partnerProfileId === authContext.profileId;

    if (!isAdmin && !isAssignedPartner) {
      const err = new Error('Only the assigned partner can review job costing');
      (err as any).statusCode = 403;
      throw err;
    }

    const costing = await prisma.jobCosting.findUnique({
      where: { jobId },
      include: {
        allocations: true,
        budgetCap: true,
      },
    });

    if (!costing) {
      const err = new Error('Job costing not found');
      (err as any).statusCode = 404;
      throw err;
    }

    if (String(costing.costingStatus) !== 'submitted') {
      const err = new Error('Only submitted job costing can be reviewed by the partner');
      (err as any).statusCode = 409;
      throw err;
    }

    const decision = String(input.decision || '').trim().toLowerCase();
    const reviewNotes = String(input.reviewNotes || '').trim();
    if (decision !== 'approved' && decision !== 'rejected') {
      const err = new Error('Review decision must be approved or rejected');
      (err as any).statusCode = 400;
      throw err;
    }

    if (decision === 'rejected' && !reviewNotes) {
      const err = new Error('A review point is required before returning costing to the manager');
      (err as any).statusCode = 400;
      throw err;
    }

    const missingPartnerReviewDocs = await this.getMissingStageDocuments(jobId, 'in_progress');
    if (missingPartnerReviewDocs.length > 0) {
      const err = new Error(
        `Partner review requires uploaded documents: ${missingPartnerReviewDocs
          .map((item) => item.label)
          .join(', ')}`
      );
      (err as any).statusCode = 400;
      throw err;
    }

    const nextCostingStatus = decision === 'approved' ? 'approved' : 'rejected';
    const now = new Date();

    const updated = await prisma.$transaction(async (tx) => {
      const updatedCosting = await tx.jobCosting.update({
        where: { id: costing.id },
        data: {
          costingStatus: nextCostingStatus,
          approvedByPartnerProfileId: decision === 'approved' ? authContext.profileId : null,
          approvedAt: decision === 'approved' ? now : null,
        },
        include: {
          allocations: true,
          budgetCap: true,
        },
      });

      await this.recordJobCostingStatusTransition(tx, {
        jobCostingId: costing.id,
        jobId,
        fromStatus: String(costing.costingStatus),
        toStatus: nextCostingStatus,
        changedByProfileId: authContext.profileId,
        reason: decision === 'rejected' ? reviewNotes : null,
        metadata: {
          decision,
        },
      });

      return updatedCosting;
    });

    await createAudit({
      action: `job_costing_reviewed:job_${jobId}`,
      entity_type: 'job',
      entity_id: jobId,
      user_id: authContext.userId,
      metadata: {
        jobId,
        decision,
        reviewNotes: decision === 'rejected' ? reviewNotes : null,
      },
    });

    if (job.managerProfileId) {
      await NotificationService.createNotification(
        {
          recipientProfileId: job.managerProfileId,
          type: decision === 'approved' ? 'info' : 'action',
          title:
            decision === 'approved'
              ? `Job costing approved: ${job.jobName}`
              : `Job costing returned for revision: ${job.jobName}`,
          message:
            decision === 'approved'
              ? `Partner approved the costing package for "${job.jobName}". The job can now move to in-progress.`
              : `Partner returned "${job.jobName}" with review points: ${reviewNotes}`,
          actionRequired: decision === 'rejected',
          jobId: job.id,
          link: this.buildTrackingPath(job.id),
        },
        {
          userId: authContext.userId,
          profileId: authContext.profileId,
          roleName: authContext.roles?.[0],
        }
      );
    }

    return updated;
  }

  /**
   * Get job staff assignments
   */
  async getJobStaff(jobId: number) {
    const staffing = await prisma.jobStaffAssignment.findMany({
      where: { jobId },
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            user: { select: { email: true } },
            isPartner: true,
          },
        },
        role: { select: { id: true, name: true } },
      },
    });

    return staffing;
  }

  /**
   * Update an existing job staff assignment
   */
  async updateJobStaffAssignment(
    jobId: number,
    assignmentId: number,
    input: JobStaffAssignmentUpdateInput,
    authContext: AuthContext
  ) {
    const assignment = await prisma.jobStaffAssignment.findUnique({
      where: { id: assignmentId },
      include: {
        job: {
          select: {
            id: true,
            jobName: true,
            managerProfileId: true,
            partnerProfileId: true,
          },
        },
      },
    });

    if (!assignment || assignment.jobId !== jobId) {
      throw { statusCode: 404, message: 'Staff assignment not found for this job' };
    }

    const roleSet = new Set((authContext.roles || []).map((role) => String(role || '').toLowerCase()));
    const isAdmin = roleSet.has('super_admin') || roleSet.has('hr') || roleSet.has('gmp');
    const isJobManager = assignment.job.managerProfileId === authContext.profileId;
    const isPartner = assignment.job.partnerProfileId === authContext.profileId;

    if (!isAdmin && !isJobManager && !isPartner) {
      throw { statusCode: 403, message: 'Not authorized to update team assignment for this job' };
    }

    const hasAnyUpdatableField =
      input.assignedRoleId !== undefined ||
      input.assignedHourlyRate !== undefined ||
      input.roleOnJob !== undefined;

    if (!hasAnyUpdatableField) {
      throw {
        statusCode: 400,
        message: 'At least one field is required: assignedRoleId, assignedHourlyRate, roleOnJob',
      };
    }

    const nextRoleId = input.assignedRoleId ?? assignment.assignedRoleId;

    const role = await prisma.positionRole.findUnique({
      where: { id: nextRoleId },
      select: { id: true, name: true, billingRate: true },
    });

    if (!role) {
      throw { statusCode: 404, message: 'Assigned role not found' };
    }

    let nextHourlyRate: number;
    if (input.assignedHourlyRate !== undefined && input.assignedHourlyRate !== null) {
      nextHourlyRate = Number(input.assignedHourlyRate);
    } else if (input.assignedRoleId !== undefined) {
      nextHourlyRate = Number(role.billingRate || 0);
    } else {
      nextHourlyRate = Number(assignment.assignedHourlyRate || 0);
    }

    if (!Number.isFinite(nextHourlyRate) || nextHourlyRate <= 0) {
      throw { statusCode: 400, message: 'Assigned hourly rate must be greater than 0' };
    }

    const roleSnapshot = {
      id: role.id,
      name: role.name,
      billingRate: Number(role.billingRate || 0),
      costRate: Number(role.billingRate || 0),
      assignedHourlyRate: nextHourlyRate,
    };

    const updated = await prisma.jobStaffAssignment.update({
      where: { id: assignmentId },
      data: {
        assignedRoleId: nextRoleId,
        assignedHourlyRate: nextHourlyRate,
        roleOnJob:
          input.roleOnJob !== undefined
            ? String(input.roleOnJob || '').trim() || null
            : assignment.roleOnJob,
        roleSnapshot,
      },
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            user: { select: { email: true } },
            isPartner: true,
          },
        },
        role: { select: { id: true, name: true } },
      },
    });

    await createAudit({
      action: `job_staff_assignment_updated:job_${jobId}`,
      entity_type: 'job_staff_assignment',
      entity_id: updated.id,
      user_id: authContext.userId,
      metadata: {
        jobId,
        assignmentId: updated.id,
        employeeProfileId: updated.employeeProfileId,
        assignedRoleId: updated.assignedRoleId,
        assignedHourlyRate: Number(updated.assignedHourlyRate),
      },
    });

    return updated;
  }

  /**
   * Remove a staff assignment from a job
   */
  async removeJobStaffAssignment(jobId: number, assignmentId: number, authContext: AuthContext) {
    const assignment = await prisma.jobStaffAssignment.findUnique({
      where: { id: assignmentId },
      include: {
        job: {
          select: {
            id: true,
            jobName: true,
            managerProfileId: true,
            partnerProfileId: true,
          },
        },
      },
    });

    if (!assignment || assignment.jobId !== jobId) {
      throw { statusCode: 404, message: 'Staff assignment not found for this job' };
    }

    const roleSet = new Set((authContext.roles || []).map((role) => String(role || '').toLowerCase()));
    const isAdmin = roleSet.has('super_admin') || roleSet.has('hr') || roleSet.has('gmp');
    const isJobManager = assignment.job.managerProfileId === authContext.profileId;
    const isPartner = assignment.job.partnerProfileId === authContext.profileId;

    if (!isAdmin && !isJobManager && !isPartner) {
      throw { statusCode: 403, message: 'Not authorized to remove team assignment for this job' };
    }

    const jobCosting = await prisma.jobCosting.findUnique({
      where: { jobId },
      select: { id: true },
    });

    if (jobCosting) {
      const hasAllocation = await prisma.jobTimeAllocation.findFirst({
        where: {
          jobCostingId: jobCosting.id,
          employeeProfileId: assignment.employeeProfileId,
        },
        select: { id: true },
      });

      if (hasAllocation) {
        throw {
          statusCode: 409,
          message:
            'Cannot remove staff assignment while costing allocations exist for this employee on the job',
        };
      }
    }

    await prisma.jobStaffAssignment.delete({
      where: { id: assignmentId },
    });

    const remainingAssignments = await prisma.jobStaffAssignment.count({
      where: { jobId },
    });

    await prisma.job.update({
      where: { id: jobId },
      data: { teamAssigned: remainingAssignments > 0 },
    });

    await createAudit({
      action: `job_staff_assignment_removed:job_${jobId}`,
      entity_type: 'job_staff_assignment',
      entity_id: assignmentId,
      user_id: authContext.userId,
      metadata: {
        jobId,
        assignmentId,
        employeeProfileId: assignment.employeeProfileId,
      },
    });

    return { assignmentId, jobId, removed: true };
  }

  /**
   * Get job costing details
   */
  async getJobCosting(jobId: number) {
    const costing = await prisma.jobCosting.findUnique({
      where: { jobId },
      include: {
        budgetCap: true,
        allocations: true,
      },
    });

    return costing;
  }

  /**
   * Get time entries for job
   */
  async getJobTimeEntries(
    jobId: number,
    options?: {
      page?: number;
      pageSize?: number;
      status?: string;
      dateFrom?: Date;
      dateTo?: Date;
    }
  ) {
    const { page = 1, pageSize = 50, status, dateFrom, dateTo } = options || {};
    const skip = (page - 1) * pageSize;

    let whereClause: any = { jobId };
    if (status) whereClause.status = status;
    if (dateFrom || dateTo) {
      whereClause.dateWorked = {};
      if (dateFrom) whereClause.dateWorked.gte = dateFrom;
      if (dateTo) whereClause.dateWorked.lte = dateTo;
    }

    const [entries, total] = await Promise.all([
      prisma.timeEntry.findMany({
        where: whereClause,
        skip,
        take: pageSize,
        include: {
          employee: { select: { id: true, firstName: true, lastName: true } },
          approver: { select: { id: true, firstName: true, lastName: true } },
          task: { select: { id: true, title: true } },
        },
        orderBy: { dateWorked: 'desc' },
      }),
      prisma.timeEntry.count({ where: whereClause }),
    ]);

    return { entries, total };
  }

  /**
   * Calculate job profitability
   * 
   * Returns:
   * - Total revenue (billableAmount)
   * - Total cost (employee cost)
   * - Profit/loss
   * - Margin %
   */
  async getJobProfitability(jobId: number) {
    const job = await this.getJobById(jobId, ['staffing', 'timeEntries']);

    const [timeEntryResult, requisitionResult] = await Promise.all([
      prisma.timeEntry.aggregate({
        where: { jobId },
        _sum: {
          billableAmount: true,
          costAmount: true,
        },
      }),
      prisma.requisitionRequest.aggregate({
        where: {
          jobId,
          status: 'approved',
        },
        _sum: {
          amount: true,
        },
      }),
    ]);

    const totalRevenue = timeEntryResult._sum.billableAmount || 0;
    const laborCost = Number(timeEntryResult._sum.costAmount || 0);
    const approvedRequisitionCost = Number(requisitionResult._sum.amount || 0);
    const totalCost = laborCost + approvedRequisitionCost;
    const totalProfitLoss = Number(totalRevenue) - totalCost;

    const revenueNumber = Number(totalRevenue);
    const profitNumber = Number(totalProfitLoss);
    const marginPercent = revenueNumber > 0 ? (profitNumber / revenueNumber) * 100 : 0;

    return {
      jobId,
      jobName: job.jobName,
      totalRevenue: Number(totalRevenue),
      laborCost,
      approvedRequisitionCost,
      totalCost: Number(totalCost),
      totalProfitLoss: Number(totalProfitLoss),
      marginPercent: Number(marginPercent.toFixed(2)),
      billingType: job.billingType,
      status: job.status,
    };
  }

  /**
   * Calculate job utilization metrics
   * 
   * Returns:
   * - Total billable hours
   * - Total hours
   * - Billable %
   * - Per-employee breakdown
   */
  async getJobUtilization(jobId: number) {
    const job = await this.getJobById(jobId);

    // Get time entries
    const timeEntries = await prisma.timeEntry.findMany({
      where: { jobId },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    // Calculate aggregates
    const totalHours = timeEntries.reduce((sum, te) => sum + Number(te.hours), 0);
    const billableHours = timeEntries
      .filter((te) => te.billable)
      .reduce((sum, te) => sum + Number(te.hours), 0);

    const utilizationPercent = totalHours > 0 ? (billableHours / totalHours) * 100 : 0;

    // Per-employee breakdown
    const byEmployee: Record<number, any> = {};
    timeEntries.forEach((te) => {
      if (!byEmployee[te.employeeProfileId]) {
        byEmployee[te.employeeProfileId] = {
          employeeProfileId: te.employeeProfileId,
          employeeName: `${te.employee.firstName} ${te.employee.lastName}`,
          totalHours: 0,
          billableHours: 0,
        };
      }
      byEmployee[te.employeeProfileId].totalHours += Number(te.hours);
      if (te.billable) {
        byEmployee[te.employeeProfileId].billableHours += Number(te.hours);
      }
    });

    // Calculate utilization per employee
    const employeeUtilization = Object.values(byEmployee).map((emp: any) => ({
      ...emp,
      utilizationPercent:
        emp.totalHours > 0 ? ((emp.billableHours / emp.totalHours) * 100).toFixed(2) : 0,
    }));

    return {
      jobId,
      jobName: job.jobName,
      totalHours: Number(totalHours.toFixed(2)),
      billableHours: Number(billableHours.toFixed(2)),
      utilizationPercent: Number(utilizationPercent.toFixed(2)),
      employeeUtilization,
    };
  }

  /**
   * Get job revenue allocations
   * 
   * Returns revenue split between manager, partner, client
   */
  async getJobRevenueAllocations(jobId: number) {
    const allocations = await prisma.revenueAllocation.findMany({
      where: { jobId },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true, user: { select: { email: true } } } },
      },
    });

    return allocations;
  }

  /**
   * Comprehensive workflow tracking payload for dashboards and cross-module visibility.
   */
  async getJobWorkflowTracking(jobId: number, authContext?: AuthContext) {
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      include: {
        clientOnboarding: {
          select: {
            id: true,
            status: true,
            uploadedByProfileId: true,
            hrReviewerProfileId: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        client: { select: { id: true, clientName: true, clientCode: true } },
        manager: { select: { id: true, firstName: true, lastName: true } },
        partner: { select: { id: true, firstName: true, lastName: true } },
        receivableOwner: { select: { id: true, firstName: true, lastName: true } },
        department: { select: { id: true, name: true } },
        engagementLetter: {
          select: {
            id: true,
            status: true,
            documentId: true,
            feeAmount: true,
            currency: true,
            startDate: true,
            endDate: true,
          },
        },
        staffing: {
          include: {
            employee: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                positionTitle: true,
              },
            },
            role: {
              select: {
                id: true,
                name: true,
                billingRate: true,
                costRate: true,
              },
            },
          },
        },
        jobCosting: {
          include: {
            budgetCap: true,
            allocations: true,
            statusTransitions: {
              orderBy: { createdAt: 'desc' },
              take: 10,
              select: {
                id: true,
                fromStatus: true,
                toStatus: true,
                reason: true,
                createdAt: true,
                changedByProfileId: true,
                changedBy: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                  },
                },
              },
            },
          },
        },
        tasks: {
          select: {
            id: true,
            title: true,
            status: true,
            billable: true,
            dueDate: true,
            assignedToProfileId: true,
            estimatedHours: true,
          },
        },
        timeEntries: {
          select: {
            id: true,
            employeeProfileId: true,
            hours: true,
            billable: true,
            status: true,
            dateWorked: true,
            billableAmount: true,
            costAmount: true,
            profitLoss: true,
          },
        },
        payments: {
          select: {
            id: true,
            paymentAmount: true,
            paymentDate: true,
            invoiceNumber: true,
          },
        },
        revenueAllocations: {
          select: {
            id: true,
            employeeProfileId: true,
            allocationPercentage: true,
            allocatedAmount: true,
            employeeBillable: true,
            employeeProfit: true,
            employeeLoss: true,
            allocationMonth: true,
          },
        },
        requisitionRequests: {
          select: {
            id: true,
            requisitionNumber: true,
            title: true,
            status: true,
            amount: true,
            currency: true,
            submittedAt: true,
            approvedAt: true,
            isClientRecoverable: true,
            requester: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
              },
            },
            requisitionType: {
              select: {
                id: true,
                name: true,
                sourceModule: true,
              },
            },
          },
          orderBy: [{ submittedAt: 'desc' }, { id: 'desc' }],
          take: 25,
        },
        statusTransitions: {
          where: { entityType: 'Job', entityId: jobId },
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            fromStatus: true,
            toStatus: true,
            reason: true,
            changedByProfileId: true,
            createdAt: true,
          },
        },
      },
    });

    if (!job) {
      throw { statusCode: 404, message: 'Job not found' };
    }

    if (authContext) {
      const roleSet = this.roleSet(authContext.roles);
      const isAdmin =
        roleSet.has('super_admin') ||
        roleSet.has('hr') ||
        roleSet.has('gmp') ||
        roleSet.has('finance');
      const isManager = job.managerProfileId === authContext.profileId;
      const isPartner = job.partnerProfileId === authContext.profileId;
      const isStaffAssigned = job.staffing.some(
        (item) => item.employeeProfileId === authContext.profileId
      );

      if (!isAdmin && !isManager && !isPartner && !isStaffAssigned) {
        throw { statusCode: 403, message: 'Not authorized to view tracking for this job' };
      }
    }

    const jobInvoices = await this.listJobInvoices(jobId);

    const activeTimeEntries = job.timeEntries.filter((entry) =>
      ['pending', 'submitted', 'approved'].includes(String(entry.status))
    );
    const approvedTimeEntries = job.timeEntries.filter(
      (entry) => String(entry.status) === 'approved'
    );
    const taskTotals = {
      total: job.tasks.length,
      pending: job.tasks.filter((task) => task.status === 'pending').length,
      inProgress: job.tasks.filter((task) => task.status === 'in_progress').length,
      blocked: job.tasks.filter((task) => task.status === 'blocked').length,
      completed: job.tasks.filter((task) => task.status === 'completed').length,
      cancelled: job.tasks.filter((task) => task.status === 'cancelled').length,
    };
    const incompleteTaskCount = job.tasks.filter(
      (task) => !['completed', 'cancelled'].includes(String(task.status))
    ).length;

    const expectedFeeAmount = this.resolveJobFeeForTracking(job as any);
    const collectedAmount = roundCurrency(
      job.payments.reduce((sum, payment) => sum + Number(payment.paymentAmount || 0), 0)
    );
    const outstandingAmount = roundCurrency(Math.max(0, expectedFeeAmount - collectedAmount));
    const billedAmount = roundCurrency(
      activeTimeEntries.reduce((sum, entry) => sum + Number(entry.billableAmount || 0), 0)
    );
    const approvedBilledAmount = roundCurrency(
      approvedTimeEntries.reduce((sum, entry) => sum + Number(entry.billableAmount || 0), 0)
    );
    const laborCostToDate = roundCurrency(
      activeTimeEntries.reduce((sum, entry) => sum + Number(entry.costAmount || 0), 0)
    );
    const requisitionRequests = job.requisitionRequests || [];
    const approvedRequisitions = requisitionRequests.filter(
      (item) => String(item.status) === 'approved'
    );
	    const pendingRequisitions = requisitionRequests.filter((item) =>
	      [
	        'pending_manager_approval',
	        'pending_partner_approval',
	        'pending_gmp_approval',
	        'pending_finance_approval',
	      ].includes(String(item.status))
	    );
    const approvedRequisitionCost = roundCurrency(
      approvedRequisitions.reduce((sum, item) => sum + Number(item.amount || 0), 0)
    );
    const committedRequisitionCost = roundCurrency(
      pendingRequisitions.reduce((sum, item) => sum + Number(item.amount || 0), 0)
    );
    const recoverableRequisitionCost = roundCurrency(
      approvedRequisitions
        .filter((item) => item.isClientRecoverable)
        .reduce((sum, item) => sum + Number(item.amount || 0), 0)
    );
    const costToDate = roundCurrency(laborCostToDate + approvedRequisitionCost);
    const totalCommittedCost = roundCurrency(costToDate + committedRequisitionCost);
    const profitToDate = roundCurrency(billedAmount - costToDate);

    const totalHoursWorked = roundCurrency(
      activeTimeEntries.reduce((sum, entry) => sum + Number(entry.hours || 0), 0)
    );
    const approvedHoursWorked = roundCurrency(
      approvedTimeEntries.reduce((sum, entry) => sum + Number(entry.hours || 0), 0)
    );
    const totalBillableHours = roundCurrency(
      activeTimeEntries
        .filter((entry) => entry.billable)
        .reduce((sum, entry) => sum + Number(entry.hours || 0), 0)
    );
    const totalNonBillableHours = roundCurrency(
      activeTimeEntries
        .filter((entry) => !entry.billable)
        .reduce((sum, entry) => sum + Number(entry.hours || 0), 0)
    );

    const allocatedHours = roundCurrency(
      (job.jobCosting?.allocations || []).reduce(
        (sum, allocation) => sum + Number(allocation.allocatedHours || 0),
        0
      )
    );

    const byEmployee = new Map<
      number,
      {
        profileId: number;
        employeeName: string;
        positionTitle: string | null;
        assignedRole: string | null;
        assignedHourlyRate: number;
        allocatedHours: number;
        loggedHours: number;
        approvedHours: number;
        billableHours: number;
        nonBillableHours: number;
        billableAmount: number;
        costAmount: number;
      }
    >();

    for (const staff of job.staffing) {
      byEmployee.set(staff.employeeProfileId, {
        profileId: staff.employeeProfileId,
        employeeName: `${staff.employee.firstName} ${staff.employee.lastName}`.trim(),
        positionTitle: staff.employee.positionTitle || null,
        assignedRole: staff.role?.name || null,
        assignedHourlyRate: Number(staff.assignedHourlyRate || 0),
        allocatedHours: 0,
        loggedHours: 0,
        approvedHours: 0,
        billableHours: 0,
        nonBillableHours: 0,
        billableAmount: 0,
        costAmount: 0,
      });
    }

    for (const allocation of job.jobCosting?.allocations || []) {
      const current = byEmployee.get(allocation.employeeProfileId);
      if (!current) {
        byEmployee.set(allocation.employeeProfileId, {
          profileId: allocation.employeeProfileId,
          employeeName: `Profile ${allocation.employeeProfileId}`,
          positionTitle: null,
          assignedRole: null,
          assignedHourlyRate: Number(allocation.hourlyRate || 0),
          allocatedHours: Number(allocation.allocatedHours || 0),
          loggedHours: 0,
          approvedHours: 0,
          billableHours: 0,
          nonBillableHours: 0,
          billableAmount: 0,
          costAmount: 0,
        });
      } else {
        current.allocatedHours += Number(allocation.allocatedHours || 0);
        if (!current.assignedHourlyRate) {
          current.assignedHourlyRate = Number(allocation.hourlyRate || 0);
        }
      }
    }

    for (const entry of activeTimeEntries) {
      const current = byEmployee.get(entry.employeeProfileId) || {
        profileId: entry.employeeProfileId,
        employeeName: `Profile ${entry.employeeProfileId}`,
        positionTitle: null,
        assignedRole: null,
        assignedHourlyRate: 0,
        allocatedHours: 0,
        loggedHours: 0,
        approvedHours: 0,
        billableHours: 0,
        nonBillableHours: 0,
        billableAmount: 0,
        costAmount: 0,
      };
      current.loggedHours += Number(entry.hours || 0);
      current.billableAmount += Number(entry.billableAmount || 0);
      current.costAmount += Number(entry.costAmount || 0);
      if (entry.billable) {
        current.billableHours += Number(entry.hours || 0);
      } else {
        current.nonBillableHours += Number(entry.hours || 0);
      }
      if (String(entry.status) === 'approved') {
        current.approvedHours += Number(entry.hours || 0);
      }
      byEmployee.set(entry.employeeProfileId, current);
    }

    const employeeTracking = Array.from(byEmployee.values()).map((item) => {
      const utilizationPercent =
        item.allocatedHours > 0
          ? Number(((item.loggedHours / item.allocatedHours) * 100).toFixed(2))
          : 0;
      const remainingHours = roundCurrency(item.allocatedHours - item.loggedHours);
      return {
        ...item,
        allocatedHours: roundCurrency(item.allocatedHours),
        loggedHours: roundCurrency(item.loggedHours),
        approvedHours: roundCurrency(item.approvedHours),
        billableHours: roundCurrency(item.billableHours),
        nonBillableHours: roundCurrency(item.nonBillableHours),
        billableAmount: roundCurrency(item.billableAmount),
        costAmount: roundCurrency(item.costAmount),
        remainingAllocatedHours: roundCurrency(Math.max(0, remainingHours)),
        overrunHours: roundCurrency(Math.max(0, -remainingHours)),
        utilizationPercent,
      };
    });

    const missingForInProgress = await this.getMissingStageDocuments(jobId, 'in_progress');
    const missingForCompletion = await this.getMissingStageDocuments(jobId, 'completed');
    const invoiceMilestones = await this.getJobInvoiceMilestoneTracking(jobId);
    const latestRejectedCostingReview = job.jobCosting?.statusTransitions?.find(
      (transition: any) => String(transition.toStatus) === 'rejected'
    );
    const latestSubmittedCostingReview = job.jobCosting?.statusTransitions?.find(
      (transition: any) => String(transition.toStatus) === 'submitted'
    );

    const lifecycleBlockersForInProgress: string[] = [];
    if (!job.teamAssigned) lifecycleBlockersForInProgress.push('Team assignment is incomplete');
    if (!job.costingCompleted) lifecycleBlockersForInProgress.push('Job costing is incomplete');
    if (job.jobCosting?.costingStatus !== 'approved') {
      lifecycleBlockersForInProgress.push('Costing is not partner-approved');
    }
    missingForInProgress.forEach((item) =>
      lifecycleBlockersForInProgress.push(`Missing document: ${item.label}`)
    );

    const lifecycleBlockersForCompletion: string[] = [];
    if (incompleteTaskCount > 0) {
      lifecycleBlockersForCompletion.push(`${incompleteTaskCount} task(s) are still incomplete`);
    }
    missingForCompletion.forEach((item) =>
      lifecycleBlockersForCompletion.push(`Missing document: ${item.label}`)
    );

    const now = new Date();
    const dueDate = job.dueDate ? new Date(job.dueDate) : null;
    const isOverdue =
      Boolean(dueDate) &&
      dueDate!.getTime() < now.getTime() &&
      !['completed', 'cancelled'].includes(String(job.status));
    const overdueDays =
      isOverdue && dueDate
        ? Math.max(1, Math.ceil((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)))
        : 0;

    const billedVsExpectedPercent =
      expectedFeeAmount > 0
        ? Number(((billedAmount / expectedFeeAmount) * 100).toFixed(2))
        : 0;
    const collectionPercent =
      expectedFeeAmount > 0
        ? Number(((collectedAmount / expectedFeeAmount) * 100).toFixed(2))
        : 0;
    const marginPercent =
      billedAmount > 0 ? Number(((profitToDate / billedAmount) * 100).toFixed(2)) : 0;
    const recentRequisitions = requisitionRequests.map((item) => ({
      id: item.id,
      requisitionNumber: item.requisitionNumber,
      title: item.title,
      status: item.status,
      amount: Number(item.amount || 0),
      currency: item.currency,
      submittedAt: item.submittedAt,
      approvedAt: item.approvedAt,
      isClientRecoverable: item.isClientRecoverable,
      requesterName: `${item.requester?.firstName || ''} ${item.requester?.lastName || ''}`.trim(),
      requisitionTypeName: item.requisitionType?.name || null,
      sourceModule: item.requisitionType?.sourceModule || null,
    }));

    return {
      job: this.withDerivedOverdueStatus({
        id: job.id,
        jobCode: job.jobCode,
        jobName: job.jobName,
        description: job.description,
        status: job.status,
        priority: job.priority,
        startDate: job.startDate,
        dueDate: job.dueDate,
        completionDate: job.completionDate,
        billingType: job.billingType,
        currency: job.currency,
        fixedFeeAmount: Number(job.fixedFeeAmount || 0),
        budgetHours: Number(job.budgetHours || 0),
        collectionStage: job.collectionStage,
        readyForCollectionAt: job.readyForCollectionAt,
        teamAssigned: job.teamAssigned,
        costingCompleted: job.costingCompleted,
      }),
      ownership: {
        client: job.client,
        department: job.department,
        manager: job.manager,
        partner: job.partner,
        receivableOwner: job.receivableOwner,
      },
      workflow: {
        marketing: {
          clientOnboardingId: job.clientOnboarding?.id || null,
          onboardingStatus: job.clientOnboarding?.status || null,
          engagementLetterId: job.engagementLetter?.id || null,
          engagementLetterStatus: job.engagementLetter?.status || null,
          engagementLetterDocumentUploaded: Boolean(job.engagementLetter?.documentId),
        },
        hr: {
          jobCreated: true,
          managerAssigned: Boolean(job.managerProfileId),
          partnerAssigned: Boolean(job.partnerProfileId),
          departmentAssigned: Boolean(job.departmentId),
        },
        manager: {
          teamAssigned: job.teamAssigned,
          staffCount: job.staffing.length,
          costingCompleted: job.costingCompleted,
          costingStatus: job.jobCosting?.costingStatus || null,
          submittedAt: latestSubmittedCostingReview?.createdAt || null,
          approvedAt: job.jobCosting?.approvedAt || null,
          latestReviewReason:
            String(job.jobCosting?.costingStatus || '') === 'rejected'
              ? latestRejectedCostingReview?.reason || null
              : null,
          latestReviewAt:
            String(job.jobCosting?.costingStatus || '') === 'rejected'
              ? latestRejectedCostingReview?.createdAt || null
              : null,
          latestReviewBy:
            String(job.jobCosting?.costingStatus || '') === 'rejected' &&
            latestRejectedCostingReview?.changedBy
              ? latestRejectedCostingReview.changedBy
              : null,
          budgetCapEnforced: job.jobCosting?.budgetCap?.capEnforced ?? null,
          allowOverage: job.jobCosting?.budgetCap?.allowOverage ?? null,
          maxOveragePercent: Number(job.jobCosting?.budgetCap?.maxOveragePercent || 0),
        },
        execution: {
          currentStatus: job.status,
          canMoveToInProgress: lifecycleBlockersForInProgress.length === 0,
          canComplete: lifecycleBlockersForCompletion.length === 0,
          blockersForInProgress: lifecycleBlockersForInProgress,
          blockersForCompletion: lifecycleBlockersForCompletion,
          isOverdue,
          overdueDays,
        },
      },
      tracking: {
        tasks: {
          ...taskTotals,
          incomplete: incompleteTaskCount,
        },
        staffing: {
          teamAssigned: job.teamAssigned,
          headcount: job.staffing.length,
          allocatedHours,
          loggedHours: totalHoursWorked,
          remainingAllocatedHours: roundCurrency(Math.max(0, allocatedHours - totalHoursWorked)),
          overrunHours: roundCurrency(Math.max(0, totalHoursWorked - allocatedHours)),
          employees: employeeTracking,
        },
        timesheets: {
          totalEntries: job.timeEntries.length,
          activeEntries: activeTimeEntries.length,
          approvedEntries: approvedTimeEntries.length,
          pendingOrSubmittedEntries: activeTimeEntries.filter((entry) =>
            ['pending', 'submitted'].includes(String(entry.status))
          ).length,
          totalHoursWorked,
          approvedHoursWorked,
          totalBillableHours,
          totalNonBillableHours,
          billableUtilizationPercent:
            totalHoursWorked > 0
              ? Number(((totalBillableHours / totalHoursWorked) * 100).toFixed(2))
              : 0,
        },
        financials: {
          expectedFeeAmount,
          billedAmount,
          approvedBilledAmount,
          laborCostToDate,
          approvedRequisitionCost,
          committedRequisitionCost,
          recoverableRequisitionCost,
          costToDate,
          totalCommittedCost,
          profitToDate,
          marginPercent,
          billedVsExpectedPercent,
        },
        collections: {
          collectionStage: job.collectionStage,
          paymentCount: job.payments.length,
          collectedAmount,
          outstandingAmount,
          collectionPercent,
          readyForCollectionAt: job.readyForCollectionAt,
        },
        revenueAllocations: {
          count: job.revenueAllocations.length,
          allocatedAmount: roundCurrency(
            job.revenueAllocations.reduce(
              (sum, allocation) => sum + Number(allocation.allocatedAmount || 0),
              0
            )
          ),
          employeeBillableAmount: roundCurrency(
            job.revenueAllocations.reduce(
              (sum, allocation) => sum + Number(allocation.employeeBillable || 0),
              0
            )
          ),
          employeeProfitAmount: roundCurrency(
            job.revenueAllocations.reduce(
              (sum, allocation) => sum + Number(allocation.employeeProfit || 0),
              0
            )
          ),
          employeeLossAmount: roundCurrency(
            job.revenueAllocations.reduce(
              (sum, allocation) => sum + Number(allocation.employeeLoss || 0),
              0
            )
          ),
        },
        invoices: {
          total: jobInvoices.length,
          draftCount: jobInvoices.filter((invoice) => invoice.status === 'draft').length,
          issuedCount: jobInvoices.filter((invoice) => invoice.status === 'issued').length,
          partiallyPaidCount: jobInvoices.filter((invoice) => invoice.status === 'partially_paid').length,
          paidCount: jobInvoices.filter((invoice) => invoice.status === 'paid').length,
          overdueCount: jobInvoices.filter((invoice) => invoice.status === 'overdue').length,
          nextDueDate:
            [...jobInvoices]
              .filter((invoice) => invoice.status !== 'paid' && invoice.status !== 'void' && invoice.dueDate)
              .sort((left, right) =>
                new Date(left.dueDate || 0).getTime() - new Date(right.dueDate || 0).getTime()
              )[0]?.dueDate ?? null,
          items: jobInvoices,
        },
        milestones: invoiceMilestones,
        documentReadiness: {
          missingForInProgress: missingForInProgress.map((item) => item.label),
          missingForCompletion: missingForCompletion.map((item) => item.label),
        },
        requisitions: {
          totalRequests: requisitionRequests.length,
          approvedCount: approvedRequisitions.length,
          pendingCount: pendingRequisitions.length,
          approvedSpend: approvedRequisitionCost,
          committedSpend: committedRequisitionCost,
          recoverableApprovedSpend: recoverableRequisitionCost,
          recent: recentRequisitions,
        },
      },
      statusTimeline: job.statusTransitions,
      generatedAt: new Date(),
    };
  }

  /**
   * Calculate job budget status
   */
  async getJobBudgetStatus(jobId: number) {
    const job = await this.getJobById(jobId);
    const costing = await this.getJobCosting(jobId);

    if (!costing?.budgetCap) {
      return {
        jobId,
        hasBudget: false,
        capEnforced: false,
      };
    }

    // Get logged hours
    const timeEntryResult = await prisma.timeEntry.aggregate({
      where: { jobId },
      _sum: { hours: true },
    });

    const loggedHours = Number(timeEntryResult._sum.hours || 0);
    const budgetCap = costing.budgetCap;
    const allocatedHours = Number(budgetCap.totalAllocatedHours);
    const remaining = allocatedHours - loggedHours;
    const percentageUsed = allocatedHours > 0 ? (loggedHours / allocatedHours) * 100 : 0;

    return {
      jobId,
      jobName: job.jobName,
      hasBudget: true,
      capEnforced: budgetCap.capEnforced,
      allowOverage: budgetCap.allowOverage,
      allocatedHours,
      loggedHours,
      remainingHours: Math.max(0, remaining),
      percentageUsed: Number(percentageUsed.toFixed(2)),
      budgetStatus:
        remaining > 0 ? 'within_budget' : remaining === 0 ? 'at_capacity' : 'exceeded',
    };
  }
}

export default new JobService();

