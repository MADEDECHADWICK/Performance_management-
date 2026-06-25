import bcrypt from "bcryptjs";
import prisma from "../../src/prisma";
import { ensureBalancedScorecardSeed } from "../../src/services/balancedScorecardStructure.service";
import {
  createBalancedScorecardCycle,
  createBalancedScorecardVersion,
  publishBalancedScorecardVersion,
  resolveActiveBalancedScorecardVersionId,
} from "../../src/services/balancedScorecardGovernance.service";
import { bridgeEvaluationScoreToBsc } from "../../src/services/evaluationBscBridge.service";

const TEST_PASSWORD = "Test@1234";
const d = (value: string) => new Date(`${value}T00:00:00.000Z`);
const money = (n: number) => Number(n.toFixed(2));

// ─── existing production users ────────────────────────────────────────────────
const PROD_EMAILS = [
  "gmp@ronalds.local",
  "partner@ronalds.local",
  "manager@ronalds.local",
  "hr@ronalds.local",
  "finance@ronalds.local",
  "marketing@ronalds.local",
  "employee@ronalds.local",
  "chadwickmadas@gmail.com",
  "rach.achola@gmail.com",
] as const;

// ─── new users created by this seed ──────────────────────────────────────────
const NEW_USERS = [
  {
    email: "tax.mgr@ronalds.local",
    firstName: "James",
    lastName: "Mutua",
    positionTitle: "Tax Manager",
    positionRoleName: "Tax Manager",
    departmentCode: "TAX",
    isPartner: false,
    reportsToEmail: "partner@ronalds.local",
    authRole: "manager",
    financialTarget: 2500000,
    utilizationTarget: 0.78,
    employeeId: "PROD-003",
    hireDate: "2022-03-01",
  },
  {
    email: "tax.emp1@ronalds.local",
    firstName: "Kevin",
    lastName: "Otieno",
    positionTitle: "Tax Consultant",
    positionRoleName: "Tax Consultant",
    departmentCode: "TAX",
    isPartner: false,
    reportsToEmail: "tax.mgr@ronalds.local",
    authRole: "employee",
    financialTarget: 1200000,
    utilizationTarget: 0.8,
    employeeId: "PROD-004",
    hireDate: "2024-01-15",
  },
  {
    email: "tax.emp2@ronalds.local",
    firstName: "Ruth",
    lastName: "Achieng",
    positionTitle: "Senior Associate",
    positionRoleName: "Senior Associate",
    departmentCode: "TAX",
    isPartner: false,
    reportsToEmail: "tax.mgr@ronalds.local",
    authRole: "employee",
    financialTarget: 1400000,
    utilizationTarget: 0.82,
    employeeId: "PROD-005",
    hireDate: "2023-11-06",
  },
] as const;

type ProfileLite = {
  id: number;
  firstName: string;
  lastName: string;
  departmentId: number | null;
  roleId: number | null;
  role: { id: number; name: string; billingRate: unknown; costRate: unknown } | null;
  user: { email: string } | null;
};

// ─── guard ────────────────────────────────────────────────────────────────────
const assertProductionSeed = () => {
  const allowNonLocal = process.env.ALLOW_NON_LOCAL_SEED === "true";
  if (allowNonLocal) return;
  const raw = process.env.DATABASE_URL || "";
  let host = "";
  try { host = new URL(raw).hostname.toLowerCase(); } catch {
    throw new Error("DATABASE_URL is missing or invalid.");
  }
  if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
    throw new Error(
      `Refusing to seed into remote database "${host}". Set ALLOW_NON_LOCAL_SEED=true to override.`
    );
  }
};

const requireProfile = (profiles: Map<string, ProfileLite>, email: string) => {
  const p = profiles.get(email);
  if (!p) throw new Error(`Missing profile for ${email}`);
  return p;
};

const roleRates = (p: ProfileLite) => ({
  billingRate: Number(p.role?.billingRate || 0),
  costRate: Number(p.role?.costRate || 0),
});

// ─── position roles ──────────────────────────────────────────────────────────
async function ensurePositionRoles() {
  const rows = await Promise.all([
    { name: "Partner",           billingRate: 10000, costRate: 7500 },
    { name: "Tax Manager",       billingRate: 7000,  costRate: 5200 },
    { name: "Advisory Manager",  billingRate: 7000,  costRate: 5200 },
    { name: "Finance Manager",   billingRate: 6800,  costRate: 5000 },
    { name: "Finance Analyst",   billingRate: 4300,  costRate: 3000 },
    { name: "Marketing Lead",    billingRate: 5000,  costRate: 3400 },
    { name: "Senior Associate",  billingRate: 4500,  costRate: 3200 },
    { name: "Advisory Consultant", billingRate: 4000, costRate: 2800 },
    { name: "Tax Consultant",    billingRate: 4000,  costRate: 2800 },
    { name: "Associate",         billingRate: 3200,  costRate: 2200 },
  ].map((r) =>
    prisma.positionRole.upsert({
      where: { name: r.name },
      update: { billingRate: r.billingRate, costRate: r.costRate, isActive: true },
      create: { name: r.name, billingRate: r.billingRate, costRate: r.costRate, isActive: true },
    })
  ));
  return new Map(rows.map((r) => [r.name, r]));
}

// ─── departments ──────────────────────────────────────────────────────────────
async function ensureDepartments() {
  const depts = [
    { code: "TAX", name: "Tax & Audit",       description: "Tax compliance and audit services" },
    { code: "ADV", name: "Advisory",           description: "Business advisory and consulting" },
    { code: "FIN", name: "Finance",            description: "Finance operations and reporting" },
    { code: "MKT", name: "Marketing",          description: "Marketing and business development" },
  ];
  const rows = await Promise.all(
    depts.map((dept) =>
      prisma.department.upsert({
        where: { departmentCode: dept.code },
        update: { name: dept.name, description: dept.description },
        create: { departmentCode: dept.code, name: dept.name, description: dept.description },
      })
    )
  );
  return new Map(rows.map((r) => [r.departmentCode, r]));
}

// ─── load all profiles ────────────────────────────────────────────────────────
async function loadProfiles(emails: readonly string[]): Promise<Map<string, ProfileLite>> {
  const profiles = await prisma.profile.findMany({
    where: { user: { email: { in: [...emails] } } },
    select: {
      id: true, firstName: true, lastName: true, departmentId: true, roleId: true,
      role: { select: { id: true, name: true, billingRate: true, costRate: true } },
      user: { select: { email: true } },
    },
  });
  return new Map(profiles.map((p) => [p.user?.email?.toLowerCase() ?? "", p]));
}

// ─── create new users ─────────────────────────────────────────────────────────
async function createNewUsers(
  positionRoleMap: Map<string, { id: number }>,
  departmentMap: Map<string, { id: number }>
) {
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);

  // Ensure auth roles exist
  const authRoleNames = ["manager", "employee"] as const;
  const authRoles = await Promise.all(
    authRoleNames.map((name) =>
      prisma.authRole.upsert({
        where: { name },
        update: { isActive: true },
        create: { name, description: `${name} role`, isActive: true },
      })
    )
  );
  const authRoleMap = new Map(authRoles.map((r) => [r.name, r]));

  for (const blueprint of NEW_USERS) {
    const roleId = positionRoleMap.get(blueprint.positionRoleName)?.id ?? null;
    const departmentId = departmentMap.get(blueprint.departmentCode)?.id ?? null;
    const authRole = authRoleMap.get(blueprint.authRole as "manager" | "employee");
    if (!authRole) throw new Error(`Auth role ${blueprint.authRole} not found`);

    const user = await prisma.user.upsert({
      where: { email: blueprint.email },
      update: { password: passwordHash, isActive: true, isVerified: true },
      create: { email: blueprint.email, password: passwordHash, isActive: true, isVerified: true },
    });

    await prisma.profile.upsert({
      where: { userId: user.id },
      update: {
        firstName: blueprint.firstName, lastName: blueprint.lastName,
        positionTitle: blueprint.positionTitle, departmentId, roleId,
        status: "active", isPartner: blueprint.isPartner,
        onboardingStatus: "completed", onboardingChecklistCompleted: true, inductionCompleted: true,
      },
      create: {
        userId: user.id,
        firstName: blueprint.firstName, lastName: blueprint.lastName,
        positionTitle: blueprint.positionTitle, departmentId, roleId,
        status: "active", isPartner: blueprint.isPartner,
        onboardingStatus: "completed", onboardingChecklistCompleted: true, inductionCompleted: true,
      },
    });

    await prisma.userAuthRole.deleteMany({ where: { userId: user.id } });
    await prisma.userAuthRole.create({ data: { userId: user.id, roleId: authRole.id } });
  }
}

