"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.nonFinancialPerformanceService = exports.NonFinancialPerformanceService = void 0;
const prisma_1 = __importDefault(require("../prisma"));
const library_1 = require("@prisma/client/runtime/library");
/**
 * Non-Financial Performance Service
 * Implements the Balanced Scorecard framework for audit and consulting firms
 * Calculates objective scores based on actual performance data
 */
class NonFinancialPerformanceService {
    /**
     * Calculate comprehensive non-financial performance scores for an employee
     * @param employeeId - The employee to calculate scores for
     * @param evaluationCycleId - Optional evaluation cycle ID for period-specific calculations
     * @param periodStart - Start date for the calculation period
     * @param periodEnd - End date for the calculation period
     */
    async calculateNonFinancialScores(employeeId, evaluationCycleId, periodStart, periodEnd) {
        // Default to current evaluation period if not specified
        const defaultPeriodStart = periodStart || new Date(new Date().getFullYear(), 0, 1); // Start of year
        const defaultPeriodEnd = periodEnd || new Date(); // Today
        // Calculate each BSC category
        const learningGrowthScore = await this.calculateLearningGrowthScore(employeeId, defaultPeriodStart, defaultPeriodEnd);
        const customerSatisfactionScore = await this.calculateCustomerSatisfactionScore(employeeId, defaultPeriodStart, defaultPeriodEnd);
        const internalProcessesScore = await this.calculateInternalProcessesScore(employeeId, defaultPeriodStart, defaultPeriodEnd);
        // Weight the scores: Learning & Growth (35%), Customer Satisfaction (35%), Internal Processes (30%)
        const overallNonFinancialScore = Math.min(100, (learningGrowthScore * 0.35) +
            (customerSatisfactionScore * 0.35) +
            (internalProcessesScore * 0.30));
        // Store the calculated scores in EmployeeKpiScore table for audit trail
        await this.storeKPIScores(employeeId, evaluationCycleId, defaultPeriodStart, defaultPeriodEnd, {
            learningGrowthScore,
            customerSatisfactionScore,
            internalProcessesScore,
            overallNonFinancialScore
        });
        return {
            learningGrowthScore: Math.round(learningGrowthScore * 100) / 100,
            customerSatisfactionScore: Math.round(customerSatisfactionScore * 100) / 100,
            internalProcessesScore: Math.round(internalProcessesScore * 100) / 100,
            overallNonFinancialScore: Math.round(overallNonFinancialScore * 100) / 100
        };
    }
    /**
     * Get detailed breakdown of BSC scores with individual KPIs
     */
    async getBSCBreakdown(employeeId, periodStart, periodEnd) {
        const [learningGrowthKPIs, customerSatisfactionKPIs, internalProcessesKPIs] = await Promise.all([
            this.calculateLearningGrowthKPIs(employeeId, periodStart, periodEnd),
            this.calculateCustomerSatisfactionKPIs(employeeId, periodStart, periodEnd),
            this.calculateInternalProcessesKPIs(employeeId, periodStart, periodEnd)
        ]);
        return {
            learningGrowth: {
                score: this.calculateCategoryScore(learningGrowthKPIs),
                kpis: learningGrowthKPIs
            },
            customerSatisfaction: {
                score: this.calculateCategoryScore(customerSatisfactionKPIs),
                kpis: customerSatisfactionKPIs
            },
            internalProcesses: {
                score: this.calculateCategoryScore(internalProcessesKPIs),
                kpis: internalProcessesKPIs
            }
        };
    }
    /**
     * Learning & Growth Score Calculation (35% of total non-financial score)
     */
    async calculateLearningGrowthScore(employeeId, periodStart, periodEnd) {
        const kpis = await this.calculateLearningGrowthKPIs(employeeId, periodStart, periodEnd);
        return this.calculateCategoryScore(kpis);
    }
    async calculateLearningGrowthKPIs(employeeId, periodStart, periodEnd) {
        // 1. Training Hours (Target: 40 hours/year) - Weight: 25%
        const trainingHours = await this.getTrainingHours(employeeId, periodStart, periodEnd);
        const trainingKPI = {
            kpiName: 'training_hours',
            calculatedValue: trainingHours,
            targetValue: 40,
            achievementPercentage: Math.min(100, (trainingHours / 40) * 100),
            weightPercentage: 25,
            weightedScore: Math.min(25, (trainingHours / 40) * 25)
        };
        // 2. Knowledge Sessions (Target: 4 sessions/year) - Weight: 20%
        const knowledgeSessions = await this.getKnowledgeSessionsCount(employeeId, periodStart, periodEnd);
        const knowledgeKPI = {
            kpiName: 'knowledge_sessions',
            calculatedValue: knowledgeSessions,
            targetValue: 4,
            achievementPercentage: Math.min(100, (knowledgeSessions / 4) * 100),
            weightPercentage: 20,
            weightedScore: Math.min(20, (knowledgeSessions / 4) * 20)
        };
        // 3. Mentoring Hours (Target: 20 hours/year) - Weight: 20%
        const mentoringHours = await this.getMentoringHours(employeeId, periodStart, periodEnd);
        const mentoringKPI = {
            kpiName: 'mentoring_hours',
            calculatedValue: mentoringHours,
            targetValue: 20,
            achievementPercentage: Math.min(100, (mentoringHours / 20) * 100),
            weightPercentage: 20,
            weightedScore: Math.min(20, (mentoringHours / 20) * 20)
        };
        // 4. Development Goals Completion (Target: 80% completion) - Weight: 35%
        const developmentCompletion = await this.getDevelopmentGoalsCompletion(employeeId, periodStart, periodEnd);
        const developmentKPI = {
            kpiName: 'development_goals_completion',
            calculatedValue: developmentCompletion,
            targetValue: 80,
            achievementPercentage: Math.min(100, (developmentCompletion / 80) * 100),
            weightPercentage: 35,
            weightedScore: Math.min(35, (developmentCompletion / 80) * 35)
        };
        return [trainingKPI, knowledgeKPI, mentoringKPI, developmentKPI];
    }
    /**
     * Customer Satisfaction Score Calculation (35% of total non-financial score)
     */
    async calculateCustomerSatisfactionScore(employeeId, periodStart, periodEnd) {
        const kpis = await this.calculateCustomerSatisfactionKPIs(employeeId, periodStart, periodEnd);
        return this.calculateCategoryScore(kpis);
    }
    async calculateCustomerSatisfactionKPIs(employeeId, periodStart, periodEnd) {
        // 1. Client Feedback Rating (Target: 4.0/5.0) - Weight: 40%
        const avgClientRating = await this.getAverageClientFeedback(employeeId, periodStart, periodEnd);
        const clientFeedbackKPI = {
            kpiName: 'client_feedback_rating',
            calculatedValue: avgClientRating,
            targetValue: 4.0,
            achievementPercentage: (avgClientRating / 4.0) * 100,
            weightPercentage: 40,
            weightedScore: (avgClientRating / 4.0) * 40
        };
        // 2. On-Time Delivery (Target: 95%) - Weight: 30%
        const onTimeDeliveryRate = await this.getOnTimeDeliveryRate(employeeId, periodStart, periodEnd);
        const onTimeKPI = {
            kpiName: 'on_time_delivery',
            calculatedValue: onTimeDeliveryRate,
            targetValue: 95,
            achievementPercentage: (onTimeDeliveryRate / 95) * 100,
            weightPercentage: 30,
            weightedScore: (onTimeDeliveryRate / 95) * 30
        };
        // 3. Client Retention (Target: 85%) - Weight: 30%
        const clientRetentionRate = await this.getClientRetentionRate(employeeId, periodStart, periodEnd);
        const clientRetentionKPI = {
            kpiName: 'client_retention',
            calculatedValue: clientRetentionRate,
            targetValue: 85,
            achievementPercentage: (clientRetentionRate / 85) * 100,
            weightPercentage: 30,
            weightedScore: (clientRetentionRate / 85) * 30
        };
        return [clientFeedbackKPI, onTimeKPI, clientRetentionKPI];
    }
    /**
     * Internal Processes Score Calculation (30% of total non-financial score)
     */
    async calculateInternalProcessesScore(employeeId, periodStart, periodEnd) {
        const kpis = await this.calculateInternalProcessesKPIs(employeeId, periodStart, periodEnd);
        return this.calculateCategoryScore(kpis);
    }
    async calculateInternalProcessesKPIs(employeeId, periodStart, periodEnd) {
        // 1. Quality Review Score (Target: 4.0/5.0) - Weight: 35%
        const avgQualityScore = await this.getAverageQualityScore(employeeId, periodStart, periodEnd);
        const qualityKPI = {
            kpiName: 'quality_review_score',
            calculatedValue: avgQualityScore,
            targetValue: 4.0,
            achievementPercentage: (avgQualityScore / 4.0) * 100,
            weightPercentage: 35,
            weightedScore: (avgQualityScore / 4.0) * 35
        };
        // 2. Deadline Compliance (Target: 90%) - Weight: 30%
        const deadlineCompliance = await this.getDeadlineComplianceRate(employeeId, periodStart, periodEnd);
        const deadlineKPI = {
            kpiName: 'deadline_compliance',
            calculatedValue: deadlineCompliance,
            targetValue: 90,
            achievementPercentage: (deadlineCompliance / 90) * 100,
            weightPercentage: 30,
            weightedScore: (deadlineCompliance / 90) * 30
        };
        // 3. Process Improvement Ideas (Target: 2/year) - Weight: 20%
        const improvementIdeas = await this.getImplementedImprovementIdeas(employeeId, periodStart, periodEnd);
        const improvementKPI = {
            kpiName: 'improvement_ideas',
            calculatedValue: improvementIdeas,
            targetValue: 2,
            achievementPercentage: Math.min(100, (improvementIdeas / 2) * 100),
            weightPercentage: 20,
            weightedScore: Math.min(20, (improvementIdeas / 2) * 20)
        };
        // 4. Peer Collaboration Rating (Target: 4.0/5.0) - Weight: 15%
        const peerRating = await this.getAveragePeerRating(employeeId, periodStart, periodEnd);
        const peerKPI = {
            kpiName: 'peer_collaboration',
            calculatedValue: peerRating,
            targetValue: 4.0,
            achievementPercentage: (peerRating / 4.0) * 100,
            weightPercentage: 15,
            weightedScore: (peerRating / 4.0) * 15
        };
        return [qualityKPI, deadlineKPI, improvementKPI, peerKPI];
    }
    /**
     * Helper method to calculate category score from KPIs
     */
    calculateCategoryScore(kpis) {
        const totalWeightedScore = kpis.reduce((sum, kpi) => sum + kpi.weightedScore, 0);
        return Math.min(100, totalWeightedScore);
    }
    // Data retrieval methods for individual KPIs
    async getTrainingHours(employeeId, periodStart, periodEnd) {
        const result = await prisma_1.default.trainingRecord.aggregate({
            _sum: {
                hours: true
            },
            where: {
                employee_id: employeeId,
                completed_at: {
                    gte: periodStart,
                    lte: periodEnd
                },
                status: 'completed'
            }
        });
        return result._sum.hours ? Number(result._sum.hours) : 0;
    }
    async getKnowledgeSessionsCount(employeeId, periodStart, periodEnd) {
        return await prisma_1.default.knowledgeSession.count({
            where: {
                presenter_id: employeeId,
                session_date: {
                    gte: periodStart,
                    lte: periodEnd
                }
            }
        });
    }
    async getMentoringHours(employeeId, periodStart, periodEnd) {
        const result = await prisma_1.default.workLog.aggregate({
            _sum: {
                hours_worked: true
            },
            where: {
                employee_id: employeeId,
                work_date: {
                    gte: periodStart,
                    lte: periodEnd
                },
                activity_type: 'mentoring'
            }
        });
        return result._sum.hours_worked ? Number(result._sum.hours_worked) : 0;
    }
    async getDevelopmentGoalsCompletion(employeeId, periodStart, periodEnd) {
        const totalGoals = await prisma_1.default.employeeGoal.count({
            where: {
                employee_id: employeeId,
                createdAt: {
                    gte: periodStart,
                    lte: periodEnd
                }
            }
        });
        if (totalGoals === 0)
            return 100; // No goals = 100% completion
        const completedGoals = await prisma_1.default.employeeGoal.count({
            where: {
                employee_id: employeeId,
                createdAt: {
                    gte: periodStart,
                    lte: periodEnd
                },
                status: 'completed'
            }
        });
        return (completedGoals / totalGoals) * 100;
    }
    async getAverageClientFeedback(employeeId, periodStart, periodEnd) {
        const result = await prisma_1.default.clientEvaluation.aggregate({
            _avg: {
                overall_rating: true
            },
            where: {
                employee_id: employeeId,
                evaluation_date: {
                    gte: periodStart,
                    lte: periodEnd
                },
                submitted_at: {
                    not: null
                }
            }
        });
        return result._avg.overall_rating ? Number(result._avg.overall_rating) : 0;
    }
    async getOnTimeDeliveryRate(employeeId, periodStart, periodEnd) {
        // Get jobs where the employee was assigned and completed
        const completedJobs = await prisma_1.default.job.findMany({
            include: {
                jobStaffAssignments: {
                    where: {
                        employee_id: employeeId
                    }
                }
            },
            where: {
                jobStaffAssignments: {
                    some: {
                        employee_id: employeeId
                    }
                },
                completion_date: {
                    gte: periodStart,
                    lte: periodEnd,
                    not: null
                },
                due_date: {
                    not: null
                }
            }
        });
        if (completedJobs.length === 0)
            return 100; // No jobs = 100% on-time
        const onTimeJobs = completedJobs.filter(job => job.completion_date && job.due_date && job.completion_date <= job.due_date);
        return (onTimeJobs.length / completedJobs.length) * 100;
    }
    async getClientRetentionRate(employeeId, periodStart, periodEnd) {
        // This is a simplified calculation - in practice, you might need more complex logic
        // For now, we'll use client evaluation ratings as a proxy for retention
        const totalEvaluations = await prisma_1.default.clientEvaluation.count({
            where: {
                employee_id: employeeId,
                evaluation_date: {
                    gte: periodStart,
                    lte: periodEnd
                },
                submitted_at: { not: null }
            }
        });
        if (totalEvaluations === 0)
            return 85; // Default to target
        const positiveEvaluations = await prisma_1.default.clientEvaluation.count({
            where: {
                employee_id: employeeId,
                evaluation_date: {
                    gte: periodStart,
                    lte: periodEnd
                },
                submitted_at: { not: null },
                would_recommend: true
            }
        });
        return (positiveEvaluations / totalEvaluations) * 100;
    }
    async getAverageQualityScore(employeeId, periodStart, periodEnd) {
        const result = await prisma_1.default.qualityReview.aggregate({
            _avg: {
                overall_score: true
            },
            where: {
                employee_id: employeeId,
                review_date: {
                    gte: periodStart,
                    lte: periodEnd
                }
            }
        });
        return result._avg.overall_score ? Number(result._avg.overall_score) : 0;
    }
    async getDeadlineComplianceRate(employeeId, periodStart, periodEnd) {
        // Get all tasks assigned to the employee in the period
        const completedTasks = await prisma_1.default.task.findMany({
            where: {
                assigned_to: employeeId,
                status: 'completed',
                updatedAt: {
                    gte: periodStart,
                    lte: periodEnd
                },
                due_date: {
                    not: null
                }
            }
        });
        if (completedTasks.length === 0)
            return 100; // No tasks = 100% compliance
        const onTimeTasks = completedTasks.filter(task => task.due_date && task.updatedAt <= task.due_date);
        return (onTimeTasks.length / completedTasks.length) * 100;
    }
    async getImplementedImprovementIdeas(employeeId, periodStart, periodEnd) {
        return await prisma_1.default.improvementIdea.count({
            where: {
                submitted_by: employeeId,
                submitted_at: {
                    gte: periodStart,
                    lte: periodEnd
                },
                status: 'implemented'
            }
        });
    }
    async getAveragePeerRating(employeeId, periodStart, periodEnd) {
        const result = await prisma_1.default.peerEvaluation.aggregate({
            _avg: {
                overall_rating: true
            },
            where: {
                evaluatee_id: employeeId,
                createdAt: {
                    gte: periodStart,
                    lte: periodEnd
                },
                submitted_at: {
                    not: null
                }
            }
        });
        return result._avg.overall_rating ? Number(result._avg.overall_rating) : 0;
    }
    /**
     * Store calculated KPI scores in the database for audit trail
     */
    async storeKPIScores(employeeId, evaluationCycleId, periodStart, periodEnd, scores) {
        const kpiScores = [
            {
                employee_id: employeeId,
                evaluation_cycle_id: evaluationCycleId,
                kpi_name: 'bsc_learning_growth',
                kpi_category: 'learning_growth',
                calculated_value: new library_1.Decimal(scores.learningGrowthScore),
                target_value: new library_1.Decimal(100),
                achievement_percentage: new library_1.Decimal(scores.learningGrowthScore),
                weight_percentage: new library_1.Decimal(35),
                weighted_score: new library_1.Decimal(scores.learningGrowthScore * 0.35),
                calculation_period_start: periodStart,
                calculation_period_end: periodEnd
            },
            {
                employee_id: employeeId,
                evaluation_cycle_id: evaluationCycleId,
                kpi_name: 'bsc_customer_satisfaction',
                kpi_category: 'customer_satisfaction',
                calculated_value: new library_1.Decimal(scores.customerSatisfactionScore),
                target_value: new library_1.Decimal(100),
                achievement_percentage: new library_1.Decimal(scores.customerSatisfactionScore),
                weight_percentage: new library_1.Decimal(35),
                weighted_score: new library_1.Decimal(scores.customerSatisfactionScore * 0.35),
                calculation_period_start: periodStart,
                calculation_period_end: periodEnd
            },
            {
                employee_id: employeeId,
                evaluation_cycle_id: evaluationCycleId,
                kpi_name: 'bsc_internal_processes',
                kpi_category: 'internal_processes',
                calculated_value: new library_1.Decimal(scores.internalProcessesScore),
                target_value: new library_1.Decimal(100),
                achievement_percentage: new library_1.Decimal(scores.internalProcessesScore),
                weight_percentage: new library_1.Decimal(30),
                weighted_score: new library_1.Decimal(scores.internalProcessesScore * 0.30),
                calculation_period_start: periodStart,
                calculation_period_end: periodEnd
            },
            {
                employee_id: employeeId,
                evaluation_cycle_id: evaluationCycleId,
                kpi_name: 'bsc_overall_non_financial',
                kpi_category: 'overall',
                calculated_value: new library_1.Decimal(scores.overallNonFinancialScore),
                target_value: new library_1.Decimal(100),
                achievement_percentage: new library_1.Decimal(scores.overallNonFinancialScore),
                weight_percentage: new library_1.Decimal(100),
                weighted_score: new library_1.Decimal(scores.overallNonFinancialScore),
                calculation_period_start: periodStart,
                calculation_period_end: periodEnd
            }
        ];
        // Upsert each KPI score
        for (const kpiScore of kpiScores) {
            await prisma_1.default.employeeKpiScore.upsert({
                where: {
                    employee_id_evaluation_cycle_id_kpi_name: {
                        employee_id: employeeId,
                        evaluation_cycle_id: evaluationCycleId || -1, // Use -1 for null cycle
                        kpi_name: kpiScore.kpi_name
                    }
                },
                update: {
                    calculated_value: kpiScore.calculated_value,
                    achievement_percentage: kpiScore.achievement_percentage,
                    weighted_score: kpiScore.weighted_score,
                    calculation_period_start: kpiScore.calculation_period_start,
                    calculation_period_end: kpiScore.calculation_period_end
                },
                create: kpiScore
            });
        }
    }
}
exports.NonFinancialPerformanceService = NonFinancialPerformanceService;
exports.nonFinancialPerformanceService = new NonFinancialPerformanceService();
