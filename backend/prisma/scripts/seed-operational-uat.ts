import prisma from "../../src/prisma";
import { seedUatTeam } from "./seed-uat-team";
import {
  createBalancedScorecardInitiative,
  ensureBalancedScorecardSeed,
  listBalancedScorecardStructure,
  updateBalancedScorecardInitiative,
  upsertBalancedScorecardKpiAssignment,
} from "../../src/services/balancedScorecardStructure.service";
import {
  createBalancedScorecardCycle,
  createBalancedScorecardVersion,
  publishBalancedScorecardVersion,
  resolveActiveBalancedScorecardVersionId,
} from "../../src/services/balancedScorecardGovernance.service";
import { bridgeEvaluationScoreToBsc } from "../../src/services/evaluationBscBridge.service";

const TEST_PASSWORD = "Test@1234";
const UAT_EMAILS = [
  "sarah.hr@testfirm.co",
  "grace.gmp@testfirm.co",
  "james.partner@testfirm.co",
  "linda.partner@testfirm.co",
  "brian.mgr@testfirm.co",
  "agnes.mgr@testfirm.co",
  "diana.finance@testfirm.co",
  "victor.finance@testfirm.co",
  "pauline.marketing@testfirm.co",
  "kevin.emp@testfirm.co",
  "ruth.emp@testfirm.co",
  "samuel.emp@testfirm.co",
  "peter.emp@testfirm.co",
  "esther.emp@testfirm.co",
  "nicholas.emp@testfirm.co",
] as const;

type ProfileLite = {
  id: number;
  firstName: string;
  lastName: string;
  departmentId: number | null;
  roleId: number | null;
  role: {
    id: number;
    name: string;
    billingRate: unknown;
    costRate: unknown;
  } | null;
  user: { email: string } | null;
};

const d = (value: string) => new Date(`${value}T00:00:00.000Z`);
const dt = (value: string) => new Date(value);
const money = (value: number) => Number(value.toFixed(2));

const assertLocalDatabase = () => {
  const raw = process.env.DATABASE_URL || "";
  const allowNonLocal = process.env.ALLOW_NON_LOCAL_UAT_SEED === "true";
  if (allowNonLocal) return;

  let host = "";
  try {
    host = new URL(raw).hostname.toLowerCase();
  } catch {
    throw new Error("DATABASE_URL is missing or invalid; refusing to run UAT seed.");
  }

  if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
    throw new Error(
      `Refusing to seed UAT data into non-local database host "${host}". Set ALLOW_NON_LOCAL_UAT_SEED=true only when you intentionally want this.`
    );
  }
};

const requireProfile = (profiles: Map<string, ProfileLite>, email: string) => {
  const profile = profiles.get(email);
  if (!profile) throw new Error(`Missing UAT profile for ${email}`);
  return profile;
};

const profileName = (profile: ProfileLite) => `${profile.firstName} ${profile.lastName}`;

const roleRates = (profile: ProfileLite) => ({
  billingRate: Number(profile.role?.billingRate || 0),
  costRate: Number(profile.role?.costRate || 0),
});

async function loadProfiles() {
  const profiles = await prisma.profile.findMany({
    where: {
      user: {
        email: {
          in: [...UAT_EMAILS],
        },
      },
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      departmentId: true,
      roleId: true,
      role: {
        select: {
          id: true,
          name: true,
          billingRate: true,
          costRate: true,
        },
      },
      user: { select: { email: true } },
    },
  });

  return new Map(
    profiles.map((profile) => [profile.user?.email?.toLowerCase() ?? "", profile])
  );
}

async function applyProfileTargets(profiles: Map<string, ProfileLite>) {
  const targets: Array<{
    email: string;
    employeeId: string;
    hireDate: Date;
    financialTarget: number;
    utilizationTarget: number;
  }> = [
    ["sarah.hr@testfirm.co", "UAT-001", "2023-01-16", 0, 0.65],
    ["grace.gmp@testfirm.co", "UAT-002", "2020-03-02", 10000000, 0.7],
    ["james.partner@testfirm.co", "UAT-003", "2021-02-01", 4500000, 0.75],
    ["linda.partner@testfirm.co", "UAT-004", "2021-04-05", 4200000, 0.75],
    ["brian.mgr@testfirm.co", "UAT-005", "2022-01-10", 2500000, 0.78],
    ["agnes.mgr@testfirm.co", "UAT-006", "2022-05-09", 2400000, 0.78],
    ["diana.finance@testfirm.co", "UAT-007", "2022-07-04", 0, 0.72],
    ["victor.finance@testfirm.co", "UAT-008", "2024-02-12", 0, 0.72],
    ["pauline.marketing@testfirm.co", "UAT-009", "2023-08-14", 1500000, 0.68],
    ["kevin.emp@testfirm.co", "UAT-010", "2024-01-15", 1200000, 0.8],
    ["ruth.emp@testfirm.co", "UAT-011", "2023-11-06", 1400000, 0.82],
    ["samuel.emp@testfirm.co", "UAT-012", "2024-03-18", 900000, 0.78],
    ["peter.emp@testfirm.co", "UAT-013", "2023-10-02", 1350000, 0.82],
    ["esther.emp@testfirm.co", "UAT-014", "2024-01-22", 1150000, 0.8],
    ["nicholas.emp@testfirm.co", "UAT-015", "2024-04-08", 850000, 0.78],
  ].map(([email, employeeId, hireDate, financialTarget, utilizationTarget]) => ({
    email,
    employeeId,
    hireDate: d(hireDate),
    financialTarget,
    utilizationTarget,
  }));

  for (const target of targets) {
    const profile = requireProfile(profiles, target.email);
    await prisma.profile.update({
      where: { id: profile.id },
      data: {
        employeeId: target.employeeId,
        hireDate: target.hireDate,
        financialTarget: target.financialTarget,
        utilizationTarget: target.utilizationTarget,
        onboardingStatus: "completed",
        onboardingChecklistCompleted: true,
        inductionCompleted: true,
      },
    });
  }
}

async function upsertClient(input: {
  clientCode: string;
  clientName: string;
  industry: string;
  departmentId: number | null;
  partnerProfileId: number;
  managerProfileId: number;
  contactPerson: string;
}) {
  return prisma.client.upsert({
    where: { clientCode: input.clientCode },
    update: {
      clientName: input.clientName,
      industry: input.industry,
      departmentId: input.departmentId,
      partnerProfileId: input.partnerProfileId,
      managerProfileId: input.managerProfileId,
      contactPerson: input.contactPerson,
      contactEmail: `${input.clientCode.toLowerCase()}@client.test`,
      contactPhone: "+254700000000",
      location: "Nairobi",
      status: "active",
    },
    create: {
      clientCode: input.clientCode,
      clientName: input.clientName,
      industry: input.industry,
      departmentId: input.departmentId,
      partnerProfileId: input.partnerProfileId,
      managerProfileId: input.managerProfileId,
      contactPerson: input.contactPerson,
      contactEmail: `${input.clientCode.toLowerCase()}@client.test`,
      contactPhone: "+254700000000",
      location: "Nairobi",
      status: "active",
    },
  });
}

async function upsertProposal(input: {
  clientId: number;
  title: string;
  serviceType: string;
  proposedFee: number;
  proposalDate: Date;
  status: "draft" | "sent" | "won" | "lost";
  probability: number;
  createdByProfileId: number;
  assignedPartnerProfileId: number;
  wonAt?: Date | null;
  lostReason?: string | null;
  notes?: string;
}) {
  const existing = await prisma.proposal.findFirst({
    where: { clientId: input.clientId, proposalTitle: input.title },
    select: { id: true },
  });
  const data = {
    clientId: input.clientId,
    proposalTitle: input.title,
    serviceType: input.serviceType,
    proposedFee: input.proposedFee,
    proposalDate: input.proposalDate,
    expectedStart: d("2026-06-01"),
    expectedDurationDays: 60,
    status: input.status,
    probability: input.probability,
    createdByProfileId: input.createdByProfileId,
    assignedPartnerProfileId: input.assignedPartnerProfileId,
    wonAt: input.wonAt ?? null,
    lostReason: input.lostReason ?? null,
    notes: input.notes ?? null,
  };

  if (existing) {
    return prisma.proposal.update({ where: { id: existing.id }, data });
  }
  return prisma.proposal.create({ data });
}