// ─── bypass onboarding for existing users ────────────────────────────────────
async function bypassOnboarding(profiles: Map<string, ProfileLite>) {
  const targets = [
    { email: "gmp@ronalds.local",       employeeId: "PROD-GMP-001", hireDate: "2018-01-15", financialTarget: 10000000, utilizationTarget: 0.7 },
    { email: "partner@ronalds.local",    employeeId: "PROD-PTR-001", hireDate: "2019-06-01", financialTarget: 4500000,  utilizationTarget: 0.75 },
    { email: "manager@ronalds.local",    employeeId: "PROD-MGR-001", hireDate: "2020-09-01", financialTarget: 2500000,  utilizationTarget: 0.78 },
    { email: "hr@ronalds.local",         employeeId: "PROD-HR-001",  hireDate: "2021-02-01", financialTarget: 0,        utilizationTarget: 0.65 },
    { email: "finance@ronalds.local",    employeeId: "PROD-FIN-001", hireDate: "2020-11-01", financialTarget: 0,        utilizationTarget: 0.72 },
    { email: "marketing@ronalds.local",  employeeId: "PROD-MKT-001", hireDate: "2022-04-01", financialTarget: 1500000,  utilizationTarget: 0.68 },
    { email: "employee@ronalds.local",   employeeId: "PROD-EMP-001", hireDate: "2023-03-01", financialTarget: 1000000,  utilizationTarget: 0.8 },
    { email: "chadwickmadas@gmail.com",  employeeId: "PROD-EMP-002", hireDate: "2022-07-01", financialTarget: 1400000,  utilizationTarget: 0.82 },
    { email: "rach.achola@gmail.com",    employeeId: "PROD-GMP-002", hireDate: "2017-09-01", financialTarget: 8000000,  utilizationTarget: 0.7 },
  ];
  for (const t of targets) {
    const p = profiles.get(t.email);
    if (!p) continue;
    await prisma.profile.update({
      where: { id: p.id },
      data: {
        employeeId: t.employeeId,
        hireDate: d(t.hireDate),
        financialTarget: t.financialTarget,
        utilizationTarget: t.utilizationTarget,
        onboardingStatus: "completed",
        onboardingChecklistCompleted: true,
        inductionCompleted: true,
      },
    });
  }
}

// ─── wire department heads / reporting lines ──────────────────────────────────
async function wireDepartmentStructure(
  profiles: Map<string, ProfileLite>,
  positionRoleMap: Map<string, { id: number }>,
  departmentMap: Map<string, { id: number }>
) {
  const gmp     = requireProfile(profiles, "gmp@ronalds.local");
  const partner = requireProfile(profiles, "partner@ronalds.local");
  const mgr     = requireProfile(profiles, "manager@ronalds.local");
  // rach.achola@gmail.com only exists in the live Render DB; fall back to gmp locally
  const rachael = profiles.get("rach.achola@gmail.com") ?? gmp;
  const emp1    = requireProfile(profiles, "employee@ronalds.local");
  const emp2    = profiles.get("chadwickmadas@gmail.com") ?? emp1;  // prod-only fallback
  const taxMgr  = requireProfile(profiles, "tax.mgr@ronalds.local");
  const taxEmp1 = requireProfile(profiles, "tax.emp1@ronalds.local");
  const taxEmp2 = requireProfile(profiles, "tax.emp2@ronalds.local");

  const taxDeptId = departmentMap.get("TAX")!.id;
  const advDeptId = departmentMap.get("ADV")!.id;
  const finDeptId = departmentMap.get("FIN")!.id;
  const mktDeptId = departmentMap.get("MKT")!.id;

  const partnerRoleId       = positionRoleMap.get("Partner")?.id;
  const advisoryManagerRoleId = positionRoleMap.get("Advisory Manager")?.id;
  const advisoryConsultantRoleId = positionRoleMap.get("Advisory Consultant")?.id;
  const seniorAssocRoleId   = positionRoleMap.get("Senior Associate")?.id;

  // GMP
  await prisma.profile.update({ where: { id: gmp.id }, data: { isPartner: true, managerId: null } });
  await prisma.partner.upsert({ where: { profileId: gmp.id }, update: {}, create: { profileId: gmp.id } });

  // Rachael (prod only) - treat as ADV dept partner; if absent locally, gmp already handled above
  if (rachael.id !== gmp.id) {
    await prisma.profile.update({
      where: { id: rachael.id },
      data: { isPartner: true, managerId: gmp.id, departmentId: advDeptId,
              ...(partnerRoleId ? { roleId: partnerRoleId } : {}) },
    });
    await prisma.partner.upsert({ where: { profileId: rachael.id }, update: {}, create: { profileId: rachael.id } });
  }

  // Partner (Janet) → TAX dept
  await prisma.profile.update({
    where: { id: partner.id },
    data: { isPartner: true, managerId: gmp.id, departmentId: taxDeptId,
            ...(partnerRoleId ? { roleId: partnerRoleId } : {}) },
  });
  await prisma.partner.upsert({ where: { profileId: partner.id }, update: {}, create: { profileId: partner.id } });

  // Tax Manager (James) → TAX dept, reports to Janet
  await prisma.profile.update({
    where: { id: taxMgr.id },
    data: { managerId: partner.id, departmentId: taxDeptId },
  });

  // Tax employees → TAX, report to James
  await prisma.profile.update({ where: { id: taxEmp1.id }, data: { managerId: taxMgr.id, departmentId: taxDeptId } });
  await prisma.profile.update({ where: { id: taxEmp2.id }, data: { managerId: taxMgr.id, departmentId: taxDeptId } });

  // Manager (Patrick) → ADV dept, reports to Rachael
  await prisma.profile.update({
    where: { id: mgr.id },
    data: { managerId: rachael.id, departmentId: advDeptId,
            ...(advisoryManagerRoleId ? { roleId: advisoryManagerRoleId } : {}) },
  });

  // ADV employees → ADV, report to Patrick
  await prisma.profile.update({
    where: { id: emp1.id },
    data: { managerId: mgr.id, departmentId: advDeptId,
            ...(advisoryConsultantRoleId ? { roleId: advisoryConsultantRoleId } : {}) },
  });
  await prisma.profile.update({
    where: { id: emp2.id },
    data: { managerId: mgr.id, departmentId: advDeptId,
            ...(seniorAssocRoleId ? { roleId: seniorAssocRoleId } : {}) },
  });

  // Dept head assignments
  await prisma.department.update({
    where: { id: taxDeptId },
    data: { partnerProfileId: partner.id, departmentHeadId: taxMgr.id },
  });
  await prisma.department.update({
    where: { id: advDeptId },
    data: { partnerProfileId: rachael.id, departmentHeadId: mgr.id },
  });

  const finProfile  = requireProfile(profiles, "finance@ronalds.local");
  const mktProfile  = requireProfile(profiles, "marketing@ronalds.local");
  await prisma.department.update({ where: { id: finDeptId }, data: { departmentHeadId: finProfile.id } });
  await prisma.department.update({ where: { id: mktDeptId }, data: { departmentHeadId: mktProfile.id } });
}

// ─── upsert helpers ───────────────────────────────────────────────────────────
async function upsertClient(input: {
  clientCode: string; clientName: string; industry: string;
  departmentId: number | null; partnerProfileId: number; managerProfileId: number;
  contactPerson: string;
}) {
  const base = {
    clientName: input.clientName, industry: input.industry,
    departmentId: input.departmentId, partnerProfileId: input.partnerProfileId,
    managerProfileId: input.managerProfileId, contactPerson: input.contactPerson,
    contactEmail: `info@${input.clientCode.toLowerCase()}.co.ke`,
    contactPhone: "+254700000000", location: "Nairobi", status: "active" as const,
  };
  return prisma.client.upsert({
    where: { clientCode: input.clientCode },
    update: base, create: { clientCode: input.clientCode, ...base },
  });
}

async function upsertProposal(input: {
  clientId: number; title: string; serviceType: string; proposedFee: number;
  proposalDate: Date; status: "draft" | "sent" | "won" | "lost"; probability: number;
  createdByProfileId: number; assignedPartnerProfileId: number;
  wonAt?: Date | null; lostReason?: string | null; notes?: string;
}) {
  const existing = await prisma.proposal.findFirst({
    where: { clientId: input.clientId, proposalTitle: input.title }, select: { id: true },
  });
  const data = {
    clientId: input.clientId, proposalTitle: input.title, serviceType: input.serviceType,
    proposedFee: input.proposedFee, proposalDate: input.proposalDate,
    expectedStart: d("2026-06-01"), expectedDurationDays: 60,
    status: input.status, probability: input.probability,
    createdByProfileId: input.createdByProfileId,
    assignedPartnerProfileId: input.assignedPartnerProfileId,
    wonAt: input.wonAt ?? null, lostReason: input.lostReason ?? null, notes: input.notes ?? null,
  };
  if (existing) return prisma.proposal.update({ where: { id: existing.id }, data });
  return prisma.proposal.create({ data });
}

