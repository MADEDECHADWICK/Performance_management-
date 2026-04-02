import {
  NotificationType,
  Prisma,
  RequisitionAccountabilityStatus,
  RequisitionApprovalDecision,
  RequisitionApprovalStageType,
  RequisitionStatus,
} from "@prisma/client";
import prisma from "../prisma";
import { NotificationService } from "./notifications.service";
import createAudit from "../utils/audit";

type AuthContext = {
  userId: number;
  profileId: number;
  roleName?: string;
  roles: string[];
};

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

type FieldSchemaItem = {
  key: string;
  label: string;
  type: "text" | "textarea" | "number" | "date" | "boolean" | "select";
  required?: boolean;
  helpText?: string;
  placeholder?: string;
  options?: Array<{ label: string; value: string }>;
};

type CreateRequisitionTypeInput = {
  code: string;
  name: string;
  description?: string;
  sourceModule: string;
  isActive?: boolean;
  requiresJob?: boolean;
  requiresClient?: boolean;
  requiresVendor?: boolean;
  requiresDueDate?: boolean;
  requiresAttachment?: boolean;
  fieldSchema?: unknown;
};

type CreateRequisitionRequestInput = {
  requisitionTypeId: number;
  title: string;
  justification?: string;
  amount: number;
  amountBreakdown?: unknown;
  currency?: string;
  quantity?: number | null;
  neededByDate?: string | Date | null;
  vendorName?: string;
  clientId?: number | null;
  jobId?: number | null;
  isClientRecoverable?: boolean;
  taxImpactNotes?: string;
  moduleData?: Record<string, unknown> | null;
  attachmentDocumentIds?: number[];
};

type ReviewRequisitionInput = {
  notes?: string;
  reason?: string;
};

type UpdateFinanceStageRequisitionInput = {
  title?: string;
  justification?: string;
  amount?: number;
  amountBreakdown?: unknown;
  currency?: string;
  quantity?: number | null;
  neededByDate?: string | Date | null;
  vendorName?: string;
  isClientRecoverable?: boolean;
  taxImpactNotes?: string;
  moduleData?: Record<string, unknown> | null;
};

type ReleaseRequisitionFundsInput = {
  notes?: string;
  releasedAt?: string | Date | null;
};

type SubmitRequisitionAccountabilityInput = {
  notes?: string;
  attachmentDocumentIds?: number[];
};

type RequisitionAmountBreakdownItem = {
  label: string;
  amount: number;
  notes?: string;
};

const PRIVILEGED_ROLES = new Set(["super_admin", "hr", "gmp"]);
const REQUESTER_DIRECT_GMP_ROLES = new Set(["finance", "marketing"]);
const REQUESTER_DIRECT_GMP_MODULES = new Set(["finance", "marketing"]);
const APPROVER_ROLES = new Set(["manager", "partner", "gmp", "super_admin", "hr", "finance"]);
const ACTIVE_PENDING_STATUSES: RequisitionStatus[] = [
  RequisitionStatus.pending_manager_approval,
  RequisitionStatus.pending_partner_approval,
  RequisitionStatus.pending_gmp_approval,
  RequisitionStatus.pending_finance_approval,
];
const VALID_FIELD_TYPES = new Set(["text", "textarea", "number", "date", "boolean", "select"]);
const DEFAULT_CURRENCY = "KES";
const ACCOUNTABILITY_WINDOW_DAYS = 21;

const REQUEST_ARGS = Prisma.validator<Prisma.RequisitionRequestDefaultArgs>()({
  include: {
    requisitionType: true,
    requester: {
      select: {
        id: true,
        firstName: true,
        lastName: true,
        positionTitle: true,
        department: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    },
    requesterDepartment: {
      select: {
        id: true,
        name: true,
      },
    },
    currentApprover: {
      select: {
        id: true,
        firstName: true,
        lastName: true,
        positionTitle: true,
      },
    },
    releasedBy: {
      select: {
        id: true,
        firstName: true,
        lastName: true,
        positionTitle: true,
      },
    },
    accountabilitySubmittedBy: {
      select: {
        id: true,
        firstName: true,
        lastName: true,
        positionTitle: true,
      },
    },
    client: {
      select: {
        id: true,
        clientName: true,
        clientCode: true,
      },
    },
    job: {
      select: {
        id: true,
        jobName: true,
        jobCode: true,
      },
    },
    approvalSteps: {
      include: {
        approver: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            positionTitle: true,
          },
        },
      },
      orderBy: [{ stepNumber: "asc" }],
    },
  },
});

type RequisitionWithRelations = Prisma.RequisitionRequestGetPayload<typeof REQUEST_ARGS>;

const normalizeRole = (role: string) =>
  String(role || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");

const uniqueRoles = (roles: string[]) =>
  Array.from(new Set((roles || []).map((role) => normalizeRole(role)).filter(Boolean)));

const isPrivileged = (auth: AuthContext) => uniqueRoles(auth.roles).some((role) => PRIVILEGED_ROLES.has(role));

const canApprove = (auth: AuthContext) => uniqueRoles(auth.roles).some((role) => APPROVER_ROLES.has(role));
const isFinanceActor = (auth: AuthContext) =>
  isPrivileged(auth) || uniqueRoles(auth.roles).includes("finance");

const roundMoney = (value: number) => Number(value.toFixed(2));

const parseDateOnly = (value: string | Date) => {
  const date = value instanceof Date ? new Date(value) : new Date(String(value));
  if (Number.isNaN(date.getTime())) {
    throw { statusCode: 400, message: "Invalid date value" };
  }
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
};

const parseDateTimeValue = (value: string | Date) => {
  const date = value instanceof Date ? new Date(value) : new Date(String(value));
  if (Number.isNaN(date.getTime())) {
    throw { statusCode: 400, message: "Invalid datetime value" };
  }
  return date;
};

const formatStatusLabel = (status: RequisitionStatus) =>
  status.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());

export default class RequisitionService {
  private static buildAccessibleJobWhere(auth: AuthContext) {
    if (isPrivileged(auth)) {
      return undefined;
    }

    return {
      OR: [
        {
          staffing: {
            some: {
              employeeProfileId: auth.profileId,
            },
          },
        },
        { managerProfileId: auth.profileId },
        { partnerProfileId: auth.profileId },
      ],
    } as Prisma.JobWhereInput;
  }

  private static ensureAdminAccess(auth: AuthContext) {
    if (!isPrivileged(auth)) {
      throw { statusCode: 403, message: "You do not have requisition admin access" };
    }
  }

  private static ensureApproveAccess(auth: AuthContext) {
    if (!canApprove(auth)) {
      throw { statusCode: 403, message: "You do not have requisition approval access" };
    }
  }

  private static ensureFinanceAccess(auth: AuthContext, message = "You do not have finance requisition access") {
    if (!isFinanceActor(auth)) {
      throw { statusCode: 403, message };
    }
  }

