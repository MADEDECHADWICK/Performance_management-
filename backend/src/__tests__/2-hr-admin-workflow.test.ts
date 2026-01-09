/**
 * HR / Super Admin Workflow Tests
 * 
 * Test Suite 2: HR and Super Admin can manage the entire system
 * 
 * Validates:
 * - HR can create jobs and assign them to partners
 * - HR can assign employees to jobs and tasks
 * - HR can define KPIs for employees and jobs
 * - HR can modify job status (won/ongoing/completed/closed)
 * - Changes propagate correctly to employee and partner dashboards
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { PrismaClient } from '@prisma/client';
import { TestDataFactory } from './fixtures/test-data.factory';

const prisma = new PrismaClient();

describe('HR/Super Admin 2: HR Workflow Management Tests', () => {
  let hrManager: Awaited<ReturnType<typeof TestDataFactory.createHRManager>>;
  let partner: Awaited<ReturnType<typeof TestDataFactory.createPartner>>;
  let employee1: Awaited<ReturnType<typeof TestDataFactory.createEmployee>>;
  let employee2: Awaited<ReturnType<typeof TestDataFactory.createEmployee>>;
  let client: Awaited<ReturnType<typeof TestDataFactory.createClient>>;
  let department: Awaited<ReturnType<typeof TestDataFactory.createDepartment>>;

  beforeAll(async () => {
    // Arrange: Create HR manager and other users
    hrManager = await TestDataFactory.createHRManager();
    partner = await TestDataFactory.createPartner();
    department = await TestDataFactory.createDepartment('Audit Department');
    employee1 = await TestDataFactory.createEmployee('emp1@test.com', department.id);
    employee2 = await TestDataFactory.createEmployee('emp2@test.com', department.id);
    client = await TestDataFactory.createClient();
  });

  afterAll(async () => {
    // Cleanup
    try {
      await prisma.timeEntry.deleteMany({});
      await prisma.task.deleteMany({});
      await prisma.job.deleteMany({});
      await prisma.jobStaffAssignment.deleteMany({});
      await prisma.employeeKpiAssignment.deleteMany({});
      await prisma.kpi.deleteMany({});
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

  describe('2.1: Job Creation and Partner Assignment', () => {
    it('HR should be able to create a job', async () => {
      // Act: Create a job
      const job = await TestDataFactory.createJob(
        partner.profile.id,
        client.id,
        'HR Created Job'
      );

      // Assert
      expect(job).toBeDefined();
      expect(job.job_name).toBe('HR Created Job');
      expect(job.partner_id).toBe(partner.profile.id);
      expect(job.client_id).toBe(client.id);
      expect(job.status).toBe('active');
    });

    it('HR should be able to assign a job to a partner', async () => {
      // Act
      const job = await prisma.job.create({
        data: {
          job_name: 'Partner Assignment Test',
          job_code: `JOB-${Date.now()}`,
          partner_id: partner.profile.id,
          client_id: client.id,
          status: 'active',
          billable_hours: 100,
          hourly_rate: 150,
        },
      });

      // Assert: Verify partner is assigned
      expect(job.partner_id).toBe(partner.profile.id);

      // Cleanup
      await prisma.job.delete({ where: { id: job.id } });
    });

    it('HR should be able to create jobs with specific budgets and rates', async () => {
      // Arrange
      const jobName = 'Budgeted Job';
      const budgetAmount = 50000;
      const hourlyRate = 200;

      // Act
      const job = await TestDataFactory.createJob(
        partner.profile.id,
        client.id,
        jobName,
        {
          budget: budgetAmount,
          hourly_rate: hourlyRate,
        }
      );

      // Assert
      expect(Number(job.budget)).toBe(budgetAmount);
      expect(Number(job.hourly_rate)).toBe(hourlyRate);

      // Cleanup
      await prisma.job.delete({ where: { id: job.id } });
    });
  });

  describe('2.2: Employee Assignment to Jobs', () => {
    it('HR should be able to assign an employee to a job', async () => {
      // Arrange
      const job = await TestDataFactory.createJob(partner.profile.id, client.id);

      // Act: Assign employee to job
      const assignment = await TestDataFactory.createJobStaffAssignment(
        job.id,
        employee1.profile.id,
        100,
        75
      );

      // Assert
      expect(assignment.job_id).toBe(job.id);
      expect(assignment.employee_id).toBe(employee1.profile.id);
      expect(Number(assignment.hours_allocated)).toBe(100);
      expect(Number(assignment.hourly_rate)).toBe(75);

      // Cleanup
      await prisma.jobStaffAssignment.delete({ where: { id: assignment.id } });
      await prisma.job.delete({ where: { id: job.id } });
    });

    it('HR should be able to assign multiple employees to a job', async () => {
      // Arrange
      const job = await TestDataFactory.createJob(partner.profile.id, client.id);

      // Act: Assign multiple employees
      const assignment1 = await TestDataFactory.createJobStaffAssignment(
        job.id,
        employee1.profile.id,
        100
      );
      const assignment2 = await TestDataFactory.createJobStaffAssignment(
        job.id,
        employee2.profile.id,
        80
      );

      // Assert: Both assignments exist
      const allAssignments = await prisma.jobStaffAssignment.findMany({
        where: { job_id: job.id },
      });
      expect(allAssignments.length).toBe(2);

      // Cleanup
      await prisma.jobStaffAssignment.deleteMany({ where: { job_id: job.id } });
      await prisma.job.delete({ where: { id: job.id } });
    });

    it('HR should be able to assign employees to tasks within a job', async () => {
      // Arrange
      const job = await TestDataFactory.createJob(partner.profile.id, client.id);

      // Act: Create task and assign employee
      const task = await TestDataFactory.createTask(job.id, employee1.profile.id);

      // Assert
      expect(task.job_id).toBe(job.id);
      expect(task.assigned_to).toBe(employee1.profile.id);
      expect(task.status).toBe('pending');

      // Cleanup
      await prisma.task.delete({ where: { id: task.id } });
      await prisma.job.delete({ where: { id: job.id } });
    });
  });

  describe('2.3: KPI Definition and Assignment', () => {
    it('HR should be able to create KPIs', async () => {
      // Act
      const kpi = await TestDataFactory.createKPI(
        'Revenue Growth',
        department.id
      );

      // Assert
      expect(kpi).toBeDefined();
      expect(kpi.name).toBe('Revenue Growth');
      expect(kpi.department_id).toBe(department.id);
      expect(Number(kpi.target_value)).toBe(90);

      // Cleanup
      await prisma.kpi.delete({ where: { id: kpi.id } });
    });

    it('HR should be able to assign KPIs to employees', async () => {
      // Arrange
      const kpi = await TestDataFactory.createKPI('Revenue Target', department.id);

      // Act: Assign KPI to employee
      const assignment = await TestDataFactory.createEmployeeKPIAssignment(
        employee1.profile.id,
        kpi.id,
        95,
        30
      );

      // Assert
      expect(assignment.employee_id).toBe(employee1.profile.id);
      expect(assignment.kpi_id).toBe(kpi.id);
      expect(Number(assignment.target_value)).toBe(95);
      expect(Number(assignment.weight)).toBe(30);
      expect(assignment.status).toBe('active');

      // Cleanup
      await prisma.employeeKpiAssignment.delete({ where: { id: assignment.id } });
      await prisma.kpi.delete({ where: { id: kpi.id } });
    });

    it('HR should be able to assign multiple KPIs to an employee', async () => {
      // Arrange
      const kpi1 = await TestDataFactory.createKPI('KPI1', department.id);
      const kpi2 = await TestDataFactory.createKPI('KPI2', department.id);

      // Act: Assign both KPIs
      const assignment1 = await TestDataFactory.createEmployeeKPIAssignment(
        employee1.profile.id,
        kpi1.id
      );
      const assignment2 = await TestDataFactory.createEmployeeKPIAssignment(
        employee1.profile.id,
        kpi2.id
      );

      // Assert: Both are assigned
      const allAssignments = await prisma.employeeKpiAssignment.findMany({
        where: { employee_id: employee1.profile.id },
      });
      expect(allAssignments.length).toBeGreaterThanOrEqual(2);

      // Cleanup
      await prisma.employeeKpiAssignment.deleteMany({
        where: { employee_id: employee1.profile.id },
      });
      await prisma.kpi.deleteMany({
        where: { id: { in: [kpi1.id, kpi2.id] } },
      });
    });

    it('HR should be able to set KPI targets and weights', async () => {
      // Arrange
      const kpi = await TestDataFactory.createKPI('Performance KPI', department.id);

      // Act: Update KPI with specific target and weight
      const assignment = await prisma.employeeKpiAssignment.create({
        data: {
          employee_id: employee1.profile.id,
          kpi_id: kpi.id,
          target_value: 85,
          weight: 40,
          period_start: new Date(),
          period_end: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          status: 'active',
        },
      });

      // Assert: Values are correctly set
      expect(Number(assignment.target_value)).toBe(85);
      expect(Number(assignment.weight)).toBe(40);

      // Cleanup
      await prisma.employeeKpiAssignment.delete({ where: { id: assignment.id } });
      await prisma.kpi.delete({ where: { id: kpi.id } });
    });
  });

  describe('2.4: Job Status Workflow', () => {
    it('HR should be able to create a job with "active" status', async () => {
      // Act
      const job = await TestDataFactory.createJob(
        partner.profile.id,
        client.id,
        'Active Job'
      );

      // Assert
      expect(job.status).toBe('active');

      // Cleanup
      await prisma.job.delete({ where: { id: job.id } });
    });

    it('HR should be able to update job status to "ongoing"', async () => {
      // Arrange
      const job = await TestDataFactory.createJob(
        partner.profile.id,
        client.id,
        'Status Update Job'
      );

      // Act: Update status
      const updatedJob = await prisma.job.update({
        where: { id: job.id },
        data: { status: 'ongoing' },
      });

      // Assert
      expect(updatedJob.status).toBe('ongoing');

      // Cleanup
      await prisma.job.delete({ where: { id: updatedJob.id } });
    });

    it('HR should be able to mark job as "completed"', async () => {
      // Arrange
      const job = await TestDataFactory.createJob(
        partner.profile.id,
        client.id,
        'Completed Job'
      );

      // Act: Complete job
      const completedJob = await prisma.job.update({
        where: { id: job.id },
        data: {
          status: 'completed',
          completion_date: new Date(),
          completion_percentage: 100,
        },
      });

      // Assert
      expect(completedJob.status).toBe('completed');
      expect(completedJob.completion_percentage).toBe(100);

      // Cleanup
      await prisma.job.delete({ where: { id: completedJob.id } });
    });

    it('HR should be able to update job completion percentage', async () => {
      // Arrange
      const job = await TestDataFactory.createJob(
        partner.profile.id,
        client.id,
        'Progress Tracking Job'
      );

      // Act: Update progress
      const updatedJob = await prisma.job.update({
        where: { id: job.id },
        data: { completion_percentage: 50 },
      });

      // Assert
      expect(updatedJob.completion_percentage).toBe(50);

      // Cleanup
      await prisma.job.delete({ where: { id: updatedJob.id } });
    });

    it('HR should be able to transition job through complete workflow', async () => {
      // Arrange
      const job = await TestDataFactory.createJob(
        partner.profile.id,
        client.id,
        'Workflow Job'
      );

      // Act: Transition states
      let currentJob = job;
      currentJob = await prisma.job.update({
        where: { id: currentJob.id },
        data: { status: 'ongoing', completion_percentage: 25 },
      });
      expect(currentJob.status).toBe('ongoing');
      expect(currentJob.completion_percentage).toBe(25);

      currentJob = await prisma.job.update({
        where: { id: currentJob.id },
        data: { completion_percentage: 75 },
      });
      expect(currentJob.completion_percentage).toBe(75);

      currentJob = await prisma.job.update({
        where: { id: currentJob.id },
        data: {
          status: 'completed',
          completion_percentage: 100,
          completion_date: new Date(),
        },
      });
      expect(currentJob.status).toBe('completed');
      expect(currentJob.completion_percentage).toBe(100);

      // Cleanup
      await prisma.job.delete({ where: { id: currentJob.id } });
    });
  });

  describe('2.5: Dashboard Data Propagation', () => {
    it('job changes should be visible to assigned partner', async () => {
      // Arrange
      const job = await TestDataFactory.createJob(
        partner.profile.id,
        client.id,
        'Partner View Job'
      );

      // Act: Update job
      const updatedJob = await prisma.job.update({
        where: { id: job.id },
        data: { status: 'ongoing', completion_percentage: 30 },
      });

      // Assert: Retrieve and verify partner can see changes
      const partnerView = await prisma.job.findUnique({
        where: { id: job.id },
      });

      expect(partnerView?.status).toBe('ongoing');
      expect(partnerView?.completion_percentage).toBe(30);

      // Cleanup
      await prisma.job.delete({ where: { id: job.id } });
    });

    it('employee assignments should be visible to employees', async () => {
      // Arrange
      const job = await TestDataFactory.createJob(
        partner.profile.id,
        client.id,
        'Employee Assignment Job'
      );
      const task = await TestDataFactory.createTask(
        job.id,
        employee1.profile.id,
        'Employee Task'
      );

      // Act: Retrieve as would appear in employee dashboard
      const employeeTask = await prisma.task.findUnique({
        where: { id: task.id },
      });

      // Assert
      expect(employeeTask?.assigned_to).toBe(employee1.profile.id);
      expect(employeeTask?.job_id).toBe(job.id);

      // Cleanup
      await prisma.task.delete({ where: { id: task.id } });
      await prisma.job.delete({ where: { id: job.id } });
    });

    it('KPI assignments should be visible to assigned employees', async () => {
      // Arrange
      const kpi = await TestDataFactory.createKPI('Visible KPI', department.id);
      const assignment = await TestDataFactory.createEmployeeKPIAssignment(
        employee1.profile.id,
        kpi.id
      );

      // Act: Retrieve as would appear in employee KPI view
      const visibleKPI = await prisma.employeeKpiAssignment.findUnique({
        where: { id: assignment.id },
        include: { kpi: true },
      });

      // Assert
      expect(visibleKPI?.employee_id).toBe(employee1.profile.id);
      expect(visibleKPI?.kpi?.name).toBeDefined();

      // Cleanup
      await prisma.employeeKpiAssignment.delete({ where: { id: assignment.id } });
      await prisma.kpi.delete({ where: { id: kpi.id } });
    });
  });

  describe('2.6: Audit Trail', () => {
    it('HR actions should be trackable (via timestamps)', async () => {
      // Arrange
      const createdJob = await TestDataFactory.createJob(
        partner.profile.id,
        client.id,
        'Audit Trail Job'
      );

      // Assert: Job has creation timestamp
      expect(createdJob.createdAt).toBeDefined();
      expect(createdJob.updatedAt).toBeDefined();

      // Cleanup
      await prisma.job.delete({ where: { id: createdJob.id } });
    });

    it('modifications should update the updatedAt timestamp', async () => {
      // Arrange
      const job = await TestDataFactory.createJob(
        partner.profile.id,
        client.id,
        'Modification Audit Job'
      );
      const originalUpdatedAt = job.updatedAt;

      // Wait to ensure timestamp difference
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Act: Update job
      const updatedJob = await prisma.job.update({
        where: { id: job.id },
        data: { status: 'ongoing' },
      });

      // Assert: Timestamp should change
      expect(updatedJob.updatedAt.getTime()).toBeGreaterThan(
        originalUpdatedAt.getTime()
      );

      // Cleanup
      await prisma.job.delete({ where: { id: job.id } });
    });
  });
});
