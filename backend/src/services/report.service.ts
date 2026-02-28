/**
 * Report generation service aligned to current TypeScript types.
 */

import PDFDocument from "pdfkit";
import ExcelJS from "exceljs";
import { Readable } from "stream";

interface ReportOptions {
  title?: string;
  dateRange?: {
    from: Date;
    to: Date;
  };
  includeCharts?: boolean;
  confidential?: boolean;
}

class ReportGenerationService {
  async generatePDFReport(data: any, options: ReportOptions = {}): Promise<Readable> {
    const doc = new PDFDocument({ size: "A4", margin: 40 });

    doc.info.Title = options.title || "Report";
    doc.info.Author = "BSC System";

    doc.fontSize(18).font("Helvetica-Bold").text(options.title || "Report");
    doc.moveDown();

    if (options.dateRange) {
      doc
        .fontSize(10)
        .font("Helvetica")
        .text(
          `Period: ${options.dateRange.from.toLocaleDateString()} - ${options.dateRange.to.toLocaleDateString()}`
        );
      doc.moveDown();
    }

    if (options.confidential) {
      doc.fontSize(10).fillColor("red").text("CONFIDENTIAL");
      doc.fillColor("black");
      doc.moveDown();
    }

    const lines = this.stringifyData(data);
    lines.forEach((line) => {
      doc.fontSize(10).font("Helvetica").text(line);
    });

    doc.end();
    return doc as unknown as Readable;
  }

  async generateExcelExport(data: any, options: ReportOptions = {}): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const summarySheet = workbook.addWorksheet("Summary");

    summarySheet.columns = [
      { header: "Field", key: "field", width: 30 },
      { header: "Value", key: "value", width: 50 },
    ];

    summarySheet.addRow({ field: "Title", value: options.title || "Report" });
    summarySheet.addRow({ field: "Generated", value: new Date().toISOString() });
    if (options.dateRange) {
      summarySheet.addRow({
        field: "Period",
        value: `${options.dateRange.from.toISOString()} to ${options.dateRange.to.toISOString()}`,
      });
    }

    this.flattenRows(data).forEach((row) => summarySheet.addRow(row));

    if (data?.budget) {
      this.addBudgetSheet(workbook, data.budget);
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  }

  async generateCSVExport(data: any[], headers?: string[]): Promise<string> {
    if (!Array.isArray(data) || data.length === 0) return "";

    const resolvedHeaders =
      headers && headers.length > 0 ? headers : Object.keys(data[0] || {});

    const escape = (value: unknown) => {
      const text = String(value ?? "");
      if (text.includes(",") || text.includes('"') || text.includes("\n")) {
        return `"${text.replace(/"/g, '""')}"`;
      }
      return text;
    };

    const lines = [
      resolvedHeaders.join(","),
      ...data.map((item) => resolvedHeaders.map((header) => escape(item?.[header])).join(",")),
    ];
    return lines.join("\n");
  }

  getBudgetReportData(budgetData: any) {
    return {
      summary: {
        totalBudget: Number(budgetData?.total_budget || budgetData?.totalBudget || 0),
        spent: Number(budgetData?.spent || 0),
        available: Number(budgetData?.available_budget || budgetData?.available || 0),
      },
      byCategory: budgetData?.byCategory || [],
      recentTransactions: budgetData?.transactions?.slice(0, 10) || [],
    };
  }

  getRevenueReportData(revenueData: any) {
    return {
      summary: {
        totalRevenue: Number(revenueData?.total_revenue || revenueData?.totalRevenue || 0),
        collected: Number(revenueData?.collected || 0),
        outstanding: Number(revenueData?.outstanding || 0),
      },
      byMonth: revenueData?.byMonth || [],
      byClient: revenueData?.byClient || [],
    };
  }

  getEvaluationReportData(evaluationData: any) {
    return {
      summary: {
        totalEvaluations: Number(
          evaluationData?.total_evaluations || evaluationData?.totalEvaluations || 0
        ),
        averageScore: Number(evaluationData?.average_score || evaluationData?.averageScore || 0),
      },
      byDepartment: evaluationData?.byDepartment || [],
      byEvaluatorType: evaluationData?.byEvaluatorType || [],
    };
  }

  getStaffingReportData(staffingData: any) {
    return {
      summary: {
        totalStaff: Number(staffingData?.total_staff || staffingData?.totalStaff || 0),
        activeAssignments: Number(
          staffingData?.active_assignments || staffingData?.activeAssignments || 0
        ),
      },
      byDepartment: staffingData?.byDepartment || [],
      byRole: staffingData?.byRole || [],
    };
  }

  private stringifyData(data: unknown, prefix = ""): string[] {
    if (data === null || data === undefined) return [`${prefix}N/A`];

    if (Array.isArray(data)) {
      if (!data.length) return [`${prefix}[]`];
      return data.flatMap((item, index) => this.stringifyData(item, `${prefix}[${index}] `));
    }

    if (typeof data === "object") {
      return Object.entries(data as Record<string, unknown>).flatMap(([key, value]) =>
        this.stringifyData(value, `${prefix}${key}: `)
      );
    }

    return [`${prefix}${String(data)}`];
  }

  private flattenRows(data: any): Array<{ field: string; value: string }> {
    if (!data || typeof data !== "object") return [];
    return Object.entries(data).map(([field, value]) => ({
      field,
      value: typeof value === "string" ? value : JSON.stringify(value),
    }));
  }

  private addBudgetSheet(workbook: ExcelJS.Workbook, budget: any) {
    const sheet = workbook.addWorksheet("Budget");
    sheet.columns = [
      { header: "Category", key: "category", width: 25 },
      { header: "Value", key: "value", width: 20 },
    ];

    sheet.addRow({ category: "Total Budget", value: budget?.total_budget || budget?.totalBudget || 0 });
    sheet.addRow({ category: "Spent", value: budget?.spent || 0 });
    sheet.addRow({ category: "Available", value: budget?.available_budget || budget?.available || 0 });

    const categories = Array.isArray(budget?.byCategory) ? budget.byCategory : [];
    categories.forEach((category: any) => {
      sheet.addRow({
        category: category?.name || category?.category || "Other",
        value: category?.amount || category?.value || 0,
      });
    });
  }
}

export default new ReportGenerationService();