async function upsertJob(input: {
  jobCode: string; jobName: string; description: string; clientId: number;
  departmentId: number | null; partnerProfileId: number; managerProfileId: number;
  receivableOwnerProfileId: number;
  status: "planned" | "in_progress" | "completed" | "on_hold" | "cancelled";
  collectionStage: "not_ready" | "ready_for_collection" | "partial_collection" | "fully_collected" | "overdue";
  startDate: Date; dueDate: Date; completionDate?: Date | null;
  billingType: "fixed_fee" | "hourly"; fixedFeeAmount: number; budgetHours: number;
  priority?: "low" | "medium" | "high" | "urgent";
}) {
  const readyAt = input.collectionStage === "not_ready" ? null : d("2026-03-01");
  const base = {
    jobName: input.jobName, description: input.description, clientId: input.clientId,
    departmentId: input.departmentId, partnerProfileId: input.partnerProfileId,
    managerProfileId: input.managerProfileId,
    receivableOwnerProfileId: input.receivableOwnerProfileId,
    receivableOwnerAssignedAt: d("2026-02-01"),
    status: input.status, collectionStage: input.collectionStage,
    readyForCollectionAt: readyAt,
    startDate: input.startDate, dueDate: input.dueDate,
    completionDate: input.completionDate ?? null,
    billingType: input.billingType, fixedFeeAmount: input.fixedFeeAmount,
    currency: "KES", budgetHours: input.budgetHours,
    priority: input.priority ?? "medium",
    costingCompleted: true, teamAssigned: true,
  };
  return prisma.job.upsert({
    where: { jobCode: input.jobCode },
    update: base, create: { jobCode: input.jobCode, ...base },
  });
}

async function upsertCosting(input: {
  jobId: number; managerProfileId: number; partnerProfileId: number;
  jobFee: number; totalEstimatedHours: number; totalEstimatedCost: number;
}) {
  const allocatedCost = input.totalEstimatedCost;
  const costing = await prisma.jobCosting.upsert({
    where: { jobId: input.jobId },
    update: {
      managerProfileId: input.managerProfileId, jobFee: input.jobFee,
      allocatedCost, remainingBudget: input.jobFee - allocatedCost,
      totalEstimatedHours: input.totalEstimatedHours,
      totalEstimatedCost: input.totalEstimatedCost,
      costingStatus: "approved", approvedByPartnerProfileId: input.partnerProfileId,
      approvedAt: d("2026-01-31"), notes: "Production approved costing baseline",
    },
    create: {
      jobId: input.jobId, managerProfileId: input.managerProfileId,
      jobFee: input.jobFee, allocatedCost, remainingBudget: input.jobFee - allocatedCost,
      totalEstimatedHours: input.totalEstimatedHours,
      totalEstimatedCost: input.totalEstimatedCost,
      costingStatus: "approved", approvedByPartnerProfileId: input.partnerProfileId,
      approvedAt: d("2026-01-31"), notes: "Production approved costing baseline",
    },
  });
  await prisma.budgetCap.upsert({
    where: { jobCostingId: costing.id },
    update: { totalAllocatedHours: input.totalEstimatedHours, capEnforced: true, allowOverage: false, maxOveragePercent: 0.1, autoLockOnExceed: true },
    create: { jobCostingId: costing.id, totalAllocatedHours: input.totalEstimatedHours, capEnforced: true, allowOverage: false, maxOveragePercent: 0.1, autoLockOnExceed: true },
  });
  return costing;
}

async function upsertStaffing(input: {
  jobId: number; profile: ProfileLite; assignedByProfileId: number; allocatedHours: number;
}) {
  if (!input.profile.roleId) return;
  const rates = roleRates(input.profile);
  return prisma.jobStaffAssignment.upsert({
    where: { jobId_employeeProfileId: { jobId: input.jobId, employeeProfileId: input.profile.id } },
    update: {
      assignedRoleId: input.profile.roleId, assignedHourlyRate: rates.billingRate,
      roleSnapshot: { roleName: input.profile.role?.name ?? "Employee", billingRate: rates.billingRate, costRate: rates.costRate, allocatedHours: input.allocatedHours },
    },
    create: {
      jobId: input.jobId, employeeProfileId: input.profile.id,
      assignedRoleId: input.profile.roleId, assignedHourlyRate: rates.billingRate,
      roleSnapshot: { roleName: input.profile.role?.name ?? "Employee", billingRate: rates.billingRate, costRate: rates.costRate, allocatedHours: input.allocatedHours },
      assignedByProfileId: input.assignedByProfileId,
    },
  });
}

async function upsertTimeAlloc(jobCostingId: number, profile: ProfileLite, hours: number, task: string) {
  if (!profile.roleId) return;
  const rates = roleRates(profile);
  return prisma.jobTimeAllocation.upsert({
    where: { jobCostingId_employeeProfileId_roleId: { jobCostingId, employeeProfileId: profile.id, roleId: profile.roleId } },
    update: { allocatedHours: hours, hourlyRate: rates.billingRate, estimatedCost: money(hours * rates.costRate), billable: true, taskDescription: task },
    create: { jobCostingId, employeeProfileId: profile.id, roleId: profile.roleId, allocatedHours: hours, hourlyRate: rates.billingRate, estimatedCost: money(hours * rates.costRate), billable: true, taskDescription: task },
  });
}

async function upsertTimeEntry(input: {
  jobId: number; profile: ProfileLite; dateWorked: Date; hours: number;
  description: string; billable: boolean;
  nonBillableCategory?: "leave" | "internal" | "training" | "over_budget" | "other" | null;
  status: "pending" | "submitted" | "approved"; approvedByProfileId?: number | null;
}) {
  const existing = await prisma.timeEntry.findFirst({
    where: { jobId: input.jobId, employeeProfileId: input.profile.id, dateWorked: input.dateWorked, description: input.description },
    select: { id: true },
  });
  const rates = roleRates(input.profile);
  const billableAmount = input.billable ? money(input.hours * rates.billingRate) : 0;
  const costAmount = money(input.hours * rates.costRate);
  const data = {
    jobId: input.jobId, taskId: null, employeeProfileId: input.profile.id,
    dateWorked: input.dateWorked, hours: input.hours, description: input.description,
    billable: input.billable,
    nonBillableCategory: input.billable ? null : (input.nonBillableCategory ?? "other"),
    status: input.status,
    approvedByProfileId: input.status === "approved" ? (input.approvedByProfileId ?? null) : null,
    approvedAt: input.status === "approved" ? d("2026-05-01") : null,
    billableAmount, costAmount, profitLoss: money(billableAmount - costAmount),
  };
  if (existing) return prisma.timeEntry.update({ where: { id: existing.id }, data });
  return prisma.timeEntry.create({ data });
}

async function upsertInvoice(input: {
  jobId: number; clientId: number; invoiceNumber: string; title: string;
  subtotalAmount: number; taxAmount: number; amountPaid: number;
  status: "draft" | "issued" | "partially_paid" | "paid" | "overdue" | "void";
  dueDate: Date; generatedByProfileId: number; issuedByProfileId: number;
}) {
  const totalAmount = money(input.subtotalAmount + input.taxAmount);
  const base = {
    jobId: input.jobId, clientId: input.clientId, title: input.title,
    status: input.status, subtotalAmount: input.subtotalAmount,
    taxAmount: input.taxAmount, totalAmount, amountPaid: input.amountPaid,
    amountOutstanding: money(totalAmount - input.amountPaid),
    dueDate: input.dueDate, generatedByProfileId: input.generatedByProfileId,
    issuedByProfileId: input.issuedByProfileId,
    generatedAt: d("2026-03-01"), issuedAt: d("2026-03-05"),
    paidAt: input.status === "paid" ? d("2026-03-28") : null,
    notes: "Production invoice",
  };
  return prisma.jobInvoice.upsert({
    where: { invoiceNumber: input.invoiceNumber },
    update: base, create: { invoiceNumber: input.invoiceNumber, ...base },
  });
}

