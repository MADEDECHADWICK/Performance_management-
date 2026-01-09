"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = __importDefault(require("../prisma"));
const nonFinancialPerformance_service_1 = require("../services/nonFinancialPerformance.service");
const auth_1 = require("../middleware/auth");
const library_1 = require("@prisma/client/runtime/library");
const router = (0, express_1.Router)();
/**
 * Non-Financial Performance Routes
 * Handles training records, quality reviews, knowledge sessions, improvement ideas, and BSC score calculations
 */
// ==================== TRAINING RECORDS ====================
/**
 * POST /training-records - Create a new training record
 */
router.post('/training-records', auth_1.authMiddleware, async (req, res) => {
    try {
        const { employee_id, course_name, provider, hours, completed_at, certificate_url, training_type } = req.body;
        const trainingRecord = await prisma_1.default.trainingRecord.create({
            data: {
                employee_id,
                course_name,
                provider,
                hours: new library_1.Decimal(hours),
                completed_at: new Date(completed_at),
                certificate_url,
                training_type: training_type || 'external',
                status: 'completed'
            }
        });
        res.json(trainingRecord);
    }
    catch (error) {
        console.error('Error creating training record:', error);
        res.status(500).json({ error: 'Failed to create training record' });
    }
});
/**
 * GET /training-records/:employeeId - Get all training records for an employee
 */
router.get('/training-records/:employeeId', auth_1.authMiddleware, async (req, res) => {
    try {
        const { employeeId } = req.params;
        const { periodStart, periodEnd } = req.query;
        const trainingRecords = await prisma_1.default.trainingRecord.findMany({
            where: {
                employee_id: parseInt(employeeId),
                ...(periodStart && periodEnd && {
                    completed_at: {
                        gte: new Date(periodStart),
                        lte: new Date(periodEnd)
                    }
                })
            },
            orderBy: { completed_at: 'desc' }
        });
        res.json(trainingRecords);
    }
    catch (error) {
        console.error('Error fetching training records:', error);
        res.status(500).json({ error: 'Failed to fetch training records' });
    }
});
/**
 * PUT /training-records/:id - Update a training record
 */
router.put('/training-records/:id', auth_1.authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;
        const trainingRecord = await prisma_1.default.trainingRecord.update({
            where: { id: parseInt(id) },
            data: {
                ...updates,
                hours: updates.hours ? new library_1.Decimal(updates.hours) : undefined,
                completed_at: updates.completed_at ? new Date(updates.completed_at) : undefined
            }
        });
        res.json(trainingRecord);
    }
    catch (error) {
        console.error('Error updating training record:', error);
        res.status(500).json({ error: 'Failed to update training record' });
    }
});
// ==================== KNOWLEDGE SESSIONS ====================
/**
 * POST /knowledge-sessions - Create a new knowledge session
 */
router.post('/knowledge-sessions', auth_1.authMiddleware, async (req, res) => {
    try {
        const { presenter_id, title, topic_area, session_date, duration_hours, attendee_count, session_type, materials_url } = req.body;
        const knowledgeSession = await prisma_1.default.knowledgeSession.create({
            data: {
                presenter_id,
                title,
                topic_area,
                session_date: new Date(session_date),
                duration_hours: new library_1.Decimal(duration_hours),
                attendee_count: attendee_count || 0,
                session_type: session_type || 'presentation',
                materials_url
            }
        });
        res.json(knowledgeSession);
    }
    catch (error) {
        console.error('Error creating knowledge session:', error);
        res.status(500).json({ error: 'Failed to create knowledge session' });
    }
});
/**
 * GET /knowledge-sessions/:presenterId - Get all knowledge sessions for a presenter
 */
