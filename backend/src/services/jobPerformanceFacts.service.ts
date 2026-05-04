import { Prisma } from '@prisma/client';
import prisma from '../prisma';

const activeTimeStatuses = ['pending', 'submitted', 'approved'] as const;
const approvedTimeStatus = 'approved' as const;
const billableInvoiceStatuses = ['issued', 'partially_paid', 'paid', 'overdue'] as const;

const toNumber = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const roundMoney = (value: number) =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const roundHours = (value: number) =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const margin = (profit: number, revenue: number) =>
  revenue > 0 ? Number(((profit / revenue) * 100).toFixed(2)) : 0;

export type JobPerformanceFactsFilter = {
  jobIds?: number[];
  clientId?: number;
  departmentId?: number;
  partnerProfileId?: number;
  managerProfileId?: number;
  employeeProfileId?: number;
  dateFrom?: Date;
  dateTo?: Date;
};

export type JobPerformanceFactsScope =
  | { type: 'firm' }
  | { type: 'partner'; profileId: number }
  | { type: 'manager'; profileId: number }
  | { type: 'employee'; profileId: number };

export type EmployeeJobPerformanceFact = {
  jobId: number;
  employeeProfileId: number;
  employeeName: string;
  totalHours: number;
  billableHours: number;
  nonBillableHours: number;
  billableValue: number;
  actualCost: number;
  collectedRevenue: number;
  cashProfit: number;
  utilizationPercent: number;
};

export type JobPerformanceFact = {
  jobId: number;
  jobCode: string | null;
  jobName: string;
  clientId: number | null;
  clientName: string | null;
  departmentId: number | null;
  partnerProfileId: number | null;
  managerProfileId: number | null;
  employeeProfileId: number | null;
  period: {
    dateFrom: string | null;
    dateTo: string | null;
  };
  status: string;
  billingType: string;
  currency: string;
  budgetHours: number;
  totalHours: number;
  timeEntryCount: number;
  approvedHours: number;
  billableHours: number;
  nonBillableHours: number;
  billableValue: number;
  billedRevenue: number;
  collectedRevenue: number;
  laborCost: number;
  approvedRequisitionCost: number;
  recoverableRequisitionCost: number;
  actualCost: number;
  workInProgressProfit: number;
  billedProfit: number;
  cashProfit: number;
  profitLoss: number;
  workInProgressMarginPercent: number;
  billedMarginPercent: number;
  marginPercent: number;
  budgetUsedPercent: number;
  outstandingRevenue: number;
  employees: EmployeeJobPerformanceFact[];
};

const buildDateFilter = (field: string, dateFrom?: Date, dateTo?: Date) => {
  if (!dateFrom && !dateTo) return {};
  return {
    [field]: {
      ...(dateFrom ? { gte: dateFrom } : {}),
      ...(dateTo ? { lte: dateTo } : {}),
    },
  };
};

const buildScopeWhere = (scope?: JobPerformanceFactsScope): Prisma.JobWhereInput => {
  if (!scope || scope.type === 'firm') return {};
  if (scope.type === 'partner') return { partnerProfileId: scope.profileId };
  if (scope.type === 'manager') return { managerProfileId: scope.profileId };
  return {
    OR: [
      { staffing: { some: { employeeProfileId: scope.profileId } } },
      { timeEntries: { some: { employeeProfileId: scope.profileId } } },
    ],
  };
};

const resolveBudgetHours = (job: {
  budgetHours: unknown;
  jobCosting?: {
    totalEstimatedHours?: unknown;
    budgetCap?: { totalAllocatedHours?: unknown } | null;
  } | null;
}) => {
  const capHours = toNumber(job.jobCosting?.budgetCap?.totalAllocatedHours);
  if (capHours > 0) return capHours;
  const estimatedHours = toNumber(job.jobCosting?.totalEstimatedHours);
  if (estimatedHours > 0) return estimatedHours;
  return toNumber(job.budgetHours);
};