async function upsertPayment(input: {
  clientId: number; jobId: number; invoiceNumber: string; paymentAmount: number;
  paymentDate: Date; referenceNumber: string; recordedByProfileId: number;
}) {
  const existing = await prisma.clientPayment.findFirst({
    where: { referenceNumber: input.referenceNumber }, select: { id: true },
  });
  const data = {
    clientId: input.clientId, jobId: input.jobId, invoiceNumber: input.invoiceNumber,
    paymentAmount: input.paymentAmount, paymentDate: input.paymentDate,
    paymentMethod: "bank_transfer", referenceNumber: input.referenceNumber,
    notes: "Production collection receipt", recordedByProfileId: input.recordedByProfileId,
  };
  if (existing) return prisma.clientPayment.update({ where: { id: existing.id }, data });
  return prisma.clientPayment.create({ data });
}

async function applyPaymentToInvoice(invoiceId: number, paymentId: number, amount: number, profileId: number) {
  return prisma.jobInvoicePaymentApplication.upsert({
    where: { jobInvoiceId_clientPaymentId: { jobInvoiceId: invoiceId, clientPaymentId: paymentId } },
    update: { appliedAmount: amount, appliedByProfileId: profileId, notes: "Production allocation" },
    create: { jobInvoiceId: invoiceId, clientPaymentId: paymentId, appliedAmount: amount, appliedByProfileId: profileId, notes: "Production allocation" },
  });
}

async function seedRevenueAllocations(jobId: number, paymentId: number, month: Date) {
  const entries = await prisma.timeEntry.findMany({
    where: { jobId, billable: true, status: { in: ["submitted", "approved"] } },
    select: { employeeProfileId: true, billableAmount: true, profitLoss: true },
  });
  const totalJobBillable = entries.reduce((s, e) => s + Number(e.billableAmount || 0), 0);
  const payment = await prisma.clientPayment.findUnique({ where: { id: paymentId }, select: { paymentAmount: true } });
  const paymentAmount = Number(payment?.paymentAmount || 0);
  if (totalJobBillable <= 0 || paymentAmount <= 0) return;
  for (const entry of entries) {
    const eb = Number(entry.billableAmount || 0);
    const pct = eb / totalJobBillable;
    const ep = Math.max(0, Number(entry.profitLoss || 0));
    const el = Math.max(0, -Number(entry.profitLoss || 0));
    await prisma.revenueAllocation.upsert({
      where: { jobId_clientPaymentId_employeeProfileId: { jobId, clientPaymentId: paymentId, employeeProfileId: entry.employeeProfileId } },
      update: { employeeBillable: eb, employeeProfit: ep, employeeLoss: el, totalJobBillable, allocationPercentage: pct, allocatedAmount: money(paymentAmount * pct), allocationMonth: month, isFinalized: true },
      create: { jobId, clientPaymentId: paymentId, employeeProfileId: entry.employeeProfileId, employeeBillable: eb, employeeProfit: ep, employeeLoss: el, totalJobBillable, allocationPercentage: pct, allocatedAmount: money(paymentAmount * pct), allocationMonth: month, isFinalized: true },
    });
  }
}

// ─── main seed sections ───────────────────────────────────────────────────────