router.get('/knowledge-sessions/:presenterId', auth_1.authMiddleware, async (req, res) => {
    try {
        const { presenterId } = req.params;
        const { periodStart, periodEnd } = req.query;
        const sessions = await prisma_1.default.knowledgeSession.findMany({
            where: {
                presenter_id: parseInt(presenterId),
                ...(periodStart && periodEnd && {
                    session_date: {
                        gte: new Date(periodStart),
                        lte: new Date(periodEnd)
                    }
                })
            },
            orderBy: { session_date: 'desc' }
        });
        res.json(sessions);
    }
    catch (error) {
        console.error('Error fetching knowledge sessions:', error);
        res.status(500).json({ error: 'Failed to fetch knowledge sessions' });
    }
});
/**
 * PUT /knowledge-sessions/:id - Update a knowledge session
 */
router.put('/knowledge-sessions/:id', auth_1.authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;
        const session = await prisma_1.default.knowledgeSession.update({
            where: { id: parseInt(id) },
            data: {
                ...updates,
                duration_hours: updates.duration_hours ? new library_1.Decimal(updates.duration_hours) : undefined,
                session_date: updates.session_date ? new Date(updates.session_date) : undefined
            }
        });
        res.json(session);
    }
    catch (error) {
        console.error('Error updating knowledge session:', error);
        res.status(500).json({ error: 'Failed to update knowledge session' });
    }
});
// ==================== QUALITY REVIEWS ====================
/**
 * POST /quality-reviews - Create a new quality review
 */
router.post('/quality-reviews', auth_1.authMiddleware, async (req, res) => {
    try {
        const { job_id, employee_id, reviewer_id, accuracy_score, completeness_score, timeliness_score, innovation_score, overall_score, feedback, areas_for_improvement, strengths } = req.body;
        const qualityReview = await prisma_1.default.qualityReview.create({
            data: {
                job_id,
                employee_id,
                reviewer_id,
                accuracy_score: new library_1.Decimal(accuracy_score),
                completeness_score: new library_1.Decimal(completeness_score),
                timeliness_score: new library_1.Decimal(timeliness_score),
                innovation_score: innovation_score ? new library_1.Decimal(innovation_score) : undefined,
                overall_score: new library_1.Decimal(overall_score),
                feedback,
                areas_for_improvement,
                strengths
            }
        });
        res.json(qualityReview);
    }
    catch (error) {
        console.error('Error creating quality review:', error);
        res.status(500).json({ error: 'Failed to create quality review' });
    }
});
/**
 * GET /quality-reviews/:employeeId - Get all quality reviews for an employee
 */
router.get('/quality-reviews/:employeeId', auth_1.authMiddleware, async (req, res) => {
    try {
        const { employeeId } = req.params;
        const { periodStart, periodEnd } = req.query;
        const reviews = await prisma_1.default.qualityReview.findMany({
            where: {
                employee_id: parseInt(employeeId),
                ...(periodStart && periodEnd && {
                    review_date: {
                        gte: new Date(periodStart),
                        lte: new Date(periodEnd)
                    }
                })
            },
            include: {
                job: true,
                reviewer: true
            },
            orderBy: { review_date: 'desc' }
        });
        res.json(reviews);
    }
    catch (error) {
        console.error('Error fetching quality reviews:', error);
        res.status(500).json({ error: 'Failed to fetch quality reviews' });
    }
});
/**
 * PUT /quality-reviews/:id - Update a quality review
 */
router.put('/quality-reviews/:id', auth_1.authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;
        const review = await prisma_1.default.qualityReview.update({
            where: { id: parseInt(id) },
            data: {
                ...updates,
                accuracy_score: updates.accuracy_score ? new library_1.Decimal(updates.accuracy_score) : undefined,
                completeness_score: updates.completeness_score ? new library_1.Decimal(updates.completeness_score) : undefined,
                timeliness_score: updates.timeliness_score ? new library_1.Decimal(updates.timeliness_score) : undefined,
                innovation_score: updates.innovation_score ? new library_1.Decimal(updates.innovation_score) : undefined,
                overall_score: updates.overall_score ? new library_1.Decimal(updates.overall_score) : undefined
            }
        });
        res.json(review);
    }
    catch (error) {
        console.error('Error updating quality review:', error);
        res.status(500).json({ error: 'Failed to update quality review' });
    }
});
// ==================== IMPROVEMENT IDEAS ====================
/**
 * POST /improvement-ideas - Submit a new improvement idea
 */
