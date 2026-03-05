import express from 'express';
import request from 'supertest';
import { Prisma } from '@prisma/client';
import prisma from '../prisma';
import teamManagementRoutes from './teamManagement';

let testProfileId = 1;
let testUserId = 1;

jest.mock('../middleware/auth', () => ({
  authMiddleware: (req: any, _res: any, next: any) => {
    req.user = {
      userId: testUserId,
      email: 'manager.training@ronalds.local',
      profileId: testProfileId,
      authRoles: ['manager'],
    };
    req.userRoles = ['manager'];
    req.profile = {
      id: testProfileId,
      role: { name: 'manager' },
    };
    next();
  },
}));

const createApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/manager', teamManagementRoutes);
  return app;
};

describe('teamManagement training records integration', () => {
  const createdTrainingIds: number[] = [];
  let dbReachable = false;

  beforeAll(async () => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      dbReachable = true;

      const managerProfile = await prisma.profile.findFirst({
        where: { status: 'active', userId: { not: null } },
        select: { id: true, userId: true },
        orderBy: { id: 'asc' },
      });
      if (!managerProfile || !managerProfile.userId) {
        throw new Error('No active profile with linked user found for integration test');
      }
      testProfileId = managerProfile.id;
      testUserId = managerProfile.userId;
    } catch {
      dbReachable = false;
    }
  }, 30000);

  afterAll(async () => {
    if (!createdTrainingIds.length) return;
    try {
      await prisma.$executeRaw(Prisma.sql`
        DELETE FROM "training_records"
        WHERE id IN (${Prisma.join(createdTrainingIds)})
      `);
    } catch {
      // Keep cleanup non-blocking.
    }
  });

  it('creates and lists persisted training records', async () => {
    if (!dbReachable) {
      console.warn('Skipping training integration: database not reachable.');
      return;
    }

    const app = createApp();
    const suffix = Date.now();

    const createResponse = await request(app).post('/api/manager/training-records').send({
      courseName: `Integration Training ${suffix}`,
      trainingType: 'workshop',
      deliveryMode: 'online',
      startDate: '2026-03-10T09:00:00.000Z',
      endDate: '2026-03-11T17:00:00.000Z',
      provider: 'Ronalds Academy',
      cost: 25000,
      notes: 'Integration test training record',
    });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body?.id).toBeTruthy();
    const trainingId = Number(createResponse.body.id);
    createdTrainingIds.push(trainingId);

    const listResponse = await request(app).get('/api/manager/training-records');
    expect(listResponse.status).toBe(200);
    expect(Array.isArray(listResponse.body)).toBe(true);
    expect(listResponse.body.some((record: any) => Number(record.id) === trainingId)).toBe(true);
  }, 45000);
});