async function seedJobs(profiles: Map<string, ProfileLite>) {
  const partner  = requireProfile(profiles, "partner@ronalds.local");   // Janet - TAX
  const gmp      = requireProfile(profiles, "gmp@ronalds.local");
  const rachael  = profiles.get("rach.achola@gmail.com") ?? gmp;       // ADV partner (prod-only fallback)
  const taxMgr   = requireProfile(profiles, "tax.mgr@ronalds.local");   // James
  const mgr      = requireProfile(profiles, "manager@ronalds.local");   // Patrick - ADV
  const taxEmp1  = requireProfile(profiles, "tax.emp1@ronalds.local");  // Kevin
  const taxEmp2  = requireProfile(profiles, "tax.emp2@ronalds.local");  // Ruth
  const emp1     = requireProfile(profiles, "employee@ronalds.local");  // Chadwick
  const emp2     = profiles.get("chadwickmadas@gmail.com") ?? emp1;    // Chad (prod-only fallback)
  const finance  = requireProfile(profiles, "finance@ronalds.local");
  const marketing = requireProfile(profiles, "marketing@ronalds.local");

  // ── Clients ──────────────────────────────────────────────────────────────────
  const apex = await upsertClient({
    clientCode: "PROD-TAX-001", clientName: "Apex Manufacturing Ltd",
    industry: "Manufacturing", departmentId: partner.departmentId,
    partnerProfileId: partner.id, managerProfileId: taxMgr.id, contactPerson: "Mercy Njoroge",
  });
  const silverstone = await upsertClient({
    clientCode: "PROD-TAX-002", clientName: "Silverstone Hotels Ltd",
    industry: "Hospitality", departmentId: partner.departmentId,
    partnerProfileId: partner.id, managerProfileId: taxMgr.id, contactPerson: "Amina Hassan",
  });
  const safari = await upsertClient({
    clientCode: "PROD-ADV-001", clientName: "Safari Health Group",
    industry: "Healthcare", departmentId: mgr.departmentId,
    partnerProfileId: rachael.id, managerProfileId: mgr.id, contactPerson: "Daniel Otieno",
  });
  const bluePeak = await upsertClient({
    clientCode: "PROD-ADV-002", clientName: "BluePeak Energy Ltd",
    industry: "Energy", departmentId: mgr.departmentId,
    partnerProfileId: rachael.id, managerProfileId: mgr.id, contactPerson: "Joseph Mwangi",
  });
  const lakeside = await upsertClient({
    clientCode: "PROD-ADV-003", clientName: "Lakeside Fintech Ltd",
    industry: "Financial Services", departmentId: mgr.departmentId,
    partnerProfileId: rachael.id, managerProfileId: mgr.id, contactPerson: "Patricia Kamau",
  });

  // ── Proposals ────────────────────────────────────────────────────────────────
  await Promise.all([
    upsertProposal({ clientId: apex.id, title: "Apex FY2026 Tax Compliance", serviceType: "Tax Compliance", proposedFee: 1200000, proposalDate: d("2026-01-10"), status: "won", probability: 100, createdByProfileId: marketing.id, assignedPartnerProfileId: partner.id, wonAt: d("2026-01-18"), notes: "Won proposal → PROD-JOB-TAX-001" }),
    upsertProposal({ clientId: silverstone.id, title: "Silverstone Tax Returns FY2025", serviceType: "Tax Returns", proposedFee: 650000, proposalDate: d("2025-11-20"), status: "won", probability: 100, createdByProfileId: marketing.id, assignedPartnerProfileId: partner.id, wonAt: d("2025-12-05"), notes: "Won and completed" }),
    upsertProposal({ clientId: safari.id, title: "Safari Internal Controls Review", serviceType: "Advisory", proposedFee: 900000, proposalDate: d("2026-01-05"), status: "won", probability: 100, createdByProfileId: marketing.id, assignedPartnerProfileId: rachael.id, wonAt: d("2026-01-16"), notes: "Won advisory proposal" }),
    upsertProposal({ clientId: bluePeak.id, title: "BluePeak Market Entry Strategy", serviceType: "Strategic Advisory", proposedFee: 1500000, proposalDate: d("2026-02-01"), status: "lost", probability: 0, createdByProfileId: marketing.id, assignedPartnerProfileId: rachael.id, lostReason: "Client awarded to a competitor with lower fees" }),
    upsertProposal({ clientId: lakeside.id, title: "Lakeside Digital Transformation", serviceType: "Technology Advisory", proposedFee: 2000000, proposalDate: d("2026-03-10"), status: "sent", probability: 65, createdByProfileId: marketing.id, assignedPartnerProfileId: rachael.id, notes: "Follow-up scheduled for May 2026" }),
    upsertProposal({ clientId: apex.id, title: "Apex Transfer Pricing Study", serviceType: "Transfer Pricing", proposedFee: 800000, proposalDate: d("2026-04-05"), status: "sent", probability: 75, createdByProfileId: marketing.id, assignedPartnerProfileId: partner.id, notes: "Awaiting client approval" }),
  ]);

  // ── Jobs ─────────────────────────────────────────────────────────────────────
  const job1 = await upsertJob({
    jobCode: "PROD-JOB-TAX-001", jobName: "Apex Tax Compliance FY2026",
    description: "Full tax compliance engagement for Apex Manufacturing FY2026.",
    clientId: apex.id, departmentId: partner.departmentId,
    partnerProfileId: partner.id, managerProfileId: taxMgr.id, receivableOwnerProfileId: finance.id,
    status: "in_progress", collectionStage: "partial_collection",
    startDate: d("2026-02-01"), dueDate: d("2026-05-31"),
    billingType: "fixed_fee", fixedFeeAmount: 1200000, budgetHours: 240, priority: "high",
  });

  const job2 = await upsertJob({
    jobCode: "PROD-JOB-TAX-002", jobName: "Silverstone Tax Returns FY2025",
    description: "Annual tax return filing for Silverstone Hotels.",
    clientId: silverstone.id, departmentId: partner.departmentId,
    partnerProfileId: partner.id, managerProfileId: taxMgr.id, receivableOwnerProfileId: finance.id,
    status: "completed", collectionStage: "fully_collected",
    startDate: d("2026-01-05"), dueDate: d("2026-03-31"),
    completionDate: d("2026-03-28"),
    billingType: "fixed_fee", fixedFeeAmount: 650000, budgetHours: 120, priority: "medium",
  });

  const job3 = await upsertJob({
    jobCode: "PROD-JOB-ADV-001", jobName: "Safari Internal Controls Review",
    description: "Review and assessment of Safari Health Group's internal control framework.",
    clientId: safari.id, departmentId: mgr.departmentId,
    partnerProfileId: rachael.id, managerProfileId: mgr.id, receivableOwnerProfileId: finance.id,
    status: "in_progress", collectionStage: "ready_for_collection",
    startDate: d("2026-02-10"), dueDate: d("2026-06-30"),
    billingType: "fixed_fee", fixedFeeAmount: 900000, budgetHours: 200, priority: "high",
  });

  const job4 = await upsertJob({
    jobCode: "PROD-JOB-ADV-002", jobName: "BluePeak Market Entry Advisory",
    description: "Strategic advisory for BluePeak Energy's East African market entry.",
    clientId: bluePeak.id, departmentId: mgr.departmentId,
    partnerProfileId: rachael.id, managerProfileId: mgr.id, receivableOwnerProfileId: finance.id,
    status: "completed", collectionStage: "fully_collected",
    startDate: d("2025-11-01"), dueDate: d("2026-02-28"),
    completionDate: d("2026-02-26"),
    billingType: "fixed_fee", fixedFeeAmount: 1500000, budgetHours: 300, priority: "high",
  });

  const job5 = await upsertJob({
    jobCode: "PROD-JOB-ADV-003", jobName: "Lakeside Business Optimization",
    description: "Business process optimization for Lakeside Fintech Ltd.",
    clientId: lakeside.id, departmentId: mgr.departmentId,
    partnerProfileId: rachael.id, managerProfileId: mgr.id, receivableOwnerProfileId: finance.id,
    status: "planned", collectionStage: "not_ready",
    startDate: d("2026-06-01"), dueDate: d("2026-09-30"),
    billingType: "fixed_fee", fixedFeeAmount: 750000, budgetHours: 160, priority: "medium",
  });

  // ── Costings ─────────────────────────────────────────────────────────────────
  const cost1 = await upsertCosting({ jobId: job1.id, managerProfileId: taxMgr.id, partnerProfileId: partner.id, jobFee: 1200000, totalEstimatedHours: 240, totalEstimatedCost: money(30*5200 + 80*2800 + 60*3200) });
  const cost2 = await upsertCosting({ jobId: job2.id, managerProfileId: taxMgr.id, partnerProfileId: partner.id, jobFee: 650000,  totalEstimatedHours: 120, totalEstimatedCost: money(20*5200 + 40*2800 + 30*3200) });
  const cost3 = await upsertCosting({ jobId: job3.id, managerProfileId: mgr.id,    partnerProfileId: rachael.id, jobFee: 900000,  totalEstimatedHours: 200, totalEstimatedCost: money(25*5200 + 70*2200 + 50*3200) });
  const cost4 = await upsertCosting({ jobId: job4.id, managerProfileId: mgr.id,    partnerProfileId: rachael.id, jobFee: 1500000, totalEstimatedHours: 300, totalEstimatedCost: money(30*5200 + 80*2200 + 70*3200) });

  // ── Staffing ─────────────────────────────────────────────────────────────────
  await Promise.all([
    upsertStaffing({ jobId: job1.id, profile: taxMgr,  assignedByProfileId: partner.id, allocatedHours: 30 }),
    upsertStaffing({ jobId: job1.id, profile: taxEmp1, assignedByProfileId: taxMgr.id,  allocatedHours: 80 }),
    upsertStaffing({ jobId: job1.id, profile: taxEmp2, assignedByProfileId: taxMgr.id,  allocatedHours: 60 }),
    upsertStaffing({ jobId: job2.id, profile: taxMgr,  assignedByProfileId: partner.id, allocatedHours: 20 }),
    upsertStaffing({ jobId: job2.id, profile: taxEmp1, assignedByProfileId: taxMgr.id,  allocatedHours: 40 }),
    upsertStaffing({ jobId: job2.id, profile: taxEmp2, assignedByProfileId: taxMgr.id,  allocatedHours: 30 }),
    upsertStaffing({ jobId: job3.id, profile: mgr,     assignedByProfileId: rachael.id, allocatedHours: 25 }),
    upsertStaffing({ jobId: job3.id, profile: emp1,    assignedByProfileId: mgr.id,     allocatedHours: 70 }),
    upsertStaffing({ jobId: job3.id, profile: emp2,    assignedByProfileId: mgr.id,     allocatedHours: 50 }),
    upsertStaffing({ jobId: job4.id, profile: mgr,     assignedByProfileId: rachael.id, allocatedHours: 30 }),
    upsertStaffing({ jobId: job4.id, profile: emp1,    assignedByProfileId: mgr.id,     allocatedHours: 80 }),
    upsertStaffing({ jobId: job4.id, profile: emp2,    assignedByProfileId: mgr.id,     allocatedHours: 70 }),
  ]);

  // ── Time allocations ─────────────────────────────────────────────────────────
  await Promise.all([
    upsertTimeAlloc(cost1.id, taxMgr,  30, "Tax planning, review, and client engagement"),
    upsertTimeAlloc(cost1.id, taxEmp1, 80, "Tax schedules and computation"),
    upsertTimeAlloc(cost1.id, taxEmp2, 60, "Audit support and documentation"),
    upsertTimeAlloc(cost2.id, taxMgr,  20, "Return review and sign-off"),
    upsertTimeAlloc(cost2.id, taxEmp1, 40, "Tax return preparation"),
    upsertTimeAlloc(cost2.id, taxEmp2, 30, "Working papers and filing"),
    upsertTimeAlloc(cost3.id, mgr,     25, "Fieldwork management and client liaison"),
    upsertTimeAlloc(cost3.id, emp1,    70, "Control testing and interviews"),
    upsertTimeAlloc(cost3.id, emp2,    50, "Documentation and gap analysis"),
    upsertTimeAlloc(cost4.id, mgr,     30, "Strategy sessions and deliverables review"),
    upsertTimeAlloc(cost4.id, emp1,    80, "Market research and analysis"),
    upsertTimeAlloc(cost4.id, emp2,    70, "Report writing and presentations"),
  ]);

  return { job1, job2, job3, job4, job5, apex, silverstone, safari, bluePeak, lakeside,
           partner, rachael, taxMgr, mgr, taxEmp1, taxEmp2, emp1, emp2, finance };
}

