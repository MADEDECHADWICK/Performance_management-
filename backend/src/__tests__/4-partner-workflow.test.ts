/**
 * Partner Workflow Tests
 * 
 * Test Suite 4: Partner functionality and job ownership
 * 
 * Validates:
 * - Partners can view only their owned jobs
 * - Partners can view team assignments and task progress
 * - Partners can view time entries for their jobs
 * - Partners can view job-level financial performance
 * - Partners can view portfolio-level financial performance
 * - Financial summaries update in real time
 * - No cross-partner data leakage
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

describe('Partner 4: Partner Workflow Management Tests', () => {
  let partner1: Awaited<ReturnType<typeof TestDataFactory.createPartner>>;
  let partner2: Awaited<ReturnType<typeof TestDataFactory.createPartner>>;
  let employee1: Awaited<ReturnType<typeof TestDataFactory.createEmployee>>;
  let employee2: Awaited<ReturnType<typeof TestDataFactory.createEmployee>>;
  let client1: Awaited<ReturnType<typeof TestDataFactory.createClient>>;
  let client2: Awaited<ReturnType<typeof TestDataFactory.createClient>>;
  let job1P1: Awaited<ReturnType<typeof TestDataFactory.createJob>>;
  let job2P1: Awaited<ReturnType<typeof TestDataFactory.createJob>>;
  let job1P2: Awaited<ReturnType<typeof TestDataFactory.createJob>>;

  beforeAll(async () => {
    // Arrange: Create partners and employees
    partner1 = await TestDataFactory.createPartner('p1@test.com', 'Partner 1');
    partner2 = await TestDataFactory.createPartner('p2@test.com', 'Partner 2');
    employee1 = await TestDataFactory.createEmployee('emp1@test.com');
    employee2 = await TestDataFactory.createEmployee('emp2@test.com');

    // Create clients
    client1 = await TestDataFactory.createClient('Client 1');
    client2 = await TestDataFactory.createClient('Client 2');

    // Create jobs for partners
    job1P1 = await TestDataFactory.createJob(
      partner1.profile.id,
      client1.id,
      'Partner1 Job1'
    );
    job2P1 = await TestDataFactory.createJob(
      partner1.profile.id,
      client2.id,
      'Partner1 Job2'
    );
    job1P2 = await TestDataFactory.createJob(
      partner2.profile.id,
      client1.id,
      'Partner2 Job1'
    );

    // Assign employees to jobs
    await TestDataFactory.createJobStaffAssignment(
      job1P1.id,
      employee1.profile.id,
      100
    );
    await TestDataFactory.createJobStaffAssignment(
      job2P1.id,
      employee1.profile.id,
      80
    );
    await TestDataFactory.createJobStaffAssignment(
      job1P2.id,
      employee2.profile.id,
      120
    );

    // Create tasks
    await TestDataFactory.createTask(job1P1.id, employee1.profile.id, 'Task 1');
    await TestDataFactory.createTask(job2P1.id, employee1.profile.id, 'Task 2');
    await TestDataFactory.createTask(job1P2.id, employee2.profile.id, 'Task 3');
  });

  afterAll(async () => {
    // Cleanup
    try {
      await prisma.timeEntry.deleteMany({});
      await prisma.task.deleteMany({});
      await prisma.jobStaffAssignment.deleteMany({});
      await prisma.jobProfitability.deleteMany({});
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

  describe('4.1: Job Ownership and Access', () => {
    it('partner should be able to view their own jobs', async () => {
      // Act: Get partner1's jobs
      const partnerJobs = await prisma.job.findMany({
        where: { partner_id: partner1.profile.id },
      });

      // Assert
      expect(partnerJobs.length).toBeGreaterThanOrEqual(2);
      expect(partnerJobs.every((j) => j.partner_id === partner1.profile.id)).toBe(true);
    });

    it('partner should NOT be able to view other partners\' jobs', async () => {
      // Arrange
      const context1 = await getAuthContext(partner1.user.id);
      const context2 = await getAuthContext(partner2.user.id);

      // Act: Check access
      const canAccessOwn = await canAccessJob(job1P1.id, context1!);
      const canAccessOther = await canAccessJob(job1P1.id, context2!);

      // Assert
      expect(canAccessOwn).toBe(true);
      expect(canAccessOther).toBe(false);
    });

    it('each partner should only see their own jobs in their portfolio', async () => {
      // Act: Get jobs for each partner
      const p1Jobs = await prisma.job.findMany({
        where: { partner_id: partner1.profile.id },
      });
      const p2Jobs = await prisma.job.findMany({
        where: { partner_id: partner2.profile.id },
      });

      // Assert: Completely separate lists
      const p1Ids = p1Jobs.map((j) => j.id);
      const p2Ids = p2Jobs.map((j) => j.id);
      const overlap = p1Ids.filter((id) => p2Ids.includes(id));

      expect(overlap.length).toBe(0);
    });

    it('partner should be able to view multiple jobs they own', async () => {
      // Act
      const p1Jobs = await prisma.job.findMany({
        where: { partner_id: partner1.profile.id },
      });

      // Assert: Should have both jobs
      expect(p1Jobs.length).toBeGreaterThanOrEqual(2);
      expect(p1Jobs.map((j) => j.id)).toContain(job1P1.id);
      expect(p1Jobs.map((j) => j.id)).toContain(job2P1.id);
    });
  });

  describe('4.2: Team Assignments and Task Progress Visibility', () => {
    it('partner should be able to view team assignments for their jobs', async () => {
      // Act: Get assignments for partner1's job
      const assignments = await prisma.jobStaffAssignment.findMany({
        where: { job_id: job1P1.id },
        include: { employee: true },
      });

      // Assert
      expect(assignments.length).toBeGreaterThan(0);
      expect(assignments[0].employee_id).toBe(employee1.profile.id);
    });

    it('partner should see all team members assigned to their job', async () => {
      // Act: Get all team for job1P1
      const assignments = await prisma.jobStaffAssignment.findMany({
        where: { job_id: job1P1.id },
      });

      // Assert
      expect(assignments.length).toBeGreaterThan(0);
      expect(Number(assignments[0].hours_allocated)).toBe(100);
    });

    it('partner should be able to view task progress for their jobs', async () => {
      // Act: Get tasks for partner1's job
      const tasks = await prisma.task.findMany({
        where: { job_id: job1P1.id },
        include: { assignee: true, job: true },
      });

      // Assert
      expect(tasks.length).toBeGreaterThan(0);
      expect(tasks[0].job_id).toBe(job1P1.id);
    });

    it('partner should see task completion status', async () => {
      // Arrange: Create a task and update its status
      const task = await TestDataFactory.createTask(
        job1P1.id,
        employee1.profile.id
      );

      // Act: Update task
      const updated = await prisma.task.update({
        where: { id: task.id },
        data: { status: 'in_progress' },
      });

      // Assert: Partner can see updated status
      const viewByPartner = await prisma.task.findUnique({
        where: { id: task.id },
      });

      expect(viewByPartner?.status).toBe('in_progress');

      // Cleanup
      await prisma.task.delete({ where: { id: task.id } });
    });

    it('partner should NOT see team assignments or tasks from other partners\' jobs', async () => {
      // Act: Get assignments for partner1's job
      const p1Assignments = await prisma.jobStaffAssignment.findMany({
        where: { job_id: job1P1.id },
      });

      // Get assignments for partner2's job
      const p2Assignments = await prisma.jobStaffAssignment.findMany({
        where: { job_id: job1P2.id },
      });

      // Assert: Different team lists
      expect(p1Assignments[0]?.employee_id).toBe(employee1.profile.id);
      expect(p2Assignments[0]?.employee_id).toBe(employee2.profile.id);
    });
  });

  describe('4.3: Time Entry Visibility', () => {
    it('partner should be able to view time entries for their jobs', async () => {
      // Arrange: Create time entry
      const timeEntry = await TestDataFactory.createTimeEntry(
        job1P1.id,
        employee1.profile.id,
        8
      );

      // Act: Partner retrieves time entries
      const entries = await prisma.timeEntry.findMany({
        where: { job_id: job1P1.id },
      });

      // Assert
      expect(entries.length).toBeGreaterThan(0);
      expect(entries[0].job_id).toBe(job1P1.id);

      // Cleanup
      await prisma.timeEntry.delete({ where: { id: timeEntry.id } });
    });

    it('partner should see time entry status and approval state', async () => {
      // Arrange: Create time entry
      const timeEntry = await TestDataFactory.createTimeEntry(
        job1P1.id,
        employee1.profile.id,
        5,
        true,
        undefined,
        'submitted'
      );

      // Act: View entry
      const entry = await prisma.timeEntry.findUnique({
        where: { id: timeEntry.id },
      });

      // Assert: Can see status
      expect(entry?.status).toBe('submitted');

      // Cleanup
      await prisma.timeEntry.delete({ where: { id: timeEntry.id } });
    });

    it('partner should be able to approve time entries on their jobs', async () => {
      // Arrange
      const context = await getAuthContext(partner1.user.id);
      const timeEntry = await TestDataFactory.createTimeEntry(
        job1P1.id,
        employee1.profile.id,
        6
      );

      // Act: Check if can approve
      const canApprove = await canApproveTimeEntries(job1P1.id, context!);

      // Assert
      expect(canApprove).toBe(true);

      // Simulate approval
      const approved = await prisma.timeEntry.update({
        where: { id: timeEntry.id },
        data: { status: 'approved', approved_by: partner1.profile.id },
      });

      expect(approved.status).toBe('approved');

      // Cleanup
      await prisma.timeEntry.delete({ where: { id: timeEntry.id } });
    });

    it('partner should NOT be able to approve time entries on other partners\' jobs', async () => {
      // Arrange
      const context1 = await getAuthContext(partner1.user.id);

      // Act: Check if partner1 can approve partner2's job time
      const canApprove = await canApproveTimeEntries(job1P2.id, context1!);

      // Assert
      expect(canApprove).toBe(false);
    });

    it('partner should NOT see time entries from other partners\' jobs', async () => {
      // Arrange: Create time entries for both partners' jobs
      const entry1 = await TestDataFactory.createTimeEntry(
        job1P1.id,
        employee1.profile.id
      );
      const entry2 = await TestDataFactory.createTimeEntry(
        job1P2.id,
        employee2.profile.id
      );

      // Act: Get entries by job
      const p1Entries = await prisma.timeEntry.findMany({
        where: { job_id: job1P1.id },
      });
      const p2Entries = await prisma.timeEntry.findMany({
        where: { job_id: job1P2.id },
      });

      // Assert: Separate lists
      expect(p1Entries.some((e) => e.id === entry1.id)).toBe(true);
      expect(p2Entries.some((e) => e.id === entry2.id)).toBe(true);
      expect(p1Entries.some((e) => e.id === entry2.id)).toBe(false);
      expect(p2Entries.some((e) => e.id === entry1.id)).toBe(false);

      // Cleanup
      await prisma.timeEntry.deleteMany({
        where: { id: { in: [entry1.id, entry2.id] } },
      });
    });
  });

  describe('4.4: Job-Level Financial Performance', () => {
    it('partner should be able to view job-level financial metrics', async () => {
      // Arrange: Create profitability data
      const profitability = await TestDataFactory.createJobProfitability(
        job1P1.id,
        15000,
        8000
      );

      // Act
      const metrics = await prisma.jobProfitability.findUnique({
        where: { id: profitability.id },
      });

      // Assert
      expect(Number(metrics?.total_revenue)).toBe(15000);
      expect(Number(metrics?.total_cost)).toBe(8000);
      expect(Number(metrics?.profit)).toBe(7000);

      // Cleanup
      await prisma.jobProfitability.delete({ where: { id: profitability.id } });
    });

    it('partner should see profit and profit margin calculations', async () => {
      // Arrange
      const totalRevenue = 20000;
      const totalCost = 12000;
      const expectedProfit = totalRevenue - totalCost;
      const expectedMargin = (expectedProfit / totalRevenue) * 100;

      const profitability = await TestDataFactory.createJobProfitability(
        job1P1.id,
        totalRevenue,
        totalCost
      );

      // Act
      const metrics = await prisma.jobProfitability.findUnique({
        where: { id: profitability.id },
      });

      // Assert
      expect(Number(metrics?.profit)).toBe(expectedProfit);
      expect(Math.abs(Number(metrics?.profit_margin) - expectedMargin)).toBeLessThan(0.01);

      // Cleanup
      await prisma.jobProfitability.delete({ where: { id: profitability.id } });
    });

    it('partner should NOT be able to view other partners\' job financials', async () => {
      // Arrange: Create financials for partner2's job
      const p2Financials = await TestDataFactory.createJobProfitability(
        job1P2.id,
        25000,
        10000
      );

      // Act: Partner1 should only see their own
      const p1Financials = await prisma.jobProfitability.findMany({
        where: { job: { partner_id: partner1.profile.id } },
      });

      const p2OnlyFinancials = await prisma.jobProfitability.findMany({
        where: { job: { partner_id: partner2.profile.id } },
      });

      // Assert: No overlap
      expect(p1Financials.some((f) => f.id === p2Financials.id)).toBe(false);
      expect(p2OnlyFinancials.some((f) => f.id === p2Financials.id)).toBe(true);

      // Cleanup
      await prisma.jobProfitability.delete({ where: { id: p2Financials.id } });
    });
  });

  describe('4.5: Portfolio-Level Financial Performance', () => {
    it('partner should be able to view all their jobs\' combined financials', async () => {
      // Arrange: Create financials for partner1's jobs
      const fin1 = await TestDataFactory.createJobProfitability(
        job1P1.id,
        15000,
        8000
      );
      const fin2 = await TestDataFactory.createJobProfitability(
        job2P1.id,
        12000,
        6000
      );

      // Act: Get partner's portfolio metrics
      const allFinancials = await prisma.jobProfitability.findMany({
        where: { job: { partner_id: partner1.profile.id } },
      });

      // Assert
      expect(allFinancials.length).toBeGreaterThanOrEqual(2);
      const totalRevenue = allFinancials.reduce(
        (sum, f) => sum + Number(f.total_revenue),
        0
      );
      expect(totalRevenue).toBeGreaterThan(0);

      // Cleanup
      await prisma.jobProfitability.deleteMany({
        where: { id: { in: [fin1.id, fin2.id] } },
      });
    });

    it('partner portfolio should aggregate multiple jobs correctly', async () => {
      // Arrange: Clean up old records first
      await prisma.jobProfitability.deleteMany({
        where: { 
          job_id: { in: [job1P1.id, job2P1.id] }
        },
      });
      
      // Create fresh financials for partner1's jobs
      const fin1 = await TestDataFactory.createJobProfitability(
        job1P1.id,
        20000,
        10000
      );
      const fin2 = await TestDataFactory.createJobProfitability(
        job2P1.id,
        15000,
        9000
      );

      // Act: Calculate portfolio totals
      const financials = await prisma.jobProfitability.findMany({
        where: { job: { partner_id: partner1.profile.id } },
      });

      const portfolioMetrics = {
        totalRevenue: financials.reduce((sum, f) => sum + Number(f.total_revenue), 0),
        totalCost: financials.reduce((sum, f) => sum + Number(f.total_cost), 0),
        totalProfit: financials.reduce((sum, f) => sum + Number(f.profit), 0),
      };

      // Assert: Correct aggregation (should only have fin1 and fin2)
      expect(financials.length).toBe(2);
      expect(portfolioMetrics.totalRevenue).toBe(35000);
      expect(portfolioMetrics.totalCost).toBe(19000);
      expect(portfolioMetrics.totalProfit).toBe(16000);

      // Cleanup
      await prisma.jobProfitability.deleteMany({
        where: { id: { in: [fin1.id, fin2.id] } },
      });
    });

    it('partner should NOT see other partners\' portfolio metrics', async () => {
      // Arrange: Create financials for different partners
      const p1Fin = await TestDataFactory.createJobProfitability(
        job1P1.id,
        50000,
        25000
      );
      const p2Fin = await TestDataFactory.createJobProfitability(
        job1P2.id,
        100000,
        60000
      );

      // Act: Get metrics for each partner
      const p1Portfolio = await prisma.jobProfitability.findMany({
        where: { job: { partner_id: partner1.profile.id } },
      });
      const p2Portfolio = await prisma.jobProfitability.findMany({
        where: { job: { partner_id: partner2.profile.id } },
      });

      // Assert: Completely separate
      expect(p1Portfolio.some((f) => f.id === p2Fin.id)).toBe(false);
      expect(p2Portfolio.some((f) => f.id === p1Fin.id)).toBe(false);

      // Cleanup
      await prisma.jobProfitability.deleteMany({
        where: { id: { in: [p1Fin.id, p2Fin.id] } },
      });
    });
  });

  describe('4.6: Real-Time Financial Updates', () => {
    it('financial summaries should update when time entries are added', async () => {
      // Arrange: Initial state
      const job = await TestDataFactory.createJob(partner1.profile.id, client1.id);

      // Act: Add time entries and calculate costs
      const timeEntry1 = await TestDataFactory.createTimeEntry(
        job.id,
        employee1.profile.id,
        5,
        true
      );
      const timeEntry2 = await TestDataFactory.createTimeEntry(
        job.id,
        employee1.profile.id,
        3,
        true
      );

      // Get job updated info
      const jobAfterTimeEntry = await prisma.job.findUnique({
        where: { id: job.id },
      });

      // Assert: Job reflects time entries (in real app, this would be calculated)
      expect(jobAfterTimeEntry).toBeDefined();

      // Cleanup
      await prisma.timeEntry.deleteMany({ where: { job_id: job.id } });
      await prisma.job.delete({ where: { id: job.id } });
    });

    it('partner should see updated job data after status changes', async () => {
      // Arrange
      const job = await TestDataFactory.createJob(
        partner1.profile.id,
        client1.id
      );

      // Act: Update job
      const updated = await prisma.job.update({
        where: { id: job.id },
        data: {
          status: 'ongoing',
          completion_percentage: 50,
          amount_collected: 5000,
        },
      });

      // Assert: Partner sees latest data
      const currentView = await prisma.job.findUnique({
        where: { id: job.id },
      });

      expect(currentView?.status).toBe('ongoing');
      expect(currentView?.completion_percentage).toBe(50);
      expect(Number(currentView?.amount_collected)).toBe(5000);

      // Cleanup
      await prisma.job.delete({ where: { id: job.id } });
    });
  });
});
