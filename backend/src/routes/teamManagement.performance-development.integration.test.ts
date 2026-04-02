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
      email: 'manager.integration@ronalds.local',
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
  app.use('/api/team-management', teamManagementRoutes);
  return app;
};

describe('teamManagement performance integration', () => {
  let dbReachable = false;
  let assignmentRoleId: number | null = null;
  let createdRoleId: number | null = null;

  const createdProfileIds: number[] = [];
  const createdJobIds: number[] = [];
  const createdJobAssignmentIds: number[] = [];
  const createdTimeEntryIds: number[] = [];
  const createdPerformanceScoreIds: number[] = [];
  const createdEvaluationDefinitionIds: number[] = [];
  const createdEvaluationAssignmentIds: number[] = [];
  const createdSkillAssessmentIds: number[] = [];

  beforeAll(async () => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      dbReachable = true;

      const managerProfile = await prisma.profile.findFirst({
        where: { status: 'active', userId: { not: null } },
        select: { id: true, userId: true },
        orderBy: { id: 'asc' },
      });
      if (!managerProfile?.userId) {
        throw new Error('No active profile with linked user found for integration test');
      }
      testProfileId = managerProfile.id;
      testUserId = managerProfile.userId;

      const existingRole = await prisma.positionRole.findFirst({
        select: { id: true },
        orderBy: { id: 'asc' },
      });

      if (existingRole) {
        assignmentRoleId = existingRole.id;
      } else {
        const createdRole = await prisma.positionRole.create({
          data: {
            name: `Integration Role ${Date.now()}`,
            description: 'Temporary role for integration tests',
            billingRate: new Prisma.Decimal(1200),
            costRate: new Prisma.Decimal(900),
          },
          select: { id: true },
        });
        assignmentRoleId = createdRole.id;
        createdRoleId = createdRole.id;
      }
    } catch {
      dbReachable = false;
    }
  }, 60000);

  afterAll(async () => {
    if (!dbReachable) return;

    try {
      if (createdEvaluationAssignmentIds.length > 0) {
        await prisma.evaluationAssignment.deleteMany({
          where: { id: { in: createdEvaluationAssignmentIds } },
        });
      }

      if (createdEvaluationDefinitionIds.length > 0) {
        await prisma.evaluationDefinition.deleteMany({
          where: { id: { in: createdEvaluationDefinitionIds } },
        });
      }

      if (createdPerformanceScoreIds.length > 0) {
        await prisma.performanceScore.deleteMany({
          where: { id: { in: createdPerformanceScoreIds } },
        });
      }

      if (createdTimeEntryIds.length > 0) {
        await prisma.timeEntry.deleteMany({
          where: { id: { in: createdTimeEntryIds } },
        });
      }

      if (createdSkillAssessmentIds.length > 0) {
        await prisma.skillAssessment.deleteMany({
          where: { id: { in: createdSkillAssessmentIds } },
        });
      }

      if (createdJobAssignmentIds.length > 0) {
        await prisma.jobStaffAssignment.deleteMany({
          where: { id: { in: createdJobAssignmentIds } },
        });
      }

      if (createdJobIds.length > 0) {
        await prisma.job.deleteMany({
          where: { id: { in: createdJobIds } },
        });
      }

      if (createdProfileIds.length > 0) {
        await prisma.profile.deleteMany({
          where: { id: { in: createdProfileIds } },
        });
      }

      if (createdRoleId) {
        await prisma.positionRole.deleteMany({ where: { id: createdRoleId } });
      }
    } catch {
      // Keep cleanup non-blocking.
    }
  }, 60000);

  it('persists development data and returns DB-backed team performance metrics', async () => {
    if (!dbReachable) {
      console.warn('Skipping teamManagement integration: database not reachable.');
      return;
    }
    if (!assignmentRoleId) {
      console.warn('Skipping teamManagement integration: no assignment role available.');
      return;
    }

    const app = createApp();
    const suffix = Date.now();

    const member = await prisma.profile.create({
      data: {
        firstName: `Integration${suffix}`,
        lastName: 'Member',
        status: 'active',
        managerId: testProfileId,
        positionTitle: 'Associate',
      },
      select: { id: true },
    });
    createdProfileIds.push(member.id);

    const job = await prisma.job.create({
      data: {
        jobName: `Integration Job ${suffix}`,
        managerProfileId: testProfileId,
        status: 'in_progress',
        budgetHours: new Prisma.Decimal(120),
        billingType: 'hourly',
      },
      select: { id: true },
    });
    createdJobIds.push(job.id);

    const assignment = await prisma.jobStaffAssignment.create({
      data: {
        jobId: job.id,
        employeeProfileId: member.id,
        assignedRoleId: assignmentRoleId,
        assignedHourlyRate: new Prisma.Decimal(1000),
      },
      select: { id: true },
    });
    createdJobAssignmentIds.push(assignment.id);

    const timeEntry = await prisma.timeEntry.create({
      data: {
        jobId: job.id,
        employeeProfileId: member.id,
        dateWorked: new Date(),
        hours: new Prisma.Decimal(8),
        billable: true,
        status: 'approved',
        description: 'Integration test time entry',
        billableAmount: new Prisma.Decimal(8000),
        costAmount: new Prisma.Decimal(4000),
        profitLoss: new Prisma.Decimal(4000),
      },
      select: { id: true },
    });
    createdTimeEntryIds.push(timeEntry.id);

    const score = await prisma.performanceScore.create({
      data: {
        employeeProfileId: member.id,
        period: new Date(),
        financialWeighted: new Prisma.Decimal(86),
        nonFinancialWeighted: new Prisma.Decimal(84),
        totalScore: new Prisma.Decimal(85),
      },
      select: { id: true },
    });
    createdPerformanceScoreIds.push(score.id);

    const definition = await prisma.evaluationDefinition.create({
      data: {
        name: `Integration Evaluation ${suffix}`,
        status: 'published',
        createdByProfileId: testProfileId,
      },
      select: { id: true },
    });
    createdEvaluationDefinitionIds.push(definition.id);

    const pendingEval = await prisma.evaluationAssignment.create({
      data: {
        evaluationDefinitionId: definition.id,
        evaluatorProfileId: testProfileId,
        evaluateeProfileId: member.id,
        evaluatorType: 'manager',
        status: 'pending',
        evidenceUrls: [],
      },
      select: { id: true },
    });
    createdEvaluationAssignmentIds.push(pendingEval.id);

    const completedEval = await prisma.evaluationAssignment.create({
      data: {
        evaluationDefinitionId: definition.id,
        evaluatorProfileId: testProfileId,
        evaluateeProfileId: member.id,
        evaluatorType: 'peer',
        status: 'submitted',
        evidenceUrls: [],
      },
      select: { id: true },
    });
    createdEvaluationAssignmentIds.push(completedEval.id);

    const createSkillResponse = await request(app)
      .post('/api/team-management/skill-assessments')
      .send({
        employeeId: member.id,
        skillCategory: 'Audit',
        skillName: 'IFRS Review',
        currentLevel: 2,
        targetLevel: 4,
        notes: 'Needs more exposure to complex group structures.',
      });

    expect(createSkillResponse.status).toBe(201);
    expect(createSkillResponse.body?.id).toBeTruthy();
    const skillAssessmentId = Number(createSkillResponse.body.id);
    createdSkillAssessmentIds.push(skillAssessmentId);

    const skillListResponse = await request(app)
      .get(`/api/team-management/skill-assessments?employee=${member.id}`);
    expect(skillListResponse.status).toBe(200);
    expect(Array.isArray(skillListResponse.body)).toBe(true);
    expect(
      skillListResponse.body.some((row: any) => Number(row.id) === skillAssessmentId)
    ).toBe(true);

    const metricsResponse = await request(app).get('/api/team-management/development-metrics');
    expect(metricsResponse.status).toBe(200);
    expect(Number(metricsResponse.body?.avg_skill_level || 0)).toBeGreaterThan(0);

    const performanceResponse = await request(app).get('/api/team-management/team-performance');
    expect(performanceResponse.status).toBe(200);
    expect(Array.isArray(performanceResponse.body?.team_members)).toBe(true);

    const memberRow = performanceResponse.body.team_members.find(
      (row: any) => Number(row.employee_id) === member.id
    );

    expect(memberRow).toBeTruthy();
    expect(Number(memberRow.billable_hours || 0)).toBeGreaterThanOrEqual(8);
    expect(Number(memberRow.performance_score || 0)).toBeGreaterThan(0);
    expect(Number(memberRow.active_projects || 0)).toBeGreaterThanOrEqual(1);

    expect(Number(performanceResponse.body?.metrics?.team_size || 0)).toBeGreaterThanOrEqual(1);
    expect(Number(performanceResponse.body?.metrics?.total_billable_hours || 0)).toBeGreaterThanOrEqual(8);
    expect(Number(performanceResponse.body?.metrics?.completed_evaluations || 0)).toBeGreaterThanOrEqual(1);
    expect(Number(performanceResponse.body?.metrics?.pending_evaluations || 0)).toBeGreaterThanOrEqual(1);
  }, 90000);
});
