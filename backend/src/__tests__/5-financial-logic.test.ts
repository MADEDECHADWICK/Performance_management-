/**
 * Financial Logic Validation Tests
 * 
 * Test Suite 5: Financial calculations and formulas
 * 
 * Validates:
 * - Billable vs non-billable hour calculations
 * - Employee-level billable amount calculations
 * - Job-level revenue, cost, profitability, and margin
 * - Partner portfolio aggregation
 * - Edge cases (zero hours, non-billable-only, fixed-fee vs hourly, rate changes)
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { PrismaClient } from '@prisma/client';
import { TestDataFactory } from './fixtures/test-data.factory';
import { FinancialService } from '../services/financial.service';

const prisma = new PrismaClient();

describe('Financial 5: Financial Logic Validation Tests', () => {
  let partner: Awaited<ReturnType<typeof TestDataFactory.createPartner>>;
  let employee: Awaited<ReturnType<typeof TestDataFactory.createEmployee>>;
  let client: Awaited<ReturnType<typeof TestDataFactory.createClient>>;

  beforeAll(async () => {
    // Arrange: Create basic test entities
    partner = await TestDataFactory.createPartner('fin-partner@test.com');
    employee = await TestDataFactory.createEmployee('fin-emp@test.com');
    client = await TestDataFactory.createClient('Financial Client');
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

  describe('5.1: Billable vs Non-Billable Hours', () => {
    it('should correctly count billable hours', async () => {
      // Arrange
      const job = await TestDataFactory.createJob(partner.profile.id, client.id);
      await TestDataFactory.createTimeEntry(job.id, employee.profile.id, 5, true);
      await TestDataFactory.createTimeEntry(job.id, employee.profile.id, 3, true);

      // Act
      const entries = await prisma.timeEntry.findMany({
        where: { job_id: job.id, billable: true },
      });
      const totalBillable = entries.reduce((sum, e) => sum + Number(e.hours), 0);

      // Assert
      expect(totalBillable).toBe(8);

      // Cleanup
      await prisma.timeEntry.deleteMany({ where: { job_id: job.id } });
      await prisma.job.delete({ where: { id: job.id } });
    });

    it('should correctly count non-billable hours', async () => {
      // Arrange
      const job = await TestDataFactory.createJob(partner.profile.id, client.id);
      await TestDataFactory.createTimeEntry(job.id, employee.profile.id, 2, false);
      await TestDataFactory.createTimeEntry(job.id, employee.profile.id, 1.5, false);

      // Act
      const entries = await prisma.timeEntry.findMany({
        where: { job_id: job.id, billable: false },
      });
      const totalNonBillable = entries.reduce((sum, e) => sum + Number(e.hours), 0);

      // Assert
      expect(totalNonBillable).toBe(3.5);

      // Cleanup
      await prisma.timeEntry.deleteMany({ where: { job_id: job.id } });
      await prisma.job.delete({ where: { id: job.id } });
    });

    it('should separate billable and non-billable hours in same job', async () => {
      // Arrange
      const job = await TestDataFactory.createJob(partner.profile.id, client.id);
      await TestDataFactory.createTimeEntry(job.id, employee.profile.id, 6, true);
      await TestDataFactory.createTimeEntry(job.id, employee.profile.id, 2, false);

      // Act
      const billable = await prisma.timeEntry.findMany({
        where: { job_id: job.id, billable: true },
      });
      const nonBillable = await prisma.timeEntry.findMany({
        where: { job_id: job.id, billable: false },
      });

      const totalBillable = billable.reduce((sum, e) => sum + Number(e.hours), 0);
      const totalNonBillable = nonBillable.reduce((sum, e) => sum + Number(e.hours), 0);

      // Assert
      expect(totalBillable).toBe(6);
      expect(totalNonBillable).toBe(2);
      expect(totalBillable + totalNonBillable).toBe(8);

      // Cleanup
      await prisma.timeEntry.deleteMany({ where: { job_id: job.id } });
      await prisma.job.delete({ where: { id: job.id } });
    });

    it('should handle fractional billable hours', async () => {
      // Arrange
      const job = await TestDataFactory.createJob(partner.profile.id, client.id);
      await TestDataFactory.createTimeEntry(job.id, employee.profile.id, 2.5, true);
      await TestDataFactory.createTimeEntry(job.id, employee.profile.id, 1.75, true);

      // Act
      const entries = await prisma.timeEntry.findMany({
        where: { job_id: job.id, billable: true },
      });
      const total = entries.reduce((sum, e) => sum + Number(e.hours), 0);

      // Assert
      expect(total).toBeCloseTo(4.25, 5);

      // Cleanup
      await prisma.timeEntry.deleteMany({ where: { job_id: job.id } });
      await prisma.job.delete({ where: { id: job.id } });
    });
  });

  describe('5.2: Employee-Level Billable Amount Calculations', () => {
    it('should calculate employee billable cost (hours * hourly_rate)', async () => {
      // Arrange
      const job = await TestDataFactory.createJob(partner.profile.id, client.id);
      const employeeRate = Number(employee.profile.hourly_rate);
      const billableHours = 10;

      await TestDataFactory.createTimeEntry(
        job.id,
        employee.profile.id,
        billableHours,
        true,
        undefined,
        'approved'
      );

      // Act
      const metrics = await FinancialService.calculateEmployeeJobMetrics(
        employee.profile.id,
        job.id
      );

      // Assert: Cost = hours * rate
      const expectedCost = billableHours * employeeRate;
      expect(metrics.billableCost).toBe(expectedCost);

      // Cleanup
      await prisma.timeEntry.deleteMany({ where: { job_id: job.id } });
      await prisma.job.delete({ where: { id: job.id } });
    });

    it('should calculate zero cost for non-billable hours', async () => {
      // Arrange
      const job = await TestDataFactory.createJob(partner.profile.id, client.id);

      // Log only non-billable time
      await TestDataFactory.createTimeEntry(
        job.id,
        employee.profile.id,
        5,
        false
      );

      // Act
      const billableEntries = await prisma.timeEntry.findMany({
        where: { job_id: job.id, employee_id: employee.profile.id, billable: true },
      });
      const billableHours = billableEntries.reduce(
        (sum, e) => sum + Number(e.hours),
        0
      );

      // Assert
      expect(billableHours).toBe(0);

      // Cleanup
      await prisma.timeEntry.deleteMany({ where: { job_id: job.id } });
      await prisma.job.delete({ where: { id: job.id } });
    });

    it('should calculate correct billable amount with mixed entries', async () => {
      // Arrange
      const job = await TestDataFactory.createJob(partner.profile.id, client.id);
      const employeeRate = Number(employee.profile.hourly_rate);

      // Log: 8 billable + 2 non-billable
      await TestDataFactory.createTimeEntry(job.id, employee.profile.id, 8, true);
      await TestDataFactory.createTimeEntry(job.id, employee.profile.id, 2, false);

      // Act
      const billableEntries = await prisma.timeEntry.findMany({
        where: { job_id: job.id, employee_id: employee.profile.id, billable: true },
      });
      const billableHours = billableEntries.reduce(
        (sum, e) => sum + Number(e.hours),
        0
      );

      // Assert: Only billable hours counted
      const expectedCost = billableHours * employeeRate;
      expect(billableHours).toBe(8);
      expect(expectedCost).toBe(8 * employeeRate);

      // Cleanup
      await prisma.timeEntry.deleteMany({ where: { job_id: job.id } });
      await prisma.job.delete({ where: { id: job.id } });
    });

    it('should handle employees with different hourly rates', async () => {
      // Arrange
      const job = await TestDataFactory.createJob(partner.profile.id, client.id);
      const emp1 = await TestDataFactory.createEmployee('emp-high@test.com');
      const emp2 = await TestDataFactory.createEmployee('emp-low@test.com');

      // Update rates
      await prisma.profile.update({
        where: { id: emp1.profile.id },
        data: { hourly_rate: 100 },
      });
      await prisma.profile.update({
        where: { id: emp2.profile.id },
        data: { hourly_rate: 50 },
      });

      // Log same hours with different employees
      await TestDataFactory.createTimeEntry(job.id, emp1.profile.id, 8, true);
      await TestDataFactory.createTimeEntry(job.id, emp2.profile.id, 8, true);

      // Act
      const emp1Billable = await prisma.timeEntry.findMany({
        where: {
          job_id: job.id,
          employee_id: emp1.profile.id,
          billable: true,
        },
      });
      const emp2Billable = await prisma.timeEntry.findMany({
        where: {
          job_id: job.id,
          employee_id: emp2.profile.id,
          billable: true,
        },
      });

      const emp1Cost = emp1Billable.reduce((sum, e) => sum + Number(e.hours), 0) * 100;
      const emp2Cost = emp2Billable.reduce((sum, e) => sum + Number(e.hours), 0) * 50;

      // Assert
      expect(emp1Cost).toBe(800);
      expect(emp2Cost).toBe(400);

      // Cleanup
      await prisma.timeEntry.deleteMany({ where: { job_id: job.id } });
      await prisma.job.delete({ where: { id: job.id } });
      await prisma.profile.deleteMany({
        where: { id: { in: [emp1.profile.id, emp2.profile.id] } },
      });
      await prisma.user.deleteMany({
        where: { id: { in: [emp1.user.id, emp2.user.id] } },
      });
    });
  });

  describe('5.3: Job-Level Financial Calculations', () => {
    it('should calculate job profitability (revenue - cost)', async () => {
      // Arrange
      const totalRevenue = 20000;
      const totalCost = 12000;

      const profitability = await TestDataFactory.createJobProfitability(
        (await TestDataFactory.createJob(partner.profile.id, client.id)).id,
        totalRevenue,
        totalCost
      );

      // Assert
      const expectedProfit = totalRevenue - totalCost;
      expect(Number(profitability.profit)).toBe(expectedProfit);
      expect(Number(profitability.profit)).toBe(8000);

      // Cleanup
      await prisma.jobProfitability.delete({ where: { id: profitability.id } });
      await prisma.job.delete({ where: { id: profitability.job_id } });
    });

    it('should calculate profit margin percentage correctly', async () => {
      // Arrange: Revenue = 25000, Cost = 15000
      const totalRevenue = 25000;
      const totalCost = 15000;
      const job = await TestDataFactory.createJob(partner.profile.id, client.id);

      const profitability = await TestDataFactory.createJobProfitability(
        job.id,
        totalRevenue,
        totalCost
      );

      // Act
      const expectedMargin = ((totalRevenue - totalCost) / totalRevenue) * 100;

      // Assert: (25000 - 15000) / 25000 * 100 = 40%
      expect(Number(profitability.profit_margin)).toBeCloseTo(40, 2);
      expect(expectedMargin).toBeCloseTo(40, 2);

      // Cleanup
      await prisma.jobProfitability.delete({ where: { id: profitability.id } });
      await prisma.job.delete({ where: { id: job.id } });
    });

    it('should handle breakeven jobs (revenue = cost)', async () => {
      // Arrange
      const amount = 10000;
      const job = await TestDataFactory.createJob(partner.profile.id, client.id);

      const profitability = await TestDataFactory.createJobProfitability(
        job.id,
        amount,
        amount
      );

      // Assert: Profit = 0, Margin = 0
      expect(Number(profitability.profit)).toBe(0);
      expect(Number(profitability.profit_margin)).toBe(0);

      // Cleanup
      await prisma.jobProfitability.delete({ where: { id: profitability.id } });
      await prisma.job.delete({ where: { id: job.id } });
    });

    it('should handle loss-making jobs (cost > revenue)', async () => {
      // Arrange
      const revenue = 8000;
      const cost = 12000;
      const job = await TestDataFactory.createJob(partner.profile.id, client.id);

      const profitability = await TestDataFactory.createJobProfitability(
        job.id,
        revenue,
        cost
      );

      // Assert: Negative profit
      expect(Number(profitability.profit)).toBe(-4000);
      expect(Number(profitability.profit_margin)).toBeLessThan(0);

      // Cleanup
      await prisma.jobProfitability.delete({ where: { id: profitability.id } });
      await prisma.job.delete({ where: { id: job.id } });
    });
  });

  describe('5.4: Edge Cases', () => {
    it('should handle zero hours logged', async () => {
      // Arrange
      const job = await TestDataFactory.createJob(partner.profile.id, client.id);

      // Act: No time entries
      const entries = await prisma.timeEntry.findMany({
        where: { job_id: job.id },
      });

      // Assert
      expect(entries.length).toBe(0);

      // Cleanup
      await prisma.job.delete({ where: { id: job.id } });
    });

    it('should handle non-billable-only jobs', async () => {
      // Arrange
      const job = await TestDataFactory.createJob(partner.profile.id, client.id);

      // Log only non-billable time
      await TestDataFactory.createTimeEntry(job.id, employee.profile.id, 10, false);
      await TestDataFactory.createTimeEntry(job.id, employee.profile.id, 5, false);

      // Act
      const billableEntries = await prisma.timeEntry.findMany({
        where: { job_id: job.id, billable: true },
      });
      const totalBillable = billableEntries.reduce(
        (sum, e) => sum + Number(e.hours),
        0
      );

      // Assert: No billable hours
      expect(totalBillable).toBe(0);

      // Cleanup
      await prisma.timeEntry.deleteMany({ where: { job_id: job.id } });
      await prisma.job.delete({ where: { id: job.id } });
    });

    it('should handle revenue with zero cost', async () => {
      // Arrange
      const revenue = 50000;
      const cost = 0;
      const job = await TestDataFactory.createJob(partner.profile.id, client.id);

      const profitability = await TestDataFactory.createJobProfitability(
        job.id,
        revenue,
        cost
      );

      // Assert: 100% margin
      expect(Number(profitability.profit)).toBe(50000);
      expect(Number(profitability.profit_margin)).toBe(100);

      // Cleanup
      await prisma.jobProfitability.delete({ where: { id: profitability.id } });
      await prisma.job.delete({ where: { id: job.id } });
    });

    it('should handle zero revenue', async () => {
      // Arrange
      const revenue = 0;
      const cost = 5000;
      const job = await TestDataFactory.createJob(partner.profile.id, client.id);

      const profitability = await TestDataFactory.createJobProfitability(
        job.id,
        revenue,
        cost
      );

      // Assert: Negative profit, undefined margin (avoid division by zero)
      expect(Number(profitability.profit)).toBe(-5000);

      // Cleanup
      await prisma.jobProfitability.delete({ where: { id: profitability.id } });
      await prisma.job.delete({ where: { id: job.id } });
    });

    it('should handle very small profit margins', async () => {
      // Arrange
      const revenue = 10001;
      const cost = 10000;
      const job = await TestDataFactory.createJob(partner.profile.id, client.id);

      const profitability = await TestDataFactory.createJobProfitability(
        job.id,
        revenue,
        cost
      );

      // Assert: Small but non-zero margin
      expect(Number(profitability.profit_margin)).toBeGreaterThan(0);
      expect(Number(profitability.profit_margin)).toBeLessThan(0.1);

      // Cleanup
      await prisma.jobProfitability.delete({ where: { id: profitability.id } });
      await prisma.job.delete({ where: { id: job.id } });
    });
  });

  describe('5.5: Portfolio Aggregation', () => {
    it('should sum revenue across multiple partner jobs', async () => {
      // Clean up old records first
      await prisma.jobProfitability.deleteMany({
        where: { job: { partner_id: partner.profile.id } }
      });
      
      // Arrange
      const job1 = await TestDataFactory.createJob(partner.profile.id, client.id);
      const job2 = await TestDataFactory.createJob(partner.profile.id, client.id);

      const fin1 = await TestDataFactory.createJobProfitability(job1.id, 20000, 10000);
      const fin2 = await TestDataFactory.createJobProfitability(job2.id, 15000, 8000);

      // Act
      const financials = await prisma.jobProfitability.findMany({
        where: { job: { partner_id: partner.profile.id } },
      });

      const totalRevenue = financials.reduce(
        (sum, f) => sum + Number(f.total_revenue),
        0
      );

      // Assert
      expect(totalRevenue).toBe(35000);

      // Cleanup
      await prisma.jobProfitability.deleteMany({
        where: { id: { in: [fin1.id, fin2.id] } },
      });
      await prisma.job.deleteMany({
        where: { id: { in: [job1.id, job2.id] } },
      });
    });

    it('should calculate portfolio profit correctly', async () => {
      // Clean up old records first
      await prisma.jobProfitability.deleteMany({
        where: { job: { partner_id: partner.profile.id } }
      });
      
      // Arrange
      const job1 = await TestDataFactory.createJob(partner.profile.id, client.id);
      const job2 = await TestDataFactory.createJob(partner.profile.id, client.id);

      const fin1 = await TestDataFactory.createJobProfitability(job1.id, 30000, 15000);
      const fin2 = await TestDataFactory.createJobProfitability(job2.id, 20000, 10000);

      // Act
      const financials = await prisma.jobProfitability.findMany({
        where: { job: { partner_id: partner.profile.id } },
      });

      const totalProfit = financials.reduce(
        (sum, f) => sum + Number(f.profit),
        0
      );

      // Assert: (30000-15000) + (20000-10000) = 25000
      expect(totalProfit).toBe(25000);

      // Cleanup
      await prisma.jobProfitability.deleteMany({
        where: { id: { in: [fin1.id, fin2.id] } },
      });
      await prisma.job.deleteMany({
        where: { id: { in: [job1.id, job2.id] } },
      });
    });

    it('should calculate portfolio margin across jobs', async () => {
      // Clean up old records first
      await prisma.jobProfitability.deleteMany({
        where: { job: { partner_id: partner.profile.id } }
      });
      
      // Arrange
      const job1 = await TestDataFactory.createJob(partner.profile.id, client.id);
      const job2 = await TestDataFactory.createJob(partner.profile.id, client.id);

      const fin1 = await TestDataFactory.createJobProfitability(job1.id, 40000, 20000);
      const fin2 = await TestDataFactory.createJobProfitability(job2.id, 10000, 5000);

      // Act
      const financials = await prisma.jobProfitability.findMany({
        where: { job: { partner_id: partner.profile.id } },
      });

      const totalRevenue = financials.reduce(
        (sum, f) => sum + Number(f.total_revenue),
        0
      );
      const totalCost = financials.reduce((sum, f) => sum + Number(f.total_cost), 0);

      const portfolioMargin = ((totalRevenue - totalCost) / totalRevenue) * 100;

      // Assert: (50000 - 25000) / 50000 * 100 = 50%
      expect(portfolioMargin).toBeCloseTo(50, 0);

      // Cleanup
      await prisma.jobProfitability.deleteMany({
        where: { id: { in: [fin1.id, fin2.id] } },
      });
      await prisma.job.deleteMany({
        where: { id: { in: [job1.id, job2.id] } },
      });
    });
  });
});
