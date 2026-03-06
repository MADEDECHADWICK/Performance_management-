import express from 'express';
import request from 'supertest';
import prisma from '../prisma';
import employeeProjectAllocationsRoutes from './employeeProjectAllocations';

jest.mock('../prisma', () => {
  const prismaMock = {
    jobTimeAllocation: {
      findMany: jest.fn(),
    },
    jobStaffAssignment: {
      findMany: jest.fn(),
    },
    timeEntry: {
      groupBy: jest.fn(),
    },
  };

  return {
    __esModule: true,
    default: prismaMock,
    prisma: prismaMock,
  };
});

type PrismaMock = {
  jobTimeAllocation: {
    findMany: jest.Mock;
  };
  jobStaffAssignment: {
    findMany: jest.Mock;
  };
  timeEntry: {
    groupBy: jest.Mock;
  };
};

const mockedPrisma = prisma as unknown as PrismaMock;

const createApp = () => {
  const app = express();
  app.use('/employee_project_allocations', employeeProjectAllocationsRoutes);
  return app;
};

describe('employee project allocations route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('supports legacy employee_id query alias and returns costing + fallback rows', async () => {
    const app = createApp();

    mockedPrisma.jobTimeAllocation.findMany.mockResolvedValue([
      {
        id: 1,
        employeeProfileId: 11,
        allocatedHours: 20,
        hourlyRate: 100,
        estimatedCost: 2000,
        billable: true,
        taskDescription: 'Core work',
        createdAt: new Date('2026-02-01T00:00:00.000Z'),
        jobCosting: {
          jobId: 201,
          job: {
            id: 201,
            jobCode: 'JOB-201',
            jobName: 'Tax filing',
            client: { clientName: 'Acme Corp' },
          },
        },
        employee: {
          id: 11,
          firstName: 'Jane',
          lastName: 'Doe',
        },
      },
    ]);

    mockedPrisma.jobStaffAssignment.findMany.mockResolvedValue([
      {
        id: 10,
        jobId: 201,
        employeeProfileId: 11,
        assignedHourlyRate: 100,
        roleOnJob: 'Reviewer',
        assignedAt: new Date('2026-02-02T00:00:00.000Z'),
        employee: { id: 11, firstName: 'Jane', lastName: 'Doe' },
        job: {
          id: 201,
          jobCode: 'JOB-201',
          jobName: 'Tax filing',
          budgetHours: 120,
          client: { clientName: 'Acme Corp' },
        },
      },
      {
        id: 11,
        jobId: 202,
        employeeProfileId: 11,
        assignedHourlyRate: 80,
        roleOnJob: 'Analyst',
        assignedAt: new Date('2026-02-03T00:00:00.000Z'),
        employee: { id: 11, firstName: 'Jane', lastName: 'Doe' },
        job: {
          id: 202,
          jobCode: 'JOB-202',
          jobName: 'Audit support',
          budgetHours: 60,
          client: { clientName: 'Beta Ltd' },
        },
      },
    ]);

    mockedPrisma.timeEntry.groupBy.mockResolvedValue([
      {
        jobId: 202,
        employeeProfileId: 11,
        _sum: {
          hours: 5,
          billableAmount: 400,
        },
      },
    ]);

    const response = await request(app).get('/employee_project_allocations?employee_id=11');

    expect(response.status).toBe(200);
    expect(mockedPrisma.jobTimeAllocation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { employeeProfileId: { in: [11] } },
      })
    );
    expect(mockedPrisma.jobStaffAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { employeeProfileId: { in: [11] } },
      })
    );

    expect(response.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          jobId: 201,
          employeeProfileId: 11,
          allocationBasis: 'costing',
          estimated: false,
          allocationAmount: 2000,
        }),
        expect.objectContaining({
          jobId: 202,
          employeeProfileId: 11,
          allocationBasis: 'time_entries',
          estimated: false,
          allocationAmount: 400,
          billableHours: 5,
        }),
      ])
    );
  });

  it('uses budget-share estimate for non-costed assignments with no billable entries', async () => {
    const app = createApp();

    mockedPrisma.jobTimeAllocation.findMany.mockResolvedValue([]);
    mockedPrisma.jobStaffAssignment.findMany.mockResolvedValue([
      {
        id: 21,
        jobId: 305,
        employeeProfileId: 15,
        assignedHourlyRate: 120,
        roleOnJob: 'Lead',
        assignedAt: new Date('2026-03-01T00:00:00.000Z'),
        employee: { id: 15, firstName: 'Alex', lastName: 'Kim' },
        job: {
          id: 305,
          jobCode: 'JOB-305',
          jobName: 'Due diligence',
          budgetHours: 100,
          client: { clientName: 'Gamma PLC' },
        },
      },
      {
        id: 22,
        jobId: 305,
        employeeProfileId: 19,
        assignedHourlyRate: 120,
        roleOnJob: 'Support',
        assignedAt: new Date('2026-03-01T00:00:00.000Z'),
        employee: { id: 19, firstName: 'Sam', lastName: 'Lee' },
        job: {
          id: 305,
          jobCode: 'JOB-305',
          jobName: 'Due diligence',
          budgetHours: 100,
          client: { clientName: 'Gamma PLC' },
        },
      },
    ]);
    mockedPrisma.timeEntry.groupBy.mockResolvedValue([]);

    const response = await request(app).get('/employee_project_allocations?employeeIds=15,19');

    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          jobId: 305,
          employeeProfileId: 15,
          estimated: true,
          allocationBasis: 'staff_assignment_budget_share',
          billableHours: 50,
          allocationAmount: 6000,
        }),
        expect.objectContaining({
          jobId: 305,
          employeeProfileId: 19,
          estimated: true,
          allocationBasis: 'staff_assignment_budget_share',
          billableHours: 50,
          allocationAmount: 6000,
        }),
      ])
    );
  });
});

