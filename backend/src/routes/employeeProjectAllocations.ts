// This file defines the API routes for fetching employee project allocations. It includes a GET endpoint that allows clients to retrieve allocation data for specified employee IDs, along with related job and client information. The route handler queries the database using Prisma to fetch the relevant allocation records, processes the data to calculate allocation amounts and other derived fields, and returns the results in a structured JSON format. By organizing this functionality in a dedicated route file, we can maintain a clear separation of concerns and facilitate the management of employee project allocation data within the application.

import { Router } from 'express';
import prisma from '../prisma';

const router = Router();

const toNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

// GET /employee-project-allocations?employeeIds=1,2&fields=allocationAmount
router.get('/', async (req, res) => {
  try {
    const rawEmployeeIds =
      req.query.employeeIds ??
      req.query.employeeId;
    
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

    return res.json(rows);
  } catch (err: any) {
    console.error('Error fetching employee project allocations:', err);
    return res.status(500).json({ error: 'Failed to fetch allocations' });
  }
});

export default router;