async function upsertJob(input: {
  jobCode: string;
  jobName: string;
  description: string;
  clientId: number;
  departmentId: number | null;
  partnerProfileId: number;
  managerProfileId: number;
  receivableOwnerProfileId: number;
  status: "planned" | "in_progress" | "completed" | "on_hold" | "cancelled";
  collectionStage:
    | "not_ready"
    | "ready_for_collection"
    | "partial_collection"
    | "fully_collected"
    | "overdue";
  startDate: Date;
  dueDate: Date;
  completionDate?: Date | null;
  fixedFeeAmount: number;
  budgetHours: number;
  priority?: "low" | "medium" | "high" | "urgent";
}) {
  return prisma.job.upsert({
    where: { jobCode: input.jobCode },
    update: {
      jobName: input.jobName,
      description: input.description,
      clientId: input.clientId,
      departmentId: input.departmentId,
      partnerProfileId: input.partnerProfileId,
      managerProfileId: input.managerProfileId,
      receivableOwnerProfileId: input.receivableOwnerProfileId,
      receivableOwnerAssignedAt: d("2026-05-01"),
      status: input.status,
      collectionStage: input.collectionStage,
      readyForCollectionAt:
        input.collectionStage === "not_ready" ? null : d("2026-05-20"),
      startDate: input.startDate,
      dueDate: input.dueDate,
      completionDate: input.completionDate ?? null,
      billingType: "fixed_fee",
      fixedFeeAmount: input.fixedFeeAmount,
      currency: "KES",
      budgetHours: input.budgetHours,
      priority: input.priority ?? "medium",
      costingCompleted: true,
      teamAssigned: true,
    },
    create: {
      jobCode: input.jobCode,
      jobName: input.jobName,
      description: input.description,
      clientId: input.clientId,
      departmentId: input.departmentId,
      partnerProfileId: input.partnerProfileId,
      managerProfileId: input.managerProfileId,
      receivableOwnerProfileId: input.receivableOwnerProfileId,
      receivableOwnerAssignedAt: d("2026-05-01"),
      status: input.status,
      collectionStage: input.collectionStage,
      readyForCollectionAt:
        input.collectionStage === "not_ready" ? null : d("2026-05-20"),
      startDate: input.startDate,
      dueDate: input.dueDate,
      completionDate: input.completionDate ?? null,
      billingType: "fixed_fee",
      fixedFeeAmount: input.fixedFeeAmount,
      currency: "KES",
      budgetHours: input.budgetHours,
      priority: input.priority ?? "medium",
      costingCompleted: true,
      teamAssigned: true,
    },
  });
}

async function upsertStaffing(input: {
  jobId: number;
  profile: ProfileLite;
  assignedByProfileId: number;
  allocatedHours: number;
  roleOnJob?: string;
}) {
  if (!input.profile.roleId) {
    throw new Error(`Profile ${profileName(input.profile)} does not have a position role`);
  }
  const rates = roleRates(input.profile);
  return prisma.jobStaffAssignment.upsert({
    where: {
      jobId_employeeProfileId: {
        jobId: input.jobId,
        employeeProfileId: input.profile.id,
      },
    },
    update: {
      assignedRoleId: input.profile.roleId,
      assignedHourlyRate: rates.billingRate,
      roleSnapshot: {
        roleName: input.profile.role?.name ?? input.roleOnJob ?? "UAT role",
        billingRate: rates.billingRate,
        costRate: rates.costRate,
        allocatedHours: input.allocatedHours,
      },
      roleOnJob: input.roleOnJob ?? input.profile.role?.name ?? null,
      assignedByProfileId: input.assignedByProfileId,
    },
    create: {
      jobId: input.jobId,
      employeeProfileId: input.profile.id,
      assignedRoleId: input.profile.roleId,
      assignedHourlyRate: rates.billingRate,
      roleSnapshot: {
        roleName: input.profile.role?.name ?? input.roleOnJob ?? "UAT role",
        billingRate: rates.billingRate,
        costRate: rates.costRate,
        allocatedHours: input.allocatedHours,
      },
      roleOnJob: input.roleOnJob ?? input.profile.role?.name ?? null,
      assignedByProfileId: input.assignedByProfileId,
    },
  });
}

async function upsertCosting(input: {
  jobId: number;
  managerProfileId: number;
  partnerProfileId: number;
  jobFee: number;
  totalEstimatedHours: number;
  totalEstimatedCost: number;
}) {
  const allocatedCost = input.totalEstimatedCost;
  const remainingBudget = input.jobFee - allocatedCost;
  const costing = await prisma.jobCosting.upsert({
    where: { jobId: input.jobId },
    update: {
      managerProfileId: input.managerProfileId,
      jobFee: input.jobFee,
      allocatedCost,
      remainingBudget,
      totalEstimatedHours: input.totalEstimatedHours,
      totalEstimatedCost: input.totalEstimatedCost,
      costingStatus: "approved",
      approvedByPartnerProfileId: input.partnerProfileId,
      approvedAt: d("2026-04-30"),
      notes: "UAT partner-approved costing baseline",
    },
    create: {
      jobId: input.jobId,
      managerProfileId: input.managerProfileId,
      jobFee: input.jobFee,
      allocatedCost,
      remainingBudget,
      totalEstimatedHours: input.totalEstimatedHours,
      totalEstimatedCost: input.totalEstimatedCost,
      costingStatus: "approved",
      approvedByPartnerProfileId: input.partnerProfileId,
      approvedAt: d("2026-04-30"),
      notes: "UAT partner-approved costing baseline",
    },
  });

  await prisma.budgetCap.upsert({
    where: { jobCostingId: costing.id },
    update: {
      totalAllocatedHours: input.totalEstimatedHours,
      capEnforced: true,
      allowOverage: false,
      maxOveragePercent: 0.1,
      autoLockOnExceed: true,
    },
    create: {
      jobCostingId: costing.id,
      totalAllocatedHours: input.totalEstimatedHours,
      capEnforced: true,
      allowOverage: false,
      maxOveragePercent: 0.1,
      autoLockOnExceed: true,
    },
  });

  return costing;
}

async function upsertTimeAllocation(input: {
  jobCostingId: number;
  profile: ProfileLite;
  allocatedHours: number;
  billable?: boolean;
  taskDescription: string;
}) {
  if (!input.profile.roleId) {
    throw new Error(`Profile ${profileName(input.profile)} does not have a position role`);
  }
  const rates = roleRates(input.profile);
  return prisma.jobTimeAllocation.upsert({
    where: {
      jobCostingId_employeeProfileId_roleId: {
        jobCostingId: input.jobCostingId,
        employeeProfileId: input.profile.id,
        roleId: input.profile.roleId,
      },
    },
    update: {
      allocatedHours: input.allocatedHours,
      hourlyRate: rates.billingRate,
      estimatedCost: money(input.allocatedHours * rates.costRate),
      billable: input.billable ?? true,
      taskDescription: input.taskDescription,
    },
    create: {
      jobCostingId: input.jobCostingId,
      employeeProfileId: input.profile.id,
      roleId: input.profile.roleId,
      allocatedHours: input.allocatedHours,
      hourlyRate: rates.billingRate,
      estimatedCost: money(input.allocatedHours * rates.costRate),
      billable: input.billable ?? true,
      taskDescription: input.taskDescription,
    },
  });
}

async function upsertTask(input: {
  jobId: number;
  title: string;
  assignedToProfileId: number | null;
  estimatedHours: number;
  billable: boolean;
  status: "pending" | "in_progress" | "blocked" | "completed" | "cancelled";
  priority?: "low" | "medium" | "high" | "urgent";
  dueDate: Date;
}) {
  const existing = await prisma.task.findFirst({
    where: { jobId: input.jobId, title: input.title },
    select: { id: true },
  });
  const data = {
    jobId: input.jobId,
    title: input.title,
    assignedToProfileId: input.assignedToProfileId,
    estimatedHours: input.estimatedHours,
    billable: input.billable,
    status: input.status,
    priority: input.priority ?? "medium",
    dueDate: input.dueDate,
  };
  if (existing) return prisma.task.update({ where: { id: existing.id }, data });
  return prisma.task.create({ data });
}

async function upsertTimeEntry(input: {
  jobId: number;
  taskId?: number | null;
  profile: ProfileLite;
  dateWorked: Date;
  hours: number;
  description: string;
  billable: boolean;
  nonBillableCategory?: "internal" | "training" | "over_budget" | "other" | null;
  status: "pending" | "submitted" | "approved" | "rejected" | "cancelled";
  approvedByProfileId?: number | null;
}) {
  const existing = await prisma.timeEntry.findFirst({
    where: {
      jobId: input.jobId,
      employeeProfileId: input.profile.id,
      dateWorked: input.dateWorked,
      description: input.description,
    },
    select: { id: true },
  });
  const rates = roleRates(input.profile);
  const billableAmount = input.billable ? money(input.hours * rates.billingRate) : 0;
  const costAmount = money(input.hours * rates.costRate);
  const data = {
    jobId: input.jobId,
    taskId: input.taskId ?? null,
    employeeProfileId: input.profile.id,
    dateWorked: input.dateWorked,
    hours: input.hours,
    description: input.description,
    billable: input.billable,
    nonBillableCategory: input.billable ? null : input.nonBillableCategory ?? "other",
    status: input.status,
    approvedByProfileId:
      input.status === "approved" ? input.approvedByProfileId ?? null : null,
    approvedAt: input.status === "approved" ? d("2026-05-20") : null,
    billableAmount,
    costAmount,
    profitLoss: money(billableAmount - costAmount),
  };

  if (existing) return prisma.timeEntry.update({ where: { id: existing.id }, data });
  return prisma.timeEntry.create({ data });
}

async function upsertInvoice(input: {
  jobId: number;
  clientId: number;
  invoiceNumber: string;
  title: string;
  subtotalAmount: number;
  taxAmount: number;
  amountPaid: number;
  status: "draft" | "issued" | "partially_paid" | "paid" | "overdue" | "void";
  dueDate: Date;
  generatedByProfileId: number;
  issuedByProfileId: number;
}) {
  const totalAmount = money(input.subtotalAmount + input.taxAmount);
  return prisma.jobInvoice.upsert({
    where: { invoiceNumber: input.invoiceNumber },
    update: {
      jobId: input.jobId,
      clientId: input.clientId,
      title: input.title,
      status: input.status,
      subtotalAmount: input.subtotalAmount,
      taxAmount: input.taxAmount,
      totalAmount,
      amountPaid: input.amountPaid,
      amountOutstanding: money(totalAmount - input.amountPaid),
      dueDate: input.dueDate,
      generatedByProfileId: input.generatedByProfileId,
      issuedByProfileId: input.issuedByProfileId,
      generatedAt: d("2026-05-20"),
      issuedAt: d("2026-05-21"),
      paidAt: input.status === "paid" ? d("2026-05-28") : null,
      notes: "UAT invoice for finance and collection testing",
    },
    create: {
      jobId: input.jobId,
      clientId: input.clientId,
      invoiceNumber: input.invoiceNumber,
      title: input.title,
      status: input.status,
      subtotalAmount: input.subtotalAmount,
      taxAmount: input.taxAmount,
      totalAmount,
      amountPaid: input.amountPaid,
      amountOutstanding: money(totalAmount - input.amountPaid),
      dueDate: input.dueDate,
      generatedByProfileId: input.generatedByProfileId,
      issuedByProfileId: input.issuedByProfileId,
      generatedAt: d("2026-05-20"),
      issuedAt: d("2026-05-21"),
      paidAt: input.status === "paid" ? d("2026-05-28") : null,
      notes: "UAT invoice for finance and collection testing",
    },
  });
}

