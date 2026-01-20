/**
 * Report Generation Service
 * 
 * Generates reports in multiple formats:
 * - PDF reports (budget, revenue, evaluations)
 * - Excel exports (data tables with formatting)
 * - CSV downloads (analytics data)
 */

import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import { Readable } from 'stream';

interface ReportOptions {
  title?: string;
  dateRange?: {
    from: Date;
    to: Date;
  };
  includeCharts?: boolean;
  confidential?: boolean;
}

interface ChartData {
  labels: string[];
  datasets: {
    label: string;
    data: number[];
    color?: string;
  }[];
}

class ReportGenerationService {
  /**
   * Generate PDF Report
   */
  async generatePDFReport(data: any, options: ReportOptions = {}): Promise<Readable> {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: 'A4',
          margin: 40,
        });

        // Document metadata
        doc.title = options.title || 'Report';
        doc.author = 'BSC System';

        // Add confidential marking if needed
        if (options.confidential) {
          doc.fontSize(10)
            .text('CONFIDENTIAL', { align: 'center' })
            .moveDown();
        }

        // Title
        doc.fontSize(20)
          .font('Helvetica-Bold')
          .text(options.title || 'Report', { align: 'center' })
          .moveDown();

        // Date range
        if (options.dateRange) {
          const from = options.dateRange.from.toLocaleDateString();
          const to = options.dateRange.to.toLocaleDateString();
          doc.fontSize(10)
            .font('Helvetica')
            .text(`Period: ${from} to ${to}`, { align: 'center' })
            .moveDown(2);
        }

        // Generated date
        doc.fontSize(9)
          .text(`Generated: ${new Date().toLocaleString()}`, { align: 'right' })
          .moveDown(2);

        // Add content
        this.addPDFContent(doc, data);

        // Add footer on each page
        const pageCount = (doc as any).bufferedPageRange().count;
        for (let i = 0; i < pageCount; i++) {
          doc.switchToPage(i);
          doc.fontSize(8)
            .text(
              `Page ${i + 1} of ${pageCount}`,
              40,
              doc.page.height - 30,
              { align: 'center' }
            );
        }

        resolve(doc as any);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Generate Excel Export
   */
  async generateExcelExport(data: any, options: ReportOptions = {}): Promise<Buffer> {
    try {
      const workbook = new ExcelJS.Workbook();

      // Add title sheet
      const titleSheet = workbook.addWorksheet('Summary');
      titleSheet.columns = [
        { header: 'Report', width: 30 },
        { header: 'Value', width: 40 },
      ];

      titleSheet.addRow([options.title || 'Report', '']);
      titleSheet.addRow(['Generated', new Date().toLocaleString()]);
      if (options.dateRange) {
        titleSheet.addRow([
          'Period',
          `${options.dateRange.from.toLocaleDateString()} to ${options.dateRange.to.toLocaleDateString()}`,
        ]);
      }

      titleSheet.addRow(['', '']); // Blank row

      // Format title sheet
      titleSheet.getRow(1).font = { bold: true, size: 14 };
      titleSheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF4472C4' },
      };
      titleSheet.getRow(1).font = { color: { argb: 'FFFFFFFF' }, bold: true };

      // Add data sheets based on data type
      if (data.budget) {
        this.addBudgetSheet(workbook, data.budget);
      }
      if (data.revenue) {
        this.addRevenueSheet(workbook, data.revenue);
      }
      if (data.evaluations) {
        this.addEvaluationSheet(workbook, data.evaluations);
      }
      if (data.staffing) {
        this.addStaffingSheet(workbook, data.staffing);
      }

      // Write to buffer
      const buffer = await workbook.xlsx.writeBuffer();
      return buffer as Buffer;
    } catch (error) {
      throw new Error(`Excel generation failed: ${error}`);
    }
  }

  /**
   * Generate CSV Export
   */
  async generateCSVExport(data: any[], headers?: string[]): Promise<string> {
    try {
      if (!data || data.length === 0) {
        return '';
      }

      // Use provided headers or extract from first object
      const cols = headers || Object.keys(data[0]);

      // CSV header row
      let csv = cols.map((col) => this.escapeCSV(String(col))).join(',') + '\n';

      // Data rows
      for (const row of data) {
        csv += cols
          .map((col) => this.escapeCSV(String(row[col] || '')))
          .join(',') + '\n';
      }

      return csv;
    } catch (error) {
      throw new Error(`CSV generation failed: ${error}`);
    }
  }

  /**
   * Generate Budget Report (PDF-friendly)
   */
  getBudgetReportData(budgetData: any) {
    return {
      title: 'Budget Report',
      summary: {
        totalBudget: budgetData.total_budget,
        spent: budgetData.spent,
        available: budgetData.available_budget,
        utilization: `${((budgetData.spent / budgetData.total_budget) * 100).toFixed(2)}%`,
      },
      byCategory: budgetData.byCategory || [],
      recentTransactions: budgetData.transactions?.slice(0, 10) || [],
    };
  }

  /**
   * Generate Revenue Report
   */
  getRevenueReportData(revenueData: any) {
    return {
      title: 'Revenue Report',
      summary: {
        totalRevenue: revenueData.total,
        billable: revenueData.billable || 0,
        nonBillable: revenueData.non_billable || 0,
        variance: revenueData.variance || 0,
      },
      byType: revenueData.byType || [],
      monthlyTrend: revenueData.monthlyTrend || [],
    };
  }

  /**
   * Generate Evaluation Report
   */
  getEvaluationReportData(evaluationData: any) {
    return {
      title: 'Evaluation Report',
      summary: {
        averageScore: evaluationData.averageScore,
        totalEvaluations: evaluationData.count,
        ratingDistribution: evaluationData.ratingDistribution || {},
      },
      topPerformers: evaluationData.topPerformers || [],
      improvementAreas: evaluationData.improvementAreas || [],
    };
  }

  /**
   * Generate Staffing Report
   */
  getStaffingReportData(staffingData: any) {
    return {
      title: 'Staffing Report',
      summary: {
        totalAllocated: staffingData.totalAllocated,
        averageUtilization: staffingData.averageUtilization,
        underutilized: staffingData.underutilized?.length || 0,
        overallocated: staffingData.overallocated?.length || 0,
      },
      byEmployee: staffingData.byEmployee || [],
      resourceGaps: staffingData.gaps || [],
    };
  }

  // ==================== PRIVATE HELPERS ====================

  private addPDFContent(doc: PDFDocument, data: any) {
    // Summary section
    if (data.summary) {
      doc.fontSize(14)
        .font('Helvetica-Bold')
        .text('Summary', { underline: true })
        .moveDown();

      for (const [key, value] of Object.entries(data.summary)) {
        doc.fontSize(11)
          .font('Helvetica')
          .text(`${this.formatKey(key)}: ${value}`, { indent: 20 })
          .moveDown(0.5);
      }

      doc.moveDown();
    }

    // Details section
    if (data.details && Array.isArray(data.details)) {
      doc.fontSize(14)
        .font('Helvetica-Bold')
        .text('Details', { underline: true })
        .moveDown();

      this.addTableToPDF(doc, data.details);
      doc.moveDown();
    }

    // Charts section
    if (data.charts && Array.isArray(data.charts)) {
      doc.fontSize(14)
        .font('Helvetica-Bold')
        .text('Analytics', { underline: true })
        .moveDown();

      for (const chart of data.charts) {
        doc.fontSize(11)
          .font('Helvetica-Bold')
          .text(chart.title)
          .moveDown(0.5);
        // Note: PDFKit doesn't have native chart support
        // In production, you'd generate charts as images and embed them
        doc.text(`[Chart: ${chart.type}]`, { color: '999999' })
          .moveDown();
      }
    }
  }

  private addTableToPDF(doc: PDFDocument, data: any[]) {
    if (!data || data.length === 0) return;

    const headers = Object.keys(data[0]);
    const colWidth = 500 / headers.length;

    // Header row
    doc.fontSize(10).font('Helvetica-Bold');
    let x = 50;
    for (const header of headers) {
      doc.text(this.formatKey(header), x, doc.y, {
        width: colWidth,
        align: 'left',
      });
      x += colWidth;
    }
    doc.moveDown();

    // Data rows
    doc.font('Helvetica').fontSize(9);
    for (const row of data.slice(0, 20)) {
      x = 50;
      for (const header of headers) {
        const value = row[header] || '';
        doc.text(String(value), x, doc.y, {
          width: colWidth,
          align: 'left',
        });
        x += colWidth;
      }
      doc.moveDown(1.5);
    }
  }

  private addBudgetSheet(workbook: ExcelJS.Workbook, budget: any) {
    const sheet = workbook.addWorksheet('Budget');
    sheet.columns = [
      { header: 'Category', width: 20 },
      { header: 'Amount', width: 15 },
      { header: 'Percentage', width: 15 },
    ];

    if (budget.byCategory) {
      for (const category of budget.byCategory) {
        sheet.addRow([
          category.name,
          category.amount,
          `${category.percentage}%`,
        ]);
      }
    }
  }

  private addRevenueSheet(workbook: ExcelJS.Workbook, revenue: any) {
    const sheet = workbook.addWorksheet('Revenue');
    sheet.columns = [
      { header: 'Type', width: 15 },
      { header: 'Amount', width: 15 },
      { header: 'Percentage', width: 15 },
    ];

    if (revenue.byType) {
      for (const type of revenue.byType) {
        sheet.addRow([type.name, type.amount, `${type.percentage}%`]);
      }
    }
  }

  private addEvaluationSheet(workbook: ExcelJS.Workbook, evaluations: any) {
    const sheet = workbook.addWorksheet('Evaluations');
    sheet.columns = [
      { header: 'Employee', width: 20 },
      { header: 'Score', width: 10 },
      { header: 'Rating', width: 15 },
    ];

    if (Array.isArray(evaluations)) {
      for (const eval of evaluations) {
        sheet.addRow([eval.employeeName, eval.score, eval.rating]);
      }
    }
  }

  private addStaffingSheet(workbook: ExcelJS.Workbook, staffing: any) {
    const sheet = workbook.addWorksheet('Staffing');
    sheet.columns = [
      { header: 'Employee', width: 20 },
      { header: 'Job', width: 20 },
      { header: 'Allocation %', width: 15 },
    ];

    if (staffing.byEmployee) {
      for (const allocation of staffing.byEmployee) {
        sheet.addRow([
          allocation.employeeName,
          allocation.jobName,
          allocation.percentage,
        ]);
      }
    }
  }

  private formatKey(key: string): string {
    return key
      .replace(/([A-Z])/g, ' $1')
      .replace(/_/g, ' ')
      .trim()
      .split(' ')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  private escapeCSV(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }
}

export default new ReportGenerationService();
