/**
 * Phase 6 Backend Enhancement Controller
 * 
 * Handles real-time notifications, report generation/export,
 * and analytics aggregation endpoints
 */

import { Request, Response } from 'express';
import reportService from '../services/report.service';
import jobsService from '../services/background-jobs.service';
import cacheService from '../services/cache.service';
import websocketService from '../services/websocket.service';
import prisma from '../lib/prisma';

class Phase6Controller {
  /**
   * ==================== REPORT EXPORTS ====================
   */

  /**
   * Export budget report as PDF
   */
  async exportBudgetReportPDF(req: Request, res: Response) {
    try {
      const { departmentId, startDate, endDate } = req.query;
      const auth = (req as any).auth;

      // Authorization: admin, manager, finance
      if (!['admin', 'manager', 'finance'].includes(auth.roleName)) {
        return res.status(403).json({ message: 'Forbidden' });
      }

      // Fetch budget data
      const budgetData = await prisma.budget.findMany({
        where: {
          ...(departmentId && { departmentId: String(departmentId) }),
          created_at: {
            gte: startDate ? new Date(String(startDate)) : undefined,
            lte: endDate ? new Date(String(endDate)) : undefined,
          },
        },
        include: { Job: true },
      });

      const reportData = reportService.getBudgetReportData({
        total_budget: budgetData.reduce((sum, b) => sum + b.total_budget, 0),
        spent: budgetData.reduce((sum, b) => sum + b.spent, 0),
        available_budget: budgetData.reduce((sum, b) => sum + b.available_budget, 0),
        byCategory: this.groupByCategory(budgetData),
        transactions: budgetData.slice(0, 10),
      });

      const doc = await reportService.generatePDFReport(reportData, {
        title: 'Budget Report',
        dateRange: {
          from: startDate ? new Date(String(startDate)) : new Date(),
          to: endDate ? new Date(String(endDate)) : new Date(),
        },
      });

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="budget-report.pdf"');
      doc.pipe(res);
    } catch (error) {
      console.error('Budget PDF export error:', error);
      res.status(500).json({ message: 'Report generation failed' });
    }
  }

  /**
   * Export budget report as Excel
   */
  async exportBudgetReportExcel(req: Request, res: Response) {
    try {
      const { departmentId, startDate, endDate } = req.query;
      const auth = (req as any).auth;

      if (!['admin', 'manager', 'finance'].includes(auth.roleName)) {
        return res.status(403).json({ message: 'Forbidden' });
      }

      const budgetData = await prisma.budget.findMany({
        where: {
          ...(departmentId && { departmentId: String(departmentId) }),
        },
      });

      const buffer = await reportService.generateExcelExport(
        { budget: budgetData },
        { title: 'Budget Report' }
      );

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="budget-report.xlsx"');
      res.send(buffer);
    } catch (error) {
      console.error('Budget Excel export error:', error);
      res.status(500).json({ message: 'Export failed' });
    }
  }

  /**
   * Export revenue report as PDF
   */
  async exportRevenueReportPDF(req: Request, res: Response) {
    try {
      const { departmentId, startDate, endDate } = req.query;
      const auth = (req as any).auth;

      if (!['admin', 'manager', 'finance'].includes(auth.roleName)) {
        return res.status(403).json({ message: 'Forbidden' });
      }

      const revenueData = await prisma.revenue.findMany({
        where: {
          created_at: {
            gte: startDate ? new Date(String(startDate)) : undefined,
            lte: endDate ? new Date(String(endDate)) : undefined,
          },
        },
      });

      const reportData = reportService.getRevenueReportData({
        total: revenueData.reduce((sum, r) => sum + r.amount, 0),
        byType: this.groupByRevenueType(revenueData),
      });

      const doc = await reportService.generatePDFReport(reportData, {
        title: 'Revenue Report',
      });

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="revenue-report.pdf"');
      doc.pipe(res);
    } catch (error) {
      console.error('Revenue PDF export error:', error);
      res.status(500).json({ message: 'Report generation failed' });
    }
  }