async function syncInvoiceLine(invoiceId: number, description: string, amount: number) {
  const existing = await prisma.jobInvoiceLine.findFirst({
    where: { jobInvoiceId: invoiceId, description },
    select: { id: true },
  });
  const data = {
    jobInvoiceId: invoiceId,
    lineType: "service_fee" as const,
    description,
    quantity: 1,
    unitPrice: amount,
    lineAmount: amount,
    sortOrder: 1,
  };
  if (existing) return prisma.jobInvoiceLine.update({ where: { id: existing.id }, data });
  return prisma.jobInvoiceLine.create({ data });
}

async function upsertPayment(input: {
  clientId: number;
  jobId: number;
  invoiceNumber: string;
  paymentAmount: number;
  paymentDate: Date;
  referenceNumber: string;
  recordedByProfileId: number;
}) {
  const existing = await prisma.clientPayment.findFirst({
    where: { referenceNumber: input.referenceNumber },
    select: { id: true },
  });
  const data = {
    clientId: input.clientId,
    jobId: input.jobId,
    invoiceNumber: input.invoiceNumber,
    paymentAmount: input.paymentAmount,
    paymentDate: input.paymentDate,
    paymentMethod: "bank_transfer",
    referenceNumber: input.referenceNumber,
    notes: "UAT collection receipt",
    recordedByProfileId: input.recordedByProfileId,
  };
  if (existing) return prisma.clientPayment.update({ where: { id: existing.id }, data });
  return prisma.clientPayment.create({ data });
}

async function upsertPaymentApplication(input: {
  invoiceId: number;
  paymentId: number;
  appliedAmount: number;
  appliedByProfileId: number;
}) {
  return prisma.jobInvoicePaymentApplication.upsert({
    where: {
      jobInvoiceId_clientPaymentId: {
        jobInvoiceId: input.invoiceId,
        clientPaymentId: input.paymentId,
      },
    },
    update: {
      appliedAmount: input.appliedAmount,
      appliedByProfileId: input.appliedByProfileId,
      notes: "UAT invoice allocation",
    },
    create: {
      jobInvoiceId: input.invoiceId,
      clientPaymentId: input.paymentId,
      appliedAmount: input.appliedAmount,
      appliedByProfileId: input.appliedByProfileId,
      notes: "UAT invoice allocation",
    },
  });
}

async function upsertRevenueAllocations(jobId: number, paymentId: number, month: Date) {
  const entries = await prisma.timeEntry.findMany({
    where: { jobId, billable: true, status: { in: ["submitted", "approved"] } },
    select: {
      employeeProfileId: true,
      billableAmount: true,
      profitLoss: true,
    },
  });
  const totalJobBillable = entries.reduce(
    (sum, entry) => sum + Number(entry.billableAmount || 0),
    0
  );
  const payment = await prisma.clientPayment.findUnique({
    where: { id: paymentId },
    select: { paymentAmount: true },
  });
  const paymentAmount = Number(payment?.paymentAmount || 0);
  if (totalJobBillable <= 0 || paymentAmount <= 0) return;

  for (const entry of entries) {
    const employeeBillable = Number(entry.billableAmount || 0);
    const employeeProfit = Math.max(0, Number(entry.profitLoss || 0));
    const employeeLoss = Math.max(0, -Number(entry.profitLoss || 0));
    const allocationPercentage = employeeBillable / totalJobBillable;
    await prisma.revenueAllocation.upsert({
      where: {
        jobId_clientPaymentId_employeeProfileId: {
          jobId,
          clientPaymentId: paymentId,
          employeeProfileId: entry.employeeProfileId,
        },
      },
      update: {
        employeeBillable,
        employeeProfit,
        employeeLoss,
        totalJobBillable,
        allocationPercentage,
        allocatedAmount: money(paymentAmount * allocationPercentage),
        allocationMonth: month,
        isFinalized: true,
      },
      create: {
        jobId,
        clientPaymentId: paymentId,
        employeeProfileId: entry.employeeProfileId,
        employeeBillable,
        employeeProfit,
        employeeLoss,
        totalJobBillable,
        allocationPercentage,
        allocatedAmount: money(paymentAmount * allocationPercentage),
        allocationMonth: month,
        isFinalized: true,
      },
    });
  }
}

async function upsertNotification(input: {
  profileId: number;
  title: string;
  message: string;
  type?: "info" | "action" | "warning" | "escalation";
  jobId?: number;
  clientId?: number;
  link?: string;
  actionRequired?: boolean;
}) {
  const existing = await prisma.notification.findFirst({
    where: {
      profileId: input.profileId,
      title: input.title,
      jobId: input.jobId ?? null,
      clientId: input.clientId ?? null,
    },
    select: { id: true },
  });
  const data = {
    profileId: input.profileId,
    title: input.title,
    message: input.message,
    type: input.type ?? "info",
    actionRequired: input.actionRequired ?? false,
    jobId: input.jobId ?? null,
    clientId: input.clientId ?? null,
    link: input.link ?? null,
    isRead: false,
  };
  if (existing) return prisma.notification.update({ where: { id: existing.id }, data });
  return prisma.notification.create({ data });
}

