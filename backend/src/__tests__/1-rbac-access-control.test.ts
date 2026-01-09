/**
 * Role-Based Access Control (RBAC) Tests
 * 
 * Test Suite 1: Verify strict role isolation and endpoint access restrictions
 * 
 * Validates:
 * - Employees cannot access partner or admin endpoints
 * - Partners cannot access other partners' jobs or admin endpoints
 * - Super admin has full system access
 * - HR managers can manage organizational resources
 * - Proper role enforcement across all endpoints
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { PrismaClient } from '@prisma/client';
import { TestDataFactory } from './fixtures/test-data.factory';
import {
  getAuthContext,
  hasRole,
  canAccessJob,
  canApproveTimeEntries,
  UserRole,
} from '../middleware/partner-auth';

const prisma = new PrismaClient();

describe('RBAC 1: Role-Based Access Control Tests', () => {
  let superAdmin: Awaited<ReturnType<typeof TestDataFactory.createSuperAdmin>>;
  let hrManager: Awaited<ReturnType<typeof TestDataFactory.createHRManager>>;
  let partner1: Awaited<ReturnType<typeof TestDataFactory.createPartner>>;
  let partner2: Awaited<ReturnType<typeof TestDataFactory.createPartner>>;
  let employee1: Awaited<ReturnType<typeof TestDataFactory.createEmployee>>;
  let employee2: Awaited<ReturnType<typeof TestDataFactory.createEmployee>>;
  let client: Awaited<ReturnType<typeof TestDataFactory.createClient>>;
  let job1: Awaited<ReturnType<typeof TestDataFactory.createJob>>;
  let job2: Awaited<ReturnType<typeof TestDataFactory.createJob>>;

  beforeAll(async () => {
    // Arrange: Create test users with different roles
    superAdmin = await TestDataFactory.createSuperAdmin();
    hrManager = await TestDataFactory.createHRManager();
    partner1 = await TestDataFactory.createPartner('partner1@test.com', 'Partner 1 Co');
    partner2 = await TestDataFactory.createPartner('partner2@test.com', 'Partner 2 Co');
    employee1 = await TestDataFactory.createEmployee('emp1@test.com');
    employee2 = await TestDataFactory.createEmployee('emp2@test.com');

    client = await TestDataFactory.createClient('Test Client');

    // Create jobs for different partners
    job1 = await TestDataFactory.createJob(partner1.profile.id, client.id, 'Partner 1 Job');
    job2 = await TestDataFactory.createJob(partner2.profile.id, client.id, 'Partner 2 Job');
  });

  afterAll(async () => {
    // Cleanup
    try {
      await prisma.job.deleteMany({});
      await prisma.partner.deleteMany({});
      await prisma.partnerCompany.deleteMany({});
      await prisma.client.deleteMany({});
      await prisma.userRole.deleteMany({});
      await prisma.profile.deleteMany({});
      await prisma.user.deleteMany({});
    } finally {
      await prisma.$disconnect();
    }
  });

  describe('1.1: Super Admin Access Control', () => {
    it('should have super_admin role assigned', async () => {
      // Act
      const context = await getAuthContext(superAdmin.user.id);

      // Assert
      expect(context).toBeDefined();
      expect(context?.roles).toContain(UserRole.SUPER_ADMIN);
    });

    it('super admin should have access to all jobs', async () => {
      // Act
      const context = await getAuthContext(superAdmin.user.id);
      const canAccessJob1 = await canAccessJob(job1.id, context!);
      const canAccessJob2 = await canAccessJob(job2.id, context!);

      // Assert
      expect(canAccessJob1).toBe(true);
      expect(canAccessJob2).toBe(true);
    });

    it('super admin should be able to approve time entries for any job', async () => {
      // Act
      const context = await getAuthContext(superAdmin.user.id);
      const canApprove1 = await canApproveTimeEntries(job1.id, context!);
      const canApprove2 = await canApproveTimeEntries(job2.id, context!);

      // Assert
      expect(canApprove1).toBe(true);
      expect(canApprove2).toBe(true);
    });

    it('super admin should have all roles', async () => {
      // Act
      const context = await getAuthContext(superAdmin.user.id);

      // Assert
      expect(hasRole(context!, UserRole.SUPER_ADMIN)).toBe(true);
      expect(hasRole(context!, UserRole.HR_MANAGER)).toBe(false); // Not directly assigned
      expect(context?.roles.length).toBeGreaterThan(0);
    });
  });

  describe('1.2: HR Manager Access Control', () => {
    it('should have hr_manager role assigned', async () => {
      // Act
      const context = await getAuthContext(hrManager.user.id);

      // Assert
      expect(context).toBeDefined();
      expect(context?.roles).toContain(UserRole.HR_MANAGER);
    });

    it('hr manager should have access to all jobs for management purposes', async () => {
      // Act
      const context = await getAuthContext(hrManager.user.id);
      const canAccessJob1 = await canAccessJob(job1.id, context!);
      const canAccessJob2 = await canAccessJob(job2.id, context!);

      // Assert
      expect(canAccessJob1).toBe(true);
      expect(canAccessJob2).toBe(true);
    });

    it('hr manager should be able to approve time entries', async () => {
      // Act
      const context = await getAuthContext(hrManager.user.id);
      const canApprove1 = await canApproveTimeEntries(job1.id, context!);
      const canApprove2 = await canApproveTimeEntries(job2.id, context!);

      // Assert
      expect(canApprove1).toBe(true);
      expect(canApprove2).toBe(true);
    });
  });

  describe('1.3: Partner Access Control', () => {
    it('should have partner role assigned', async () => {
      // Act
      const context = await getAuthContext(partner1.user.id);

      // Assert
      expect(context).toBeDefined();
      expect(context?.roles).toContain(UserRole.PARTNER);
      expect(context?.isPartner).toBe(true);
    });

    it('partner should have access only to their own jobs', async () => {
      // Act
      const context = await getAuthContext(partner1.user.id);
      const canAccessOwnJob = await canAccessJob(job1.id, context!);
      const canAccessOtherJob = await canAccessJob(job2.id, context!);

      // Assert
      expect(canAccessOwnJob).toBe(true);
      expect(canAccessOtherJob).toBe(false); // Cannot access partner 2's job
    });

    it('partner should not have access to other partners\' jobs', async () => {
      // Arrange: Partner 1 context
      const context = await getAuthContext(partner1.user.id);

      // Act: Try to access partner 2's job
      const canAccess = await canAccessJob(job2.id, context!);

      // Assert
      expect(canAccess).toBe(false);
    });

    it('partner should be able to approve time entries on their own jobs', async () => {
      // Act
      const context = await getAuthContext(partner1.user.id);
      const canApprove = await canApproveTimeEntries(job1.id, context!);

      // Assert
      expect(canApprove).toBe(true);
    });

    it('partner should NOT be able to approve time entries on other partners\' jobs', async () => {
      // Act
      const context = await getAuthContext(partner1.user.id);
      const canApprove = await canApproveTimeEntries(job2.id, context!);

      // Assert
      expect(canApprove).toBe(false);
    });

    it('multiple partners should not have access to each other\'s data', async () => {
      // Arrange
      const context1 = await getAuthContext(partner1.user.id);
      const context2 = await getAuthContext(partner2.user.id);

      // Act & Assert
      expect(await canAccessJob(job1.id, context1!)).toBe(true);
      expect(await canAccessJob(job1.id, context2!)).toBe(false);
      expect(await canAccessJob(job2.id, context1!)).toBe(false);
      expect(await canAccessJob(job2.id, context2!)).toBe(true);
    });
  });

  describe('1.4: Employee Access Control', () => {
    it('should have employee role assigned', async () => {
      // Act
      const context = await getAuthContext(employee1.user.id);

      // Assert
      expect(context).toBeDefined();
      expect(context?.roles).toContain(UserRole.EMPLOYEE);
    });

    it('employee should NOT be able to access jobs directly', async () => {
      // Act
      const context = await getAuthContext(employee1.user.id);
      const canAccessJob1 = await canAccessJob(job1.id, context!);

      // Assert
      expect(canAccessJob1).toBe(false);
    });

    it('employee should NOT be able to approve time entries', async () => {
      // Act
      const context = await getAuthContext(employee1.user.id);
      const canApprove = await canApproveTimeEntries(job1.id, context!);

      // Assert
      expect(canApprove).toBe(false);
    });

    it('employee should only have employee role', async () => {
      // Act
      const context = await getAuthContext(employee1.user.id);

      // Assert
      expect(hasRole(context!, UserRole.EMPLOYEE)).toBe(true);
      expect(hasRole(context!, UserRole.PARTNER)).toBe(false);
      expect(hasRole(context!, UserRole.SUPER_ADMIN)).toBe(false);
      expect(hasRole(context!, UserRole.HR_MANAGER)).toBe(false);
    });
  });

  describe('1.5: Cross-Role Isolation Tests', () => {
    it('should prevent role privilege escalation', async () => {
      // Arrange
      const employeeContext = await getAuthContext(employee1.user.id);
      const partnerContext = await getAuthContext(partner1.user.id);

      // Act & Assert: Employee cannot do what Partner can
      expect(hasRole(employeeContext!, UserRole.EMPLOYEE)).toBe(true);
      expect(hasRole(employeeContext!, UserRole.PARTNER)).toBe(false);
      expect(await canApproveTimeEntries(job1.id, employeeContext!)).toBe(false);
      expect(await canApproveTimeEntries(job1.id, partnerContext!)).toBe(true);
    });

    it('should enforce strict role boundaries for financial operations', async () => {
      // Arrange
      const context = await getAuthContext(employee1.user.id);

      // Act & Assert: Employee cannot perform financial operations
      expect(hasRole(context!, UserRole.EMPLOYEE)).toBe(true);
      expect(await canApproveTimeEntries(job1.id, context!)).toBe(false);
    });

    it('should prevent unauthorized access to sensitive endpoints', async () => {
      // Test that non-admin users cannot access admin functions
      const employeeContext = await getAuthContext(employee1.user.id);
      const partnerContext = await getAuthContext(partner1.user.id);

      // Neither should have admin role
      expect(hasRole(employeeContext!, UserRole.SUPER_ADMIN)).toBe(false);
      expect(hasRole(partnerContext!, UserRole.SUPER_ADMIN)).toBe(false);
    });
  });

  describe('1.6: Invalid/Non-existent Job Access', () => {
    it('should deny access to non-existent jobs for all roles', async () => {
      // Arrange
      const fakeJobId = 99999;
      const superAdminContext = await getAuthContext(superAdmin.user.id);
      const partnerContext = await getAuthContext(partner1.user.id);
      const employeeContext = await getAuthContext(employee1.user.id);

      // Act & Assert
      expect(await canAccessJob(fakeJobId, superAdminContext!)).toBe(false);
      expect(await canAccessJob(fakeJobId, partnerContext!)).toBe(false);
      expect(await canAccessJob(fakeJobId, employeeContext!)).toBe(false);
    });
  });
});