async function seedTimeEntries(
  work: Awaited<ReturnType<typeof seedJobs>>,
  profiles: Map<string, ProfileLite>
) {
  const { job1, job2, job3, job4, taxMgr, taxEmp1, taxEmp2, mgr, emp1, emp2 } = work;
  const approverTax = work.partner;
  const approverAdv = work.rachael;

  type TE = Parameters<typeof upsertTimeEntry>[0];
  const entries: TE[] = [];

  // Helper to add entries over a date list
  const addEntries = (
    jobId: number, profile: ProfileLite, dates: string[],
    hours: number, desc: string, billable: boolean,
    approvedBy: number,
    nonBillableCategory?: "leave" | "internal" | "training" | null
  ) => {
    for (const date of dates) {
      entries.push({
        jobId, profile, dateWorked: d(date), hours, description: desc,
        billable, nonBillableCategory: billable ? null : (nonBillableCategory ?? "other"),
        status: "approved", approvedByProfileId: approvedBy,
      });
    }
  };

  // ── Job 1: Apex Tax Compliance (Feb–Apr) ────────────────────────────────────
  addEntries(job1.id, taxMgr,  ["2026-02-03","2026-02-17","2026-03-03","2026-03-17","2026-04-07","2026-04-21"], 5, "Tax planning and client review meetings", true, approverTax.id);
  addEntries(job1.id, taxEmp1, ["2026-02-04","2026-02-11","2026-02-18","2026-02-25","2026-03-04","2026-03-11","2026-03-18","2026-03-25","2026-04-01","2026-04-08","2026-04-15","2026-04-22"], 8, "Tax schedule preparation and computations", true, taxMgr.id);
  addEntries(job1.id, taxEmp2, ["2026-02-05","2026-02-12","2026-02-19","2026-02-26","2026-03-05","2026-03-12","2026-03-19","2026-03-26","2026-04-02","2026-04-09"], 6, "Audit support documentation and evidence", true, taxMgr.id);

  // ── Job 2: Silverstone Tax Returns (Jan–Mar, completed) ────────────────────
  addEntries(job2.id, taxMgr,  ["2026-01-15","2026-02-06","2026-03-10"], 6, "Return review and partner sign-off", true, approverTax.id);
  addEntries(job2.id, taxEmp1, ["2026-01-16","2026-01-23","2026-02-06","2026-02-13","2026-02-20","2026-03-06","2026-03-13"], 8, "Annual tax return preparation", true, taxMgr.id);
  addEntries(job2.id, taxEmp2, ["2026-01-19","2026-01-26","2026-02-09","2026-02-16","2026-03-09"], 6, "Working papers and filing pack", true, taxMgr.id);

  // ── Job 3: Safari Internal Controls (Feb–Apr) ────────────────────────────────
  addEntries(job3.id, mgr,   ["2026-02-11","2026-02-25","2026-03-11","2026-03-25","2026-04-08","2026-04-22"], 5, "Fieldwork management and client liaison", true, approverAdv.id);
  addEntries(job3.id, emp1,  ["2026-02-12","2026-02-19","2026-02-26","2026-03-05","2026-03-12","2026-03-19","2026-03-26","2026-04-02","2026-04-09","2026-04-16"], 8, "Control owner interviews and testing", true, mgr.id);
  addEntries(job3.id, emp2,  ["2026-02-13","2026-02-20","2026-02-27","2026-03-06","2026-03-13","2026-03-20","2026-03-27","2026-04-03"], 8, "Control documentation and gap analysis", true, mgr.id);

  // ── Job 4: BluePeak Market Entry (Nov–Feb, completed) ───────────────────────
  addEntries(job4.id, mgr,   ["2025-11-10","2025-11-24","2025-12-08","2025-12-22","2026-01-12","2026-01-26","2026-02-09","2026-02-23"], 4, "Strategy sessions and deliverables review", true, approverAdv.id);
  addEntries(job4.id, emp1,  ["2025-11-11","2025-11-18","2025-11-25","2025-12-02","2025-12-09","2025-12-16","2026-01-06","2026-01-13","2026-01-20","2026-01-27","2026-02-03","2026-02-10"], 8, "Market research and competitive analysis", true, mgr.id);
  addEntries(job4.id, emp2,  ["2025-11-12","2025-11-19","2025-11-26","2025-12-03","2025-12-10","2025-12-17","2026-01-07","2026-01-14","2026-01-21","2026-01-28","2026-02-04"], 8, "Advisory report writing and presentations", true, mgr.id);

  // ── Non-billable: internal meetings ─────────────────────────────────────────
  addEntries(job1.id, taxEmp1, ["2026-02-27"], 2, "Department internal meeting - non-billable", false, taxMgr.id, "internal");
  addEntries(job1.id, taxEmp2, ["2026-03-27"], 2, "Training session - tax updates", false, taxMgr.id, "training");
  addEntries(job3.id, emp1,    ["2026-03-27"], 2, "Internal firm strategy meeting", false, mgr.id, "internal");
  addEntries(job3.id, emp2,    ["2026-04-24"], 2, "Advisory practice training", false, mgr.id, "training");

  // ── Leave entry (Kevin, Feb 13 - leave-blocked day) ─────────────────────────
  addEntries(job1.id, taxEmp1, ["2026-02-13"], 8, "Annual leave - approved", false, taxMgr.id, "leave");

  // Process in batches
  for (const entry of entries) {
    await upsertTimeEntry(entry);
  }
}

async function seedInvoicesAndPayments(
  work: Awaited<ReturnType<typeof seedJobs>>,
) {
  const { job1, job2, job3, job4, apex, silverstone, safari, bluePeak, partner, rachael, taxMgr, mgr, finance } = work;

  // Job 2 (Silverstone - completed, fully collected)
  const inv2 = await upsertInvoice({
    jobId: job2.id, clientId: silverstone.id, invoiceNumber: "PROD-INV-002",
    title: "Silverstone Tax Returns FY2025 - Professional Fees",
    subtotalAmount: 650000, taxAmount: 0, amountPaid: 650000,
    status: "paid", dueDate: d("2026-04-30"),
    generatedByProfileId: finance.id, issuedByProfileId: taxMgr.id,
  });
  const pay2 = await upsertPayment({
    clientId: silverstone.id, jobId: job2.id, invoiceNumber: "PROD-INV-002",
    paymentAmount: 650000, paymentDate: d("2026-03-28"),
    referenceNumber: "PROD-PAY-002", recordedByProfileId: finance.id,
  });
  await applyPaymentToInvoice(inv2.id, pay2.id, 650000, finance.id);
  await seedRevenueAllocations(job2.id, pay2.id, d("2026-03-01"));

  // Job 4 (BluePeak - completed, fully collected)
  const inv4 = await upsertInvoice({
    jobId: job4.id, clientId: bluePeak.id, invoiceNumber: "PROD-INV-004",
    title: "BluePeak Market Entry Advisory - Professional Fees",
    subtotalAmount: 1500000, taxAmount: 0, amountPaid: 1500000,
    status: "paid", dueDate: d("2026-04-30"),
    generatedByProfileId: finance.id, issuedByProfileId: mgr.id,
  });
  const pay4 = await upsertPayment({
    clientId: bluePeak.id, jobId: job4.id, invoiceNumber: "PROD-INV-004",
    paymentAmount: 1500000, paymentDate: d("2026-03-15"),
    referenceNumber: "PROD-PAY-004", recordedByProfileId: finance.id,
  });
  await applyPaymentToInvoice(inv4.id, pay4.id, 1500000, finance.id);
  await seedRevenueAllocations(job4.id, pay4.id, d("2026-03-01"));

  // Job 1 (Apex - in_progress, partial collection)
  const inv1 = await upsertInvoice({
    jobId: job1.id, clientId: apex.id, invoiceNumber: "PROD-INV-001",
    title: "Apex Tax Compliance FY2026 - Milestone 1",
    subtotalAmount: 600000, taxAmount: 0, amountPaid: 600000,
    status: "paid", dueDate: d("2026-04-30"),
    generatedByProfileId: finance.id, issuedByProfileId: taxMgr.id,
  });
  const pay1 = await upsertPayment({
    clientId: apex.id, jobId: job1.id, invoiceNumber: "PROD-INV-001",
    paymentAmount: 600000, paymentDate: d("2026-04-10"),
    referenceNumber: "PROD-PAY-001", recordedByProfileId: finance.id,
  });
  await applyPaymentToInvoice(inv1.id, pay1.id, 600000, finance.id);
  await seedRevenueAllocations(job1.id, pay1.id, d("2026-04-01"));

  // Job 3 (Safari - in_progress, ready for collection - invoice issued)
  await upsertInvoice({
    jobId: job3.id, clientId: safari.id, invoiceNumber: "PROD-INV-003",
    title: "Safari Internal Controls Review - Professional Fees",
    subtotalAmount: 900000, taxAmount: 0, amountPaid: 0,
    status: "issued", dueDate: d("2026-06-30"),
    generatedByProfileId: finance.id, issuedByProfileId: mgr.id,
  });

  // Revenue projections
  const months = ["2026-02-01", "2026-03-01", "2026-04-01", "2026-05-01"];
  for (const month of months) {
    const existing = await prisma.revenueProjection.findFirst({
      where: { monthYear: d(month), clientId: null, departmentId: null }, select: { id: true },
    });
    const projData = {
      monthYear: d(month), projectedAmount: 750000, currency: "KES",
      actualCollected: month <= "2026-04-01" ? 750000 : 0,
      variance: month <= "2026-04-01" ? 0 : -750000,
      variancePercent: month <= "2026-04-01" ? 0 : -100,
      status: month <= "2026-04-01" ? ("actualized" as const) : ("projected" as const),
    };
    if (existing) await prisma.revenueProjection.update({ where: { id: existing.id }, data: projData });
    else await prisma.revenueProjection.create({ data: projData });
  }
}