  private static normalizeFieldSchema(value: unknown): FieldSchemaItem[] {
    if (value === undefined || value === null || value === "") {
      return [];
    }

    let parsed = value;
    if (typeof value === "string") {
      try {
        parsed = JSON.parse(value);
      } catch {
        throw { statusCode: 400, message: "fieldSchema must be valid JSON" };
      }
    }

    if (!Array.isArray(parsed)) {
      throw { statusCode: 400, message: "fieldSchema must be an array" };
    }

    return parsed.map((item, index) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        throw { statusCode: 400, message: `fieldSchema[${index}] must be an object` };
      }

      const key = String((item as any).key || "").trim();
      const label = String((item as any).label || "").trim();
      const type = String((item as any).type || "").trim().toLowerCase();

      if (!key || !/^[a-zA-Z][a-zA-Z0-9_]*$/.test(key)) {
        throw { statusCode: 400, message: `fieldSchema[${index}].key must be a valid identifier` };
      }
      if (!label) {
        throw { statusCode: 400, message: `fieldSchema[${index}].label is required` };
      }
      if (!VALID_FIELD_TYPES.has(type)) {
        throw { statusCode: 400, message: `fieldSchema[${index}].type is invalid` };
      }

      const normalized: FieldSchemaItem = {
        key,
        label,
        type: type as FieldSchemaItem["type"],
        required: Boolean((item as any).required),
      };

      const helpText = String((item as any).helpText || "").trim();
      const placeholder = String((item as any).placeholder || "").trim();
      if (helpText) normalized.helpText = helpText;
      if (placeholder) normalized.placeholder = placeholder;

      if (type === "select") {
        const rawOptions = Array.isArray((item as any).options) ? (item as any).options : [];
        const options = rawOptions.map((option: any, optionIndex: number) => {
          const optionLabel = String(option?.label || "").trim();
          const optionValue = String(option?.value || "").trim();
          if (!optionLabel || !optionValue) {
            throw {
              statusCode: 400,
              message: `fieldSchema[${index}].options[${optionIndex}] must include label and value`,
            };
          }
          return { label: optionLabel, value: optionValue };
        });
        if (!options.length) {
          throw { statusCode: 400, message: `fieldSchema[${index}].options is required for select fields` };
        }
        normalized.options = options;
      }

      return normalized;
    });
  }

  private static async resolveActiveProfileById(
    tx: Tx,
    profileId: number,
    message: string
  ) {
    const profile = await tx.profile.findUnique({
      where: { id: profileId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        status: true,
      },
    });

    if (!profile || profile.status !== "active") {
      throw { statusCode: 422, message };
    }

    return profile;
  }

  private static async resolveRequesterProfile(tx: Tx, auth: AuthContext) {
    const profile = await tx.profile.findUnique({
      where: { id: auth.profileId },
      include: {
        department: {
          select: {
            id: true,
            name: true,
            departmentHeadId: true,
            partnerProfileId: true,
          },
        },
      },
    });

    if (!profile || profile.status !== "active") {
      throw { statusCode: 404, message: "Requester profile not found or inactive" };
    }

    return profile;
  }

  private static async resolveGmpApprover(tx: Tx) {
    const gmp = await tx.profile.findFirst({
      where: {
        status: "active",
        user: {
          roles: {
            some: {
              role: {
                name: "gmp",
              },
            },
          },
        },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
      },
      orderBy: [{ id: "asc" }],
    });

    if (!gmp) {
      throw { statusCode: 422, message: "No active GMP profile is configured for requisition approvals" };
    }

    return gmp;
  }

  private static async resolveFinanceApprover(
    tx: Tx,
    options?: {
      excludeProfileIds?: number[];
    }
  ) {
    const excludeProfileIds = Array.from(
      new Set(
        (options?.excludeProfileIds || [])
          .map((value) => Number(value))
          .filter((value) => Number.isInteger(value) && value > 0)
      )
    );

    const buildWhere = (excludeIds: number[]) => ({
      status: "active" as const,
      ...(excludeIds.length ? { id: { notIn: excludeIds } } : {}),
      user: {
        roles: {
          some: {
            role: {
              name: "finance",
            },
          },
        },
      },
    });

    let financeApprover = await tx.profile.findFirst({
      where: buildWhere(excludeProfileIds),
      select: {
        id: true,
        firstName: true,
        lastName: true,
      },
      orderBy: [{ id: "asc" }],
    });

    if (!financeApprover && excludeProfileIds.length) {
      financeApprover = await tx.profile.findFirst({
        where: buildWhere([]),
        select: {
          id: true,
          firstName: true,
          lastName: true,
        },
        orderBy: [{ id: "asc" }],
      });
    }

    if (!financeApprover) {
      throw { statusCode: 422, message: "No active finance approver is configured for requisition disbursement" };
    }

    return financeApprover;
  }

  private static async resolveManagerApprover(
    tx: Tx,
    requester: Awaited<ReturnType<typeof RequisitionService.resolveRequesterProfile>>
  ) {
    if (requester.managerId) {
      try {
        return await this.resolveActiveProfileById(
          tx,
          requester.managerId,
          "Requester manager is not active"
        );
      } catch {}
    }

    if (requester.department?.departmentHeadId && requester.department.departmentHeadId !== requester.id) {
      return this.resolveActiveProfileById(
        tx,
        requester.department.departmentHeadId,
        "Department head is not active for requisition approval"
      );
    }

    throw { statusCode: 422, message: "No active manager approver is configured for this requester" };
  }

  private static async resolvePartnerApprover(
    tx: Tx,
    requester: Awaited<ReturnType<typeof RequisitionService.resolveRequesterProfile>>,
    jobId?: number | null,
    clientId?: number | null
  ) {
    if (jobId) {
      const job = await tx.job.findUnique({
        where: { id: jobId },
        select: {
          id: true,
          partnerProfileId: true,
          clientId: true,
        },
      });

      if (!job) {
        throw { statusCode: 404, message: "Selected job was not found" };
      }

      if (job.partnerProfileId) {
        try {
          return await this.resolveActiveProfileById(
            tx,
            job.partnerProfileId,
            "Job partner is not active for requisition approval"
          );
        } catch {}
      }

      clientId = clientId || job.clientId;
    }

    if (clientId) {
      const client = await tx.client.findUnique({
        where: { id: clientId },
        select: {
          id: true,
          partnerProfileId: true,
        },
      });

      if (!client) {
        throw { statusCode: 404, message: "Selected client was not found" };
      }

      if (client.partnerProfileId) {
        try {
          return await this.resolveActiveProfileById(
            tx,
            client.partnerProfileId,
            "Client partner is not active for requisition approval"
          );
        } catch {}
      }
    }

    if (requester.department?.partnerProfileId) {
      try {
        return await this.resolveActiveProfileById(
          tx,
          requester.department.partnerProfileId,
          "Department partner is not active for requisition approval"
        );
      } catch {}
    }

    return this.resolveGmpApprover(tx);
  }

  private static async validateRequestScope(
    tx: Tx,
    type: { requiresJob: boolean; requiresClient: boolean; requiresVendor: boolean; requiresDueDate: boolean },
    input: CreateRequisitionRequestInput,
    auth: AuthContext
  ) {
    const jobId = input.jobId ? Number(input.jobId) : null;
    const clientId = input.clientId ? Number(input.clientId) : null;

    if (type.requiresJob && !jobId) {
      throw { statusCode: 400, message: "This requisition type requires a job" };
    }
    if (type.requiresClient && !clientId && !jobId) {
      throw { statusCode: 400, message: "This requisition type requires a client or job" };
    }
    if (type.requiresVendor && !String(input.vendorName || "").trim()) {
      throw { statusCode: 400, message: "This requisition type requires a vendor name" };
    }
    if (type.requiresDueDate && !input.neededByDate) {
      throw { statusCode: 400, message: "This requisition type requires a needed-by date" };
    }

    let resolvedJobId: number | null = jobId;
    let resolvedClientId: number | null = clientId;

    if (jobId) {
      const job = await tx.job.findUnique({
        where: { id: jobId },
        select: {
          id: true,
          clientId: true,
          status: true,
          managerProfileId: true,
          partnerProfileId: true,
          staffing: isPrivileged(auth)
            ? false
            : {
                where: { employeeProfileId: auth.profileId },
                select: { id: true },
                take: 1,
              },
        },
      });
      if (!job) {
        throw { statusCode: 404, message: "Selected job was not found" };
      }

      if (["completed", "cancelled"].includes(String(job.status))) {
        throw { statusCode: 422, message: "Selected job is closed and cannot accept new requisitions" };
      }

      if (!isPrivileged(auth)) {
        const hasStaffAssignment = Array.isArray(job.staffing) && job.staffing.length > 0;
        const isAssignedManager = Number(job.managerProfileId || 0) === auth.profileId;
        const isAssignedPartner = Number(job.partnerProfileId || 0) === auth.profileId;
        if (!hasStaffAssignment && !isAssignedManager && !isAssignedPartner) {
          throw {
            statusCode: 403,
            message: "You can only raise job-linked requisitions against jobs assigned to you",
          };
        }
      }

      if (resolvedClientId && job.clientId && Number(resolvedClientId) !== Number(job.clientId)) {
        throw { statusCode: 400, message: "Selected client does not match the chosen job" };
      }

      resolvedJobId = job.id;
      resolvedClientId = resolvedClientId || job.clientId || null;
    }

    if (type.requiresClient && !resolvedClientId) {
      throw { statusCode: 400, message: "This requisition type requires a client-linked job or client" };
    }

    if (resolvedClientId) {
      const client = await tx.client.findUnique({
        where: { id: resolvedClientId },
        select: { id: true },
      });
      if (!client) {
        throw { statusCode: 404, message: "Selected client was not found" };
      }
    }

    return { jobId: resolvedJobId, clientId: resolvedClientId };
  }

  private static validateModuleData(fieldSchema: FieldSchemaItem[], moduleData: unknown) {
    const normalized =
      moduleData && typeof moduleData === "object" && !Array.isArray(moduleData)
        ? { ...(moduleData as Record<string, unknown>) }
        : {};

    for (const field of fieldSchema) {
      const value = normalized[field.key];
      const isEmptyString = typeof value === "string" && !value.trim();
      const isMissing = value === undefined || value === null || isEmptyString;

      if (field.required && isMissing) {
        throw { statusCode: 400, message: `${field.label} is required for this requisition type` };
      }

      if (isMissing) continue;

      if (field.type === "number" && !Number.isFinite(Number(value))) {
        throw { statusCode: 400, message: `${field.label} must be numeric` };
      }
      if (field.type === "date" && Number.isNaN(new Date(String(value)).getTime())) {
        throw { statusCode: 400, message: `${field.label} must be a valid date` };
      }
      if (field.type === "boolean" && typeof value !== "boolean") {
        throw { statusCode: 400, message: `${field.label} must be true or false` };
      }
      if (field.type === "select") {
        const allowed = new Set((field.options || []).map((option) => option.value));
        if (!allowed.has(String(value))) {
          throw { statusCode: 400, message: `${field.label} has an invalid selection` };
        }
      }
    }

    return normalized;
  }

  private static normalizeAmountBreakdown(
    value: unknown,
    totalAmount: number
  ): RequisitionAmountBreakdownItem[] | null {
    if (value === undefined || value === null || value === "") {
      return null;
    }

    let parsed = value;
    if (typeof value === "string") {
      try {
        parsed = JSON.parse(value);
      } catch {
        throw { statusCode: 400, message: "amountBreakdown must be valid JSON" };
      }
    }

    if (!Array.isArray(parsed)) {
      throw { statusCode: 400, message: "amountBreakdown must be an array" };
    }

    const normalized = parsed.map((item, index) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        throw { statusCode: 400, message: `amountBreakdown[${index}] must be an object` };
      }

      const label = String((item as any).label || "").trim();
      const notes = String((item as any).notes || "").trim();
      const amount = roundMoney(Number((item as any).amount || 0));

      if (!label) {
        throw { statusCode: 400, message: `amountBreakdown[${index}].label is required` };
      }
      if (!Number.isFinite(amount) || amount <= 0) {
        throw { statusCode: 400, message: `amountBreakdown[${index}].amount must be greater than zero` };
      }

      return {
        label,
        amount,
        ...(notes ? { notes } : {}),
      };
    });

    if (!normalized.length) {
      throw { statusCode: 400, message: "amountBreakdown must include at least one line when provided" };
    }

    const breakdownTotal = roundMoney(
      normalized.reduce((sum, item) => sum + Number(item.amount || 0), 0)
    );

    if (Math.abs(breakdownTotal - roundMoney(totalAmount)) > 0.01) {
      throw {
        statusCode: 400,
        message: "Amount breakdown total must match the requisition amount",
      };
    }

    return normalized;
  }

  private static async validateAttachmentIds(
    tx: Tx,
    attachmentDocumentIds: number[] | undefined,
    requiresAttachment: boolean,
    auth: AuthContext
  ) {
    const attachmentIds = Array.isArray(attachmentDocumentIds)
      ? attachmentDocumentIds
          .map((value) => Number(value))
          .filter((value) => Number.isInteger(value) && value > 0)
      : [];

    if (requiresAttachment && attachmentIds.length === 0) {
      throw { statusCode: 400, message: "This requisition type requires at least one attachment" };
    }

    if (!attachmentIds.length) {
      return [];
    }

    const documents = await tx.document.findMany({
      where: {
        id: { in: attachmentIds },
      },
      select: {
        id: true,
        uploadedBy: true,
      },
    });

    if (documents.length !== attachmentIds.length) {
      throw { statusCode: 400, message: "One or more attachment documents were not found" };
    }

    for (const document of documents) {
      if (document.uploadedBy !== auth.profileId && !isPrivileged(auth)) {
        throw { statusCode: 403, message: "You can only attach documents you uploaded" };
      }
    }

    return attachmentIds;
  }

  private static async attachDocumentsToRequest(
    tx: Tx,
    attachmentIds: number[],
    requisitionRequestId: number,
    auth: AuthContext,
    options?: {
      description?: string;
      accessLevel?: "employee" | "manager" | "hr" | "admin";
    }
  ) {
    if (!attachmentIds.length) return;

    await tx.document.updateMany({
      where: { id: { in: attachmentIds } },
      data: {
        entityType: "RequisitionRequest",
        entityId: requisitionRequestId,
        description: options?.description || "Requisition supporting document",
        accessLevel: options?.accessLevel || (isPrivileged(auth) ? "admin" : "employee"),
      },
    });
  }

  private static async buildApprovalRoute(
    tx: Tx,
    requester: Awaited<ReturnType<typeof RequisitionService.resolveRequesterProfile>>,
    auth: AuthContext,
    sourceModule?: string | null,
    jobId?: number | null,
    clientId?: number | null
  ) {
    const roles = uniqueRoles(auth.roles);
    const normalizedSourceModule = String(sourceModule || "").trim().toLowerCase();
    const requesterDepartmentName = String(requester.department?.name || "").trim().toLowerCase();
    const financeApprover = await this.resolveFinanceApprover(tx, {
      excludeProfileIds: [requester.id],
    });
    const appendFinanceStep = (
      steps: Array<{
        stepNumber: number;
        stageType: RequisitionApprovalStageType;
        approverProfileId: number;
        approverName: string;
      }>
    ) => {
      if (
        steps.some(
          (step) =>
            step.stageType === RequisitionApprovalStageType.finance &&
            step.approverProfileId === financeApprover.id
        )
      ) {
        return steps;
      }

      return [
        ...steps,
        {
          stepNumber: steps.length + 1,
          stageType: RequisitionApprovalStageType.finance,
          approverProfileId: financeApprover.id,
          approverName: `${financeApprover.firstName} ${financeApprover.lastName}`.trim(),
        },
      ];
    };
    const requesterRequiresDirectGmp =
      roles.some((role) => REQUESTER_DIRECT_GMP_ROLES.has(role)) ||
      REQUESTER_DIRECT_GMP_MODULES.has(normalizedSourceModule) ||
      requesterDepartmentName === "finance" ||
      requesterDepartmentName === "marketing";

    if (requesterRequiresDirectGmp) {
      const gmp = await this.resolveGmpApprover(tx);
      return appendFinanceStep([
        {
          stepNumber: 1,
          stageType: RequisitionApprovalStageType.gmp,
          approverProfileId: gmp.id,
          approverName: `${gmp.firstName} ${gmp.lastName}`.trim(),
        },
      ]);
    }

    if (roles.includes("gmp") || roles.includes("super_admin")) {
      return appendFinanceStep([]);
    }

    if (roles.includes("partner") || requester.isPartner) {
      const gmp = await this.resolveGmpApprover(tx);
      return appendFinanceStep([
        {
          stepNumber: 1,
          stageType: RequisitionApprovalStageType.gmp,
          approverProfileId: gmp.id,
          approverName: `${gmp.firstName} ${gmp.lastName}`.trim(),
        },
      ]);
    }

    const partner = await this.resolvePartnerApprover(tx, requester, jobId, clientId);

    if (roles.includes("manager")) {
      const gmp = await this.resolveGmpApprover(tx);
      return appendFinanceStep([
        {
          stepNumber: 1,
          stageType:
            partner.id === gmp.id
              ? RequisitionApprovalStageType.gmp
              : RequisitionApprovalStageType.partner,
          approverProfileId: partner.id,
          approverName: `${partner.firstName} ${partner.lastName}`.trim(),
        },
      ]);
    }

    const manager = await this.resolveManagerApprover(tx, requester);
    const steps: Array<{
      stepNumber: number;
      stageType: RequisitionApprovalStageType;
      approverProfileId: number;
      approverName: string;
    }> = [];

    if (manager.id !== requester.id) {
      steps.push({
        stepNumber: 1,
        stageType: RequisitionApprovalStageType.manager,
        approverProfileId: manager.id,
        approverName: `${manager.firstName} ${manager.lastName}`.trim(),
      });
    }

    if (!steps.some((step) => step.approverProfileId === partner.id)) {
      const gmp = await this.resolveGmpApprover(tx);
      steps.push({
        stepNumber: steps.length + 1,
        stageType:
          partner.id === gmp.id
            ? RequisitionApprovalStageType.gmp
            : RequisitionApprovalStageType.partner,
        approverProfileId: partner.id,
        approverName: `${partner.firstName} ${partner.lastName}`.trim(),
      });
    }

    return appendFinanceStep(steps);
  }

  private static statusForStage(stageType: RequisitionApprovalStageType) {
    switch (stageType) {
      case RequisitionApprovalStageType.partner:
        return RequisitionStatus.pending_partner_approval;
      case RequisitionApprovalStageType.gmp:
        return RequisitionStatus.pending_gmp_approval;
      case RequisitionApprovalStageType.finance:
        return RequisitionStatus.pending_finance_approval;
      case RequisitionApprovalStageType.manager:
      default:
        return RequisitionStatus.pending_manager_approval;
    }
  }

  private static approvalNotificationMessage(
    request: RequisitionWithRelations,
    nextStep: RequisitionWithRelations["approvalSteps"][number]
  ) {
    if (nextStep.stageType === RequisitionApprovalStageType.finance) {
      return `${request.requester.firstName} ${request.requester.lastName} requisition "${request.title}" is ready for finance approval and disbursement.`;
    }

    return `${request.requester.firstName} ${request.requester.lastName} requisition "${request.title}" is ready for your review.`;
  }

  private static generateRequisitionNumber() {
    const now = new Date();
    const yyyy = now.getUTCFullYear();
    const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(now.getUTCDate()).padStart(2, "0");
    const hh = String(now.getUTCHours()).padStart(2, "0");
    const min = String(now.getUTCMinutes()).padStart(2, "0");
    const sec = String(now.getUTCSeconds()).padStart(2, "0");
    const suffix = Math.floor(Math.random() * 9000 + 1000);
    return `REQ-${yyyy}${mm}${dd}-${hh}${min}${sec}-${suffix}`;
  }

  private static async createStatusTransition(
    tx: Tx,
    request: { id: number; status: RequisitionStatus; clientId?: number | null; jobId?: number | null },
    toStatus: RequisitionStatus,
    auth: AuthContext,
    reason?: string | null
  ) {
    await tx.statusTransition.create({
      data: {
        entityType: "RequisitionRequest",
        entityId: request.id,
        fromStatus: request.status,
        toStatus,
        changedByProfileId: auth.profileId,
        reason: reason || null,
        metadata: {
          requisitionRequestId: request.id,
        },
        clientId: request.clientId || null,
        jobId: request.jobId || null,
      },
    });
  }

  private static async notifyApprover(
    requisitionRequestId: number,
    approverProfileId: number,
    title: string,
    message: string,
    auth: AuthContext
  ) {
    await NotificationService.createNotification(
      {
        recipientProfileId: approverProfileId,
        type: NotificationType.action,
        title,
        message,
        actionRequired: true,
        link: "/requisitions/approvals",
      },
      auth
    );
  }

  private static async notifyRequester(
    requesterProfileId: number,
    title: string,
    message: string,
    type: NotificationType,
    auth: AuthContext
  ) {
    await NotificationService.createNotification(
      {
        recipientProfileId: requesterProfileId,
        type,
        title,
        message,
        actionRequired: false,
        link: "/requisitions",
      },
      auth
    );
  }

  private static async addAttachmentSummaries<T extends Array<any>>(items: T) {
    const ids = items.map((item) => item.id).filter((id) => Number.isInteger(id));
    if (!ids.length) return items;

    const documents = await prisma.document.findMany({
      where: {
        entityType: "RequisitionRequest",
        entityId: { in: ids },
      },
      select: {
        id: true,
        entityId: true,
        fileName: true,
        documentType: true,
        createdAt: true,
      },
      orderBy: [{ createdAt: "desc" }],
    });

    const map = new Map<number, Array<any>>();
    for (const document of documents) {
      const requestId = Number(document.entityId);
      if (!map.has(requestId)) map.set(requestId, []);
      map.get(requestId)!.push(document);
    }

    return items.map((item) => ({
      ...item,
      attachmentCount: map.get(item.id)?.length || 0,
      attachments: map.get(item.id) || [],
    })) as T;
  }

  private static async loadRequestOrThrow(
    tx: Tx,
    requisitionRequestId: number
  ): Promise<RequisitionWithRelations> {
    const request = await tx.requisitionRequest.findUnique({
      where: { id: requisitionRequestId },
      include: REQUEST_ARGS.include,
    });

    if (!request) {
      throw { statusCode: 404, message: "Requisition request not found" };
    }

    return request;
  }

  private static async ensureRequestAccess(
    tx: Tx,
    requisitionRequestId: number,
    auth: AuthContext
  ): Promise<RequisitionWithRelations> {
    const request = await this.loadRequestOrThrow(tx, requisitionRequestId);
    if (isPrivileged(auth)) return request;

    const isRequester = request.requesterProfileId === auth.profileId;
    const isCurrentApprover = request.currentApproverProfileId === auth.profileId;
    const isAssignedApprover = request.approvalSteps.some((step) => step.approverProfileId === auth.profileId);
    if (!isRequester && !isCurrentApprover && !isAssignedApprover) {
      throw { statusCode: 403, message: "You do not have access to this requisition request" };
    }

    return request;
  }

  static async listRequisitionTypes(auth: AuthContext) {
    return prisma.requisitionType.findMany({
      where: isPrivileged(auth) ? undefined : { isActive: true },
      orderBy: [{ isActive: "desc" }, { sourceModule: "asc" }, { name: "asc" }],
    });
  }

  static async listAvailableJobs(auth: AuthContext) {
    const scopedWhere = this.buildAccessibleJobWhere(auth);
    const where: Prisma.JobWhereInput = {
      status: {
        notIn: ["completed", "cancelled"],
      },
      ...(scopedWhere || {}),
    };

    return prisma.job.findMany({
      where,
      select: {
        id: true,
        jobName: true,
        jobCode: true,
        status: true,
        clientId: true,
        client: {
          select: {
            id: true,
            clientName: true,
            clientCode: true,
          },
        },
      },
      orderBy: [{ jobName: "asc" }, { id: "asc" }],
    });
  }

  static async createRequisitionType(input: CreateRequisitionTypeInput, auth: AuthContext) {
    this.ensureAdminAccess(auth);
    const fieldSchema = this.normalizeFieldSchema(input.fieldSchema);
    const created = await prisma.requisitionType.create({
      data: {
        code: String(input.code || "").trim().toUpperCase(),
        name: String(input.name || "").trim(),
        description: String(input.description || "").trim() || null,
        sourceModule: String(input.sourceModule || "").trim().toLowerCase(),
        isActive: input.isActive ?? true,
        requiresJob: Boolean(input.requiresJob),
        requiresClient: Boolean(input.requiresClient),
        requiresVendor: Boolean(input.requiresVendor),
        requiresDueDate: Boolean(input.requiresDueDate),
        requiresAttachment: Boolean(input.requiresAttachment),
        fieldSchema: fieldSchema.length ? (fieldSchema as any) : null,
      },
    });

    await createAudit({
      action: "requisition.type_created",
      entity_type: "requisition_type",
      entity_id: created.id,
      user_id: auth.userId,
      metadata: {
        actorProfileId: auth.profileId,
        sourceModule: created.sourceModule,
      },
    });

    return created;
  }

  static async updateRequisitionType(
    requisitionTypeId: number,
    input: Partial<CreateRequisitionTypeInput>,
    auth: AuthContext
  ) {
    this.ensureAdminAccess(auth);
    const data: Record<string, unknown> = {};
    if (input.code !== undefined) data.code = String(input.code || "").trim().toUpperCase();
    if (input.name !== undefined) data.name = String(input.name || "").trim();
    if (input.description !== undefined) data.description = String(input.description || "").trim() || null;
    if (input.sourceModule !== undefined) {
      data.sourceModule = String(input.sourceModule || "").trim().toLowerCase();
    }
    if (input.isActive !== undefined) data.isActive = Boolean(input.isActive);
    if (input.requiresJob !== undefined) data.requiresJob = Boolean(input.requiresJob);
    if (input.requiresClient !== undefined) data.requiresClient = Boolean(input.requiresClient);
    if (input.requiresVendor !== undefined) data.requiresVendor = Boolean(input.requiresVendor);
    if (input.requiresDueDate !== undefined) data.requiresDueDate = Boolean(input.requiresDueDate);
    if (input.requiresAttachment !== undefined) data.requiresAttachment = Boolean(input.requiresAttachment);
    if (input.fieldSchema !== undefined) {
      const fieldSchema = this.normalizeFieldSchema(input.fieldSchema);
      data.fieldSchema = fieldSchema.length ? (fieldSchema as any) : null;
    }

    const updated = await prisma.requisitionType.update({
      where: { id: requisitionTypeId },
      data,
    });

    await createAudit({
      action: "requisition.type_updated",
      entity_type: "requisition_type",
      entity_id: updated.id,
      user_id: auth.userId,
      metadata: { actorProfileId: auth.profileId },
    });

    return updated;
  }

  static async deleteRequisitionType(requisitionTypeId: number, auth: AuthContext) {
    this.ensureAdminAccess(auth);
    const updated = await prisma.requisitionType.update({
      where: { id: requisitionTypeId },
      data: { isActive: false },
    });

    await createAudit({
      action: "requisition.type_deactivated",
      entity_type: "requisition_type",
      entity_id: updated.id,
      user_id: auth.userId,
      metadata: { actorProfileId: auth.profileId },
    });

    return updated;
  }

  static async listRequisitionRequests(
    options: {
      page: number;
      pageSize: number;
      status?: string;
      sourceModule?: string;
      requesterProfileId?: number;
    },
    auth: AuthContext
  ) {
    const page = Math.max(1, Number(options.page || 1));
    const pageSize = Math.max(1, Math.min(100, Number(options.pageSize || 10)));
    const skip = (page - 1) * pageSize;
    const where: any = {};

    if (options.status) where.status = options.status;
    if (options.sourceModule) where.sourceModule = String(options.sourceModule).trim().toLowerCase();

    if (isPrivileged(auth)) {
      if (options.requesterProfileId) {
        where.requesterProfileId = Number(options.requesterProfileId);
      }
    } else {
      where.requesterProfileId = auth.profileId;
    }

    const [requests, total] = await Promise.all([
      prisma.requisitionRequest.findMany({
        where,
        include: REQUEST_ARGS.include,
        orderBy: [{ submittedAt: "desc" }, { createdAt: "desc" }],
        skip,
        take: pageSize,
      }),
      prisma.requisitionRequest.count({ where }),
    ]);

    return {
      requests: await this.addAttachmentSummaries(requests),
      total,
    };
  }

  static async getRequisitionRequest(requisitionRequestId: number, auth: AuthContext) {
    const request = await prisma.$transaction((tx) =>
      this.ensureRequestAccess(tx, requisitionRequestId, auth)
    );
    const [decorated] = await this.addAttachmentSummaries([request]);
    return decorated;
  }

  static async createRequisitionRequest(input: CreateRequisitionRequestInput, auth: AuthContext) {
    return prisma.$transaction(async (tx) => {
      const requester = await this.resolveRequesterProfile(tx, auth);
      const requisitionType = await tx.requisitionType.findUnique({
        where: { id: Number(input.requisitionTypeId) },
      });

      if (!requisitionType || !requisitionType.isActive) {
        throw { statusCode: 404, message: "Requisition type not found or inactive" };
      }

      const title = String(input.title || "").trim();
      if (!title) {
        throw { statusCode: 400, message: "Title is required" };
      }

      const amount = roundMoney(Number(input.amount || 0));
      if (amount <= 0) {
        throw { statusCode: 400, message: "Amount must be greater than zero" };
      }
      const amountBreakdown = this.normalizeAmountBreakdown(input.amountBreakdown, amount);

      const quantity = input.quantity === null || input.quantity === undefined ? null : Number(input.quantity);
      if (quantity !== null && (!Number.isFinite(quantity) || quantity <= 0)) {
        throw { statusCode: 400, message: "Quantity must be greater than zero when provided" };
      }

      const fieldSchema = this.normalizeFieldSchema(requisitionType.fieldSchema as any);
      const moduleData = this.validateModuleData(fieldSchema, input.moduleData);
      const scopedRefs = await this.validateRequestScope(tx, requisitionType, input, auth);
      const attachmentIds = await this.validateAttachmentIds(
        tx,
        input.attachmentDocumentIds,
        requisitionType.requiresAttachment,
        auth
      );

      const steps = await this.buildApprovalRoute(
        tx,
        requester,
        auth,
        requisitionType.sourceModule,
        scopedRefs.jobId,
        scopedRefs.clientId
      );
      const currentStep = steps[0] || null;
      const currentStatus = currentStep
        ? this.statusForStage(currentStep.stageType)
        : RequisitionStatus.approved;

      const created = await tx.requisitionRequest.create({
        data: {
          requisitionNumber: this.generateRequisitionNumber(),
          requisitionTypeId: requisitionType.id,
          requesterProfileId: requester.id,
          requesterDepartmentId: requester.departmentId,
          currentApproverProfileId: currentStep?.approverProfileId || null,
          sourceModule: requisitionType.sourceModule,
          status: currentStatus,
          title,
          justification: String(input.justification || "").trim() || null,
          amount,
          amountBreakdown: amountBreakdown ? (amountBreakdown as any) : null,
          currency: String(input.currency || DEFAULT_CURRENCY).trim().toUpperCase() || DEFAULT_CURRENCY,
          quantity: quantity === null ? null : roundMoney(quantity),
          neededByDate: input.neededByDate ? parseDateOnly(input.neededByDate) : null,
          vendorName: String(input.vendorName || "").trim() || null,
          clientId: scopedRefs.clientId,
          jobId: scopedRefs.jobId,
          isClientRecoverable: Boolean(input.isClientRecoverable),
          taxImpactNotes: String(input.taxImpactNotes || "").trim() || null,
          moduleData: Object.keys(moduleData).length ? (moduleData as any) : null,
          approvalRouteSnapshot: {
            requesterRoles: uniqueRoles(auth.roles),
            steps,
          } as any,
          approvedAt: currentStep ? null : new Date(),
          approvalSteps: {
            create: steps.map((step) => ({
              stepNumber: step.stepNumber,
              stageType: step.stageType,
              approverProfileId: step.approverProfileId,
            })),
          },
        },
        include: REQUEST_ARGS.include,
      });

      await this.attachDocumentsToRequest(tx, attachmentIds, created.id, auth);
      await this.createStatusTransition(
        tx,
        {
          id: created.id,
          status: created.status,
          clientId: created.clientId,
          jobId: created.jobId,
        },
        created.status,
        auth,
        "Requisition submitted"
      );

      await createAudit({
        action: "requisition.request_created",
        entity_type: "requisition_request",
        entity_id: created.id,
        user_id: auth.userId,
        metadata: {
          actorProfileId: auth.profileId,
          requisitionNumber: created.requisitionNumber,
          sourceModule: created.sourceModule,
          currentApproverProfileId: created.currentApproverProfileId,
        },
      });

      if (created.currentApproverProfileId) {
        await this.notifyApprover(
          created.id,
          created.currentApproverProfileId,
          `Requisition awaiting approval: ${created.requisitionNumber}`,
          `${created.requester.firstName} ${created.requester.lastName} submitted "${created.title}" for ${created.currency} ${Number(created.amount).toLocaleString()}.`,
          auth
        );
      } else {
        await this.notifyRequester(
          created.requesterProfileId,
          `Requisition approved: ${created.requisitionNumber}`,
          `Your requisition "${created.title}" was auto-approved.`,
          NotificationType.info,
          auth
        );
      }

      const [decorated] = await this.addAttachmentSummaries([created]);
      return decorated;
    });
  }

  static async cancelRequisitionRequest(
    requisitionRequestId: number,
    input: { reason?: string; notes?: string },
    auth: AuthContext
  ) {
    return prisma.$transaction(async (tx) => {
      const request = await this.loadRequestOrThrow(tx, requisitionRequestId);
      if (request.requesterProfileId !== auth.profileId && !isPrivileged(auth)) {
        throw { statusCode: 403, message: "Only the requester or admin can cancel this requisition" };
      }
      if (!ACTIVE_PENDING_STATUSES.includes(request.status)) {
        throw { statusCode: 409, message: "Only pending requisitions can be cancelled" };
      }

      const cancellationReason = String(input.reason || input.notes || "").trim() || null;
      const updated = await tx.requisitionRequest.update({
        where: { id: requisitionRequestId },
        data: {
          status: RequisitionStatus.cancelled,
          currentApproverProfileId: null,
          cancellationReason,
          cancelledAt: new Date(),
        },
        include: REQUEST_ARGS.include,
      });

      await tx.requisitionApprovalStep.updateMany({
        where: {
          requisitionRequestId,
          decision: RequisitionApprovalDecision.pending,
        },
        data: {
          decision: RequisitionApprovalDecision.skipped,
          notes: "Requisition cancelled",
          actedAt: new Date(),
        },
      });

      await this.createStatusTransition(
        tx,
        request,
        RequisitionStatus.cancelled,
        auth,
        cancellationReason || "Requisition cancelled"
      );

      await createAudit({
        action: "requisition.request_cancelled",
        entity_type: "requisition_request",
        entity_id: updated.id,
        user_id: auth.userId,
        metadata: {
          actorProfileId: auth.profileId,
          currentStatus: updated.status,
        },
      });

      if (request.currentApproverProfileId && request.currentApproverProfileId !== auth.profileId) {
        await this.notifyRequester(
          request.currentApproverProfileId,
          `Requisition withdrawn: ${request.requisitionNumber}`,
          `Requisition "${request.title}" was cancelled before approval.`,
          NotificationType.info,
          auth
        );
      }

      const [decorated] = await this.addAttachmentSummaries([updated]);
      return decorated;
    });
  }

  static async updateFinanceStageRequisition(
    requisitionRequestId: number,
    input: UpdateFinanceStageRequisitionInput,
    auth: AuthContext
  ) {
    this.ensureFinanceAccess(auth);
    return prisma.$transaction(async (tx) => {
      const request = await this.loadRequestOrThrow(tx, requisitionRequestId);
      const activeStep = request.approvalSteps.find(
        (step) =>
          step.approverProfileId === auth.profileId &&
          step.decision === RequisitionApprovalDecision.pending
      );

      if (
        !isPrivileged(auth) &&
        (!activeStep || activeStep.stageType !== RequisitionApprovalStageType.finance)
      ) {
        throw { statusCode: 403, message: "Only the active finance approver can edit this requisition" };
      }

      if (request.status !== RequisitionStatus.pending_finance_approval) {
        throw {
          statusCode: 409,
          message: "Finance edits are only allowed once the requisition reaches finance approval",
        };
      }

      const title =
        input.title !== undefined ? String(input.title || "").trim() : String(request.title || "").trim();
      if (!title) {
        throw { statusCode: 400, message: "Title is required" };
      }

      const amount =
        input.amount !== undefined ? roundMoney(Number(input.amount || 0)) : roundMoney(Number(request.amount || 0));
      if (amount <= 0) {
        throw { statusCode: 400, message: "Amount must be greater than zero" };
      }

      const quantity =
        input.quantity !== undefined
          ? input.quantity === null
            ? null
            : Number(input.quantity)
          : request.quantity === null || request.quantity === undefined
            ? null
            : Number(request.quantity);
      if (quantity !== null && (!Number.isFinite(quantity) || quantity <= 0)) {
        throw { statusCode: 400, message: "Quantity must be greater than zero when provided" };
      }

      const nextAmountBreakdown = this.normalizeAmountBreakdown(
        input.amountBreakdown !== undefined ? input.amountBreakdown : request.amountBreakdown,
        amount
      );
      const fieldSchema = this.normalizeFieldSchema(request.requisitionType.fieldSchema as any);
      const nextModuleData =
        input.moduleData !== undefined
          ? this.validateModuleData(fieldSchema, input.moduleData)
          : this.validateModuleData(fieldSchema, request.moduleData);

      const updated = await tx.requisitionRequest.update({
        where: { id: requisitionRequestId },
        data: {
          title,
          justification:
            input.justification !== undefined
              ? String(input.justification || "").trim() || null
              : request.justification,
          amount,
          amountBreakdown: nextAmountBreakdown ? (nextAmountBreakdown as any) : null,
          currency:
            input.currency !== undefined
              ? String(input.currency || DEFAULT_CURRENCY).trim().toUpperCase() || DEFAULT_CURRENCY
              : request.currency,
          quantity: quantity === null ? null : roundMoney(quantity),
          neededByDate:
            input.neededByDate !== undefined
              ? input.neededByDate
                ? parseDateOnly(input.neededByDate)
                : null
              : request.neededByDate,
          vendorName:
            input.vendorName !== undefined ? String(input.vendorName || "").trim() || null : request.vendorName,
          isClientRecoverable:
            input.isClientRecoverable !== undefined
              ? Boolean(input.isClientRecoverable)
              : request.isClientRecoverable,
          taxImpactNotes:
            input.taxImpactNotes !== undefined
              ? String(input.taxImpactNotes || "").trim() || null
              : request.taxImpactNotes,
          moduleData: Object.keys(nextModuleData).length ? (nextModuleData as any) : null,
        },
        include: REQUEST_ARGS.include,
      });

      await createAudit({
        action: "requisition.request_finance_updated",
        entity_type: "requisition_request",
        entity_id: updated.id,
        user_id: auth.userId,
        metadata: {
          actorProfileId: auth.profileId,
          requisitionNumber: updated.requisitionNumber,
          status: updated.status,
        },
      });

      await this.notifyRequester(
        updated.requesterProfileId,
        `Finance updated requisition: ${updated.requisitionNumber}`,
        `Finance updated "${updated.title}" while preparing it for final approval and release.`,
        NotificationType.info,
        auth
      );

      const [decorated] = await this.addAttachmentSummaries([updated]);
      return decorated;
    });
  }

  static async releaseRequisitionFunds(
    requisitionRequestId: number,
    input: ReleaseRequisitionFundsInput,
    auth: AuthContext
  ) {
    this.ensureFinanceAccess(auth);
    return prisma.$transaction(async (tx) => {
      const request = await this.loadRequestOrThrow(tx, requisitionRequestId);
      if (request.status !== RequisitionStatus.approved) {
        throw { statusCode: 409, message: "Only approved requisitions can be marked as released" };
      }
      if (request.releasedAt) {
        throw { statusCode: 409, message: "Funds have already been released for this requisition" };
      }

      const financeStep = request.approvalSteps.find(
        (step) => step.stageType === RequisitionApprovalStageType.finance
      );
      if (financeStep && financeStep.decision !== RequisitionApprovalDecision.approved) {
        throw {
          statusCode: 409,
          message: "Finance approval must be completed before funds can be released",
        };
      }

      const releasedAt = input.releasedAt ? parseDateTimeValue(input.releasedAt) : new Date();
      if (request.approvedAt && releasedAt < request.approvedAt) {
        throw { statusCode: 400, message: "releasedAt cannot be earlier than the final approval date" };
      }

      const accountabilityDueAt = new Date(releasedAt.getTime());
      accountabilityDueAt.setUTCDate(accountabilityDueAt.getUTCDate() + ACCOUNTABILITY_WINDOW_DAYS);

      const updated = await tx.requisitionRequest.update({
        where: { id: requisitionRequestId },
        data: {
          releasedAt,
          releasedByProfileId: auth.profileId,
          releaseNotes: String(input.notes || "").trim() || null,
          accountabilityDueAt,
          accountabilityStatus: RequisitionAccountabilityStatus.pending,
        },
        include: REQUEST_ARGS.include,
      });

      await createAudit({
        action: "requisition.funds_released",
        entity_type: "requisition_request",
        entity_id: updated.id,
        user_id: auth.userId,
        metadata: {
          actorProfileId: auth.profileId,
          requisitionNumber: updated.requisitionNumber,
          accountabilityDueAt: accountabilityDueAt.toISOString(),
        },
      });

      const formattedDueDate = accountabilityDueAt.toLocaleDateString("en-KE", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });

      await this.notifyRequester(
        updated.requesterProfileId,
        `Funds released: ${updated.requisitionNumber}`,
        `Funds for "${updated.title}" were released. Accountability is due by ${formattedDueDate}.`,
        NotificationType.action,
        auth
      );

      const [decorated] = await this.addAttachmentSummaries([updated]);
      return decorated;
    });
  }

  static async submitRequisitionAccountability(
    requisitionRequestId: number,
    input: SubmitRequisitionAccountabilityInput,
    auth: AuthContext
  ) {
    return prisma.$transaction(async (tx) => {
      const request = await this.loadRequestOrThrow(tx, requisitionRequestId);
      if (request.requesterProfileId !== auth.profileId && !isPrivileged(auth)) {
        throw { statusCode: 403, message: "Only the requester can submit requisition accountability" };
      }
      if (request.status !== RequisitionStatus.approved || !request.releasedAt) {
        throw { statusCode: 409, message: "This requisition is not yet ready for accountability submission" };
      }
      if (request.accountabilityStatus === RequisitionAccountabilityStatus.submitted) {
        throw { statusCode: 409, message: "Accountability has already been submitted for this requisition" };
      }

      const attachmentIds = await this.validateAttachmentIds(
        tx,
        input.attachmentDocumentIds,
        false,
        auth
      );
      const accountabilityNotes = String(input.notes || "").trim();
      if (!accountabilityNotes && attachmentIds.length === 0) {
        throw {
          statusCode: 400,
          message: "Provide accountability notes or supporting documents before submitting",
        };
      }

      const updated = await tx.requisitionRequest.update({
        where: { id: requisitionRequestId },
        data: {
          accountabilityStatus: RequisitionAccountabilityStatus.submitted,
          accountabilitySubmittedAt: new Date(),
          accountabilitySubmittedByProfileId: auth.profileId,
          accountabilityNotes: accountabilityNotes || null,
        },
        include: REQUEST_ARGS.include,
      });

      await this.attachDocumentsToRequest(tx, attachmentIds, updated.id, auth, {
        description: "Requisition accountability document",
        accessLevel: "employee",
      });

      await createAudit({
        action: "requisition.accountability_submitted",
        entity_type: "requisition_request",
        entity_id: updated.id,
        user_id: auth.userId,
        metadata: {
          actorProfileId: auth.profileId,
          requisitionNumber: updated.requisitionNumber,
          attachmentCount: attachmentIds.length,
        },
      });

      const financeRecipientProfileId =
        updated.releasedByProfileId ||
        updated.approvalSteps.find((step) => step.stageType === RequisitionApprovalStageType.finance)
          ?.approverProfileId ||
        null;

      if (financeRecipientProfileId) {
        await NotificationService.createNotification(
          {
            recipientProfileId: financeRecipientProfileId,
            type: NotificationType.info,
            title: `Accountability submitted: ${updated.requisitionNumber}`,
            message: `${updated.requester.firstName} ${updated.requester.lastName} submitted accountability for "${updated.title}".`,
            actionRequired: false,
            link: "/finance-dashboard",
          },
          auth
        );
      }

      const [decorated] = await this.addAttachmentSummaries([updated]);
      return decorated;
    });
  }

  static async getFinanceTracker(auth: AuthContext) {
    this.ensureFinanceAccess(auth);
    const requests = await prisma.requisitionRequest.findMany({
      where: {
        OR: [
          {
            status: RequisitionStatus.approved,
            releasedAt: null,
          },
          {
            status: RequisitionStatus.approved,
            accountabilityStatus: {
              in: [
                RequisitionAccountabilityStatus.pending,
                RequisitionAccountabilityStatus.submitted,
              ],
            },
          },
        ],
      },
      include: REQUEST_ARGS.include,
      orderBy: [{ releasedAt: "asc" }, { approvedAt: "desc" }, { submittedAt: "desc" }],
    });

    const decorated = await this.addAttachmentSummaries(requests);
    const now = Date.now();
    const unreleased = decorated.filter((request) => request.status === RequisitionStatus.approved && !request.releasedAt);
    const pending = decorated.filter(
      (request) =>
        request.status === RequisitionStatus.approved &&
        request.releasedAt &&
        request.accountabilityStatus === RequisitionAccountabilityStatus.pending
    );
    const completed = decorated.filter(
      (request) => request.accountabilityStatus === RequisitionAccountabilityStatus.submitted
    );
    const overdue = pending.filter(
      (request) => request.accountabilityDueAt && new Date(request.accountabilityDueAt).getTime() < now
    );

    return {
      unreleased,
      pending,
      completed,
      counts: {
        unreleasedCount: unreleased.length,
        pendingCount: pending.length,
        overdueCount: overdue.length,
        completedCount: completed.length,
        pendingValue: pending.reduce((sum, item) => sum + Number(item.amount || 0), 0),
        completedValue: completed.reduce((sum, item) => sum + Number(item.amount || 0), 0),
      },
    };
  }

  static async listApprovals(
    options: { page: number; pageSize: number; scope?: "mine" | "all"; status?: string },
    auth: AuthContext
  ) {
    this.ensureApproveAccess(auth);
    const page = Math.max(1, Number(options.page || 1));
    const pageSize = Math.max(1, Math.min(100, Number(options.pageSize || 10)));
    const skip = (page - 1) * pageSize;
    const where: any = {};

    if (options.status) {
      where.status = options.status;
    } else {
      where.status = { in: ACTIVE_PENDING_STATUSES };
    }

    if (!isPrivileged(auth) || options.scope !== "all") {
      where.currentApproverProfileId = auth.profileId;
    }

    const [approvals, total] = await Promise.all([
      prisma.requisitionRequest.findMany({
        where,
        include: REQUEST_ARGS.include,
        orderBy: [{ submittedAt: "asc" }, { createdAt: "asc" }],
        skip,
        take: pageSize,
      }),
      prisma.requisitionRequest.count({ where }),
    ]);

    return {
      approvals: await this.addAttachmentSummaries(approvals),
      total,
    };
  }

  static async approveRequisitionRequest(
    requisitionRequestId: number,
    input: ReviewRequisitionInput,
    auth: AuthContext
  ) {
    this.ensureApproveAccess(auth);
    return prisma.$transaction(async (tx) => {
      const request = await this.loadRequestOrThrow(tx, requisitionRequestId);
      if (request.currentApproverProfileId !== auth.profileId) {
        throw { statusCode: 403, message: "You are not the active approver for this requisition" };
      }
      if (!ACTIVE_PENDING_STATUSES.includes(request.status)) {
        throw { statusCode: 409, message: "This requisition is no longer pending approval" };
      }

      const activeStep = request.approvalSteps.find(
        (step) =>
          step.approverProfileId === auth.profileId &&
          step.decision === RequisitionApprovalDecision.pending
      );
      if (!activeStep) {
        throw { statusCode: 409, message: "No active approval step was found for this requisition" };
      }

      await tx.requisitionApprovalStep.update({
        where: { id: activeStep.id },
        data: {
          decision: RequisitionApprovalDecision.approved,
          notes: String(input.notes || "").trim() || null,
          actedAt: new Date(),
        },
      });

      const nextStep = request.approvalSteps.find(
        (step) =>
          step.stepNumber > activeStep.stepNumber &&
          step.decision === RequisitionApprovalDecision.pending
      );
      const reviewNotes = String(input.notes || "").trim();

      const nextStatus = nextStep
        ? this.statusForStage(nextStep.stageType)
        : RequisitionStatus.approved;

      const updated = await tx.requisitionRequest.update({
        where: { id: requisitionRequestId },
        data: {
          status: nextStatus,
          currentApproverProfileId: nextStep?.approverProfileId || null,
          approvedAt: nextStep ? null : new Date(),
        },
        include: REQUEST_ARGS.include,
      });

      await this.createStatusTransition(
        tx,
        request,
        updated.status,
        auth,
        reviewNotes ||
          (activeStep.stageType === RequisitionApprovalStageType.finance
            ? "Requisition approved by finance"
            : "Requisition approved")
      );

      await createAudit({
        action: "requisition.request_approved",
        entity_type: "requisition_request",
        entity_id: updated.id,
        user_id: auth.userId,
        metadata: {
          actorProfileId: auth.profileId,
          stepNumber: activeStep.stepNumber,
          nextApproverProfileId: updated.currentApproverProfileId,
        },
      });

      if (updated.currentApproverProfileId) {
        await this.notifyApprover(
          updated.id,
          updated.currentApproverProfileId,
          `Requisition awaiting approval: ${updated.requisitionNumber}`,
          this.approvalNotificationMessage(updated, nextStep!),
          auth
        );
        await this.notifyRequester(
          updated.requesterProfileId,
          `Requisition progressed: ${updated.requisitionNumber}`,
          `Your requisition "${updated.title}" moved to ${formatStatusLabel(updated.status)}.`,
          NotificationType.info,
          auth
        );
      } else {
        await this.notifyRequester(
          updated.requesterProfileId,
          `Requisition approved: ${updated.requisitionNumber}`,
          activeStep.stageType === RequisitionApprovalStageType.finance
            ? `Your requisition "${updated.title}" has been fully approved by finance.`
            : `Your requisition "${updated.title}" has been fully approved.`,
          NotificationType.info,
          auth
        );
      }

      const [decorated] = await this.addAttachmentSummaries([updated]);
      return decorated;
    });
  }

  static async declineRequisitionRequest(
    requisitionRequestId: number,
    input: ReviewRequisitionInput,
    auth: AuthContext
  ) {
    this.ensureApproveAccess(auth);
    return prisma.$transaction(async (tx) => {
      const request = await this.loadRequestOrThrow(tx, requisitionRequestId);
      if (request.currentApproverProfileId !== auth.profileId) {
        throw { statusCode: 403, message: "You are not the active approver for this requisition" };
      }
      if (!ACTIVE_PENDING_STATUSES.includes(request.status)) {
        throw { statusCode: 409, message: "This requisition is no longer pending approval" };
      }

      const reason = String(input.reason || input.notes || "").trim();
      if (!reason) {
        throw { statusCode: 400, message: "A decline reason is required" };
      }

      const activeStep = request.approvalSteps.find(
        (step) =>
          step.approverProfileId === auth.profileId &&
          step.decision === RequisitionApprovalDecision.pending
      );
      if (!activeStep) {
        throw { statusCode: 409, message: "No active approval step was found for this requisition" };
      }

      await tx.requisitionApprovalStep.update({
        where: { id: activeStep.id },
        data: {
          decision: RequisitionApprovalDecision.declined,
          notes: reason,
          actedAt: new Date(),
        },
      });

      await tx.requisitionApprovalStep.updateMany({
        where: {
          requisitionRequestId,
          decision: RequisitionApprovalDecision.pending,
          stepNumber: { gt: activeStep.stepNumber },
        },
        data: {
          decision: RequisitionApprovalDecision.skipped,
          notes: "Skipped after requisition decline",
          actedAt: new Date(),
        },
      });

      const updated = await tx.requisitionRequest.update({
        where: { id: requisitionRequestId },
        data: {
          status: RequisitionStatus.declined,
          currentApproverProfileId: null,
          declineReason: reason,
          declinedAt: new Date(),
        },
        include: REQUEST_ARGS.include,
      });

      await this.createStatusTransition(tx, request, RequisitionStatus.declined, auth, reason);

      await createAudit({
        action: "requisition.request_declined",
        entity_type: "requisition_request",
        entity_id: updated.id,
        user_id: auth.userId,
        metadata: {
          actorProfileId: auth.profileId,
          stepNumber: activeStep.stepNumber,
        },
      });

      await this.notifyRequester(
        updated.requesterProfileId,
        `Requisition declined: ${updated.requisitionNumber}`,
        `Your requisition "${updated.title}" was declined. Reason: ${reason}`,
        NotificationType.warning,
        auth
      );

      const [decorated] = await this.addAttachmentSummaries([updated]);
      return decorated;
    });
  }

  static async getReportSummary(auth: AuthContext) {
    this.ensureAdminAccess(auth);
    const requests = await prisma.requisitionRequest.findMany({
      include: {
        requisitionType: { select: { id: true, name: true, sourceModule: true } },
        requester: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: [{ submittedAt: "desc" }],
    });

    const byModule = new Map<string, number>();
    const byType = new Map<string, number>();
    const pendingByStage = new Map<string, number>();

    let approvedCount = 0;
    let declinedCount = 0;
    let cancelledCount = 0;
    let pendingCount = 0;

    for (const request of requests) {
      byModule.set(request.sourceModule, (byModule.get(request.sourceModule) || 0) + 1);
      byType.set(request.requisitionType.name, (byType.get(request.requisitionType.name) || 0) + 1);

      if (ACTIVE_PENDING_STATUSES.includes(request.status)) {
        pendingCount += 1;
        const stage = request.status.replace("pending_", "").replace("_approval", "");
        pendingByStage.set(stage, (pendingByStage.get(stage) || 0) + 1);
      }
      if (request.status === RequisitionStatus.approved) approvedCount += 1;
      if (request.status === RequisitionStatus.declined) declinedCount += 1;
      if (request.status === RequisitionStatus.cancelled) cancelledCount += 1;
    }

    return {
      totalRequests: requests.length,
      pendingCount,
      approvedCount,
      declinedCount,
      cancelledCount,
      byModule: Array.from(byModule.entries()).map(([module, count]) => ({ module, count })),
      byType: Array.from(byType.entries()).map(([typeName, count]) => ({ typeName, count })),
      pendingByStage: Array.from(pendingByStage.entries()).map(([stage, count]) => ({ stage, count })),
      recentRequests: requests.slice(0, 10).map((request) => ({
        ...request,
        requesterName: `${request.requester.firstName} ${request.requester.lastName}`.trim(),
      })),
    };
  }
}