async function seedOperationalWork(profiles: Map<string, ProfileLite>) {
  const grace = requireProfile(profiles, "grace.gmp@testfirm.co");
  const james = requireProfile(profiles, "james.partner@testfirm.co");
  const linda = requireProfile(profiles, "linda.partner@testfirm.co");
  const brian = requireProfile(profiles, "brian.mgr@testfirm.co");
  const agnes = requireProfile(profiles, "agnes.mgr@testfirm.co");
  const diana = requireProfile(profiles, "diana.finance@testfirm.co");
  const victor = requireProfile(profiles, "victor.finance@testfirm.co");
  const pauline = requireProfile(profiles, "pauline.marketing@testfirm.co");
  const kevin = requireProfile(profiles, "kevin.emp@testfirm.co");
  const ruth = requireProfile(profiles, "ruth.emp@testfirm.co");
  const samuel = requireProfile(profiles, "samuel.emp@testfirm.co");
  const peter = requireProfile(profiles, "peter.emp@testfirm.co");
  const esther = requireProfile(profiles, "esther.emp@testfirm.co");
  const nicholas = requireProfile(profiles, "nicholas.emp@testfirm.co");

  const apex = await upsertClient({
    clientCode: "UAT-TAX-001",
    clientName: "Apex Manufacturing Ltd",
    industry: "Manufacturing",
    departmentId: brian.departmentId,
    partnerProfileId: james.id,
    managerProfileId: brian.id,
    contactPerson: "Mercy Njoroge",
  });
  const safari = await upsertClient({
    clientCode: "UAT-ADV-001",
    clientName: "Safari Health Group",
    industry: "Healthcare",
    departmentId: agnes.departmentId,
    partnerProfileId: linda.id,
    managerProfileId: agnes.id,
    contactPerson: "Daniel Otieno",
  });
  const lakeview = await upsertClient({
    clientCode: "UAT-TAX-002",
    clientName: "Lakeview Retail PLC",
    industry: "Retail",
    departmentId: brian.departmentId,
    partnerProfileId: james.id,
    managerProfileId: brian.id,
    contactPerson: "Amina Hassan",
  });
  const bluePeak = await upsertClient({
    clientCode: "UAT-ADV-002",
    clientName: "BluePeak Energy Ltd",
    industry: "Energy",
    departmentId: agnes.departmentId,
    partnerProfileId: linda.id,
    managerProfileId: agnes.id,
    contactPerson: "Joseph Mwangi",
  });

  await Promise.all([
    upsertProposal({
      clientId: apex.id,
      title: "Apex FY2026 Tax Compliance Proposal",
      serviceType: "Tax Compliance",
      proposedFee: 1200000,
      proposalDate: d("2026-04-10"),
      status: "won",
      probability: 100,
      createdByProfileId: pauline.id,
      assignedPartnerProfileId: james.id,
      wonAt: d("2026-04-18"),
      notes: "Won proposal converted into UAT tax job.",
    }),
    upsertProposal({
      clientId: safari.id,
      title: "Safari Internal Controls Review Proposal",
      serviceType: "Advisory",
      proposedFee: 900000,
      proposalDate: d("2026-04-05"),
      status: "won",
      probability: 100,
      createdByProfileId: pauline.id,
      assignedPartnerProfileId: linda.id,
      wonAt: d("2026-04-16"),
      notes: "Won advisory proposal converted into UAT job.",
    }),
    upsertProposal({
      clientId: lakeview.id,
      title: "Lakeview Tax Health Check Proposal",
      serviceType: "Tax Health Check",
      proposedFee: 650000,
      proposalDate: d("2026-05-02"),
      status: "sent",
      probability: 55,
      createdByProfileId: pauline.id,
      assignedPartnerProfileId: james.id,
      notes: "Open proposal for marketing pipeline reporting.",
    }),
    upsertProposal({
      clientId: bluePeak.id,
      title: "BluePeak Finance Transformation Proposal",
      serviceType: "Finance Transformation",
      proposedFee: 1500000,
      proposalDate: d("2026-03-25"),
      status: "lost",
      probability: 0,
      createdByProfileId: pauline.id,
      assignedPartnerProfileId: linda.id,
      lostReason: "Client deferred the transformation budget.",
      notes: "Lost proposal for win/loss reporting.",
    }),
  ]);

  const taxJob = await upsertJob({
    jobCode: "UAT-JOB-TAX-AUDIT-001",
    jobName: "Apex FY2026 Tax Compliance and Audit Support",
    description: "Tax compliance, audit support, billing, collection, and employee contribution test job.",
    clientId: apex.id,
    departmentId: brian.departmentId,
    partnerProfileId: james.id,
    managerProfileId: brian.id,
    receivableOwnerProfileId: diana.id,
    status: "in_progress",
    collectionStage: "partial_collection",
    startDate: d("2026-05-01"),
    dueDate: d("2026-06-15"),
    fixedFeeAmount: 1200000,
    budgetHours: 120,
    priority: "high",
  });
  const advisoryJob = await upsertJob({
    jobCode: "UAT-JOB-ADV-RISK-001",
    jobName: "Safari Internal Controls Review",
    description: "Completed advisory job for revenue, profit, evaluation, and client satisfaction testing.",
    clientId: safari.id,
    departmentId: agnes.departmentId,
    partnerProfileId: linda.id,
    managerProfileId: agnes.id,
    receivableOwnerProfileId: victor.id,
    status: "completed",
    collectionStage: "fully_collected",
    startDate: d("2026-04-20"),
    dueDate: d("2026-05-20"),
    completionDate: d("2026-05-18"),
    fixedFeeAmount: 900000,
    budgetHours: 90,
    priority: "medium",
  });
  const overdueJob = await upsertJob({
    jobCode: "UAT-JOB-TAX-OVERDUE-001",
    jobName: "Lakeview VAT Remediation",
    description: "Overdue receivable test job for finance collection and escalation notifications.",
    clientId: lakeview.id,
    departmentId: brian.departmentId,
    partnerProfileId: james.id,
    managerProfileId: brian.id,
    receivableOwnerProfileId: diana.id,
    status: "in_progress",
    collectionStage: "overdue",
    startDate: d("2026-04-01"),
    dueDate: d("2026-05-05"),
    fixedFeeAmount: 650000,
    budgetHours: 70,
    priority: "urgent",
  });

  const teamPlans = [
    {
      job: taxJob,
      manager: brian,
      partner: james,
      members: [
        { profile: brian, hours: 18, task: "Partner-ready review and manager oversight" },
        { profile: kevin, hours: 34, task: "Tax schedules and working papers" },
        { profile: ruth, hours: 42, task: "Audit support and client follow-up" },
        { profile: samuel, hours: 26, task: "Document testing and reconciliations" },
      ],
      fee: 1200000,
      hours: 120,
    },
    {
      job: advisoryJob,
      manager: agnes,
      partner: linda,
      members: [
        { profile: agnes, hours: 14, task: "Engagement management and QA" },
        { profile: peter, hours: 28, task: "Risk assessment interviews" },
        { profile: esther, hours: 28, task: "Controls testing" },
        { profile: nicholas, hours: 20, task: "Report drafting and evidence pack" },
      ],
      fee: 900000,
      hours: 90,
    },
    {
      job: overdueJob,
      manager: brian,
      partner: james,
      members: [
        { profile: brian, hours: 10, task: "Remediation oversight" },
        { profile: kevin, hours: 24, task: "VAT exposure analysis" },
        { profile: samuel, hours: 18, task: "Supporting schedules" },
      ],
      fee: 650000,
      hours: 70,
    },
  ];

  for (const plan of teamPlans) {
    for (const member of plan.members) {
      await upsertStaffing({
        jobId: plan.job.id,
        profile: member.profile,
        assignedByProfileId: plan.manager.id,
        allocatedHours: member.hours,
        roleOnJob: member.task,
      });
    }
    const totalCost = plan.members.reduce((sum, member) => {
      const rates = roleRates(member.profile);
      return sum + member.hours * rates.costRate;
    }, 0);
    const costing = await upsertCosting({
      jobId: plan.job.id,
      managerProfileId: plan.manager.id,
      partnerProfileId: plan.partner.id,
      jobFee: plan.fee,
      totalEstimatedHours: plan.hours,
      totalEstimatedCost: money(totalCost),
    });
    for (const member of plan.members) {
      await upsertTimeAllocation({
        jobCostingId: costing.id,
        profile: member.profile,
        allocatedHours: member.hours,
        taskDescription: member.task,
      });
    }
  }

  const taxTasks = {
    planning: await upsertTask({
      jobId: taxJob.id,
      title: "Kickoff and planning memo",
      assignedToProfileId: brian.id,
      estimatedHours: 8,
      billable: true,
      status: "completed",
      dueDate: d("2026-05-06"),
    }),
    schedules: await upsertTask({
      jobId: taxJob.id,
      title: "Prepare tax schedules",
      assignedToProfileId: kevin.id,
      estimatedHours: 24,
      billable: true,
      status: "in_progress",
      priority: "high",
      dueDate: d("2026-05-22"),
    }),
    audit: await upsertTask({
      jobId: taxJob.id,
      title: "Audit support pack",
      assignedToProfileId: ruth.id,
      estimatedHours: 30,
      billable: true,
      status: "in_progress",
      dueDate: d("2026-05-29"),
    }),
    evidence: await upsertTask({
      jobId: taxJob.id,
      title: "Document evidence testing",
      assignedToProfileId: samuel.id,
      estimatedHours: 18,
      billable: true,
      status: "pending",
      dueDate: d("2026-06-03"),
    }),
  };

  const advisoryTasks = {
    interviews: await upsertTask({
      jobId: advisoryJob.id,
      title: "Control owner interviews",
      assignedToProfileId: peter.id,
      estimatedHours: 18,
      billable: true,
      status: "completed",
      dueDate: d("2026-05-02"),
    }),
    testing: await upsertTask({
      jobId: advisoryJob.id,
      title: "Controls testing",
      assignedToProfileId: esther.id,
      estimatedHours: 24,
      billable: true,
      status: "completed",
      dueDate: d("2026-05-10"),
    }),
    report: await upsertTask({
      jobId: advisoryJob.id,
      title: "Final findings report",
      assignedToProfileId: nicholas.id,
      estimatedHours: 18,
      billable: true,
      status: "completed",
      dueDate: d("2026-05-17"),
    }),
  };

  const overdueTasks = {
    analysis: await upsertTask({
      jobId: overdueJob.id,
      title: "VAT exposure analysis",
      assignedToProfileId: kevin.id,
      estimatedHours: 22,
      billable: true,
      status: "blocked",
      priority: "urgent",
      dueDate: d("2026-05-04"),
    }),
  };

  await Promise.all([
    upsertTimeEntry({
      jobId: taxJob.id,
      taskId: taxTasks.planning.id,
      profile: brian,
      dateWorked: d("2026-05-04"),
      hours: 4,
      description: "Kickoff planning and client information request",
      billable: true,
      status: "approved",
      approvedByProfileId: james.id,
    }),
    upsertTimeEntry({
      jobId: taxJob.id,
      taskId: taxTasks.schedules.id,
      profile: kevin,
      dateWorked: d("2026-05-06"),
      hours: 8,
      description: "Prepared corporate tax schedules",
      billable: true,
      status: "approved",
      approvedByProfileId: brian.id,
    }),
    upsertTimeEntry({
      jobId: taxJob.id,
      taskId: taxTasks.schedules.id,
      profile: kevin,
      dateWorked: d("2026-05-07"),
      hours: 6,
      description: "Updated deferred tax reconciliation",
      billable: true,
      status: "submitted",
    }),
    upsertTimeEntry({
      jobId: taxJob.id,
      taskId: taxTasks.audit.id,
      profile: ruth,
      dateWorked: d("2026-05-08"),
      hours: 7.5,
      description: "Audit support pack and client follow-up",
      billable: true,
      status: "approved",
      approvedByProfileId: brian.id,
    }),
    upsertTimeEntry({
      jobId: taxJob.id,
      taskId: taxTasks.evidence.id,
      profile: samuel,
      dateWorked: d("2026-05-09"),
      hours: 3,
      description: "Internal documentation clean-up",
      billable: false,
      nonBillableCategory: "internal",
      status: "pending",
    }),
    upsertTimeEntry({
      jobId: advisoryJob.id,
      taskId: advisoryTasks.interviews.id,
      profile: peter,
      dateWorked: d("2026-05-01"),
      hours: 9,
      description: "Control owner interviews",
      billable: true,
      status: "approved",
      approvedByProfileId: agnes.id,
    }),
    upsertTimeEntry({
      jobId: advisoryJob.id,
      taskId: advisoryTasks.testing.id,
      profile: esther,
      dateWorked: d("2026-05-06"),
      hours: 8,
      description: "Controls testing and exception log",
      billable: true,
      status: "approved",
      approvedByProfileId: agnes.id,
    }),
    upsertTimeEntry({
      jobId: advisoryJob.id,
      taskId: advisoryTasks.report.id,
      profile: nicholas,
      dateWorked: d("2026-05-12"),
      hours: 6,
      description: "Drafted final findings report",
      billable: true,
      status: "approved",
      approvedByProfileId: agnes.id,
    }),
    upsertTimeEntry({
      jobId: overdueJob.id,
      taskId: overdueTasks.analysis.id,
      profile: kevin,
      dateWorked: d("2026-05-03"),
      hours: 7,
      description: "VAT exposure analysis before client delay",
      billable: true,
      status: "approved",
      approvedByProfileId: brian.id,
    }),
  ]);

  const taxInvoice = await upsertInvoice({
    jobId: taxJob.id,
    clientId: apex.id,
    invoiceNumber: "UAT-INV-2026-001",
    title: "Apex Tax Compliance Interim Invoice",
    subtotalAmount: 600000,
    taxAmount: 96000,
    amountPaid: 450000,
    status: "partially_paid",
    dueDate: d("2026-06-05"),
    generatedByProfileId: diana.id,
    issuedByProfileId: diana.id,
  });
  const advisoryInvoice = await upsertInvoice({
    jobId: advisoryJob.id,
    clientId: safari.id,
    invoiceNumber: "UAT-INV-2026-002",
    title: "Safari Controls Review Final Invoice",
    subtotalAmount: 900000,
    taxAmount: 144000,
    amountPaid: 1044000,
    status: "paid",
    dueDate: d("2026-05-30"),
    generatedByProfileId: victor.id,
    issuedByProfileId: diana.id,
  });
  const overdueInvoice = await upsertInvoice({
    jobId: overdueJob.id,
    clientId: lakeview.id,
    invoiceNumber: "UAT-INV-2026-003",
    title: "Lakeview VAT Remediation Invoice",
    subtotalAmount: 650000,
    taxAmount: 104000,
    amountPaid: 0,
    status: "overdue",
    dueDate: d("2026-05-10"),
    generatedByProfileId: diana.id,
    issuedByProfileId: diana.id,
  });

  await Promise.all([
    syncInvoiceLine(taxInvoice.id, "Interim fixed-fee milestone", 600000),
    syncInvoiceLine(advisoryInvoice.id, "Final fixed-fee milestone", 900000),
    syncInvoiceLine(overdueInvoice.id, "VAT remediation fixed-fee milestone", 650000),
  ]);

  const taxPayment = await upsertPayment({
    clientId: apex.id,
    jobId: taxJob.id,
    invoiceNumber: "UAT-INV-2026-001",
    paymentAmount: 450000,
    paymentDate: d("2026-05-28"),
    referenceNumber: "UAT-PAY-APEX-001",
    recordedByProfileId: victor.id,
  });
  const advisoryPayment = await upsertPayment({
    clientId: safari.id,
    jobId: advisoryJob.id,
    invoiceNumber: "UAT-INV-2026-002",
    paymentAmount: 1044000,
    paymentDate: d("2026-05-29"),
    referenceNumber: "UAT-PAY-SAFARI-001",
    recordedByProfileId: victor.id,
  });
  await Promise.all([
    upsertPaymentApplication({
      invoiceId: taxInvoice.id,
      paymentId: taxPayment.id,
      appliedAmount: 450000,
      appliedByProfileId: victor.id,
    }),
    upsertPaymentApplication({
      invoiceId: advisoryInvoice.id,
      paymentId: advisoryPayment.id,
      appliedAmount: 1044000,
      appliedByProfileId: victor.id,
    }),
    upsertRevenueAllocations(taxJob.id, taxPayment.id, d("2026-05-01")),
    upsertRevenueAllocations(advisoryJob.id, advisoryPayment.id, d("2026-05-01")),
  ]);

  await Promise.all([
    upsertNotification({
      profileId: brian.id,
      title: "UAT job budget watch",
      message: "Apex FY2026 Tax Compliance has submitted time for manager review.",
      type: "action",
      jobId: taxJob.id,
      link: `/jobs/${taxJob.id}/time`,
      actionRequired: true,
    }),
    upsertNotification({
      profileId: james.id,
      title: "UAT partner costing approved",
      message: "Apex FY2026 Tax Compliance is ready for partner tracking.",
      type: "info",
      jobId: taxJob.id,
      link: `/jobs/${taxJob.id}`,
    }),
    upsertNotification({
      profileId: diana.id,
      title: "UAT overdue receivable",
      message: "Lakeview VAT Remediation has an overdue invoice for collection follow-up.",
      type: "warning",
      jobId: overdueJob.id,
      clientId: lakeview.id,
      link: "/finance/collections",
      actionRequired: true,
    }),
    upsertNotification({
      profileId: grace.id,
      title: "UAT GMP portfolio summary",
      message: "Tax and advisory UAT jobs now contain timesheet, billing, collection, and performance data.",
      type: "info",
      link: "/dashboard",
    }),
  ]);

  await prisma.clientSatisfactionSurvey.upsert({
    where: { surveyToken: "uat-safari-controls-review" },
    update: {
      clientId: safari.id,
      jobId: advisoryJob.id,
      qualityRating: 5,
      communicationRating: 4,
      timelinessRating: 5,
      professionalismRating: 5,
      valueForMoneyRating: 4,
      overallSatisfaction: 5,
      wouldRecommend: true,
      completedAt: d("2026-05-25"),
      additionalComments: "The advisory team delivered practical findings on time.",
    },
    create: {
      clientId: safari.id,
      jobId: advisoryJob.id,
      surveyToken: "uat-safari-controls-review",
      sentAt: d("2026-05-20"),
      expiresAt: d("2026-06-20"),
      qualityRating: 5,
      communicationRating: 4,
      timelinessRating: 5,
      professionalismRating: 5,
      valueForMoneyRating: 4,
      overallSatisfaction: 5,
      wouldRecommend: true,
      completedAt: d("2026-05-25"),
      additionalComments: "The advisory team delivered practical findings on time.",
    },
  });

  return {
    clients: [apex, safari, lakeview, bluePeak],
    jobs: [taxJob, advisoryJob, overdueJob],
  };
}