async function seedLeave(profiles: Map<string, ProfileLite>) {
  const hr     = requireProfile(profiles, "hr@ronalds.local");
  const taxMgr = requireProfile(profiles, "tax.mgr@ronalds.local");
  const mgr    = requireProfile(profiles, "manager@ronalds.local");
  const taxEmp1 = requireProfile(profiles, "tax.emp1@ronalds.local"); // Kevin
  const emp1   = requireProfile(profiles, "employee@ronalds.local");  // Chadwick

  const leaveType = await prisma.leaveType.upsert({
    where: { code: "ANNUAL" },
    update: { name: "Annual Leave", isActive: true, isPaid: true, balanceTracked: true, allowsHalfDay: true, unitType: "day" },
    create: { code: "ANNUAL", name: "Annual Leave", description: "Paid annual leave", color: "#2563eb", isActive: true, isPaid: true, balanceTracked: true, allowsHalfDay: true, unitType: "day" },
  });

  let policy = await prisma.leavePolicy.findFirst({ where: { leaveTypeId: leaveType.id, name: "Annual Leave Policy" }, select: { id: true } });
  const policyData = {
    leaveTypeId: leaveType.id, name: "Annual Leave Policy",
    description: "Standard annual leave policy with manager approval.",
    isActive: true, annualEntitlement: 21, carryoverCap: 5,
    accrualEnabled: false, requiresManagerApproval: true, requiresHrApproval: false,
    excludeWeekends: true, excludePublicHolidays: true, hoursPerWorkday: 8,
    autoProjectToTimesheet: true, allowNegativeBalance: false,
  };
  policy = policy
    ? await prisma.leavePolicy.update({ where: { id: policy.id }, data: policyData })
    : await prisma.leavePolicy.create({ data: policyData });

  // ── Kevin leave balance ───────────────────────────────────────────────────────
  const kevinBalance = await prisma.leaveBalance.upsert({
    where: { employeeProfileId_leaveTypeId_leaveYear: { employeeProfileId: taxEmp1.id, leaveTypeId: leaveType.id, leaveYear: 2026 } },
    update: { openingBalance: 21, accruedUnits: 0, usedUnits: 1, pendingUnits: 0, availableUnits: 20, lastCalculatedAt: d("2026-03-01") },
    create: { employeeProfileId: taxEmp1.id, leaveTypeId: leaveType.id, leaveYear: 2026, openingBalance: 21, accruedUnits: 0, usedUnits: 1, pendingUnits: 0, availableUnits: 20, lastCalculatedAt: d("2026-03-01") },
  });

  // Kevin: approved leave Feb 13
  const existingKevin = await prisma.leaveRequest.findFirst({
    where: { employeeProfileId: taxEmp1.id, leaveTypeId: leaveType.id, startDate: d("2026-02-13"), endDate: d("2026-02-13") }, select: { id: true },
  });
  const kevinReqData = {
    employeeProfileId: taxEmp1.id, leaveTypeId: leaveType.id, policyId: policy.id,
    currentApproverProfileId: null,
    startDate: d("2026-02-13"), endDate: d("2026-02-13"),
    startDayPortion: "full_day" as const, endDayPortion: "full_day" as const,
    requestedUnits: 1, deductedUnits: 1, requestedHours: 8, deductedHours: 8,
    status: "approved" as const, reason: "Personal rest day",
    submittedAt: d("2026-02-10"), approvedAt: d("2026-02-11"),
  };
  const kevinReq = existingKevin
    ? await prisma.leaveRequest.update({ where: { id: existingKevin.id }, data: kevinReqData })
    : await prisma.leaveRequest.create({ data: kevinReqData });

  await prisma.leaveApprovalStep.upsert({
    where: { leaveRequestId_stepNumber: { leaveRequestId: kevinReq.id, stepNumber: 1 } },
    update: { stageType: "manager", approverProfileId: taxMgr.id, decision: "approved", notes: "Approved.", actedAt: d("2026-02-11") },
    create: { leaveRequestId: kevinReq.id, stepNumber: 1, stageType: "manager", approverProfileId: taxMgr.id, decision: "approved", notes: "Approved.", actedAt: d("2026-02-11") },
  });

  await prisma.leaveRequestSegment.deleteMany({ where: { leaveRequestId: kevinReq.id } });
  await prisma.leaveRequestSegment.create({ data: { leaveRequestId: kevinReq.id, leaveDate: d("2026-02-13"), startMinuteOfDay: null, endMinuteOfDay: null, hours: 8, syncStatus: "confirmed" } });

  const existingKevinLedger = await prisma.leaveLedgerEntry.findFirst({
    where: { employeeProfileId: taxEmp1.id, leaveTypeId: leaveType.id, leaveRequestId: kevinReq.id, transactionType: "deduction" }, select: { id: true },
  });
  const kevinLedgerData = { leaveBalanceId: kevinBalance.id, employeeProfileId: taxEmp1.id, leaveTypeId: leaveType.id, leaveRequestId: kevinReq.id, createdByProfileId: hr.id, leaveYear: 2026, transactionType: "deduction" as const, units: -1, note: "Approved leave deduction", effectiveDate: d("2026-02-13") };
  if (existingKevinLedger) await prisma.leaveLedgerEntry.update({ where: { id: existingKevinLedger.id }, data: kevinLedgerData });
  else await prisma.leaveLedgerEntry.create({ data: kevinLedgerData });

  // ── Chadwick (emp1): pending leave Mar 6 ─────────────────────────────────────
  await prisma.leaveBalance.upsert({
    where: { employeeProfileId_leaveTypeId_leaveYear: { employeeProfileId: emp1.id, leaveTypeId: leaveType.id, leaveYear: 2026 } },
    update: { openingBalance: 21, accruedUnits: 0, usedUnits: 0, pendingUnits: 1, availableUnits: 20, lastCalculatedAt: d("2026-03-01") },
    create: { employeeProfileId: emp1.id, leaveTypeId: leaveType.id, leaveYear: 2026, openingBalance: 21, accruedUnits: 0, usedUnits: 0, pendingUnits: 1, availableUnits: 20, lastCalculatedAt: d("2026-03-01") },
  });

  const existingChadwick = await prisma.leaveRequest.findFirst({
    where: { employeeProfileId: emp1.id, leaveTypeId: leaveType.id, startDate: d("2026-05-15"), endDate: d("2026-05-15") }, select: { id: true },
  });
  const chadwickReqData = {
    employeeProfileId: emp1.id, leaveTypeId: leaveType.id, policyId: policy.id,
    currentApproverProfileId: mgr.id,
    startDate: d("2026-05-15"), endDate: d("2026-05-15"),
    startDayPortion: "full_day" as const, endDayPortion: "full_day" as const,
    requestedUnits: 1, deductedUnits: 0, requestedHours: 8, deductedHours: 0,
    status: "pending_manager_approval" as const, reason: "Personal appointment",
    submittedAt: d("2026-05-01"),
  };
  if (existingChadwick) await prisma.leaveRequest.update({ where: { id: existingChadwick.id }, data: chadwickReqData });
  else await prisma.leaveRequest.create({ data: chadwickReqData });
}

