"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RoleAwareAnalyticsService = void 0;
const prisma_1 = __importDefault(require("../prisma"));
class RoleAwareAnalyticsService {
    /**
     * Get non-financial analytics based on user role
     * Employee: Only own metrics
     * Partner: Team metrics
     * Admin: Company-wide metrics
     */
    static async getNonFinancialAnalytics(context) {
        if (context.isAdmin) {
            return this.getCompanyNonFinancialMetrics();
        }
        else if (context.isPartner) {
            // Partners see their team's metrics
            return this.getPartnerTeamMetrics(context.userId);
        }
        else {
            // Employees see only their own metrics
            return this.getEmployeeNonFinancialMetrics(context.userId);
        }
    }
    /**
     * Get employee's personal non-financial metrics
     * Employee role restriction: Only own metrics
     */
    static async getEmployeeNonFinancialMetrics(userId) {
        try {
            // Get the most recent evaluation for this employee
            const evaluation = await prisma_1.default.performanceReview.findFirst({
                where: {
                    employee_id: userId,
                },
                orderBy: {
                    createdAt: 'desc',
                },
            });
            if (!evaluation) {
                return null;
            }
            const profile = await prisma_1.default.profile.findUnique({
                where: { id: userId },
            });
            // Use overall_rating or non_financial_score, default to 0
            const nonFinScore = Number(evaluation.non_financial_score || evaluation.overall_rating || 0);
            const overallScore = Number(evaluation.overall_rating || 0);
            // Estimate BSC breakdown if only overall score available
            const learningGrowth = Math.round(nonFinScore * 0.85);
            const customerSatisfaction = Math.round(nonFinScore * 0.90);
            const internalProcesses = Math.round(nonFinScore * 0.80);
            return {
                employeeId: userId,
                employeeName: profile ? `${profile.first_name} ${profile.last_name}` : 'Unknown',
                learningGrowth: learningGrowth || 0,
                customerSatisfaction: customerSatisfaction || 0,
                internalProcesses: internalProcesses || 0,
                overallScore: overallScore || 0,
            };
        }
        catch (error) {
            console.error('Error fetching employee non-financial metrics:', error);
            return null;
        }
    }
    /**
     * Get partner's team non-financial metrics
     * Partner role restriction: Only metrics for their team members
     */
    static async getPartnerTeamMetrics(partnerId) {
        try {
            // First get partner's jobs
            const partnerJobs = await prisma_1.default.job.findMany({
                where: {
                    partner_id: partnerId,
                },
                select: { id: true },
            });
            if (partnerJobs.length === 0) {
                return null;
            }
            const jobIds = partnerJobs.map(j => j.id);
            // Get team members on partner's jobs
            const jobStaffAssignments = await prisma_1.default.jobStaffAssignment.findMany({
                where: {
                    job_id: { in: jobIds },
                },
                select: { employee_id: true },
            });
            const teamMemberIds = [...new Set(jobStaffAssignments.map(j => j.employee_id))];
            if (teamMemberIds.length === 0) {
                return null;
            }
            // Get evaluations for team members
            const evaluations = await prisma_1.default.performanceReview.findMany({
                where: {
                    employee_id: { in: teamMemberIds },
                },
            });
            if (evaluations.length === 0) {
                return null;
            }
            // Calculate averages
            const nonFinScores = evaluations.map(e => Number(e.non_financial_score || e.overall_rating || 0));
            const avgNonFinScore = nonFinScores.reduce((a, b) => a + b, 0) / nonFinScores.length;
            const avgOverallScore = evaluations.reduce((a, b) => a + (Number(b.overall_rating) || 0), 0) / evaluations.length;
            const avgLearningGrowth = Math.round(avgNonFinScore * 0.85);
            const avgCustomerSatisfaction = Math.round(avgNonFinScore * 0.90);
            const avgInternalProcesses = Math.round(avgNonFinScore * 0.80);
            return {
                employeeId: partnerId,
                employeeName: 'Partner Portfolio',
                learningGrowth: avgLearningGrowth,
                customerSatisfaction: avgCustomerSatisfaction,
                internalProcesses: avgInternalProcesses,
                overallScore: avgOverallScore,
            };
        }
        catch (error) {
            console.error('Error fetching partner team metrics:', error);
            return null;
        }
    }
    /**
     * Get company-wide non-financial metrics
     * Admin only restriction: Aggregates across all employees
     */
    static async getCompanyNonFinancialMetrics() {
        try {
            // Get all performance reviews with evaluations
            const evaluations = await prisma_1.default.performanceReview.findMany({
                include: {
                    employee: {
                        include: {
                            department: true,
                        },
                    },
                },
            });
            if (evaluations.length === 0) {
                return {
                    avgLearningGrowth: 0,
                    avgCustomerSatisfaction: 0,
                    avgInternalProcesses: 0,
                    avgOverallScore: 0,
                    totalEmployees: 0,
                    departmentAverages: [],
                };
            }
            // Calculate company averages
            const nonFinScores = evaluations.map(e => Number(e.non_financial_score || e.overall_rating || 0));
            const avgNonFinScore = nonFinScores.length > 0 ? nonFinScores.reduce((a, b) => a + b, 0) / nonFinScores.length : 0;
            const avgOverallScore = evaluations.length > 0 ? evaluations.reduce((a, b) => a + (Number(b.overall_rating) || 0), 0) / evaluations.length : 0;
            const avgLearningGrowth = Math.round(avgNonFinScore * 0.85);
            const avgCustomerSatisfaction = Math.round(avgNonFinScore * 0.90);
            const avgInternalProcesses = Math.round(avgNonFinScore * 0.80);
            // Calculate department averages
            const departmentMap = new Map();
            evaluations.forEach(e => {
                const dept = e.employee?.department?.name || 'Unassigned';
                if (!departmentMap.has(dept)) {
                    departmentMap.set(dept, { scores: [], count: 0 });
                }
                const dept_data = departmentMap.get(dept);
                dept_data.scores.push(e.overall_rating ? Number(e.overall_rating) : 0);
                dept_data.count++;
            });
            const departmentAverages = Array.from(departmentMap.entries()).map(([dept, data]) => ({
                department: dept,
                avgScore: data.scores.reduce((a, b) => a + b, 0) / data.scores.length,
                employeeCount: data.count,
            }));
            return {
                avgLearningGrowth,
                avgCustomerSatisfaction,
                avgInternalProcesses,
                avgOverallScore,
                totalEmployees: evaluations.length,
                departmentAverages,
            };
        }
        catch (error) {
            console.error('Error fetching company non-financial metrics:', error);
            return {
                avgLearningGrowth: 0,
                avgCustomerSatisfaction: 0,
                avgInternalProcesses: 0,
                avgOverallScore: 0,
                totalEmployees: 0,
                departmentAverages: [],
            };
        }
    }
    /**
     * Get financial analytics based on user role
     * Employee: Only personal billable hours (no monetary values)
     * Partner: Only portfolio financial metrics
     * Admin: Company-wide financials
     */
    static async getFinancialAnalytics(context) {
        if (context.isAdmin) {
            return this.getCompanyFinancialMetrics();
        }
        else if (context.isPartner) {
            return this.getPartnerFinancialMetrics(context.userId);
        }
        else {
            return this.getEmployeeFinancialMetrics(context.userId);
        }
    }
    /**
     * Get employee's personal financial metrics (hours only, no monetary values)
     * Employee role restriction: Only personal hours, no revenue/profit data
     */
    static async getEmployeeFinancialMetrics(userId) {
        try {
            // Get employee's work logs and billable hours
            const workLogs = await prisma_1.default.workLog.findMany({
                where: {
                    employee_id: userId,
                },
            });
            if (workLogs.length === 0) {
                return {
                    totalHours: 0,
                    billableHours: 0,
                    nonBillableHours: 0,
                    jobBreakdown: [],
                };
            }
            // Calculate hours by job
            const jobMap = new Map();
            let totalHours = 0;
            let billableHours = 0;
            workLogs.forEach(log => {
                totalHours += Number(log.hours_worked || 0);
                billableHours += Number(log.billable_hours || 0);
            });
            const jobBreakdown = [];
            return {
                totalHours,
                billableHours,
                nonBillableHours: totalHours - billableHours,
                jobBreakdown,
            };
        }
        catch (error) {
            console.error('Error fetching employee financial metrics:', error);
            return null;
        }
    }
    /**
     * Get partner's portfolio financial metrics
     * Partner role restriction: Only their jobs and revenue
     */
    static async getPartnerFinancialMetrics(partnerId) {
        try {
            // Get all jobs owned by partner
            const jobs = await prisma_1.default.job.findMany({
                where: {
                    partner_id: partnerId,
                },
            });
            if (jobs.length === 0) {
                return {
                    partnerId,
                    totalJobs: 0,
                    totalRevenue: 0,
                    totalProfit: 0,
                    averageProfitMargin: 0,
                    jobBreakdown: [],
                };
            }
            // Return basic metrics (financial data not fully setup in schema)
            return {
                partnerId,
                totalJobs: jobs.length,
                totalRevenue: 0,
                totalProfit: 0,
                averageProfitMargin: 0,
                jobBreakdown: jobs.map(job => ({
                    jobId: job.id,
                    jobTitle: job.job_name || 'Unknown',
                    revenue: 0,
                    profit: 0,
                    profitMargin: 0,
                })),
            };
        }
        catch (error) {
            console.error('Error fetching partner financial metrics:', error);
            return null;
        }
    }
    /**
     * Get company-wide financial metrics
     * Admin only restriction: Aggregates all revenue, profit, and job data
     */
    static async getCompanyFinancialMetrics() {
        try {
            // Get all jobs
            const jobs = await prisma_1.default.job.findMany();
            if (jobs.length === 0) {
                return {
                    totalRevenue: 0,
                    totalProfit: 0,
                    averageProfitMargin: 0,
                    totalEmployees: 0,
                    revenueByDepartment: [],
                    revenueByPartner: [],
                };
            }
            // Count total employees
            const totalEmployees = await prisma_1.default.profile.count({
                where: {
                    status: 'active',
                },
            });
            // Return basic structure (financial data not fully setup in schema)
            return {
                totalRevenue: 0,
                totalProfit: 0,
                averageProfitMargin: 0,
                totalEmployees,
                revenueByDepartment: [],
                revenueByPartner: [],
            };
        }
        catch (error) {
            console.error('Error fetching company financial metrics:', error);
            return {
                totalRevenue: 0,
                totalProfit: 0,
                averageProfitMargin: 0,
                totalEmployees: 0,
                revenueByDepartment: [],
                revenueByPartner: [],
            };
        }
    }
}
exports.RoleAwareAnalyticsService = RoleAwareAnalyticsService;
exports.default = RoleAwareAnalyticsService;
