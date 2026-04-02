import { api } from "./client";
import type { BalancedScorecardWorkspace, WorkspaceRole, WorkspaceStatusTone } from "./performanceFramework";

export type ReportingTab =
  | "summary"
  | "client_summary"
  | "job_reports"
  | "timesheets"
  | "productivity"
  | "bsc_tracking";

export type ReportingMetricTone = "neutral" | "positive" | "warning" | "danger";

export interface ReportingWorkspace {
  generatedAt: string;
  effectiveRole: WorkspaceRole;
  visibleTabs: ReportingTab[];
  scope: {
    title: string;
    description: string;
    roleLabel: string;
  };
  cards: Array<{
    label: string;
    value: string;
    hint: string;
    tone: ReportingMetricTone;
  }>;
  clientSummary: {
    rows: Array<{
      clientId: number;
      clientName: string;
      jobs: number;
      budgetFee: number;
      billableAmount: number;
      nonBillableHours: number;
      nonBillableCost: number;
      amountCollected: number;
      remainingBalance: number;
      profit: number;
      loss: number;
      status: WorkspaceStatusTone;
    }>;
  };
  jobReports: {
    rows: Array<{
      jobId: number;
      job: string;
      jobCode: string | null;
      client: string;
      department: string;
      manager: string;
      partner: string;
      status: string;
      budgetFee: number;
      billableAmount: number;
      billableHours: number;
      nonBillableHours: number;
      amountCollected: number;
      remainingBalance: number;
      profit: number;
      loss: number;
      utilizationPercent: number;
      collectionStage: string;
    }>;
  };
  timesheets: {
    rows: Array<{
      employeeId: number;
      employeeName: string;
      department: string;
      manager: string;
      totalHours: number;
      billableHours: number;
      nonBillableHours: number;
      billableAmount: number;
      approvalCount: number;
      utilizationPercent: number;
      lastWorkedAt: string | null;
    }>;
  };
  productivity: {
    rows: Array<{
      jobId: number;
      job: string;
      client: string;
      employeeName: string;
      category: string;
      staff: string;
      budgetFee: number;
      billableHours: number;
      nonBillableHours: number;
      billableAmount: number;
      amountCollected: number;
      remainingBalance: number;
      profit: number;
      loss: number;
    }>;
  };
  bscTracking: {
    workspaceRole: WorkspaceRole;
    perspectiveCards: BalancedScorecardWorkspace["perspectiveCards"];
    topKpis: BalancedScorecardWorkspace["kpis"];
    initiatives: BalancedScorecardWorkspace["cascadeInitiatives"];
    employeeContributions: BalancedScorecardWorkspace["employeeContributions"];
    evaluationSummary: BalancedScorecardWorkspace["evaluationSummary"];
  };
  specializedSurface: null | {
    title: string;
    description: string;
    cards: Array<{
      title: string;
      description: string;
      path: string;
      metric: string;
      metricHint: string;
    }>;
  };
}

const reportingAPI = {
  getWorkspace: async (filters?: {
    from?: string;
    to?: string;
    evaluationCycleId?: number;
    profileId?: number;
  }): Promise<ReportingWorkspace> => {
    const params = new URLSearchParams();
    if (filters?.from) params.set("from", filters.from);
    if (filters?.to) params.set("to", filters.to);
    if (filters?.evaluationCycleId) params.set("evaluationCycleId", String(filters.evaluationCycleId));
    if (filters?.profileId) params.set("profileId", String(filters.profileId));
    const query = params.toString();
    return api.get(`/reporting/workspace${query ? `?${query}` : ""}`);
  },
};

export default reportingAPI;
