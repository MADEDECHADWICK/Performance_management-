// Stub FinancialService - to be implemented
export class FinancialService {
  static async calculatePartnerPortfolioMetrics(partnerId: number) {
    return { total: 0, jobs: [], revenue: 0 };
  }

  static async getPartnerJobsWithMetrics(partnerId: number) {
    return [];
  }

  static async calculateJobMetrics(jobId: number) {
    return { totalHours: 0, totalCost: 0, billableAmount: 0 };
  }

  static async getJobTeamUtilization(jobId: number) {
    return [];
  }

  static async getPendingTimeEntries(jobId: number) {
    return [];
  }

  static async updateJobFinancials(jobId: number) {
    return null;
  }

  static async approveTimeEntries(timeEntryIds: number[], approverId: number) {
    return null;
  }
}
