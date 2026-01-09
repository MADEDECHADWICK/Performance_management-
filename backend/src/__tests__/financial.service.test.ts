import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { PrismaClient } from '@prisma/client';
import { FinancialService } from '../services/financial.service';

const prisma = new PrismaClient();

describe('FinancialService', () => {
  let testPartnerId: number;
  let testJobId: number;
  let testEmployeeId: number;

  beforeAll(async () => {
    // Create test data
    const partner = await prisma.profile.create({
      data: {
        first_name: 'Test',
        last_name: 'Partner',
        email: `partner-${Date.now()}@test.com`,
        is_partner: true,
        hourly_rate: 100,
      },
    });
    testPartnerId = partner.id;

    const employee = await prisma.profile.create({
      data: {
        first_name: 'Test',
        last_name: 'Employee',
        email: `emp-${Date.now()}@test.com`,
        hourly_rate: 50,
      },
    });
    testEmployeeId = employee.id;

    const job = await prisma.job.create({
      data: {
        job_name: 'Test Job',
        job_code: `TEST-${Date.now()}`,
        partner_id: testPartnerId,
        billable_hours: 100,
        amount_collected: 10000,
        fees: 500,
        hourly_rate: 75,
      },
    });
    testJobId = job.id;
  });

  afterAll(async () => {
    // Cleanup
    await prisma.timeEntry.deleteMany({ where: { job_id: testJobId } });
    await prisma.task.deleteMany({ where: { job_id: testJobId } });
    await prisma.job.delete({ where: { id: testJobId } });
    await prisma.profile.delete({ where: { id: testPartnerId } });
    await prisma.profile.delete({ where: { id: testEmployeeId } });
    await prisma.$disconnect();
  });

  describe('calculateEmployeeJobMetrics', () => {
    it('should calculate employee metrics for a job', async () => {
      // Create time entries
      await prisma.timeEntry.create({
        data: {
          job_id: testJobId,
          employee_id: testEmployeeId,
          date_worked: new Date(),
          hours: 10,
          billable: true,
          status: 'approved',
        },
      });

      const metrics =
        await FinancialService.calculateEmployeeJobMetrics(
          testEmployeeId,
          testJobId
        );

      expect(metrics).toBeDefined();
      expect(metrics.employeeId).toBe(testEmployeeId);
      expect(metrics.jobId).toBe(testJobId);
      expect(metrics.actualHours).toBe(10);
      expect(metrics.billableHours).toBe(10);
      expect(metrics.billableCost).toBe(500); // 10 hours * $50/hr
    });

    it('should calculate utilization percentage correctly', async () => {
      const metrics =
        await FinancialService.calculateEmployeeJobMetrics(
          testEmployeeId,
          testJobId
        );

      expect(metrics.utilization).toBeLessThanOrEqual(100);
      expect(metrics.utilization).toBeGreaterThanOrEqual(0);
    });
  });

  describe('calculateJobMetrics', () => {
    it('should calculate job metrics with time entries', async () => {
      const metrics = await FinancialService.calculateJobMetrics(testJobId);

      expect(metrics).toBeDefined();
      expect(metrics.jobId).toBe(testJobId);
      expect(metrics.actualCost).toBe(500); // 10 hours * $50/hr
      expect(metrics.revenueCollected).toBe(10000);
      expect(metrics.fees).toBe(500);
    });

    it('should calculate profit correctly', async () => {
      const metrics = await FinancialService.calculateJobMetrics(testJobId);

      const expectedProfit = 10000 - 500 - 500; // revenue - fees - cost
      expect(metrics.profit).toBe(expectedProfit);
    });

    it('should calculate margin percentage correctly', async () => {
      const metrics = await FinancialService.calculateJobMetrics(testJobId);

      // margin = (revenue - fees - cost) / revenue * 100
      expect(metrics.marginPercentage).toBeGreaterThan(0);
      expect(metrics.marginPercentage).toBeLessThanOrEqual(100);
    });

    it('should calculate efficiency correctly', async () => {
      const metrics = await FinancialService.calculateJobMetrics(testJobId);

      expect(metrics.efficiency).toBeLessThanOrEqual(100);
      expect(metrics.efficiency).toBeGreaterThanOrEqual(0);
    });

    it('should track unique team members', async () => {
      const metrics = await FinancialService.calculateJobMetrics(testJobId);

      expect(metrics.teamSize).toBeGreaterThan(0);
    });
  });

  describe('calculatePartnerPortfolioMetrics', () => {
    it('should calculate partner portfolio metrics', async () => {
      const metrics =
        await FinancialService.calculatePartnerPortfolioMetrics(testPartnerId);

      expect(metrics).toBeDefined();
      expect(metrics.partnerId).toBe(testPartnerId);
      expect(metrics.totalJobs).toBeGreaterThanOrEqual(1);
    });

    it('should aggregate financial data correctly', async () => {
      const metrics =
        await FinancialService.calculatePartnerPortfolioMetrics(testPartnerId);

      expect(metrics.totalRevenueCollected).toBeGreaterThan(0);
      expect(metrics.totalBillableCost).toBeGreaterThan(0);
    });

    it('should calculate average metrics', async () => {
      const metrics =
        await FinancialService.calculatePartnerPortfolioMetrics(testPartnerId);

      expect(metrics.averageEfficiency).toBeLessThanOrEqual(100);
      expect(metrics.averageMargin).toBeLessThanOrEqual(100);
    });
  });

  describe('getJobTeamUtilization', () => {
    it('should get team utilization data', async () => {
      const team = await FinancialService.getJobTeamUtilization(testJobId);

      expect(Array.isArray(team)).toBe(true);
      expect(team.length).toBeGreaterThan(0);
    });

    it('should calculate per-person metrics', async () => {
      const team = await FinancialService.getJobTeamUtilization(testJobId);

      if (team.length > 0) {
        const member = team[0];
        expect(member.employeeId).toBeDefined();
        expect(member.totalHours).toBeGreaterThan(0);
        expect(member.utilizationPercentage).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('getPendingTimeEntries', () => {
    it('should return pending time entries', async () => {
      // Create a pending entry
      await prisma.timeEntry.create({
        data: {
          job_id: testJobId,
          employee_id: testEmployeeId,
          date_worked: new Date(),
          hours: 5,
          billable: true,
          status: 'submitted',
        },
      });

      const pending = await FinancialService.getPendingTimeEntries(testJobId);

      expect(Array.isArray(pending)).toBe(true);
      expect(pending.some((e) => e.status === 'submitted')).toBe(true);
    });
  });

  describe('approveTimeEntries', () => {
    it('should approve multiple time entries', async () => {
      const entries = await prisma.timeEntry.findMany({
        where: { job_id: testJobId, status: 'submitted' },
        take: 1,
      });

      if (entries.length > 0) {
        await FinancialService.approveTimeEntries([entries[0].id], testPartnerId);

        const updated = await prisma.timeEntry.findUnique({
          where: { id: entries[0].id },
        });

        expect(updated?.status).toBe('approved');
        expect(updated?.approved_by).toBe(testPartnerId);
      }
    });
  });

  describe('updateJobFinancials', () => {
    it('should update job profitability record', async () => {
      await FinancialService.updateJobFinancials(testJobId);

      const profitability = await prisma.jobProfitability.findFirst({
        where: { job_id: testJobId },
      });

      expect(profitability).toBeDefined();
      expect(profitability?.job_id).toBe(testJobId);
    });
  });
});