router.post('/improvement-ideas', auth_1.authMiddleware, async (req, res) => {
    try {
        const { submitted_by, title, description, category, priority, impact_area, estimated_savings } = req.body;
        const idea = await prisma_1.default.improvementIdea.create({
            data: {
                submitted_by,
                title,
                description,
                category,
                priority: priority || 'medium',
                impact_area,
                estimated_savings: estimated_savings ? new library_1.Decimal(estimated_savings) : undefined
            }
        });
        res.json(idea);
    }
    catch (error) {
        console.error('Error creating improvement idea:', error);
        res.status(500).json({ error: 'Failed to create improvement idea' });
    }
});
/**
 * GET /improvement-ideas - Get all improvement ideas (with optional filters)
 */
router.get('/improvement-ideas', auth_1.authMiddleware, async (req, res) => {
    try {
        const { status, submitted_by, category } = req.query;
        const ideas = await prisma_1.default.improvementIdea.findMany({
            where: {
                ...(status && { status: status }),
                ...(submitted_by && { submitted_by: parseInt(submitted_by) }),
                ...(category && { category: category })
            },
            include: {
                submitter: true,
                reviewer: true
            },
            orderBy: { submitted_at: 'desc' }
        });
        res.json(ideas);
    }
    catch (error) {
        console.error('Error fetching improvement ideas:', error);
        res.status(500).json({ error: 'Failed to fetch improvement ideas' });
    }
});
/**
 * PUT /improvement-ideas/:id - Update an improvement idea (e.g., approve/implement)
 */
router.put('/improvement-ideas/:id', auth_1.authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { status, feedback, reviewed_by } = req.body;
        const idea = await prisma_1.default.improvementIdea.update({
            where: { id: parseInt(id) },
            data: {
                status,
                feedback,
                reviewed_by,
                reviewed_at: status && ['approved', 'implemented', 'rejected'].includes(status) ? new Date() : undefined
            }
        });
        res.json(idea);
    }
    catch (error) {
        console.error('Error updating improvement idea:', error);
        res.status(500).json({ error: 'Failed to update improvement idea' });
    }
});
// ==================== NON-FINANCIAL PERFORMANCE CALCULATION ====================
/**
 * GET /non-financial-scores/:employeeId - Calculate and retrieve non-financial scores
 */
router.get('/non-financial-scores/:employeeId', auth_1.authMiddleware, async (req, res) => {
    try {
        const { employeeId } = req.params;
        const { periodStart, periodEnd, evaluationCycleId } = req.query;
        // Default to current year
        const startDate = periodStart ? new Date(periodStart) : new Date(new Date().getFullYear(), 0, 1);
        const endDate = periodEnd ? new Date(periodEnd) : new Date();
        const scores = await nonFinancialPerformance_service_1.nonFinancialPerformanceService.calculateNonFinancialScores(parseInt(employeeId), evaluationCycleId ? parseInt(evaluationCycleId) : undefined, startDate, endDate);
        res.json(scores);
    }
    catch (error) {
        console.error('Error calculating non-financial scores:', error);
        res.status(500).json({ error: 'Failed to calculate non-financial scores' });
    }
});
/**
 * GET /non-financial-breakdown/:employeeId - Get detailed BSC breakdown with all KPIs
 */
router.get('/non-financial-breakdown/:employeeId', auth_1.authMiddleware, async (req, res) => {
    try {
        const { employeeId } = req.params;
        const { periodStart, periodEnd } = req.query;
        const startDate = periodStart ? new Date(periodStart) : new Date(new Date().getFullYear(), 0, 1);
        const endDate = periodEnd ? new Date(periodEnd) : new Date();
        const breakdown = await nonFinancialPerformance_service_1.nonFinancialPerformanceService.getBSCBreakdown(parseInt(employeeId), startDate, endDate);
        res.json(breakdown);
    }
    catch (error) {
        console.error('Error fetching BSC breakdown:', error);
        res.status(500).json({ error: 'Failed to fetch BSC breakdown' });
    }
});
/**
 * POST /non-financial-scores/:evaluationId/update - Update employee evaluation with calculated BSC scores
 */