export class JobPerformanceFactsService {
  static async listFacts(
    filter: JobPerformanceFactsFilter = {},
    scope: JobPerformanceFactsScope = { type: 'firm' }
  ): Promise<JobPerformanceFact[]> {
    const where: Prisma.JobWhereInput = {
      ...buildScopeWhere(scope),
      ...(filter.jobIds?.length ? { id: { in: filter.jobIds } } : {}),
      ...(filter.clientId ? { clientId: filter.clientId } : {}),
      ...(filter.departmentId ? { departmentId: filter.departmentId } : {}),
      ...(filter.partnerProfileId ? { partnerProfileId: filter.partnerProfileId } : {}),
      ...(filter.managerProfileId ? { managerProfileId: filter.managerProfileId } : {}),
      ...(filter.employeeProfileId
        ? {
            OR: [
              { staffing: { some: { employeeProfileId: filter.employeeProfileId } } },
              { timeEntries: { some: { employeeProfileId: filter.employeeProfileId } } },
            ],
          }
        : {}),
    };

    const timeEntryWhere: Prisma.TimeEntryWhereInput = {
      status: { in: [...activeTimeStatuses] },
      ...buildDateFilter('dateWorked', filter.dateFrom, filter.dateTo),
      ...(filter.employeeProfileId ? { employeeProfileId: filter.employeeProfileId } : {}),
    };
    const approvedTimeEntryWhere: Prisma.TimeEntryWhereInput = {
      status: approvedTimeStatus,
      ...buildDateFilter('dateWorked', filter.dateFrom, filter.dateTo),
      ...(filter.employeeProfileId ? { employeeProfileId: filter.employeeProfileId } : {}),
    };
    const paymentWhere: Prisma.ClientPaymentWhereInput = {
      ...buildDateFilter('paymentDate', filter.dateFrom, filter.dateTo),
    };
    const invoiceWhere: Prisma.JobInvoiceWhereInput = {
      status: { in: [...billableInvoiceStatuses] },
      ...buildDateFilter('issuedAt', filter.dateFrom, filter.dateTo),
    };

    const jobs = await prisma.job.findMany({
      where,
      include: {
        client: { select: { id: true, clientName: true } },
        jobCosting: {
          select: {
            totalEstimatedHours: true,
            budgetCap: { select: { totalAllocatedHours: true } },
          },
        },
        timeEntries: {
          where: timeEntryWhere,
          select: {
            employeeProfileId: true,
            hours: true,
            billable: true,
            billableAmount: true,
            costAmount: true,
            status: true,
            employee: { select: { firstName: true, lastName: true } },
          },
        },
        invoices: {
          where: invoiceWhere,
          select: { totalAmount: true, amountOutstanding: true },
        },
        payments: {
          where: paymentWhere,
          select: { paymentAmount: true },
        },
        requisitionRequests: {
          where: { status: 'approved' },
          select: { amount: true, isClientRecoverable: true },
        },
      },
      orderBy: { jobName: 'asc' },
    });

    return jobs.map((job) => {
      const approvedEntries = job.timeEntries.filter((entry) => entry.status === approvedTimeStatus);
      const activeEntries = job.timeEntries;
      const employeeMap = new Map<number, EmployeeJobPerformanceFact>();

      const totalHours = roundHours(
        activeEntries.reduce((sum, entry) => sum + toNumber(entry.hours), 0)
      );
      const approvedHours = roundHours(
        approvedEntries.reduce((sum, entry) => sum + toNumber(entry.hours), 0)
      );
      const billableHours = roundHours(
        approvedEntries
          .filter((entry) => entry.billable)
          .reduce((sum, entry) => sum + toNumber(entry.hours), 0)
      );
      const nonBillableHours = roundHours(Math.max(0, approvedHours - billableHours));
      const billableValue = roundMoney(
        approvedEntries.reduce((sum, entry) => sum + toNumber(entry.billableAmount), 0)
      );
      const laborCost = roundMoney(
        approvedEntries.reduce((sum, entry) => sum + toNumber(entry.costAmount), 0)
      );
      const approvedRequisitionCost = roundMoney(
        job.requisitionRequests.reduce((sum, item) => sum + toNumber(item.amount), 0)
      );
      const recoverableRequisitionCost = roundMoney(
        job.requisitionRequests
          .filter((item) => item.isClientRecoverable)
          .reduce((sum, item) => sum + toNumber(item.amount), 0)
      );
      const actualCost = roundMoney(laborCost + approvedRequisitionCost);
      const billedRevenue = roundMoney(
        job.invoices.reduce((sum, invoice) => sum + toNumber(invoice.totalAmount), 0)
      );
      const collectedRevenue = roundMoney(
        job.payments.reduce((sum, payment) => sum + toNumber(payment.paymentAmount), 0)
      );
      const workInProgressProfit = roundMoney(billableValue - actualCost);
      const billedProfit = roundMoney(billedRevenue - actualCost);
      const cashProfit = roundMoney(collectedRevenue - actualCost);
      const budgetHours = roundHours(resolveBudgetHours(job));
      const budgetUsedPercent = budgetHours > 0 ? Number(((totalHours / budgetHours) * 100).toFixed(2)) : 0;
      const outstandingRevenue = roundMoney(
        job.invoices.reduce((sum, invoice) => sum + toNumber(invoice.amountOutstanding), 0)
      );

      approvedEntries.forEach((entry) => {
        const employeeProfileId = entry.employeeProfileId;
        const current =
          employeeMap.get(employeeProfileId) || {
            jobId: job.id,
            employeeProfileId,
            employeeName: `${entry.employee?.firstName || ''} ${entry.employee?.lastName || ''}`.trim(),
            totalHours: 0,
            billableHours: 0,
            nonBillableHours: 0,
            billableValue: 0,
            actualCost: 0,
            collectedRevenue: 0,
            cashProfit: 0,
            utilizationPercent: 0,
          };

        const hours = toNumber(entry.hours);
        current.totalHours = roundHours(current.totalHours + hours);
        if (entry.billable) {
          current.billableHours = roundHours(current.billableHours + hours);
          current.billableValue = roundMoney(current.billableValue + toNumber(entry.billableAmount));
        } else {
          current.nonBillableHours = roundHours(current.nonBillableHours + hours);
        }
        current.actualCost = roundMoney(current.actualCost + toNumber(entry.costAmount));
        employeeMap.set(employeeProfileId, current);
      });

      const employeeBillableTotal = Array.from(employeeMap.values()).reduce(
        (sum, employee) => sum + employee.billableValue,
        0
      );
      employeeMap.forEach((employee) => {
        const allocationRatio =
          employeeBillableTotal > 0 ? employee.billableValue / employeeBillableTotal : 0;
        employee.collectedRevenue = roundMoney(collectedRevenue * allocationRatio);
        employee.cashProfit = roundMoney(employee.collectedRevenue - employee.actualCost);
        employee.utilizationPercent =
          employee.totalHours > 0
            ? Number(((employee.billableHours / employee.totalHours) * 100).toFixed(2))
            : 0;
      });

      return {
        jobId: job.id,
        jobCode: job.jobCode,
        jobName: job.jobName,
        clientId: job.clientId,
        clientName: job.client?.clientName ?? null,
        departmentId: job.departmentId,
        partnerProfileId: job.partnerProfileId,
        managerProfileId: job.managerProfileId,
        employeeProfileId: filter.employeeProfileId ?? null,
        period: {
          dateFrom: filter.dateFrom?.toISOString() ?? null,
          dateTo: filter.dateTo?.toISOString() ?? null,
        },
        status: job.status,
        billingType: job.billingType,
        currency: job.currency,
        budgetHours,
        totalHours,
        timeEntryCount: activeEntries.length,
        approvedHours,
        billableHours,
        nonBillableHours,
        billableValue,
        billedRevenue,
        collectedRevenue,
        laborCost,
        approvedRequisitionCost,
        recoverableRequisitionCost,
        actualCost,
        workInProgressProfit,
        billedProfit,
        cashProfit,
        profitLoss: cashProfit,
        workInProgressMarginPercent: margin(workInProgressProfit, billableValue),
        billedMarginPercent: margin(billedProfit, billedRevenue),
        marginPercent: margin(cashProfit, collectedRevenue),
        budgetUsedPercent,
        outstandingRevenue,
        employees: Array.from(employeeMap.values()),
      };
    });
  }

  static async getJobFact(jobId: number, scope: JobPerformanceFactsScope = { type: 'firm' }) {
    const [fact] = await JobPerformanceFactsService.listFacts({ jobIds: [jobId] }, scope);
    if (!fact) {
      throw { statusCode: 404, message: 'Job not found' };
    }
    return fact;
  }
}

export default JobPerformanceFactsService;
