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

import prisma from '../prisma';
import { NotificationService } from './notifications.service';
import { createAudit } from '../utils/audit';
import { JobStatus, TaskStatus } from '@prisma/client';
import { createClientSurveyForJobCompletion } from './surveyRouting.service';

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

export interface JobInvoiceMilestoneTrackingItem {
  taskId: number;
  title: string;
  targetPercent: number;
  dueDate: Date | null;
  requirements: string | null;
  conditionStatus: TaskStatus;
  conditionCompleted: boolean;
  milestoneAmount: number;
  expectedCumulativeAmount: number;
  amountRemainingToMilestone: number;
  milestonePaid: boolean;
  readyForInvoice: boolean;
  invoiceNumberSuggestion: string;
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

const coerceDate = (value?: unknown): Date | undefined => {
  if (!value) return undefined;
  if (value instanceof Date) return value;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
};

const JOB_MILESTONE_META_PREFIX = '[[RG_JOB_MILESTONE]]';

const roundCurrency = (value: number) =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

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
    partnerProfileId?: number;
    managerProfileId?: number;
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

  /**
   * Create a new job
   * 
   * Access: Manager (creates their own), Partner (assigned to partner), Admin
   */
  async createJob(input: JobCreateInput, authContext: AuthContext) {
    // Authorization: manager creating their own job, or admin
    const isAdmin = authContext.roles?.includes('admin') || authContext.roles?.includes('super_admin');
    const isHr = authContext.roles?.includes('hr') || authContext.roles?.includes('hr_manager');
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

    const notificationPayload = {
      title: `Job created: ${job.jobName}`,
      message: `A new job has been created for ${job.client?.clientName || 'a client'}.`,
      actionRequired: true,
      jobId: job.id,
      link: `/jobs/${job.id}`,
    };

    const recipients: number[] = [];

    if (job.managerProfileId) recipients.push(job.managerProfileId);
    if (job.partnerProfileId) recipients.push(job.partnerProfileId);

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

    const gmpProfiles = await prisma.profile.findMany({
      where: {
        user: {
          roles: {
            some: {
              role: { name: { in: ['gmp', 'group_managing_partner'] } },
            },
          },
        },
      },
      select: { id: true },
    });

    financeProfiles.forEach((profile) => recipients.push(profile.id));
    gmpProfiles.forEach((profile) => recipients.push(profile.id));

    await Promise.all(
      Array.from(new Set(recipients)).map((recipientProfileId) =>
        NotificationService.createNotification(
          {
            recipientProfileId,
            type: 'info',
            ...notificationPayload,
          },
          {
            userId: authContext.userId,
            profileId: authContext.profileId,
            roleName: authContext.roles?.[0],
          }
        )
      )
    );

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
    const isAdmin = authContext.roles?.includes('admin') || authContext.roles?.includes('super_admin');
    const isHr = authContext.roles?.includes('hr') || authContext.roles?.includes('hr_manager');

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

    const notificationPayload = {
      title: `Job created: ${job.jobName}`,
      message: `A new job has been created for ${job.client?.clientName || 'a client'}.`,
      actionRequired: true,
      jobId: job.id,
      link: `/jobs/${job.id}`,
    };

    const recipients: number[] = [];

    if (job.managerProfileId) recipients.push(job.managerProfileId);
    if (job.partnerProfileId) recipients.push(job.partnerProfileId);

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

    const gmpProfiles = await prisma.profile.findMany({
      where: {
        user: {
          roles: {
            some: {
              role: { name: { in: ['gmp', 'group_managing_partner'] } },
            },
          },
        },
      },
      select: { id: true },
    });

    financeProfiles.forEach((profile) => recipients.push(profile.id));
    gmpProfiles.forEach((profile) => recipients.push(profile.id));

    await Promise.all(
      Array.from(new Set(recipients)).map((recipientProfileId) =>
        NotificationService.createNotification(
          {
            recipientProfileId,
            type: 'info',
            ...notificationPayload,
          },
          {
            userId: authContext.userId,
            profileId: authContext.profileId,
            roleName: authContext.roles?.[0],
          }
        )
      )
    );

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
    const normalizeRole = (role?: string) =>
      String(role || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '_');
    const roleSet = new Set((authContext.roles || []).map((role) => normalizeRole(role)));
    const isAdmin =
      roleSet.has('admin') ||
      roleSet.has('super_admin') ||
      roleSet.has('hr') ||
      roleSet.has('hr_manager') ||
      roleSet.has('human_resources') ||
      roleSet.has('gmp') ||
      roleSet.has('group_managing_partner');

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
    if (filters.partnerProfileId) whereClause.partnerProfileId = filters.partnerProfileId;
    if (filters.managerProfileId) whereClause.managerProfileId = filters.managerProfileId;

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
              budgetCap: true,
              totalEstimatedCost: true,
              allocatedCost: true,
              remainingBudget: true,
            },
          },
        },
      }),
      prisma.job.count({ where: whereClause }),
    ]);

    return { jobs: jobs.map((job) => this.withDerivedOverdueStatus(job as any)), total };
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
      throw new Error('Job not found');
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
            status: true,
            dueDate: true,
          },
        },
      },
    });

    if (!job) {
      throw new Error('Job not found');
    }

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
          milestone.conditionCompleted && !milestonePaid && previousMilestonesPaid;
        const amountRemainingToMilestone = roundCurrency(
          Math.max(0, expectedCumulativeAmount - collectedAmount)
        );

        const item: JobInvoiceMilestoneTrackingItem = {
          taskId: milestone.taskId,
          title: milestone.title,
          targetPercent: milestone.targetPercent,
          dueDate: milestone.dueDate ?? null,
          requirements: milestone.requirements || null,
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

  async notifyNextReadyInvoiceMilestone(jobId: number, authContext?: AuthContext) {
    const tracking = await this.getJobInvoiceMilestoneTracking(jobId);
    if (tracking.nextReadyMilestone) {
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
      roleSet.has('admin') ||
      roleSet.has('super_admin') ||
      roleSet.has('hr') ||
      roleSet.has('hr_manager') ||
      roleSet.has('gmp') ||
      roleSet.has('group_managing_partner');
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
    const isAdmin = authContext.roles?.includes('admin');
    if (!isAdmin && job.managerProfileId !== authContext.profileId) {
      throw new Error('Not authorized to update this job');
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
    const isAdmin = authContext?.roles?.includes('admin');
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
    }

    return updated;
  }

  /**
   * Delete job (soft or hard based on status)
   */
  async deleteJob(jobId: number, authContext: AuthContext) {
    const job = await this.getJobById(jobId);

    // Authorization
    const isAdmin = authContext.roles?.includes('admin');
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

    // Authorization: job manager, partner, or admin
    const isAdmin = authContext.roles?.includes('admin');
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

    const roleSet = new Set((authContext.roles || []).map((role) => role.toLowerCase()));
    const isAdmin =
      roleSet.has('admin') ||
      roleSet.has('super_admin') ||
      roleSet.has('hr') ||
      roleSet.has('hr_manager') ||
      roleSet.has('gmp') ||
      roleSet.has('group_managing_partner');
    const isJobManager = job.managerProfileId === authContext.profileId;
    const isPartner = job.partnerProfileId === authContext.profileId;

    if (!isAdmin && !isJobManager && !isPartner) {
      throw new Error('Not authorized to update job costing');
    }

    if (!Array.isArray(input.allocations) || input.allocations.length === 0) {
      throw new Error('Allocations are required');
    }

    const roleIds = Array.from(new Set(input.allocations.map((alloc) => alloc.roleId)));
    const roles = await prisma.positionRole.findMany({
      where: { id: { in: roleIds } },
      select: { id: true, name: true, billingRate: true },
    });

    const roleRateMap = new Map<number, number>(
      roles.map((role) => [role.id, Number(role.billingRate)])
    );
    const allocationData = input.allocations.map((alloc) => {
      const rate = alloc.hourlyRate ?? roleRateMap.get(alloc.roleId) ?? 0;
      const hours = Number(alloc.allocatedHours);
      const estimatedCost = hours * rate;

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

    const allocationEmployeeIds = Array.from(
      new Set(allocationData.map((alloc) => alloc.employeeProfileId))
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
            link: `/workload-management?jobId=${job.id}`,
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
            link: `/workload-management?jobId=${job.id}`,
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
    const partnerApprove = Boolean(input.partnerApprove);
    const canPartnerApprove = isPartner || isAdmin;
    const now = new Date();

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
          message: `Manager submitted job costing for "${job.jobName}". Partner approval is required before execution.`,
          actionRequired: true,
          jobId: job.id,
          link: `/jobs/${job.id}`,
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
          link: `/jobs/${job.id}`,
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
    const isAdmin = roleSet.has('admin') || roleSet.has('super_admin');
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
    const isAdmin = roleSet.has('admin') || roleSet.has('super_admin');
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

    // Sum billable amounts from time entries
    const timeEntryResult = await prisma.timeEntry.aggregate({
      where: { jobId },
      _sum: {
        billableAmount: true,
        costAmount: true,
        profitLoss: true,
      },
    });

    const totalRevenue = timeEntryResult._sum.billableAmount || 0;
    const totalCost = timeEntryResult._sum.costAmount || 0;
    const totalProfitLoss = timeEntryResult._sum.profitLoss || 0;

    const revenueNumber = Number(totalRevenue);
    const profitNumber = Number(totalProfitLoss);
    const marginPercent = revenueNumber > 0 ? (profitNumber / revenueNumber) * 100 : 0;

    return {
      jobId,
      jobName: job.jobName,
      totalRevenue: Number(totalRevenue),
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