async function seedLeave(profiles: Map<string, ProfileLite>) {
  const sarah = requireProfile(profiles, "sarah.hr@testfirm.co");
  const brian = requireProfile(profiles, "brian.mgr@testfirm.co");
  const samuel = requireProfile(profiles, "samuel.emp@testfirm.co");

  const leaveType = await prisma.leaveType.upsert({
    where: { code: "ANNUAL" },
    update: {
      name: "Annual Leave",
      isActive: true,
      isPaid: true,
      balanceTracked: true,
      allowsHalfDay: true,
      unitType: "day",
    },
    create: {
      code: "ANNUAL",
      name: "Annual Leave",
      description: "Paid annual leave",
      color: "#2563eb",
      isActive: true,
      isPaid: true,
      balanceTracked: true,
      allowsHalfDay: true,
      unitType: "day",
    },
  });

  let policy = await prisma.leavePolicy.findFirst({
    where: { leaveTypeId: leaveType.id, name: "UAT Annual Leave Policy" },
    select: { id: true },
  });
  const policyData = {
    leaveTypeId: leaveType.id,
    name: "UAT Annual Leave Policy",
    description: "UAT leave policy with manager approval and timesheet projection.",
    isActive: true,
    annualEntitlement: 21,
    carryoverCap: 5,
    accrualEnabled: false,
    requiresManagerApproval: true,
    requiresHrApproval: false,
    excludeWeekends: true,
    excludePublicHolidays: true,
    hoursPerWorkday: 8,
    autoProjectToTimesheet: true,
    allowNegativeBalance: false,
  };
  policy = policy
    ? await prisma.leavePolicy.update({ where: { id: policy.id }, data: policyData })
    : await prisma.leavePolicy.create({ data: policyData });

  const balance = await prisma.leaveBalance.upsert({
    where: {
      employeeProfileId_leaveTypeId_leaveYear: {
        employeeProfileId: samuel.id,
        leaveTypeId: leaveType.id,
        leaveYear: 2026,
      },
    },
    update: {
      openingBalance: 21,
      accruedUnits: 0,
      usedUnits: 1,
      pendingUnits: 0,
      availableUnits: 20,
      lastCalculatedAt: d("2026-05-01"),
    },
    create: {
      employeeProfileId: samuel.id,
      leaveTypeId: leaveType.id,
      leaveYear: 2026,
      openingBalance: 21,
      accruedUnits: 0,
      usedUnits: 1,
      pendingUnits: 0,
      availableUnits: 20,
      lastCalculatedAt: d("2026-05-01"),
    },
  });

  const existingRequest = await prisma.leaveRequest.findFirst({
    where: {
      employeeProfileId: samuel.id,
      leaveTypeId: leaveType.id,
      startDate: d("2026-05-12"),
      endDate: d("2026-05-12"),
      reason: "UAT approved leave used to test time-entry blocking.",
    },
    select: { id: true },
  });
  const requestData = {
    employeeProfileId: samuel.id,
    leaveTypeId: leaveType.id,
    policyId: policy.id,
    currentApproverProfileId: null,
    startDate: d("2026-05-12"),
    endDate: d("2026-05-12"),
    startDayPortion: "full_day" as const,
    endDayPortion: "full_day" as const,
    requestedUnits: 1,
    deductedUnits: 1,
    requestedHours: 8,
    deductedHours: 8,
    status: "approved" as const,
    reason: "UAT approved leave used to test time-entry blocking.",
    submittedAt: d("2026-05-01"),
    approvedAt: d("2026-05-02"),
  };
  const leaveRequest = existingRequest
    ? await prisma.leaveRequest.update({ where: { id: existingRequest.id }, data: requestData })
    : await prisma.leaveRequest.create({ data: requestData });

  await prisma.leaveApprovalStep.upsert({
    where: {
      leaveRequestId_stepNumber: {
        leaveRequestId: leaveRequest.id,
        stepNumber: 1,
      },
    },
    update: {
      stageType: "manager",
      approverProfileId: brian.id,
      decision: "approved",
      notes: "Approved for UAT leave/timesheet conflict testing.",
      actedAt: d("2026-05-02"),
    },
    create: {
      leaveRequestId: leaveRequest.id,
      stepNumber: 1,
      stageType: "manager",
      approverProfileId: brian.id,
      decision: "approved",
      notes: "Approved for UAT leave/timesheet conflict testing.",
      actedAt: d("2026-05-02"),
    },
  });

  await prisma.leaveRequestSegment.deleteMany({ where: { leaveRequestId: leaveRequest.id } });
  await prisma.leaveRequestSegment.create({
    data: {
      leaveRequestId: leaveRequest.id,
      leaveDate: d("2026-05-12"),
      startMinuteOfDay: null,
      endMinuteOfDay: null,
      hours: 8,
      syncStatus: "confirmed",
    },
  });

  const existingDeduction = await prisma.leaveLedgerEntry.findFirst({
    where: {
      employeeProfileId: samuel.id,
      leaveTypeId: leaveType.id,
      leaveRequestId: leaveRequest.id,
      transactionType: "deduction",
    },
    select: { id: true },
  });
  const ledgerData = {
    leaveBalanceId: balance.id,
    employeeProfileId: samuel.id,
    leaveTypeId: leaveType.id,
    leaveRequestId: leaveRequest.id,
    createdByProfileId: sarah.id,
    leaveYear: 2026,
    transactionType: "deduction" as const,
    units: -1,
    note: "UAT approved leave deduction",
    effectiveDate: d("2026-05-12"),
  };
  if (existingDeduction) {
    await prisma.leaveLedgerEntry.update({ where: { id: existingDeduction.id }, data: ledgerData });
  } else {
    await prisma.leaveLedgerEntry.create({ data: ledgerData });
  }

  return leaveRequest;
}

