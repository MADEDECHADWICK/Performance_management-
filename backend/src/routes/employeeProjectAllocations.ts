import { Router } from 'express';
import prisma from '../prisma';

const router = Router();

const toNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

// GET /employee_project_allocations?employeeIds=1,2&fields=allocationAmount
router.get('/', async (req, res) => {
  try {
    const rawEmployeeIds =
      req.query.employeeIds ??
      req.query.employeeId ??
      req.query.employee_id ??
      req.query.employee_ids;
    
    let ids: number[] = [];
    if (rawEmployeeIds) {
      ids = String(rawEmployeeIds)
        .split(',')
        .map((id) => parseInt(id.trim(), 10))
        .filter((id) => Number.isFinite(id) && id > 0);
    }

    const allocations = await prisma.jobTimeAllocation.findMany({
      where: ids.length > 0 ? { employeeProfileId: { in: ids } } : undefined,
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        jobCosting: {
          select: {
            jobId: true,
            job: {
              select: {
                id: true,
                jobCode: true,
                jobName: true,
                client: {
                  select: {
                    clientName: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const rows = allocations.map((allocation) => {
      const allocatedHours = toNumber(allocation.allocatedHours);
      const hourlyRate = toNumber(allocation.hourlyRate);
      const estimatedCost = toNumber(allocation.estimatedCost);
      const allocationAmount = estimatedCost > 0 ? estimatedCost : allocatedHours * hourlyRate;
      const job = allocation.jobCosting?.job;

      return {
        id: allocation.id,
        employeeProfileId: allocation.employeeProfileId,
        employeeName: `${allocation.employee.firstName} ${allocation.employee.lastName}`.trim(),
        jobId: allocation.jobCosting.jobId,
        jobCode: job?.jobCode ?? null,
        jobName: job?.jobName ?? null,
        clientName: job?.client?.clientName ?? null,
        allocatedHours,
        billableHours: allocation.billable ? allocatedHours : 0,
        nonBillableHours: allocation.billable ? 0 : allocatedHours,
        hourlyRate,
        allocationAmount,
        allocatedAmount: allocationAmount,
        billable: allocation.billable,
        allocationBasis: 'costing',
        estimated: false,
        taskDescription: allocation.taskDescription ?? null,
        allocationMonth: allocation.createdAt.toISOString(),
      };
    });

    const existingPairs = new Set(
      rows.map((row) => `${row.jobId}:${row.employeeProfileId}`)
    );

    const staffAssignments = await prisma.jobStaffAssignment.findMany({
      where: ids.length > 0 ? { employeeProfileId: { in: ids } } : undefined,
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        job: {
          select: {
            id: true,
            jobCode: true,
            jobName: true,
            budgetHours: true,
            client: {
              select: {
                clientName: true,
              },
            },
          },
        },
      },
      orderBy: { assignedAt: 'desc' },
    });

    const fallbackAssignments = staffAssignments.filter(
      (assignment) => !existingPairs.has(`${assignment.jobId}:${assignment.employeeProfileId}`)
    );

    const uniqueFallbackJobIds = Array.from(
      new Set(fallbackAssignments.map((assignment) => assignment.jobId))
    );
    const uniqueFallbackEmployeeIds = Array.from(
      new Set(fallbackAssignments.map((assignment) => assignment.employeeProfileId))
    );

    const billableByPair = new Map<
      string,
      { hours: number; amount: number }
    >();
    if (uniqueFallbackJobIds.length > 0 && uniqueFallbackEmployeeIds.length > 0) {
      const billableRollup = await prisma.timeEntry.groupBy({
        by: ['jobId', 'employeeProfileId'],
        where: {
          jobId: { in: uniqueFallbackJobIds },
          employeeProfileId: { in: uniqueFallbackEmployeeIds },
          billable: true,
          status: { not: 'rejected' as any },
        },
        _sum: {
          hours: true,
          billableAmount: true,
        },
      });

      billableRollup.forEach((entry) => {
        const key = `${entry.jobId}:${entry.employeeProfileId}`;
        billableByPair.set(key, {
          hours: toNumber(entry._sum.hours),
          amount: toNumber(entry._sum.billableAmount),
        });
      });
    }

    const fallbackAssignmentCountsByJob = fallbackAssignments.reduce((acc, assignment) => {
      acc[assignment.jobId] = (acc[assignment.jobId] || 0) + 1;
      return acc;
    }, {} as Record<number, number>);

    const fallbackRows = fallbackAssignments.map((assignment) => {
      const key = `${assignment.jobId}:${assignment.employeeProfileId}`;
      const billableSummary = billableByPair.get(key);
      const billableHoursFromEntries = toNumber(billableSummary?.hours);
      const billableAmountFromEntries = toNumber(billableSummary?.amount);
      const hourlyRate = toNumber(assignment.assignedHourlyRate);
      const jobBudgetHours = toNumber(assignment.job?.budgetHours);
      const staffCount = Math.max(1, fallbackAssignmentCountsByJob[assignment.jobId] || 1);
      const budgetShareHours = jobBudgetHours > 0 ? jobBudgetHours / staffCount : 0;
      const effectiveHours =
        billableHoursFromEntries > 0 ? billableHoursFromEntries : budgetShareHours;
      const fallbackAmount =
        billableAmountFromEntries > 0
          ? billableAmountFromEntries
          : effectiveHours * hourlyRate;
      const estimated = billableHoursFromEntries <= 0;

      return {
        id: assignment.id,
        employeeProfileId: assignment.employeeProfileId,
        employeeName: `${assignment.employee.firstName} ${assignment.employee.lastName}`.trim(),
        jobId: assignment.jobId,
        jobCode: assignment.job?.jobCode ?? null,
        jobName: assignment.job?.jobName ?? null,
        clientName: assignment.job?.client?.clientName ?? null,
        allocatedHours: effectiveHours,
        billableHours: effectiveHours,
        nonBillableHours: 0,
        hourlyRate,
        allocationAmount: fallbackAmount,
        allocatedAmount: fallbackAmount,
        billable: true,
        allocationBasis: estimated ? 'staff_assignment_budget_share' : 'time_entries',
        estimated,
        taskDescription: assignment.roleOnJob ?? null,
        allocationMonth: assignment.assignedAt.toISOString(),
      };
    });

    return res.json([...rows, ...fallbackRows]);
  } catch (err: any) {
    console.error('Error fetching employee project allocations:', err);
    return res.status(500).json({ error: 'Failed to fetch allocations' });
  }
});

export default router;
