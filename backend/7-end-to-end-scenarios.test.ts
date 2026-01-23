import prisma from './src/prisma';
import jobService from './src/services/jobs.service';
import { TimeEntryService } from './src/services/time-entry.service';
import { seedDatabase } from './prisma/seed';

describe('End-to-end workflow smoke test', () => {
  let seed: Awaited<ReturnType<typeof seedDatabase>>;

  beforeAll(async () => {
    seed = await seedDatabase();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('creates a job from an approved engagement letter and updates onboarding', async () => {
    const hrUser = seed.users.find((user) => user.email === 'hr@ronalds.local');
    const hrProfile = seed.profiles.find((profile) => profile.userId === hrUser?.id);
    const managerProfile = seed.profiles.find((profile) => profile.userId !== hrUser?.id && profile.positionTitle === 'Manager');

    if (!hrUser || !hrProfile || !managerProfile) {
      throw new Error('Missing seed users for job creation');
    }

    const job = await jobService.createJob(
      {
        jobName: 'Greenwells Audit FY2025',
        description: 'Seeded audit engagement',
        clientId: seed.client.id,
        engagementLetterId: seed.engagementLetter.id,
        partnerProfileId: seed.client.partnerProfileId || undefined,
        managerProfileId: managerProfile.id,
        billingType: 'fixed_fee',
        fixedFeeAmount: 500000,
        startDate: new Date('2026-02-01'),
        dueDate: new Date('2026-03-31'),
      },
      {
        userId: hrUser.id,
        profileId: hrProfile.id,
        roles: ['hr'],
      }
    );

    expect(job.id).toBeDefined();

    const onboarding = await prisma.clientOnboarding.findFirst({
      where: { engagementLetterId: seed.engagementLetter.id },
    });

    expect(onboarding?.jobId).toBe(job.id);
    expect(onboarding?.status).toBe('job_created');
  });

  it('assigns staff, allocates hours, and allows time logging', async () => {
    const managerUser = seed.users.find((user) => user.email === 'manager@ronalds.local');
    const managerProfile = seed.profiles.find((profile) => profile.userId === managerUser?.id);
    const employeeUser = seed.users.find((user) => user.email === 'employee@ronalds.local');
    const employeeProfile = seed.profiles.find((profile) => profile.userId === employeeUser?.id);

    if (!managerUser || !managerProfile || !employeeUser || !employeeProfile) {
      throw new Error('Missing seed users for assignment');
    }

    const job = await prisma.job.findFirst({
      where: { jobName: 'Greenwells Audit FY2025' },
      orderBy: { createdAt: 'desc' },
    });

    if (!job) {
      throw new Error('Seed job not found');
    }

    await jobService.assignJobTeam(
      job.id,
      {
        employeeProfileId: employeeProfile.id,
        assignedRoleId: employeeProfile.roleId || 0,
        assignedHourlyRate: 2000,
      },
      {
        userId: managerUser.id,
        profileId: managerProfile.id,
        roles: ['manager'],
      }
    );

    const costing = await jobService.upsertJobCosting(
      job.id,
      {
        jobFee: 500000,
        allocations: [
          {
            employeeProfileId: employeeProfile.id,
            roleId: employeeProfile.roleId || 0,
            allocatedHours: 10,
            hourlyRate: 2000,
            billable: true,
            taskDescription: 'Audit fieldwork',
          },
        ],
        notes: 'Seed allocation',
        capEnforced: true,
        allowOverage: false,
        maxOveragePercent: 0.2,
      },
      {
        userId: managerUser.id,
        profileId: managerProfile.id,
        roles: ['manager'],
      }
    );

    expect(costing?.allocations?.length).toBeGreaterThan(0);

    const timeEntry = await TimeEntryService.createTimeEntry(
      {
        jobId: job.id,
        dateWorked: new Date('2026-02-05'),
        hours: 2,
        description: 'Seed time entry',
        billable: true,
      },
      {
        userId: employeeUser.id,
        profileId: employeeProfile.id,
        roleName: 'employee',
      }
    );

    expect(timeEntry.jobId).toBe(job.id);
  });

  it('creates an approval request when extra time is needed', async () => {
    const employeeUser = seed.users.find((user) => user.email === 'employee@ronalds.local');
    const employeeProfile = seed.profiles.find((profile) => profile.userId === employeeUser?.id);
    const job = await prisma.job.findFirst({
      where: { jobName: 'Greenwells Audit FY2025' },
      orderBy: { createdAt: 'desc' },
    });

    if (!employeeUser || !employeeProfile || !job) {
      throw new Error('Missing data for approval request');
    }

    const request = await TimeEntryService.createApprovalRequest(
      {
        jobId: job.id,
        additionalHours: 4,
        justification: 'Need extra time for final review',
        requestType: 'additional_hours',
      },
      {
        userId: employeeUser.id,
        profileId: employeeProfile.id,
        roleName: 'employee',
      }
    );

    expect(request.jobId).toBe(job.id);
    expect(request.status).toBe('pending');
  });
});