async function seedEvaluations(profiles: Map<string, ProfileLite>) {
  const sarah = requireProfile(profiles, "sarah.hr@testfirm.co");
  const grace = requireProfile(profiles, "grace.gmp@testfirm.co");
  const brian = requireProfile(profiles, "brian.mgr@testfirm.co");
  const agnes = requireProfile(profiles, "agnes.mgr@testfirm.co");
  const employees = [
    requireProfile(profiles, "kevin.emp@testfirm.co"),
    requireProfile(profiles, "ruth.emp@testfirm.co"),
    requireProfile(profiles, "samuel.emp@testfirm.co"),
    requireProfile(profiles, "peter.emp@testfirm.co"),
    requireProfile(profiles, "esther.emp@testfirm.co"),
    requireProfile(profiles, "nicholas.emp@testfirm.co"),
  ];

  let template = await prisma.evaluationTemplate.findFirst({
    where: { name: "UAT Performance and BSC Template" },
    select: { id: true },
  });
  const templateData = {
    name: "UAT Performance and BSC Template",
    description: "Compact UAT template connecting evaluation score to KPI and BSC tracking.",
    templateType: "performance",
    bscCategory: "people",
    competencies: [
      { name: "Quality", weight: 30 },
      { name: "Delivery", weight: 30 },
      { name: "Collaboration", weight: 20 },
      { name: "Commercial contribution", weight: 20 },
    ],
    questions: [
      "Quality of job execution",
      "Timeliness and budget discipline",
      "Collaboration and communication",
      "Commercial contribution to revenue and profit",
    ],
    isDefault: false,
    isActive: true,
    createdBy: sarah.id,
  };
  template = template
    ? await prisma.evaluationTemplate.update({ where: { id: template.id }, data: templateData })
    : await prisma.evaluationTemplate.create({ data: templateData });

  const questionSeeds = [
    { text: "Quality of job execution", category: "competency" as const, weight: 30, order: 1 },
    { text: "Timeliness and budget discipline", category: "behavior" as const, weight: 25, order: 2 },
    { text: "Collaboration and manager feedback", category: "behavior" as const, weight: 20, order: 3 },
    { text: "Commercial contribution to revenue and profit", category: "competency" as const, weight: 25, order: 4 },
  ];
  const questions = [];
  for (const seed of questionSeeds) {
    const existing = await prisma.evaluationQuestion.findFirst({
      where: { templateId: template.id, text: seed.text },
      select: { id: true },
    });
    const data = {
      templateId: template.id,
      text: seed.text,
      category: seed.category,
      weight: seed.weight,
      order: seed.order,
      ratingScale: [
        { level: 1, label: "Below expectations" },
        { level: 3, label: "Meets expectations" },
        { level: 5, label: "Exceeds expectations" },
      ],
    };
    questions.push(
      existing
        ? await prisma.evaluationQuestion.update({ where: { id: existing.id }, data })
        : await prisma.evaluationQuestion.create({ data })
    );
  }

  let cycle = await prisma.evaluationCycle.findFirst({
    where: { cycleName: "UAT Q2 2026 Performance Cycle" },
    select: { id: true },
  });
  const cycleData = {
    cycleName: "UAT Q2 2026 Performance Cycle",
    description: "UAT evaluation cycle that syncs employee evaluation scores into performance and BSC.",
    cycleType: "quarterly" as const,
    startDate: d("2026-04-01"),
    endDate: d("2026-06-30"),
    status: "active" as const,
    createdByProfileId: sarah.id,
  };
  cycle = cycle
    ? await prisma.evaluationCycle.update({ where: { id: cycle.id }, data: cycleData })
    : await prisma.evaluationCycle.create({ data: cycleData });

  let definition = await prisma.evaluationDefinition.findFirst({
    where: { cycleId: cycle.id, name: "UAT Manager Quarterly Review" },
    select: { id: true },
  });
  const definitionData = {
    name: "UAT Manager Quarterly Review",
    description: "Manager-led UAT quarterly performance review.",
    cycleId: cycle.id,
    templateId: template.id,
    enableSelfEvaluation: true,
    enablePeerEvaluation: false,
    enableUpwardEvaluation: false,
    enableDownwardEvaluation: false,
    enableClientEvaluation: false,
    dueDate: d("2026-06-25"),
    status: "published" as const,
    createdByProfileId: sarah.id,
    publishedAt: d("2026-05-01"),
    questions: questionSeeds,
    scoringConfig: {
      scaleMax: 5,
      outputMax: 100,
      syncToPerformanceScore: true,
      syncToBsc: true,
    },
  };
  definition = definition
    ? await prisma.evaluationDefinition.update({ where: { id: definition.id }, data: definitionData })
    : await prisma.evaluationDefinition.create({ data: definitionData });

  const scoresByEmail: Record<string, number> = {
    "kevin.emp@testfirm.co": 84,
    "ruth.emp@testfirm.co": 88,
    "samuel.emp@testfirm.co": 72,
    "peter.emp@testfirm.co": 86,
    "esther.emp@testfirm.co": 82,
    "nicholas.emp@testfirm.co": 78,
  };

  for (const employee of employees) {
    const email = employee.user?.email?.toLowerCase() ?? "";
    const manager = email.includes("kevin") || email.includes("ruth") || email.includes("samuel")
      ? brian
      : agnes;
    const score = scoresByEmail[email] ?? 75;
    const assignment = await prisma.evaluationAssignment.upsert({
      where: {
        evaluationDefinitionId_evaluatorProfileId_evaluateeProfileId_evaluatorType: {
          evaluationDefinitionId: definition.id,
          evaluatorProfileId: manager.id,
          evaluateeProfileId: employee.id,
          evaluatorType: "manager",
        },
      },
      update: {
        cycleId: cycle.id,
        dueDate: d("2026-06-25"),
        relationship: "manager",
        status: "submitted",
        score,
        responses: {
          quality: score >= 85 ? 5 : 4,
          delivery: score >= 80 ? 4 : 3,
          collaboration: 4,
          commercial: score >= 85 ? 5 : 4,
        },
        evaluatorComments: `UAT manager review for ${profileName(employee)}.`,
        submittedAt: d("2026-06-20"),
        evaluatorSigned: true,
        evaluatorSignedAt: d("2026-06-20"),
        evaluateeAcknowledged: true,
        evaluateeAcknowledgedAt: d("2026-06-21"),
      },
      create: {
        evaluationDefinitionId: definition.id,
        cycleId: cycle.id,
        evaluatorProfileId: manager.id,
        evaluateeProfileId: employee.id,
        dueDate: d("2026-06-25"),
        evaluatorType: "manager",
        relationship: "manager",
        status: "submitted",
        score,
        responses: {
          quality: score >= 85 ? 5 : 4,
          delivery: score >= 80 ? 4 : 3,
          collaboration: 4,
          commercial: score >= 85 ? 5 : 4,
        },
        evaluatorComments: `UAT manager review for ${profileName(employee)}.`,
        submittedAt: d("2026-06-20"),
        evaluatorSigned: true,
        evaluatorSignedAt: d("2026-06-20"),
        evaluateeAcknowledged: true,
        evaluateeAcknowledgedAt: d("2026-06-21"),
      },
    });

    for (const question of questions) {
      const questionScore = score >= 85 ? 5 : score >= 75 ? 4 : 3;
      await prisma.evaluationResponse.upsert({
        where: {
          assignmentId_questionId: {
            assignmentId: assignment.id,
            questionId: question.id,
          },
        },
        update: {
          score: questionScore,
          comment: `UAT evidence score ${questionScore}/5.`,
        },
        create: {
          assignmentId: assignment.id,
          questionId: question.id,
          score: questionScore,
          comment: `UAT evidence score ${questionScore}/5.`,
        },
      });
    }

    await prisma.evaluationAssignment.upsert({
      where: {
        evaluationDefinitionId_evaluatorProfileId_evaluateeProfileId_evaluatorType: {
          evaluationDefinitionId: definition.id,
          evaluatorProfileId: employee.id,
          evaluateeProfileId: employee.id,
          evaluatorType: "self",
        },
      },
      update: {
        cycleId: cycle.id,
        dueDate: d("2026-06-18"),
        relationship: "self",
        status: "submitted",
        score: Math.min(100, score + 3),
        evaluatorComments: "UAT self-review submitted.",
        submittedAt: d("2026-06-18"),
      },
      create: {
        evaluationDefinitionId: definition.id,
        cycleId: cycle.id,
        evaluatorProfileId: employee.id,
        evaluateeProfileId: employee.id,
        dueDate: d("2026-06-18"),
        evaluatorType: "self",
        relationship: "self",
        status: "submitted",
        score: Math.min(100, score + 3),
        evaluatorComments: "UAT self-review submitted.",
        submittedAt: d("2026-06-18"),
      },
    });

    const utilizationScore = email.includes("samuel") || email.includes("nicholas") ? 74 : 86;
    const totalScore = Math.round(score * 0.35 + utilizationScore * 0.25 + 82 * 0.2 + 88 * 0.2);
    await prisma.performanceScore.upsert({
      where: {
        employeeProfileId_evaluationCycleId_period: {
          employeeProfileId: employee.id,
          evaluationCycleId: cycle.id,
          period: d("2026-06-30"),
        },
      },
      update: {
        revenueScore: 82,
        profitScore: 80,
        bdScore: 70,
        utilizationScore,
        jobCompletionScore: 84,
        timeToDeliveryScore: 86,
        financialWeighted: 32,
        efficiencyWeighted: 21,
        evaluationScore: score,
        clientRatingScore: 90,
        nonFinancialWeighted: 34,
        totalScore,
        grade: totalScore >= 85 ? "A" : totalScore >= 75 ? "B" : "C",
        scoreBreakdown: {
          revenue: "From UAT revenue allocations and billable time",
          profitability: "From billable amount less cost amount",
          evaluation: "Synced from UAT manager evaluation assignment",
          bsc: "Bridged into BalancedScorecardEmployeeContribution",
        },
        notes: "UAT performance score seeded from operational, evaluation, and BSC inputs.",
        calculatedAt: d("2026-06-30"),
      },
      create: {
        employeeProfileId: employee.id,
        evaluationCycleId: cycle.id,
        period: d("2026-06-30"),
        revenueScore: 82,
        profitScore: 80,
        bdScore: 70,
        utilizationScore,
        jobCompletionScore: 84,
        timeToDeliveryScore: 86,
        financialWeighted: 32,
        efficiencyWeighted: 21,
        evaluationScore: score,
        clientRatingScore: 90,
        nonFinancialWeighted: 34,
        totalScore,
        grade: totalScore >= 85 ? "A" : totalScore >= 75 ? "B" : "C",
        scoreBreakdown: {
          revenue: "From UAT revenue allocations and billable time",
          profitability: "From billable amount less cost amount",
          evaluation: "Synced from UAT manager evaluation assignment",
          bsc: "Bridged into BalancedScorecardEmployeeContribution",
        },
        notes: "UAT performance score seeded from operational, evaluation, and BSC inputs.",
        calculatedAt: d("2026-06-30"),
      },
    });

    const goalTitle = `UAT ${profileName(employee)} KPI contribution`;
    const existingGoal = await prisma.employeeGoal.findFirst({
      where: { profileId: employee.id, evaluationCycleId: cycle.id, title: goalTitle },
      select: { id: true },
    });
    const goalData = {
      profileId: employee.id,
      evaluationCycleId: cycle.id,
      bscKpiKey: "kpi-10",
      title: goalTitle,
      description: "Individual KPI goal linked to evaluation and BSC contribution.",
      targetValue: 85,
      actualValue: score,
      weight: 1,
      status: score >= 85 ? ("achieved" as const) : ("active" as const),
      dueDate: d("2026-06-30"),
      managerComment: `UAT KPI progress for ${profileName(employee)}.`,
      acknowledgedAt: d("2026-05-10"),
    };
    if (existingGoal) {
      await prisma.employeeGoal.update({ where: { id: existingGoal.id }, data: goalData });
    } else {
      await prisma.employeeGoal.create({ data: goalData });
    }

    await bridgeEvaluationScoreToBsc(employee.id, cycle.id, score);
    await prisma.balancedScorecardEmployeeContribution.update({
      where: {
        profileId_contributionKey: {
          profileId: employee.id,
          contributionKey: `evaluation-${employee.id}`,
        },
      },
      data: {
        linkedKpiKey: "kpi-10",
        initiativeTitle: "UAT quarterly performance contribution",
        latestComment: `Latest evaluation score synced at ${score}%.`,
        acknowledgedAt: d("2026-06-21"),
        acknowledgedByProfileId: manager.id,
      },
    });
  }

  await prisma.performanceScore.upsert({
    where: {
      employeeProfileId_evaluationCycleId_period: {
        employeeProfileId: brian.id,
        evaluationCycleId: cycle.id,
        period: d("2026-06-30"),
      },
    },
    update: {
      evaluationScore: 84,
      utilizationScore: 78,
      jobCompletionScore: 83,
      totalScore: 84,
      grade: "B",
      scoreBreakdown: {
        aggregation: "Manager score aggregates Tax Department employee UAT performance.",
      },
      notes: "UAT manager aggregation score.",
    },
    create: {
      employeeProfileId: brian.id,
      evaluationCycleId: cycle.id,
      period: d("2026-06-30"),
      evaluationScore: 84,
      utilizationScore: 78,
      jobCompletionScore: 83,
      totalScore: 84,
      grade: "B",
      scoreBreakdown: {
        aggregation: "Manager score aggregates Tax Department employee UAT performance.",
      },
      notes: "UAT manager aggregation score.",
    },
  });
  await prisma.performanceScore.upsert({
    where: {
      employeeProfileId_evaluationCycleId_period: {
        employeeProfileId: agnes.id,
        evaluationCycleId: cycle.id,
        period: d("2026-06-30"),
      },
    },
    update: {
      evaluationScore: 82,
      utilizationScore: 79,
      jobCompletionScore: 86,
      totalScore: 83,
      grade: "B",
      scoreBreakdown: {
        aggregation: "Manager score aggregates Advisory Department employee UAT performance.",
      },
      notes: "UAT manager aggregation score.",
    },
    create: {
      employeeProfileId: agnes.id,
      evaluationCycleId: cycle.id,
      period: d("2026-06-30"),
      evaluationScore: 82,
      utilizationScore: 79,
      jobCompletionScore: 86,
      totalScore: 83,
      grade: "B",
      scoreBreakdown: {
        aggregation: "Manager score aggregates Advisory Department employee UAT performance.",
      },
      notes: "UAT manager aggregation score.",
    },
  });
  await bridgeEvaluationScoreToBsc(grace.id, cycle.id, 85);

  return { cycle, definition };
}