router.post('/non-financial-scores/:evaluationId/update', auth_1.authMiddleware, async (req, res) => {
    try {
        const { evaluationId } = req.params;
        // Fetch the evaluation to get employee and period info
        const evaluation = await prisma_1.default.employeeEvaluation.findUnique({
            where: { id: parseInt(evaluationId) },
            include: {
                evaluationCycle: true
            }
        });
        if (!evaluation) {
            return res.status(404).json({ error: 'Evaluation not found' });
        }
        // Calculate scores
        const startDate = evaluation.evaluationCycle?.start_date || new Date(new Date().getFullYear(), 0, 1);
        const endDate = evaluation.evaluationCycle?.end_date || new Date();
        const scores = await nonFinancialPerformance_service_1.nonFinancialPerformanceService.calculateNonFinancialScores(evaluation.employee_id, evaluation.evaluation_cycle_id || undefined, startDate, endDate);
        // Update the evaluation with calculated scores
        const updatedEvaluation = await prisma_1.default.employeeEvaluation.update({
            where: { id: parseInt(evaluationId) },
            data: {
                bsc_learning_growth_score: new library_1.Decimal(scores.learningGrowthScore),
                bsc_customer_satisfaction_score: new library_1.Decimal(scores.customerSatisfactionScore),
                bsc_internal_processes_score: new library_1.Decimal(scores.internalProcessesScore)
            }
        });
        res.json({
            scores,
            evaluation: updatedEvaluation
        });
    }
    catch (error) {
        console.error('Error updating evaluation with BSC scores:', error);
        res.status(500).json({ error: 'Failed to update evaluation' });
    }
});
/**
 * GET /kpi-scores/:employeeId - Get stored KPI scores from employee_kpi_scores table
 */
router.get('/kpi-scores/:employeeId', auth_1.authMiddleware, async (req, res) => {
    try {
        const { employeeId } = req.params;
        const { evaluationCycleId } = req.query;
        const kpiScores = await prisma_1.default.employeeKpiScore.findMany({
            where: {
                employee_id: parseInt(employeeId),
                ...(evaluationCycleId && { evaluation_cycle_id: parseInt(evaluationCycleId) })
            },
            orderBy: { calculated_at: 'desc' }
        });
        res.json(kpiScores);
    }
    catch (error) {
        console.error('Error fetching KPI scores:', error);
        res.status(500).json({ error: 'Failed to fetch KPI scores' });
    }
});
/**
 * GET /team-non-financial-scores/:managerId - Get non-financial scores for entire team
 */
router.get('/team-non-financial-scores/:managerId', auth_1.authMiddleware, async (req, res) => {
    try {
        const { managerId } = req.params;
        const { periodStart, periodEnd } = req.query;
        const startDate = periodStart ? new Date(periodStart) : new Date(new Date().getFullYear(), 0, 1);
        const endDate = periodEnd ? new Date(periodEnd) : new Date();
        // Get all subordinates
        const subordinates = await prisma_1.default.profile.findMany({
            where: {
                manager_id: parseInt(managerId),
                status: 'active'
            },
            select: { id: true }
        });
        // Calculate scores for each team member
        const teamScores = await Promise.all(subordinates.map(async (sub) => {
            const scores = await nonFinancialPerformance_service_1.nonFinancialPerformanceService.calculateNonFinancialScores(sub.id, undefined, startDate, endDate);
            return {
                employeeId: sub.id,
                ...scores
            };
        }));
        res.json(teamScores);
    }
    catch (error) {
        console.error('Error fetching team non-financial scores:', error);
        res.status(500).json({ error: 'Failed to fetch team scores' });
    }
});
exports.default = router;