async function seedEvaluations(profiles: Map<string, ProfileLite>) {
  const hr      = requireProfile(profiles, "hr@ronalds.local");
  const taxMgr  = requireProfile(profiles, "tax.mgr@ronalds.local");
  const mgr     = requireProfile(profiles, "manager@ronalds.local");
  const taxEmp1 = requireProfile(profiles, "tax.emp1@ronalds.local");
  const taxEmp2 = requireProfile(profiles, "tax.emp2@ronalds.local");
  const emp1    = requireProfile(profiles, "employee@ronalds.local");
  const emp2    = profiles.get("chadwickmadas@gmail.com") ?? emp1;  // prod-only fallback

  // ── Evaluation cycle ─────────────────────────────────────────────────────────
  let cycle = await prisma.evaluationCycle.findFirst({
    where: { cycleName: "FY2026 Annual Review" }, select: { id: true, status: true },
  });
  if (!cycle) {
    cycle = await prisma.evaluationCycle.create({
      data: {
        cycleName: "FY2026 Annual Review", cycleType: "annual", status: "active",
        startDate: d("2026-01-01"), endDate: d("2026-12-31"),
        createdByProfileId: hr.id, description: "Annual performance review cycle",
      },
      select: { id: true, status: true },
    });
  }

  // ── Evaluation definition ─────────────────────────────────────────────────────
  let definition = await prisma.evaluationDefinition.findFirst({
    where: { cycleId: cycle.id, name: "Annual Performance Review 2026" }, select: { id: true },
  });
  if (!definition) {
    definition = await prisma.evaluationDefinition.create({
      data: {
        cycleId: cycle.id, name: "Annual Performance Review 2026",
        description: "Comprehensive annual evaluation for all professional staff",
        status: "published", enableSelfEvaluation: true, enablePeerEvaluation: false,
        enableUpwardEvaluation: false, enableDownwardEvaluation: true, enableClientEvaluation: false,
        dueDate: d("2026-06-30"), createdByProfileId: hr.id,
      },
      select: { id: true },
    });
  }

  // ── Assignments for each employee ─────────────────────────────────────────────
  const employeeSetups = [
    { email: "tax.emp1@ronalds.local", evaluatorProfile: taxMgr, score: 80 },
    { email: "tax.emp2@ronalds.local", evaluatorProfile: taxMgr, score: 84 },
    { email: "employee@ronalds.local", evaluatorProfile: mgr,    score: 78 },
    { email: "chadwickmadas@gmail.com", evaluatorProfile: mgr,   score: 86 },
  ];

  for (const setup of employeeSetups) {
    const employee = profiles.get(setup.email) ?? (setup.email === "chadwickmadas@gmail.com" ? emp2 : null);
    if (!employee) continue;
    const score = setup.score;
    const evaluatorProfile = setup.evaluatorProfile;

    // Manager evaluation
    await prisma.evaluationAssignment.upsert({
      where: {
        evaluationDefinitionId_evaluatorProfileId_evaluateeProfileId_evaluatorType: {
          evaluationDefinitionId: definition.id, evaluatorProfileId: evaluatorProfile.id,
          evaluateeProfileId: employee.id, evaluatorType: "manager",
        },
      },
      update: {
        cycleId: cycle.id, dueDate: d("2026-06-30"), status: "submitted",
        score, submittedAt: d("2026-06-20"),
      },
      create: {
        evaluationDefinitionId: definition.id, cycleId: cycle.id,
        evaluatorProfileId: evaluatorProfile.id, evaluateeProfileId: employee.id,
        dueDate: d("2026-06-30"), evaluatorType: "manager",
        status: "submitted", score, submittedAt: d("2026-06-20"),
      },
    });

    // Self evaluation
    await prisma.evaluationAssignment.upsert({
      where: {
        evaluationDefinitionId_evaluatorProfileId_evaluateeProfileId_evaluatorType: {
          evaluationDefinitionId: definition.id, evaluatorProfileId: employee.id,
          evaluateeProfileId: employee.id, evaluatorType: "self",
        },
      },
      update: { cycleId: cycle.id, dueDate: d("2026-06-18"), status: "submitted", score: Math.min(100, score + 3), submittedAt: d("2026-06-18") },
      create: { evaluationDefinitionId: definition.id, cycleId: cycle.id, evaluatorProfileId: employee.id, evaluateeProfileId: employee.id, dueDate: d("2026-06-18"), evaluatorType: "self", status: "submitted", score: Math.min(100, score + 3), submittedAt: d("2026-06-18") },
    });

    const utilScore = score >= 82 ? 84 : 72;
    const totalScore = Math.round(score * 0.35 + utilScore * 0.25 + 80 * 0.2 + 85 * 0.2);
    await prisma.performanceScore.upsert({
      where: { employeeProfileId_evaluationCycleId_period: { employeeProfileId: employee.id, evaluationCycleId: cycle.id, period: d("2026-06-30") } },
      update: { revenueScore: 80, profitScore: 78, utilizationScore: utilScore, jobCompletionScore: 82, evaluationScore: score, totalScore, grade: totalScore >= 85 ? "A" : totalScore >= 75 ? "B" : "C", calculatedAt: d("2026-06-30"), scoreBreakdown: { source: "Production seed" }, notes: "Seeded from production data." },
      create: { employeeProfileId: employee.id, evaluationCycleId: cycle.id, period: d("2026-06-30"), revenueScore: 80, profitScore: 78, utilizationScore: utilScore, jobCompletionScore: 82, evaluationScore: score, totalScore, grade: totalScore >= 85 ? "A" : totalScore >= 75 ? "B" : "C", calculatedAt: d("2026-06-30"), scoreBreakdown: { source: "Production seed" }, notes: "Seeded from production data." },
    });

    await bridgeEvaluationScoreToBsc(employee.id, cycle.id, score);
  }

  // Manager aggregate scores
  for (const [mgrProfile, mScore] of [[taxMgr, 83], [mgr, 82]] as [ProfileLite, number][]) {
    await prisma.performanceScore.upsert({
      where: { employeeProfileId_evaluationCycleId_period: { employeeProfileId: mgrProfile.id, evaluationCycleId: cycle.id, period: d("2026-06-30") } },
      update: { evaluationScore: mScore, utilizationScore: 78, jobCompletionScore: 82, totalScore: mScore, grade: "B", scoreBreakdown: { aggregation: "Manager aggregate score" }, notes: "Seeded aggregate." },
      create: { employeeProfileId: mgrProfile.id, evaluationCycleId: cycle.id, period: d("2026-06-30"), evaluationScore: mScore, utilizationScore: 78, jobCompletionScore: 82, totalScore: mScore, grade: "B", scoreBreakdown: { aggregation: "Manager aggregate score" }, notes: "Seeded aggregate." },
    });
  }

  return { cycle, definition };
}

async function ensureActiveBscVersion() {
  const activeVersionId = await resolveActiveBalancedScorecardVersionId();
  if (activeVersionId) return activeVersionId;

  const cycleName = "FY 2026 Balanced Scorecard";
  let cycle = await prisma.balancedScorecardCycle.findFirst({ where: { name: cycleName }, orderBy: [{ id: "desc" }], select: { id: true } });
  if (!cycle) {
    cycle = await createBalancedScorecardCycle({ name: cycleName, cadence: "monthly", startDate: "2026-01-01", endDate: "2026-12-31", createdByProfileId: null });
  }
  const latestVersion =
    (await prisma.balancedScorecardVersion.findFirst({ where: { cycleId: cycle.id }, orderBy: [{ versionNumber: "desc" }, { id: "desc" }], select: { id: true, status: true } })) ??
    (await createBalancedScorecardVersion({ cycleId: cycle.id, label: "Production baseline", createdByProfileId: null }));
  if (latestVersion.status !== "published") await publishBalancedScorecardVersion(latestVersion.id);
  return latestVersion.id;
}

async function seedBscKpis() {
  await ensureBalancedScorecardSeed();
  await ensureActiveBscVersion();
}

// ─── main ─────────────────────────────────────────────────────────────────────
async function main() {
  assertProductionSeed();
  console.log("✓ Production seed started");

  const [positionRoleMap, departmentMap] = await Promise.all([ensurePositionRoles(), ensureDepartments()]);
  console.log("✓ Position roles and departments ready");

  await createNewUsers(positionRoleMap, departmentMap);
  console.log("✓ New users created");

  const allEmails = [...PROD_EMAILS, ...NEW_USERS.map((u) => u.email)] as string[];
  let profiles = await loadProfiles(allEmails);

  await bypassOnboarding(profiles);
  console.log("✓ Onboarding bypassed for existing users");

  // Re-load after onboarding updates, then wire structure
  profiles = await loadProfiles(allEmails);
  await wireDepartmentStructure(profiles, positionRoleMap, departmentMap);
  console.log("✓ Department structure and reporting lines wired");

  // Re-load to pick up role/department changes
  profiles = await loadProfiles(allEmails);

  const work = await seedJobs(profiles);
  console.log("✓ Clients, proposals, jobs, costings, and staffing seeded");

  await seedTimeEntries(work, profiles);
  console.log("✓ Time entries seeded (3 months)");

  await seedInvoicesAndPayments(work);
  console.log("✓ Invoices, payments, and revenue allocations seeded");

  await seedLeave(profiles);
  console.log("✓ Leave requests seeded");

  // Re-load again after potential department/role updates
  profiles = await loadProfiles(allEmails);
  await seedEvaluations(profiles);
  console.log("✓ Evaluations and performance scores seeded");

  await seedBscKpis();
  console.log("✓ BSC framework ready");

  const counts = {
    clients:      await prisma.client.count({ where: { clientCode: { startsWith: "PROD-" } } }),
    proposals:    await prisma.proposal.count({ where: { client: { clientCode: { startsWith: "PROD-" } } } }),
    jobs:         await prisma.job.count({ where: { jobCode: { startsWith: "PROD-JOB-" } } }),
    timeEntries:  await prisma.timeEntry.count({ where: { job: { jobCode: { startsWith: "PROD-JOB-" } } } }),
    invoices:     await prisma.jobInvoice.count({ where: { invoiceNumber: { startsWith: "PROD-INV-" } } }),
    payments:     await prisma.clientPayment.count({ where: { referenceNumber: { startsWith: "PROD-PAY-" } } }),
    leaveReqs:    await prisma.leaveRequest.count(),
    evalCycles:   await prisma.evaluationCycle.count(),
    perfScores:   await prisma.performanceScore.count(),
  };

  console.log("\n═══════════════════════════════════════════");
  console.log("  Production seed complete");
  console.log("═══════════════════════════════════════════");
  console.table(counts);
  console.log("\nNew users (password: Test@1234):");
  for (const u of NEW_USERS) {
    console.log(`  ${u.email}  →  ${u.firstName} ${u.lastName} (${u.positionTitle})`);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
