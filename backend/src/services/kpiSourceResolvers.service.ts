import prisma from "../prisma";

export type PeriodRange = { start: Date; end: Date };

export type TrainingData = { completed: number; total: number };
export type TimesheetData = {
  billableHours: number;
  totalHours: number;
  billableAmount: number;
  nonBillableAmount: number;
};
export type JobData = {
  completedJobs: number;
  plannedJobs: number;
  billableAmount: number;
  nonBillableAmount: number;
};
export type EvaluationData = { score: number | null };
export type FinanceData = { invoiced: number; collected: number };
export type MarketingData = { leads: number; converted: number };

export async function resolveTrainingData(
  profileId: number,
  period: PeriodRange
): Promise<TrainingData> {
  const [completed, total] = await Promise.all([
    prisma.trainingRecord.count({
      where: {
        employeeProfileId: profileId,
        status: "completed",
        endDate: { gte: period.start, lte: period.end },
      },
    }),
    prisma.trainingRecord.count({
      where: {
        employeeProfileId: profileId,
        status: { not: "cancelled" },
        startDate: { lte: period.end },
      },
    }),
  ]);
  return { completed, total };
}

export async function resolveTimesheetData(
  profileId: number,
  period: PeriodRange
): Promise<TimesheetData> {
  const entries = await prisma.timeEntry.findMany({
    where: {
      employeeProfileId: profileId,
      dateWorked: { gte: period.start, lte: period.end },
      status: { in: ["approved", "submitted"] },
    },
    select: { hours: true, billable: true, billableAmount: true, costAmount: true },
  });

  const billableEntries = entries.filter((e) => e.billable);
  return {
    billableHours: billableEntries.reduce((s, e) => s + Number(e.hours), 0),
    totalHours: entries.reduce((s, e) => s + Number(e.hours), 0),
    billableAmount: billableEntries.reduce((s, e) => s + Number(e.billableAmount ?? 0), 0),
    nonBillableAmount: entries
      .filter((e) => !e.billable)
      .reduce((s, e) => s + Number(e.costAmount ?? 0), 0),
  };
}

export async function resolveJobData(
  profileId: number,
  period: PeriodRange
): Promise<JobData> {
  const assignments = await prisma.jobStaffAssignment.findMany({
    where: {
      employeeProfileId: profileId,
      job: {
        OR: [
          { startDate: { gte: period.start, lte: period.end } },
          { completionDate: { gte: period.start, lte: period.end } },
        ],
      },
    },
    select: {
      job: {
        select: {
          status: true,
          completionDate: true,
          jobCosting: { select: { jobFee: true, allocatedCost: true } },
        },
      },
    },
  });

  const jobs = assignments.map((a) => a.job);
  return {
    completedJobs: jobs.filter(
      (j) =>
        j.status === "completed" &&
        j.completionDate != null &&
        j.completionDate >= period.start &&
        j.completionDate <= period.end
    ).length,
    plannedJobs: jobs.length,
    billableAmount: jobs.reduce((s, j) => s + Number(j.jobCosting?.jobFee ?? 0), 0),
    nonBillableAmount: jobs.reduce((s, j) => s + Number(j.jobCosting?.allocatedCost ?? 0), 0),
  };
}

export async function resolveEvaluationData(
  profileId: number,
  period: PeriodRange
): Promise<EvaluationData> {
  const result = await prisma.evaluationAssignment.findFirst({
    where: {
      evaluateeProfileId: profileId,
      status: "submitted",
      score: { not: null },
      submittedAt: { gte: period.start, lte: period.end },
    },
    orderBy: { submittedAt: "desc" },
    select: { score: true },
  });
  return { score: result?.score != null ? Number(result.score) : null };
}

export async function resolveFinanceData(
  profileId: number,
  period: PeriodRange
): Promise<FinanceData> {
  // Scoped to jobs the employee was actually assigned to (not whole department)
  const assignments = await prisma.jobStaffAssignment.findMany({
    where: {
      employeeProfileId: profileId,
      job: {
        OR: [
          { startDate: { gte: period.start, lte: period.end } },
          { completionDate: { gte: period.start, lte: period.end } },
        ],
      },
    },
    select: {
      job: {
        select: {
          invoices: {
            where: {
              issuedAt: { gte: period.start, lte: period.end },
              status: { not: "void" },
            },
            select: { totalAmount: true, amountPaid: true },
          },
        },
      },
    },
  });

  const allInvoices = assignments.flatMap((a) => a.job.invoices);
  return {
    invoiced: allInvoices.reduce((s, inv) => s + Number(inv.totalAmount), 0),
    collected: allInvoices.reduce((s, inv) => s + Number(inv.amountPaid), 0),
  };
}

// Department-level finance (for org/partner scorecard aggregation)
export async function resolveFinanceDataForDept(
  departmentId: number,
  period: PeriodRange
): Promise<FinanceData> {
  const jobs = await prisma.job.findMany({
    where: {
      departmentId,
      OR: [
        { startDate: { gte: period.start, lte: period.end } },
        { completionDate: { gte: period.start, lte: period.end } },
      ],
    },
    select: {
      invoices: {
        where: {
          issuedAt: { gte: period.start, lte: period.end },
          status: { not: "void" },
        },
        select: { totalAmount: true, amountPaid: true },
      },
    },
  });

  const allInvoices = jobs.flatMap((j) => j.invoices);
  return {
    invoiced: allInvoices.reduce((s, inv) => s + Number(inv.totalAmount), 0),
    collected: allInvoices.reduce((s, inv) => s + Number(inv.amountPaid), 0),
  };
}

export async function resolveMarketingData(
  profileId: number,
  period: PeriodRange
): Promise<MarketingData> {
  const proposals = await prisma.proposal.findMany({
    where: {
      createdByProfileId: profileId,
      createdAt: { gte: period.start, lte: period.end },
    },
    select: { status: true },
  });
  return {
    leads: proposals.length,
    converted: proposals.filter((p) => p.status === "won").length,
  };
}
