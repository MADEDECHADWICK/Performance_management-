"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FinancialService = void 0;
// Stub FinancialService - to be implemented
class FinancialService {
    static async calculatePartnerPortfolioMetrics(partnerId) {
        return { total: 0, jobs: [], revenue: 0 };
    }
    static async getPartnerJobsWithMetrics(partnerId) {
        return [];
    }
    static async calculateJobMetrics(jobId) {
        return { totalHours: 0, totalCost: 0, billableAmount: 0 };
    }
    static async getJobTeamUtilization(jobId) {
        return [];
    }
    static async getPendingTimeEntries(jobId) {
        return [];
    }
    static async updateJobFinancials(jobId) {
        return null;
    }
    static async approveTimeEntries(timeEntryIds, approverId) {
        return null;
    }
}
exports.FinancialService = FinancialService;
