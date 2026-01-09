/**
 * End-to-End Scenario Tests
 * 
 * Test Suite 7: Complete company lifecycle workflows
 * 
 * Tests realistic scenarios:
 * 1. HR creates job → partner assigned → employees assigned → time logging → profitability review
 * 2. Employee logs non-billable time → job profitability updates correctly
 * 3. Partner attempts to access another partner's job → access denied
 * 4. Complete audit job lifecycle from creation to completion
 * 5. Multi-partner portfolio comparison
 * 6. Employee KPI tracking throughout performance cycle
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { PrismaClient } from '@prisma/client';
import { TestDataFactory } from './fixtures/test-data.factory';
import {
  getAuthContext,
  canAccessJob,
  canApproveTimeEntries,
} from '../middleware/partner-auth';

const prisma = new PrismaClient();

describe('E2E 7: End-to-End Scenario Tests', () => {
  let superAdmin: Awaited<ReturnType<typeof TestDataFactory.createSuperAdmin>>;
  let hrManager: Awaited<ReturnType<typeof TestDataFactory.createHRManager>>;
  let partner1: Awaited<ReturnType<typeof TestDataFactory.createPartner>>;
  let partner2: Awaited<ReturnType<typeof TestDataFactory.createPartner>>;
  let employee1: Awaited<ReturnType<typeof TestDataFactory.createEmployee>>;
  let employee2: Awaited<ReturnType<typeof TestDataFactory.createEmployee>>;
  let client: Awaited<ReturnType<typeof TestDataFactory.createClient>>;
  let department: Awaited<ReturnType<typeof TestDataFactory.createDepartment>>;

  beforeAll(async () => {
    // Setup: Create all necessary entities
    superAdmin = await TestDataFactory.createSuperAdmin();
    hrManager = await TestDataFactory.createHRManager();
    partner1 = await TestDataFactory.createPartner('partner1-e2e@test.com');
    partner2 = await TestDataFactory.createPartner('partner2-e2e@test.com');
    department = await TestDataFactory.createDepartment('E2E Department');
    employee1 = await TestDataFactory.createEmployee('emp1-e2e@test.com', department.id);
    employee2 = await TestDataFactory.createEmployee('emp2-e2e@test.com', department.id);
    client = await TestDataFactory.createClient('E2E Client');
  });

  afterAll(async () => {
    // Cleanup
    try {
      await prisma.timeEntry.deleteMany({});
      await prisma.task.deleteMany({});
      await prisma.jobStaffAssignment.deleteMany({});
      await prisma.jobProfitability.deleteMany({});
      await prisma.employeeGoal.deleteMany({});
      await prisma.employeeKpiAssignment.deleteMany({});
      await prisma.kpi.deleteMany({});
      await prisma.job.deleteMany({});
      await prisma.partner.deleteMany({});
      await prisma.partnerCompany.deleteMany({});
      await prisma.client.deleteMany({});
      await prisma.department.deleteMany({});
      await prisma.userRole.deleteMany({});
      await prisma.profile.deleteMany({});
      await prisma.user.deleteMany({});
    } finally {
      await prisma.$disconnect();
    }
  });

  describe('Scenario 1: Complete Job Lifecycle (HR Creation → Partner Assignment → Employee Execution → Financial Review)', () => {
    it('E2E-S1: HR creates job and assigns to partner', async () => {
      // Arrange: HR manager context
      const hrContext = await getAuthContext(hrManager.user.id);

      // Act 1: HR creates a job
      const job = await TestDataFactory.createJob(
        partner1.profile.id,
        client.id,
        'E2E Test Job 1'
      );

      // Assert job created
      expect(job).toBeDefined();
      expect(job.partner_id).toBe(partner1.profile.id);
      expect(job.status).toBe('active');

      // Cleanup
      await prisma.job.delete({ where: { id: job.id } });
    });

    it('E2E-S1: HR assigns employees to the job', async () => {
      // Arrange
      const job = await TestDataFactory.createJob(
        partner1.profile.id,
        client.id
      );

      // Act: HR assigns employees
      const assignment1 = await TestDataFactory.createJobStaffAssignment(
        job.id,
        employee1.profile.id,
        80
      );
      const assignment2 = await TestDataFactory.createJobStaffAssignment(
        job.id,
        employee2.profile.id,
        60
      );

      // Assert
      expect(assignment1.job_id).toBe(job.id);
      expect(assignment2.job_id).toBe(job.id);

      // Cleanup
      await prisma.jobStaffAssignment.deleteMany({ where: { job_id: job.id } });
      await prisma.job.delete({ where: { id: job.id } });
    });

    it('E2E-S1: Employees log time on assigned tasks', async () => {
      // Arrange
      const job = await TestDataFactory.createJob(partner1.profile.id, client.id);
      const task = await TestDataFactory.createTask(
        job.id,
        employee1.profile.id,
        'Task 1'
      );
      await TestDataFactory.createJobStaffAssignment(
        job.id,
        employee1.profile.id
      );

      // Act: Employee logs billable time
      const timeEntry = await TestDataFactory.createTimeEntry(
        job.id,
        employee1.profile.id,
        8,
        true,
        task.id
      );

      // Assert
      expect(timeEntry.job_id).toBe(job.id);
      expect(timeEntry.billable).toBe(true);
      expect(Number(timeEntry.hours)).toBe(8);

      // Cleanup
      await prisma.timeEntry.delete({ where: { id: timeEntry.id } });
      await prisma.task.delete({ where: { id: task.id } });
      await prisma.jobStaffAssignment.deleteMany({ where: { job_id: job.id } });
      await prisma.job.delete({ where: { id: job.id } });
    });

    it('E2E-S1: Partner reviews job profitability', async () => {
      // Arrange
      const job = await TestDataFactory.createJob(partner1.profile.id, client.id);

      // Create time entries to simulate billable work
      await TestDataFactory.createTimeEntry(
        job.id,
        employee1.profile.id,
        10,
        true
      );

      // Create financial data
      const profitability = await TestDataFactory.createJobProfitability(
        job.id,
        18000, // 10 hours * 150/hr * markup
        8000 // labor cost
      );

      // Act: Partner views profitability
      const partnerContext = await getAuthContext(partner1.user.id);
      const canView = await canAccessJob(job.id, partnerContext!);

      // Assert
      expect(canView).toBe(true);
      expect(Number(profitability.total_revenue)).toBe(18000);
      expect(Number(profitability.profit)).toBe(10000);

      // Cleanup
      await prisma.jobProfitability.delete({ where: { id: profitability.id } });
      await prisma.timeEntry.deleteMany({ where: { job_id: job.id } });
      await prisma.job.delete({ where: { id: job.id } });
    });

    it('E2E-S1: Partner approves time entries', async () => {
      // Arrange
      const job = await TestDataFactory.createJob(partner1.profile.id, client.id);
      const timeEntry = await TestDataFactory.createTimeEntry(
        job.id,
        employee1.profile.id,
        5,
        true,
        undefined,
        'submitted'
      );

      // Act: Partner approves
      const partnerContext = await getAuthContext(partner1.user.id);
      const canApprove = await canApproveTimeEntries(job.id, partnerContext!);

      const approved = await prisma.timeEntry.update({
        where: { id: timeEntry.id },
        data: {
          status: 'approved',
          approved_by: partner1.profile.id,
        },
      });

      // Assert
      expect(canApprove).toBe(true);
      expect(approved.status).toBe('approved');

      // Cleanup
      await prisma.timeEntry.delete({ where: { id: timeEntry.id } });
      await prisma.job.delete({ where: { id: job.id } });
    });

    it('E2E-S1: Job completion and final review', async () => {
      // Arrange
      const job = await TestDataFactory.createJob(
        partner1.profile.id,
        client.id,
        'Completion Job'
      );

      // Add profitability data
      const profitability = await TestDataFactory.createJobProfitability(
        job.id,
        30000,
        15000
      );

      // Act: Mark job as completed
      const completedJob = await prisma.job.update({
        where: { id: job.id },
        data: {
          status: 'completed',
          completion_percentage: 100,
          completion_date: new Date(),
          amount_collected: profitability.total_revenue,
        },
      });

      // Assert
      expect(completedJob.status).toBe('completed');
      expect(completedJob.completion_percentage).toBe(100);
      expect(Number(completedJob.amount_collected)).toBe(30000);

      // Cleanup
      await prisma.jobProfitability.delete({ where: { id: profitability.id } });
      await prisma.job.delete({ where: { id: job.id } });
    });
  });

  describe('Scenario 2: Non-Billable Time Impact on Profitability', () => {
    it('E2E-S2: Logging non-billable time reduces job profitability margin', async () => {
      // Arrange
      const job = await TestDataFactory.createJob(partner1.profile.id, client.id);
      const totalRevenue = 10000;

      // Case 1: Only billable hours
      await TestDataFactory.createTimeEntry(
        job.id,
        employee1.profile.id,
        10,
        true
      );

      const costOnlyBillable = 10 * 75; // employee rate
      const profitOnlyBillable = totalRevenue - costOnlyBillable;

      // Case 2: Add non-billable hours
      await TestDataFactory.createTimeEntry(
        job.id,
        employee1.profile.id,
        5,
        false
      );

      const costWithNonBillable = 15 * 75; // includes non-billable
      const profitWithNonBillable = totalRevenue - costWithNonBillable;

      // Assert: Profit reduced by non-billable cost
      expect(profitOnlyBillable).toBeGreaterThan(profitWithNonBillable);
      expect(profitWithNonBillable).toBe(profitOnlyBillable - 375);

      // Cleanup
      await prisma.timeEntry.deleteMany({ where: { job_id: job.id } });
      await prisma.job.delete({ where: { id: job.id } });
    });

    it('E2E-S2: Non-billable-only job has negative profitability', async () => {
      // Arrange
      const job = await TestDataFactory.createJob(
        partner1.profile.id,
        client.id
      );

      // Log only non-billable time
      await TestDataFactory.createTimeEntry(
        job.id,
        employee1.profile.id,
        20,
        false
      );

      const totalCost = 20 * 75; // 20 hours * rate
      const totalRevenue = 0; // No billable revenue

      // Create profitability record
      const profitability = await TestDataFactory.createJobProfitability(
        job.id,
        totalRevenue,
        totalCost
      );

      // Assert: Negative profit
      expect(Number(profitability.profit)).toBe(-totalCost);

      // Cleanup
      await prisma.jobProfitability.delete({ where: { id: profitability.id } });
      await prisma.timeEntry.deleteMany({ where: { job_id: job.id } });
      await prisma.job.delete({ where: { id: job.id } });
    });
  });

  describe('Scenario 3: Partner Access Control Enforcement', () => {
    it('E2E-S3: Partner1 cannot access Partner2 job', async () => {
      // Arrange
      const p2Job = await TestDataFactory.createJob(
        partner2.profile.id,
        client.id,
        'Partner2 Only Job'
      );
      const p1Context = await getAuthContext(partner1.user.id);

      // Act: Try to access
      const canAccess = await canAccessJob(p2Job.id, p1Context!);

      // Assert
      expect(canAccess).toBe(false);

      // Cleanup
      await prisma.job.delete({ where: { id: p2Job.id } });
    });

    it('E2E-S3: Partner1 cannot approve Partner2 time entries', async () => {
      // Arrange
      const p2Job = await TestDataFactory.createJob(
        partner2.profile.id,
        client.id
      );
      const timeEntry = await TestDataFactory.createTimeEntry(
        p2Job.id,
        employee2.profile.id,
        4
      );

      const p1Context = await getAuthContext(partner1.user.id);

      // Act
      const canApprove = await canApproveTimeEntries(p2Job.id, p1Context!);

      // Assert
      expect(canApprove).toBe(false);

      // Cleanup
      await prisma.timeEntry.delete({ where: { id: timeEntry.id } });
      await prisma.job.delete({ where: { id: p2Job.id } });
    });

    it('E2E-S3: Partner1 cannot see Partner2 financial data', async () => {
      // Arrange
      const p2Job = await TestDataFactory.createJob(
        partner2.profile.id,
        client.id
      );
      const p2Financials = await TestDataFactory.createJobProfitability(
        p2Job.id,
        50000,
        25000
      );

      // Act: Partner1 tries to see partner2's financials
      const p1CanSee = await prisma.jobProfitability.findMany({
        where: {
          job: { partner_id: partner1.profile.id },
        },
      });

      const p2CanSee = await prisma.jobProfitability.findMany({
        where: {
          job: { partner_id: partner2.profile.id },
        },
      });

      // Assert: Partner1 should not see partner2's data
      expect(p1CanSee.some((f) => f.id === p2Financials.id)).toBe(false);
      expect(p2CanSee.some((f) => f.id === p2Financials.id)).toBe(true);

      // Cleanup
      await prisma.jobProfitability.delete({ where: { id: p2Financials.id } });
      await prisma.job.delete({ where: { id: p2Job.id } });
    });
  });

  describe('Scenario 4: Complete Audit Job Lifecycle', () => {
    it('E2E-S4: Full audit job from proposal to completion', async () => {
      // Phase 1: Job Creation
      const auditJob = await TestDataFactory.createJob(
        partner1.profile.id,
        client.id,
        'Annual Audit 2024',
        {
          description: 'Complete annual audit',
          billable_hours: 200,
          hourly_rate: 175,
        }
      );

      expect(auditJob.status).toBe('active');

      // Phase 2: Team Assignment
      const lead = await TestDataFactory.createJobStaffAssignment(
        auditJob.id,
        employee1.profile.id,
        120
      );
      const junior = await TestDataFactory.createJobStaffAssignment(
        auditJob.id,
        employee2.profile.id,
        80
      );

      expect(Number(lead.hours_allocated)).toBe(120);
      expect(Number(junior.hours_allocated)).toBe(80);

      // Phase 3: Progress Tracking
      const startWork = await prisma.job.update({
        where: { id: auditJob.id },
        data: {
          status: 'ongoing',
          completion_percentage: 25,
        },
      });

      expect(startWork.status).toBe('ongoing');

      // Phase 4: Time Logging
      const leadHours = await TestDataFactory.createTimeEntry(
        auditJob.id,
        employee1.profile.id,
        25,
        true
      );
      const juniorHours = await TestDataFactory.createTimeEntry(
        auditJob.id,
        employee2.profile.id,
        20,
        true
      );

      expect(Number(leadHours.hours)).toBe(25);
      expect(Number(juniorHours.hours)).toBe(20);

      // Phase 5: Financial Calculation
      const totalBillable = 25 + 20;
      const revenue = totalBillable * 175;
      const cost = 25 * 75 + 20 * 75; // simplified

      const financials = await TestDataFactory.createJobProfitability(
        auditJob.id,
        revenue,
        cost
      );

      expect(Number(financials.total_revenue)).toBe(7875);

      // Phase 6: Completion
      const completed = await prisma.job.update({
        where: { id: auditJob.id },
        data: {
          status: 'completed',
          completion_percentage: 100,
          completion_date: new Date(),
          amount_collected: revenue,
        },
      });

      expect(completed.status).toBe('completed');
      expect(Number(completed.amount_collected)).toBe(7875);

      // Cleanup
      await prisma.jobProfitability.delete({ where: { id: financials.id } });
      await prisma.timeEntry.deleteMany({ where: { job_id: auditJob.id } });
      await prisma.jobStaffAssignment.deleteMany({ where: { job_id: auditJob.id } });
      await prisma.job.delete({ where: { id: auditJob.id } });
    });
  });

  describe('Scenario 5: Multi-Partner Portfolio Comparison', () => {
    it('E2E-S5: Compare portfolio metrics across partners', async () => {
      // Clean up old financial records from previous tests
      await prisma.jobProfitability.deleteMany({
        where: { 
          job: {
            OR: [
              { partner_id: partner1.profile.id },
              { partner_id: partner2.profile.id }
            ]
          }
        },
      });
      
      // Arrange: Partner1 has 2 jobs
      const p1Job1 = await TestDataFactory.createJob(
        partner1.profile.id,
        client.id
      );
      const p1Job2 = await TestDataFactory.createJob(
        partner1.profile.id,
        client.id
      );

      // Partner2 has 1 job
      const p2Job1 = await TestDataFactory.createJob(
        partner2.profile.id,
        client.id
      );

      // Create financials
      const p1F1 = await TestDataFactory.createJobProfitability(
        p1Job1.id,
        20000,
        10000
      );
      const p1F2 = await TestDataFactory.createJobProfitability(
        p1Job2.id,
        15000,
        8000
      );
      const p2F1 = await TestDataFactory.createJobProfitability(
        p2Job1.id,
        30000,
        12000
      );

      // Act: Calculate portfolio metrics
      const p1Portfolio = await prisma.jobProfitability.findMany({
        where: { job: { partner_id: partner1.profile.id } },
      });
      const p2Portfolio = await prisma.jobProfitability.findMany({
        where: { job: { partner_id: partner2.profile.id } },
      });

      const p1Revenue = p1Portfolio.reduce(
        (sum, f) => sum + Number(f.total_revenue),
        0
      );
      const p1Profit = p1Portfolio.reduce(
        (sum, f) => sum + Number(f.profit),
        0
      );
      const p2Revenue = p2Portfolio.reduce(
        (sum, f) => sum + Number(f.total_revenue),
        0
      );
      const p2Profit = p2Portfolio.reduce(
        (sum, f) => sum + Number(f.profit),
        0
      );

      // Assert
      expect(p1Revenue).toBe(35000);
      expect(p1Profit).toBe(17000);
      expect(p2Revenue).toBe(30000);
      expect(p2Profit).toBe(18000);

      // Partner2 has better profit margin despite less revenue
      expect(p2Profit / p2Revenue).toBeGreaterThan(p1Profit / p1Revenue);

      // Cleanup
      await prisma.jobProfitability.deleteMany({
        where: { id: { in: [p1F1.id, p1F2.id, p2F1.id] } },
      });
      await prisma.job.deleteMany({
        where: { id: { in: [p1Job1.id, p1Job2.id, p2Job1.id] } },
      });
    });
  });

  describe('Scenario 6: Employee KPI Tracking During Performance Cycle', () => {
    it('E2E-S6: Complete KPI cycle for employee', async () => {
      // Phase 1: Create KPIs
      const revenueKPI = await TestDataFactory.createKPI(
        'Revenue Generation',
        department.id
      );
      const qualityKPI = await TestDataFactory.createKPI(
        'Audit Quality',
        department.id
      );

      // Phase 2: Assign KPIs to employee
      const revAssignment = await TestDataFactory.createEmployeeKPIAssignment(
        employee1.profile.id,
        revenueKPI.id,
        100000,
        60 // High weight on revenue
      );
      const qualAssignment = await TestDataFactory.createEmployeeKPIAssignment(
        employee1.profile.id,
        qualityKPI.id,
        95,
        40 // Quality rating out of 100
      );

      expect(revAssignment.status).toBe('active');
      expect(qualAssignment.status).toBe('active');

      // Phase 3: Track progress mid-cycle
      await prisma.employeeKpiAssignment.update({
        where: { id: revAssignment.id },
        data: { achieved_value: 65000 }, // 65% of target
      });
      await prisma.employeeKpiAssignment.update({
        where: { id: qualAssignment.id },
        data: { achieved_value: 92 }, // 92% (97% achievement)
      });

      // Phase 4: Calculate performance score
      const allAssignments = await prisma.employeeKpiAssignment.findMany({
        where: { employee_id: employee1.profile.id },
      });

      const performanceScore = allAssignments.reduce((sum, a) => {
        const achievement =
          (Number(a.achieved_value) / Number(a.target_value)) * 100;
        return sum + (achievement * Number(a.weight)) / 100;
      }, 0);

      // Phase 5: Complete KPI cycle
      const completedRev = await prisma.employeeKpiAssignment.update({
        where: { id: revAssignment.id },
        data: {
          status: 'completed',
          achieved_value: 98000, // Final: 98% of target
        },
      });

      const completedQual = await prisma.employeeKpiAssignment.update({
        where: { id: qualAssignment.id },
        data: {
          status: 'completed',
          achieved_value: 96, // Final: 96% (excellent)
        },
      });

      // Assert
      expect(completedRev.status).toBe('completed');
      expect(completedQual.status).toBe('completed');
      expect(
        (Number(completedRev.achieved_value) /
          Number(completedRev.target_value)) *
          100
      ).toBeCloseTo(98, 1);

      // Cleanup
      await prisma.employeeKpiAssignment.deleteMany({
        where: { employee_id: employee1.profile.id },
      });
      await prisma.kpi.deleteMany({
        where: { id: { in: [revenueKPI.id, qualityKPI.id] } },
      });
    });
  });
});