const cycleRangeForCurrentYear = () => {
  const now = new Date();
  const year = now.getUTCFullYear();
  return {
    year,
    startDate: `${year}-01-01`,
    endDate: `${year}-12-31`,
  };
};

const scoreToStatus = (progress: number): "on_track" | "at_risk" | "off_track" =>
  progress >= 85 ? "on_track" : progress >= 65 ? "at_risk" : "off_track";

async function ensureActiveBscVersion() {
  const activeVersionId = await resolveActiveBalancedScorecardVersionId();
  if (activeVersionId) return activeVersionId;

  const { year, startDate, endDate } = cycleRangeForCurrentYear();
  const cycleName = `FY ${year} Balanced Scorecard`;
  let cycle = await prisma.balancedScorecardCycle.findFirst({
    where: { name: cycleName },
    orderBy: [{ id: "desc" }],
    select: { id: true },
  });
  if (!cycle) {
    cycle = await createBalancedScorecardCycle({
      name: cycleName,
      cadence: "monthly",
      startDate,
      endDate,
      createdByProfileId: null,
    });
  }

  const latestVersion =
    (await prisma.balancedScorecardVersion.findFirst({
      where: { cycleId: cycle.id },
      orderBy: [{ versionNumber: "desc" }, { id: "desc" }],
      select: { id: true, status: true },
    })) ??
    (await createBalancedScorecardVersion({
      cycleId: cycle.id,
      label: "UAT operational baseline",
      createdByProfileId: null,
    }));

  if (latestVersion.status !== "published") {
    await publishBalancedScorecardVersion(latestVersion.id);
  }

  return latestVersion.id;
}