  /**
   * Export evaluations as CSV
   */
  async exportEvaluationsCSV(req: Request, res: Response) {
    try {
      const { cycleId } = req.query;
      const auth = (req as any).auth;

      if (!['admin', 'manager', 'analyst'].includes(auth.roleName)) {
        return res.status(403).json({ message: 'Forbidden' });
      }

      const evaluations = await prisma.evaluation.findMany({
        where: {
          ...(cycleId && { evaluationCycleId: String(cycleId) }),
        },
        include: { Profile: true },
      });

      const csvData = evaluations.map((e) => ({
        evaluationId: e.id,
        employeeId: e.employeeId,
        employeeName: (e as any).Profile?.first_name,
        averageScore: e.average_score,
        rating: e.rating,
        status: e.status,
        submittedAt: e.submitted_at,
      }));

      const csv = await reportService.generateCSVExport(csvData);

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="evaluations.csv"');
      res.send(csv);
    } catch (error) {
      console.error('Evaluations CSV export error:', error);
      res.status(500).json({ message: 'Export failed' });
    }
  }

  /**
   * ==================== REPORT GENERATION JOBS ====================
   */

  /**
   * Queue report generation
   */
  async queueReportGeneration(req: Request, res: Response) {
    try {
      const { reportType, recipients, format, dateRange } = req.body;
      const auth = (req as any).auth;

      if (!['admin', 'manager'].includes(auth.roleName)) {
        return res.status(403).json({ message: 'Forbidden' });
      }

      const jobId = await jobsService.queueReport(
        reportType,
        recipients,
        format || 'pdf',
        dateRange
      );

      res.json({
        success: true,
        message: 'Report generation queued',
        jobId,
        statusCode: 202,
      });
    } catch (error) {
      console.error('Queue report error:', error);
      res.status(500).json({ message: 'Failed to queue report' });
    }
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(req: Request, res: Response) {
    try {
      const auth = (req as any).auth;

      if (!['admin', 'analyst'].includes(auth.roleName)) {
        return res.status(403).json({ message: 'Forbidden' });
      }

      const stats = await jobsService.getAllQueueStats();

      res.json({
        success: true,
        data: stats,
        statusCode: 200,
      });
    } catch (error) {
      console.error('Queue stats error:', error);
      res.status(500).json({ message: 'Failed to fetch queue stats' });
    }
  }

  /**
   * ==================== REAL-TIME NOTIFICATIONS ====================
   */

  /**
   * Get WebSocket connection status
   */
  getWebSocketStatus(req: Request, res: Response) {
    const io = websocketService.getIO();
    const isConnected = io !== null;

    res.json({
      success: true,
      data: {
        connected: isConnected,
        connectedUsers: websocketService.getConnectedUsersCount(),
      },
      statusCode: 200,
    });
  }

  /**
   * Emit budget alert (Admin only)
   */
  async emitBudgetAlert(req: Request, res: Response) {
    try {
      const { jobId, departmentId, utilization, threshold, severity } = req.body;
      const auth = (req as any).auth;

      if (auth.roleName !== 'admin') {
        return res.status(403).json({ message: 'Admin only' });
      }

      websocketService.broadcastBudgetAlert({
        jobId,
        departmentId,
        utilization,
        threshold,
        severity,
        message: `Budget utilization at ${utilization}%`,
      });

      res.json({
        success: true,
        message: 'Budget alert broadcasted',
        statusCode: 200,
      });
    } catch (error) {
      console.error('Emit alert error:', error);
      res.status(500).json({ message: 'Failed to emit alert' });
    }
  }

  /**
   * Send system announcement
   */
  async sendSystemAnnouncement(req: Request, res: Response) {
    try {
      const { title, message, priority } = req.body;
      const auth = (req as any).auth;

      if (auth.roleName !== 'admin') {
        return res.status(403).json({ message: 'Admin only' });
      }

      websocketService.broadcastSystemAnnouncement(title, message, priority || 'medium');

      res.json({
        success: true,
        message: 'Announcement sent',
        statusCode: 200,
      });
    } catch (error) {
      console.error('System announcement error:', error);
      res.status(500).json({ message: 'Failed to send announcement' });
    }
  }

  /**
   * ==================== ANALYTICS AGGREGATION ====================
   */

  /**
   * Get KPI trend analysis (time-series)
   */
  async getKPITrends(req: Request, res: Response) {
    try {
      const { employeeId, monthCount = 12 } = req.query;
      const auth = (req as any).auth;

      // Check cache first
      const cacheKey = `kpi-trends:${employeeId}:${monthCount}`;
      const cached = await cacheService.get(cacheKey, 'analytics');
      if (cached) {
        return res.json({
          success: true,
          data: cached,
          statusCode: 200,
        });
      }

      const kpis = await prisma.kpi.findMany({
        where: { employeeId: String(employeeId) },
        orderBy: { created_at: 'asc' },
        take: parseInt(String(monthCount)),
      });

      const trends = this.calculateTrends(kpis);

      // Cache for 1 hour
      await cacheService.set(cacheKey, trends, {
        ttl: 3600,
        prefix: 'analytics',
      });

      res.json({
        success: true,
        data: trends,
        statusCode: 200,
      });
    } catch (error) {
      console.error('KPI trends error:', error);
      res.status(500).json({ message: 'Failed to fetch trends' });
    }
  }

  /**
   * Get performance comparison across employees
   */
  async getPerformanceComparison(req: Request, res: Response) {
    try {
      const { departmentId, metricType = 'average_score' } = req.query;
      const auth = (req as any).auth;

      if (!['admin', 'manager', 'analyst'].includes(auth.roleName)) {
        return res.status(403).json({ message: 'Forbidden' });
      }

      const cacheKey = `perf-comparison:${departmentId}:${metricType}`;
      const cached = await cacheService.get(cacheKey, 'analytics');
      if (cached) {
        return res.json({
          success: true,
          data: cached,
          statusCode: 200,
        });
      }

      const evaluations = await prisma.evaluation.findMany({
        where: {
          Profile: {
            departmentId: String(departmentId),
          },
        },
        include: { Profile: true },
        orderBy: { average_score: 'desc' },
      });

      const comparison = evaluations.map((e) => ({
        employeeName: (e as any).Profile?.first_name,
        employeeId: e.employeeId,
        score: e.average_score,
        rating: e.rating,
      }));

      await cacheService.set(cacheKey, comparison, {
        ttl: 1800,
        prefix: 'analytics',
      });

      res.json({
        success: true,
        data: comparison,
        statusCode: 200,
      });
    } catch (error) {
      console.error('Performance comparison error:', error);
      res.status(500).json({ message: 'Failed to fetch comparison' });
    }
  }

  /**
   * Get budget variance analysis
   */
  async getBudgetVarianceAnalysis(req: Request, res: Response) {
    try {
      const { departmentId, period = '3months' } = req.query;
      const auth = (req as any).auth;

      if (!['admin', 'manager', 'finance'].includes(auth.roleName)) {
        return res.status(403).json({ message: 'Forbidden' });
      }

      const budgets = await prisma.budget.findMany({
        where: { departmentId: String(departmentId) },
      });

      const variance = this.calculateVariance(budgets);

      res.json({
        success: true,
        data: variance,
        statusCode: 200,
      });
    } catch (error) {
      console.error('Variance analysis error:', error);
      res.status(500).json({ message: 'Failed to fetch variance' });
    }
  }

  /**
   * Get revenue forecast (next 6 months)
   */
  async getRevenueForecast(req: Request, res: Response) {
    try {
      const { departmentId } = req.query;
      const auth = (req as any).auth;

      if (!['admin', 'finance', 'analyst'].includes(auth.roleName)) {
        return res.status(403).json({ message: 'Forbidden' });
      }

      const revenue = await prisma.revenue.findMany({
        where: { departmentId: String(departmentId) },
        orderBy: { created_at: 'desc' },
        take: 12,
      });

      const forecast = this.predictForecast(revenue);

      res.json({
        success: true,
        data: forecast,
        statusCode: 200,
      });
    } catch (error) {
      console.error('Forecast error:', error);
      res.status(500).json({ message: 'Failed to fetch forecast' });
    }
  }

  /**
   * Get dashboard aggregated metrics
   */
  async getDashboardMetrics(req: Request, res: Response) {
    try {
      const auth = (req as any).auth;

      const metrics = {
        budgetUtilization: await this.calculateBudgetUtilization(auth),
        revenueStatus: await this.calculateRevenueStatus(auth),
        evaluationStatus: await this.calculateEvaluationStatus(auth),
        staffingUtilization: await this.calculateStaffingUtilization(auth),
      };

      res.json({
        success: true,
        data: metrics,
        statusCode: 200,
      });
    } catch (error) {
      console.error('Dashboard metrics error:', error);
      res.status(500).json({ message: 'Failed to fetch metrics' });
    }
  }

  // ==================== PRIVATE HELPERS ====================

  private groupByCategory(data: any[]) {
    return Object.values(
      data.reduce((acc: any, item) => {
        const cat = item.category || 'Other';
        if (!acc[cat]) acc[cat] = { name: cat, amount: 0, count: 0 };
        acc[cat].amount += item.spent;
        acc[cat].count++;
        return acc;
      }, {})
    );
  }

  private groupByRevenueType(data: any[]) {
    return Object.values(
      data.reduce((acc: any, item) => {
        const type = item.type || 'billable';
        if (!acc[type]) acc[type] = { name: type, amount: 0 };
        acc[type].amount += item.amount;
        return acc;
      }, {})
    );
  }

  private calculateTrends(kpis: any[]) {
    return {
      data: kpis,
      average: kpis.reduce((sum, k) => sum + k.achievement, 0) / kpis.length,
      trend: kpis.length > 1
        ? ((kpis[kpis.length - 1].achievement - kpis[0].achievement) / kpis[0].achievement) * 100
        : 0,
    };
  }

  private calculateVariance(budgets: any[]) {
    const total = budgets.reduce((sum, b) => sum + b.total_budget, 0);
    const spent = budgets.reduce((sum, b) => sum + b.spent, 0);
    const variance = total - spent;
    return {
      total,
      spent,
      variance,
      variancePercentage: (variance / total) * 100,
    };
  }

  private predictForecast(revenue: any[]) {
    if (revenue.length === 0) return [];
    const avg = revenue.reduce((sum, r) => sum + r.amount, 0) / revenue.length;
    return Array.from({ length: 6 }, (_, i) => ({
      month: i + 1,
      forecast: avg * (1 + (Math.random() - 0.5) * 0.1),
    }));
  }

  private async calculateBudgetUtilization(auth: any) {
    const budgets = await prisma.budget.findMany();
    const total = budgets.reduce((sum, b) => sum + b.total_budget, 0);
    const spent = budgets.reduce((sum, b) => sum + b.spent, 0);
    return { total, spent, utilization: (spent / total) * 100 };
  }

  private async calculateRevenueStatus(auth: any) {
    const revenue = await prisma.revenue.findMany();
    return { total: revenue.reduce((sum, r) => sum + r.amount, 0) };
  }

  private async calculateEvaluationStatus(auth: any) {
    const evaluations = await prisma.evaluation.findMany();
    return { completed: evaluations.filter((e) => e.status === 'approved').length };
  }

  private async calculateStaffingUtilization(auth: any) {
    const staffing = await prisma.jobStaffing.findMany();
    return {
      total: staffing.length,
      overallocated: staffing.filter((s) => s.allocation_percentage > 100).length,
    };
  }
}

export default new Phase6Controller();
