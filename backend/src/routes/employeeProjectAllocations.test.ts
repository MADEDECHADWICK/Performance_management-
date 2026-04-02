import express from 'express';
import request from 'supertest';
import prisma from '../prisma';
import employeeProjectAllocationsRoutes from './employeeProjectAllocations';

jest.mock('../prisma', () => {
  const prismaMock = {
    jobTimeAllocation: {
      findMany: jest.fn(),
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
};

const mockedPrisma = prisma as unknown as PrismaMock;

const createApp = () => {
  const app = express();
  app.use('/employee-project-allocations', employeeProjectAllocationsRoutes);
  return app;
};

describe('employee project allocations route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns costing rows for requested employeeIds', async () => {
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

    const response = await request(app).get('/employee-project-allocations?employeeIds=11');

    expect(response.status).toBe(200);
    expect(mockedPrisma.jobTimeAllocation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { employeeProfileId: { in: [11] } },
      })
    );

    expect(response.body).toEqual([
      expect.objectContaining({
        jobId: 201,
        employeeProfileId: 11,
        allocationBasis: 'costing',
        estimated: false,
        allocationAmount: 2000,
      }),
    ]);
  });

  it('returns an empty array when there are no recorded allocations', async () => {
    const app = createApp();

    mockedPrisma.jobTimeAllocation.findMany.mockResolvedValue([]);

    const response = await request(app).get('/employee-project-allocations?employeeIds=15,19');

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });
});