async function seedBscKpis(profiles: Map<string, ProfileLite>) {
  await ensureBalancedScorecardSeed();
  const versionId = await ensureActiveBscVersion();
  const structure = await listBalancedScorecardStructure({ scorecardVersionId: versionId });
  const kpis = structure.kpis.length > 0 ? structure.kpis : [];
  if (kpis.length === 0) return { versionId, assignments: 0 };

  const primaryKpi = kpis.find((kpi) => kpi.metricKey === "kpi-10") ?? kpis[0];
  const secondaryKpi = kpis.find((kpi) => kpi.metricKey === "kpi-9") ?? primaryKpi;
  const owners = [
    { email: "brian.mgr@testfirm.co", kpi: secondaryKpi, target: 85, weight: 30, progress: 82, role: "manager" },
    { email: "agnes.mgr@testfirm.co", kpi: secondaryKpi, target: 85, weight: 30, progress: 84, role: "manager" },
    { email: "kevin.emp@testfirm.co", kpi: primaryKpi, target: 85, weight: 20, progress: 84, role: "employee" },
    { email: "ruth.emp@testfirm.co", kpi: primaryKpi, target: 85, weight: 20, progress: 88, role: "employee" },
    { email: "esther.emp@testfirm.co", kpi: primaryKpi, target: 85, weight: 20, progress: 82, role: "employee" },
  ];

  for (const owner of owners) {
    const profile = requireProfile(profiles, owner.email);
    await upsertBalancedScorecardKpiAssignment({
      kpiId: owner.kpi.id,
      profileId: profile.id,
      scorecardVersionId: versionId,
      individualTarget: owner.target,
      individualWeight: owner.weight,
      createdByProfileId: null,
    });

    const title = `UAT ${profileName(profile)} BSC operating target`;
    const existingInitiative = await prisma.balancedScorecardInitiative.findFirst({
      where: {
        scorecardVersionId: versionId,
        kpiId: owner.kpi.id,
        ownerProfileId: profile.id,
        title,
        isActive: true,
      },
      select: { id: true },
    });

    if (existingInitiative) {
      await updateBalancedScorecardInitiative(existingInitiative.id, {
        ownerProfileId: profile.id,
        scopeRole: owner.role,
        progress: owner.progress,
        status: scoreToStatus(owner.progress),
        summary: "UAT BSC target tied to job execution, evaluation, and contribution tracking.",
      });
    } else {
      await createBalancedScorecardInitiative({
        goalId: owner.kpi.goalId,
        kpiId: owner.kpi.id,
        scopeRole: owner.role,
        title,
        summary: "UAT BSC target tied to job execution, evaluation, and contribution tracking.",
        ownerProfileId: profile.id,
        dueDate: `${cycleRangeForCurrentYear().year}-12-31`,
        status: scoreToStatus(owner.progress),
        progress: owner.progress,
        createdByProfileId: null,
      });
    }
  }

  return { versionId, assignments: owners.length };
}

async function seedRevenueProjections(work: Awaited<ReturnType<typeof seedOperationalWork>>, profiles: Map<string, ProfileLite>) {
  const pauline = requireProfile(profiles, "pauline.marketing@testfirm.co");
  for (const client of work.clients) {
    const projectedAmount =
      client.clientCode === "UAT-TAX-001"
        ? 1200000
        : client.clientCode === "UAT-ADV-001"
          ? 900000
          : 650000;
    const actualCollected =
      client.clientCode === "UAT-TAX-001"
        ? 450000
        : client.clientCode === "UAT-ADV-001"
          ? 1044000
          : 0;
    await prisma.revenueProjection.upsert({
      where: {
        clientId_departmentId_monthYear: {
          clientId: client.id,
          departmentId: client.departmentId,
          monthYear: d("2026-05-01"),
        },
      },
      update: {
        projectedAmount,
        actualCollected,
        variance: money(actualCollected - projectedAmount),
        variancePercent:
          projectedAmount > 0 ? money(((actualCollected - projectedAmount) / projectedAmount) * 100) : 0,
        status: actualCollected >= projectedAmount ? "actualized" : "projected",
        createdByProfileId: pauline.id,
      },
      create: {
        clientId: client.id,
        departmentId: client.departmentId,
        monthYear: d("2026-05-01"),
        projectedAmount,
        actualCollected,
        variance: money(actualCollected - projectedAmount),
        variancePercent:
          projectedAmount > 0 ? money(((actualCollected - projectedAmount) / projectedAmount) * 100) : 0,
        status: actualCollected >= projectedAmount ? "actualized" : "projected",
        createdByProfileId: pauline.id,
      },
    });
  }
}

async function seedProjectEvaluations(work: Awaited<ReturnType<typeof seedOperationalWork>>, profiles: Map<string, ProfileLite>) {
  const brian = requireProfile(profiles, "brian.mgr@testfirm.co");
  const agnes = requireProfile(profiles, "agnes.mgr@testfirm.co");
  const taxEvaluatees = [
    requireProfile(profiles, "kevin.emp@testfirm.co"),
    requireProfile(profiles, "ruth.emp@testfirm.co"),
    requireProfile(profiles, "samuel.emp@testfirm.co"),
  ];
  const advisoryEvaluatees = [
    requireProfile(profiles, "peter.emp@testfirm.co"),
    requireProfile(profiles, "esther.emp@testfirm.co"),
    requireProfile(profiles, "nicholas.emp@testfirm.co"),
  ];
  const taxJob = work.jobs.find((job) => job.jobCode === "UAT-JOB-TAX-AUDIT-001");
  const advisoryJob = work.jobs.find((job) => job.jobCode === "UAT-JOB-ADV-RISK-001");
  if (!taxJob || !advisoryJob) return;

  for (const evaluatee of taxEvaluatees) {
    await prisma.projectEvaluation.upsert({
      where: {
        jobId_evaluateeProfileId_evaluatorProfileId_evaluatorType: {
          jobId: taxJob.id,
          evaluateeProfileId: evaluatee.id,
          evaluatorProfileId: brian.id,
          evaluatorType: "manager",
        },
      },
      update: {
        status: "submitted",
        scores: { quality: 4, timeliness: 4, teamwork: 4 },
        overallScore: 82,
        comments: "UAT job-level manager evaluation.",
        submittedAt: d("2026-05-25"),
      },
      create: {
        jobId: taxJob.id,
        evaluateeProfileId: evaluatee.id,
        evaluatorProfileId: brian.id,
        evaluatorType: "manager",
        status: "submitted",
        scores: { quality: 4, timeliness: 4, teamwork: 4 },
        overallScore: 82,
        comments: "UAT job-level manager evaluation.",
        submittedAt: d("2026-05-25"),
      },
    });
  }

  for (const evaluatee of advisoryEvaluatees) {
    await prisma.projectEvaluation.upsert({
      where: {
        jobId_evaluateeProfileId_evaluatorProfileId_evaluatorType: {
          jobId: advisoryJob.id,
          evaluateeProfileId: evaluatee.id,
          evaluatorProfileId: agnes.id,
          evaluatorType: "manager",
        },
      },
      update: {
        status: "submitted",
        scores: { quality: 5, timeliness: 4, teamwork: 4 },
        overallScore: 86,
        comments: "UAT completed-job manager evaluation.",
        submittedAt: d("2026-05-22"),
      },
      create: {
        jobId: advisoryJob.id,
        evaluateeProfileId: evaluatee.id,
        evaluatorProfileId: agnes.id,
        evaluatorType: "manager",
        status: "submitted",
        scores: { quality: 5, timeliness: 4, teamwork: 4 },
        overallScore: 86,
        comments: "UAT completed-job manager evaluation.",
        submittedAt: d("2026-05-22"),
      },
    });
  }
}

async function main() {
  assertLocalDatabase();
  const teamSummary = await seedUatTeam();
  let profiles = await loadProfiles();
  await applyProfileTargets(profiles);
  profiles = await loadProfiles();

  const work = await seedOperationalWork(profiles);
  await seedRevenueProjections(work, profiles);
  await seedProjectEvaluations(work, profiles);
  const leaveRequest = await seedLeave(profiles);
  const evaluation = await seedEvaluations(profiles);
  const bsc = await seedBscKpis(profiles);

  const counts = {
    users: teamSummary.users.length,
    clients: await prisma.client.count({ where: { clientCode: { startsWith: "UAT-" } } }),
    jobs: await prisma.job.count({ where: { jobCode: { startsWith: "UAT-JOB-" } } }),
    proposals: await prisma.proposal.count({
      where: { client: { clientCode: { startsWith: "UAT-" } } },
    }),
    timeEntries: await prisma.timeEntry.count({
      where: { job: { jobCode: { startsWith: "UAT-JOB-" } } },
    }),
    invoices: await prisma.jobInvoice.count({
      where: { invoiceNumber: { startsWith: "UAT-INV-" } },
    }),
    revenueAllocations: await prisma.revenueAllocation.count({
      where: { job: { jobCode: { startsWith: "UAT-JOB-" } } },
    }),
    performanceScores: await prisma.performanceScore.count({
      where: { evaluationCycleId: evaluation.cycle.id },
    }),
    bscAssignments: bsc.assignments,
  };

  console.log("Operational UAT seed complete");
  console.table(counts);
  console.log(`Default UAT password: ${TEST_PASSWORD}`);
  console.log(`Approved leave request for time-entry block test: ${leaveRequest.id}`);
  console.log("Recommended logins:");
  console.table([
    { role: "HR", email: "sarah.hr@testfirm.co" },
    { role: "GMP", email: "grace.gmp@testfirm.co" },
    { role: "Tax Partner", email: "james.partner@testfirm.co" },
    { role: "Advisory Partner", email: "linda.partner@testfirm.co" },
    { role: "Tax Manager", email: "brian.mgr@testfirm.co" },
    { role: "Advisory Manager", email: "agnes.mgr@testfirm.co" },
    { role: "Finance", email: "diana.finance@testfirm.co" },
    { role: "Marketing", email: "pauline.marketing@testfirm.co" },
    { role: "Employee on approved leave 2026-05-12", email: "samuel.emp@testfirm.co" },
  ]);
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
