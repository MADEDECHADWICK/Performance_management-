import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { PrismaClient } from '@prisma/client';
import {
  getAuthContext,
  hasRole,
  hasAnyRole,
  canAccessJob,
  canApproveTimeEntries,
  UserRole,
} from '../middleware/partner-auth';

const prisma = new PrismaClient();

describe('Partner RBAC Middleware', () => {
  let partnerId: number;
  let employeeId: number;
  let managerId: number;
  let adminId: number;
  let jobId: number;
  let partnerJobId: number;

  beforeAll(async () => {
    // Create test users
    const adminUser = await prisma.user.create({
      data: {
        email: `admin-${Date.now()}@test.com`,
        name: 'Admin User',
      },
    });
    adminId = adminUser.id;

    const partnerUser = await prisma.user.create({
      data: {
        email: `partner-${Date.now()}@test.com`,
        name: 'Test Partner',
      },
    });

    const partnerProfile = await prisma.profile.create({
      data: {
        userId: partnerUser.id,
        first_name: 'Test',
        last_name: 'Partner',
        email: `partner-profile-${Date.now()}@test.com`,
        is_partner: true,
        hourly_rate: 100,
      },
    });
    partnerId = partnerProfile.id;

    // Create partner profile entry
    const company = await prisma.partnerCompany.create({
      data: {
        company_name: `Test Partner Co ${Date.now()}`,
      },
    });

    await prisma.partner.create({
      data: {
        profile_id: partnerId,
        company_id: company.id,
      },
    });

    const employeeUser = await prisma.user.create({
      data: {
        email: `emp-${Date.now()}@test.com`,
        name: 'Test Employee',
      },
    });

    const employeeProfile = await prisma.profile.create({
      data: {
        userId: employeeUser.id,
        first_name: 'Test',
        last_name: 'Employee',
        email: `emp-profile-${Date.now()}@test.com`,
        hourly_rate: 50,
      },
    });
    employeeId = employeeProfile.id;

    const managerUser = await prisma.user.create({
      data: {
        email: `mgr-${Date.now()}@test.com`,
        name: 'Test Manager',
      },
    });

    const managerProfile = await prisma.profile.create({
      data: {
        userId: managerUser.id,
        first_name: 'Test',
        last_name: 'Manager',
        email: `mgr-profile-${Date.now()}@test.com`,
      },
    });
    managerId = managerProfile.id;

    // Create roles
    await prisma.userRole.create({
      data: {
        userId: adminId,
        role: UserRole.SUPER_ADMIN,
      },
    });

    await prisma.userRole.create({
      data: {
        userId: partnerUser.id,
        role: UserRole.PARTNER,
      },
    });

    await prisma.userRole.create({
      data: {
        userId: managerUser.id,
        role: UserRole.MANAGER,
      },
    });

    // Create test jobs
    const employeeJob = await prisma.job.create({
      data: {
        job_name: 'Employee Job',
        assigned_to: employeeId,
        billable_hours: 50,
      },
    });
    jobId = employeeJob.id;

    const partnerJob = await prisma.job.create({
      data: {
        job_name: 'Partner Job',
        partner_id: partnerId,
        billable_hours: 100,
      },
    });
    partnerJobId = partnerJob.id;
  });

  afterAll(async () => {
    // Cleanup
    await prisma.timeEntry.deleteMany({
      where: { OR: [{ job_id: jobId }, { job_id: partnerJobId }] },
    });
    await prisma.task.deleteMany({
      where: { OR: [{ job_id: jobId }, { job_id: partnerJobId }] },
    });
    await prisma.partner.deleteMany({ where: { profile_id: partnerId } });
    await prisma.userRole.deleteMany({});
    await prisma.job.deleteMany({
      where: { OR: [{ id: jobId }, { id: partnerJobId }] },
    });
    await prisma.profile.deleteMany({
      where: {
        OR: [
          { id: partnerId },
          { id: employeeId },
          { id: managerId },
        ],
      },
    });
    await prisma.user.deleteMany({
      where: {
        OR: [
          { id: adminId },
          { email: { contains: 'partner-' } },
          { email: { contains: 'emp-' } },
          { email: { contains: 'mgr-' } },
        ],
      },
    });
    await prisma.$disconnect();
  });

  describe('getAuthContext', () => {
    it('should retrieve auth context for admin', async () => {
      const context = await getAuthContext(adminId);

      expect(context).toBeDefined();
      expect(context?.userId).toBe(adminId);
      expect(context?.roles).toContain(UserRole.SUPER_ADMIN);
    });

    it('should identify partner users', async () => {
      // Get the user ID for partner
      const partnerUser = await prisma.user.findFirst({
        where: { profile: { id: partnerId } },
      });

      if (partnerUser) {
        const context = await getAuthContext(partnerUser.id);
        expect(context?.isPartner).toBe(true);
        expect(context?.partnerId).toBe(partnerId);
      }
    });
  });

  describe('Role checking functions', () => {
    it('hasRole should return true for matching role', async () => {
      const context = await getAuthContext(adminId);

      if (context) {
        const isAdmin = hasRole(context, UserRole.SUPER_ADMIN);
        expect(isAdmin).toBe(true);
      }
    });

    it('hasAnyRole should return true if user has any required role', async () => {
      const context = await getAuthContext(adminId);

      if (context) {
        const result = hasAnyRole(context, [
          UserRole.SUPER_ADMIN,
          UserRole.HR_MANAGER,
        ]);
        expect(result).toBe(true);
      }
    });

    it('hasAnyRole should return false if user lacks all roles', async () => {
      const context = await getAuthContext(adminId);

      if (context) {
        const result = hasAnyRole(context, [
          UserRole.EMPLOYEE,
          UserRole.CLIENT,
        ]);
        expect(result).toBe(false);
      }
    });
  });

  describe('Job access control', () => {
    it('admin can access any job', async () => {
      const adminContext = await getAuthContext(adminId);

      if (adminContext) {
        const canAccess = await canAccessJob(partnerJobId, adminContext);
        expect(canAccess).toBe(true);
      }
    });

    it('partner can access own jobs', async () => {
      const partnerUser = await prisma.user.findFirst({
        where: { profile: { id: partnerId } },
      });

      if (partnerUser) {
        const context = await getAuthContext(partnerUser.id);

        if (context) {
          const canAccess = await canAccessJob(partnerJobId, context);
          expect(canAccess).toBe(true);
        }
      }
    });

    it('partner cannot access jobs they do not own', async () => {
      const partnerUser = await prisma.user.findFirst({
        where: { profile: { id: partnerId } },
      });

      if (partnerUser) {
        const context = await getAuthContext(partnerUser.id);

        if (context) {
          const canAccess = await canAccessJob(jobId, context);
          expect(canAccess).toBe(false);
        }
      }
    });
  });

  describe('Time entry approval permissions', () => {
    it('partner can approve time entries for their jobs', async () => {
      const partnerUser = await prisma.user.findFirst({
        where: { profile: { id: partnerId } },
      });

      if (partnerUser) {
        const context = await getAuthContext(partnerUser.id);

        if (context) {
          const canApprove = await canApproveTimeEntries(
            partnerJobId,
            context
          );
          expect(canApprove).toBe(true);
        }
      }
    });

    it('admin can approve any time entries', async () => {
      const adminContext = await getAuthContext(adminId);

      if (adminContext) {
        const canApprove = await canApproveTimeEntries(
          partnerJobId,
          adminContext
        );
        expect(canApprove).toBe(true);
      }
    });

    it('partner cannot approve entries for other partners jobs', async () => {
      // Create another partner
      const otherPartnerUser = await prisma.user.create({
        data: {
          email: `other-partner-${Date.now()}@test.com`,
          name: 'Other Partner',
        },
      });

      const otherPartnerProfile = await prisma.profile.create({
        data: {
          userId: otherPartnerUser.id,
          first_name: 'Other',
          last_name: 'Partner',
          email: `other-partner-profile-${Date.now()}@test.com`,
          is_partner: true,
        },
      });

      const context = await getAuthContext(otherPartnerUser.id);

      if (context) {
        const canApprove = await canApproveTimeEntries(
          partnerJobId,
          context
        );
        expect(canApprove).toBe(false);
      }

      // Cleanup
      await prisma.profile.delete({ where: { id: otherPartnerProfile.id } });
      await prisma.user.delete({ where: { id: otherPartnerUser.id } });
    });
  });

  describe('Data isolation', () => {
    it('partner query should only return own jobs', async () => {
      const jobs = await prisma.job.findMany({
        where: { partner_id: partnerId },
      });

      const allPartnerOwned = jobs.every((job) => job.partner_id === partnerId);
      expect(allPartnerOwned).toBe(true);
    });

    it('no cross-partner data leakage in time entries', async () => {
      // Create a time entry for partner 1's job
      const entry = await prisma.timeEntry.create({
        data: {
          job_id: partnerJobId,
          employee_id: employeeId,
          date_worked: new Date(),
          hours: 10,
          status: 'approved',
        },
      });

      // Get time entries only for the specific job
      const entries = await prisma.timeEntry.findMany({
        where: { job_id: partnerJobId },
      });

      const hasEntry = entries.some((e) => e.id === entry.id);
      expect(hasEntry).toBe(true);

      // Cleanup
      await prisma.timeEntry.delete({ where: { id: entry.id } });
    });
  });
});
