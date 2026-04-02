import prisma from './src/prisma';
import jobService from './src/services/jobs.service';
import { TimeEntryService } from './src/services/time-entry.service';
import { seedDatabase } from './prisma/seed';
import { InductionChecklistService } from './src/services/inductionChecklist.service';
import { EmployeeOffboardingCaseService } from './src/services/employeeOffboardingCase.service';
import app from './src/app';
import jwt from 'jsonwebtoken';
import request from 'supertest';

describe('End-to-end workflow smoke test', () => {
  let seed: Awaited<ReturnType<typeof seedDatabase>>;
  let jobName: string;
  let engagementLetterId: number;

  beforeAll(async () => {
    seed = await seedDatabase();

    const hrUser = seed.users.find((user) => user.email === 'hr@ronalds.local');
    const hrProfile = seed.profiles.find((profile) => profile.userId === hrUser?.id);
    const marketingUser = seed.users.find((user) => user.email === 'marketing@ronalds.local');
    const marketingProfile = seed.profiles.find((profile) => profile.userId === marketingUser?.id);

    if (!hrUser || !hrProfile || !marketingUser || !marketingProfile) {
      throw new Error('Missing HR or marketing profile for test setup');
    }

    const suffix = Date.now();
    jobName = `Greenwells Audit FY2025 ${suffix}`;

    const engagementLetter = await prisma.engagementLetter.create({
      data: {
        clientId: seed.client.id,
        documentId: seed.document.id,
        engagementType: seed.engagementLetter.engagementType,
        feeAmount: seed.engagementLetter.feeAmount ?? 500000,
        currency: seed.engagementLetter.currency ?? 'KES',
        jobTitle: jobName,
        status: 'approved',
        approvedByProfileId: hrProfile.id,
        approvedAt: new Date(),
        uploadedByProfileId: marketingProfile.id,
      },
    });

    engagementLetterId = engagementLetter.id;

    await prisma.clientOnboarding.create({
      data: {
        clientName: seed.client.clientName,
        industry: seed.client.industry ?? 'Professional Services',
        contactPerson: seed.client.contactPerson ?? 'Alice K.',
        contactEmail: seed.client.contactEmail ?? 'alice@greenwells.co.ke',
        contactPhone: seed.client.contactPhone ?? '+254700000000',
        location: seed.client.location ?? 'Nairobi, Kenya',
        uploadedByProfileId: marketingProfile.id,
        engagementLetterId: engagementLetter.id,
        status: 'approved',
      },
    });
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
        jobName,
        description: 'Seeded audit engagement',
        clientId: seed.client.id,
        engagementLetterId,
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
      where: { engagementLetterId },
    });

    expect(onboarding?.jobId).toBe(job.id);
    expect(onboarding?.status).toBe('job_created');
  });

  it('assigns staff, allocates hours, and allows time logging', async () => {
    const managerUser = seed.users.find((user) => user.email === 'manager@ronalds.local');
    const managerProfile = seed.profiles.find((profile) => profile.userId === managerUser?.id);
    const partnerUser = seed.users.find((user) => user.email === 'partner@ronalds.local');
    const partnerProfile = seed.profiles.find((profile) => profile.userId === partnerUser?.id);
    const employeeUser = seed.users.find((user) => user.email === 'employee@ronalds.local');
    const employeeProfile = seed.profiles.find((profile) => profile.userId === employeeUser?.id);

    if (!managerUser || !managerProfile || !partnerUser || !partnerProfile || !employeeUser || !employeeProfile) {
      throw new Error('Missing seed users for assignment');
    }

    const job = await prisma.job.findFirst({
      where: { jobName },
      orderBy: { createdAt: 'desc' },
    });

    if (!job) {
      throw new Error('Seed job not found');
    }

    await prisma.jobStaffAssignment.deleteMany({
      where: {
        jobId: job.id,
        employeeProfileId: employeeProfile.id,
      },
    });

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

    await prisma.document.deleteMany({
      where: {
        entityId: job.id,
        OR: [{ entityType: 'Job' }, { entityType: 'job' }],
        documentType: { in: ['workplan', 'budget'] },
      },
    });

    await prisma.document.createMany({
      data: [
        {
          fileName: `workplan-${job.id}.pdf`,
          filePath: `seed/workplan-${job.id}.pdf`,
          documentType: 'workplan',
          entityType: 'Job',
          entityId: job.id,
          accessLevel: 'admin',
          uploadedBy: managerProfile.id,
          description: 'Seed work plan document',
        },
        {
          fileName: `budget-${job.id}.xlsx`,
          filePath: `seed/budget-${job.id}.xlsx`,
          documentType: 'budget',
          entityType: 'Job',
          entityId: job.id,
          accessLevel: 'admin',
          uploadedBy: managerProfile.id,
          description: 'Seed budget document',
        },
      ],
    });

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

    await jobService.reviewJobCosting(
      job.id,
      {
        decision: 'approved',
      },
      {
        userId: partnerUser.id,
        profileId: partnerProfile.id,
        roles: ['partner'],
      }
    );

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
      where: { jobName },
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

  it('creates an onboarding checklist and notifies the employee', async () => {
    const hrUser = seed.users.find((user) => user.email === 'hr@ronalds.local');
    const hrProfile = seed.profiles.find((profile) => profile.userId === hrUser?.id);
    const employeeUser = seed.users.find((user) => user.email === 'employee@ronalds.local');
    const employeeProfile = seed.profiles.find((profile) => profile.userId === employeeUser?.id);

    if (!hrUser || !hrProfile || !employeeUser || !employeeProfile) {
      throw new Error('Missing seed users for onboarding checklist');
    }

    const onboardingCase =
      (await prisma.employeeOnboardingCase.findUnique({
        where: { profileId: employeeProfile.id },
      })) ??
      (await prisma.employeeOnboardingCase.create({
        data: {
          profileId: employeeProfile.id,
          hrOwnerProfileId: hrProfile.id,
          status: 'pending',
          startDate: new Date(),
        },
      }));

    await prisma.inductionChecklist.deleteMany({
      where: { onboardingCaseId: onboardingCase.id },
    });

    await prisma.notification.deleteMany({
      where: {
        profileId: employeeProfile.id,
        title: "Onboarding checklist assigned",
      },
    });

    const checklist = await InductionChecklistService.createChecklist(
      {
        onboardingCaseId: onboardingCase.id,
        employeeProfileId: employeeProfile.id,
        checklistName: 'Seeded induction checklist',
        items: [
          { itemName: 'Upload ID document', requiresDocument: true },
          { itemName: 'Sign HR policy acknowledgement' },
        ],
      },
      {
        userId: hrUser.id,
        profileId: hrProfile.id,
        roles: ['hr'],
      }
    );

    expect(checklist?.status).toBe('pending');

    const notification = await prisma.notification.findFirst({
      where: {
        profileId: employeeProfile.id,
        title: 'Onboarding checklist assigned',
      },
    });

    expect(notification).toBeTruthy();
  });

  it('initiates an offboarding case with status initiated', async () => {
    const hrUser = seed.users.find((user) => user.email === 'hr@ronalds.local');
    const hrProfile = seed.profiles.find((profile) => profile.userId === hrUser?.id);
    const targetEmployee = seed.profiles.find(
      (profile) => profile.positionTitle === 'Associate' || profile.positionTitle === 'Trainee'
    );

    if (!hrUser || !hrProfile || !targetEmployee) {
      throw new Error('Missing seed users for offboarding');
    }

    await prisma.employeeOffboardingCase.deleteMany({
      where: { profileId: targetEmployee.id },
    });

    const offboarding = await EmployeeOffboardingCaseService.create(
      { profileId: targetEmployee.id, reason: 'Seeded offboarding test' },
      { userId: hrUser.id, profileId: hrProfile.id, roles: ['hr'] }
    );

    expect(offboarding.status).toBe('initiated');
  });

  it('creates job notifications for partner/manager/finance/gmp', async () => {
    const job = await prisma.job.findFirst({
      where: { jobName },
      orderBy: { createdAt: 'desc' },
    });

    if (!job) {
      throw new Error('Seed job not found for notifications');
    }

    const partnerUser = seed.users.find((user) => user.email === 'partner@ronalds.local');
    const partnerProfile = seed.profiles.find((profile) => profile.userId === partnerUser?.id);
    const managerUser = seed.users.find((user) => user.email === 'manager@ronalds.local');
    const managerProfile = seed.profiles.find((profile) => profile.userId === managerUser?.id);
    const gmpUser = seed.users.find((user) => user.email === 'gmp@ronalds.local');
    const gmpProfile = seed.profiles.find((profile) => profile.userId === gmpUser?.id);
    const financeUser = seed.users.find((user) => user.email === 'finance@ronalds.local');
    const financeProfile = seed.profiles.find((profile) => profile.userId === financeUser?.id);

    if (!partnerProfile || !managerProfile || !gmpProfile || !financeProfile) {
      throw new Error('Missing seed profiles for notification checks');
    }

    const notifications = await prisma.notification.findMany({
      where: {
        jobId: job.id,
      },
      select: { profileId: true, title: true },
    });

    const recipientIds = new Set(notifications.map((n) => n.profileId));
    expect(recipientIds.has(managerProfile.id)).toBe(true);
    expect(recipientIds.has(partnerProfile.id)).toBe(true);
    expect(recipientIds.has(gmpProfile.id)).toBe(true);
    expect(recipientIds.has(financeProfile.id)).toBe(true);
  });

  it('recomputes performance scores via the admin endpoint', async () => {
    const hrUser = seed.users.find((user) => user.email === 'hr@ronalds.local');
    const hrProfile = seed.profiles.find((profile) => profile.userId === hrUser?.id);
    const employeeUser = seed.users.find((user) => user.email === 'employee@ronalds.local');
    const employeeProfile = seed.profiles.find((profile) => profile.userId === employeeUser?.id);

    if (!hrUser || !hrProfile || !employeeUser || !employeeProfile) {
      throw new Error('Missing seed users for recompute test');
    }

    const sessionToken = `e2e-recompute-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    await prisma.session.create({
      data: {
        userId: hrUser.id,
        token: sessionToken,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    const tokenWithSession = jwt.sign(
      { userId: hrUser.id, email: hrUser.email, authRoles: ['hr'], sessionToken },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: '1h' }
    );

    const response = await request(app)
      .post('/api/performance-scores/recalculate')
      .set('Authorization', `Bearer ${tokenWithSession}`)
      .send({ profileIds: [employeeProfile.id] });

    expect(response.status).toBe(200);
    expect(response.body?.success).toBe(true);
    expect(response.body?.data?.results?.length).toBeGreaterThan(0);

    await prisma.session.deleteMany({ where: { token: sessionToken } });
  });
});
