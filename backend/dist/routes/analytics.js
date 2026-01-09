"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const prisma_1 = __importDefault(require("../prisma"));
const roleAwareAnalytics_service_1 = __importDefault(require("../services/roleAwareAnalytics.service"));
const router = (0, express_1.Router)();
/**
 * Helper function to build analytics context from authenticated user
 */
const buildAnalyticsContext = async (userId) => {
    const roles = await prisma_1.default.userRole.findMany({
        where: { userId },
    });
    const roleNames = roles.map(r => r.role);
    const isAdmin = roleNames.includes('admin') || roleNames.includes('super_admin');
    const isPartner = roleNames.includes('partner');
    const isEmployee = roleNames.includes('associate') || roleNames.includes('intern') || (!isAdmin && !isPartner);
    return {
        userId,
        roles: roleNames,
        isAdmin,
        isPartner,
        isEmployee,
    };
};
/**
 * GET /analytics/non-financial
 *
 * Returns non-financial metrics based on user role:
 * - Employee: Own metrics only
 * - Partner: Team metrics
 * - Admin: Company-wide metrics
 *
 * Visibility Rules Enforced:
 * - Employees cannot see: Company-wide aggregates, other employees' metrics
 * - Partners cannot see: Other partners' data, company totals
 * - Admins can see: All data
 */
router.get('/non-financial', auth_1.authMiddleware, async (req, res) => {
    try {
        const userId = req.user?.sub ? Number(req.user.sub) : undefined;
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        const context = await buildAnalyticsContext(userId);
        const analytics = await roleAwareAnalytics_service_1.default.getNonFinancialAnalytics(context);
        return res.json(analytics);
    }
    catch (err) {
        console.error('Error fetching non-financial analytics:', err);
        return res.status(500).json({ error: err.message });
    }
});
/**
 * GET /analytics/financial
 *
 * Returns financial metrics based on user role:
 * - Employee: Hours only (no monetary values)
 * - Partner: Portfolio revenue and profit
 * - Admin: Company-wide financial metrics
 *
 * Visibility Rules Enforced:
 * - Employees cannot see: Company revenue, partner financials, job profitability beyond hours
 * - Partners cannot see: Other partners' financials, company totals, non-partner employee data
 * - Admins can see: All financial data including aggregates
 */
router.get('/financial', auth_1.authMiddleware, async (req, res) => {
    try {
        const userId = req.user?.sub ? Number(req.user.sub) : undefined;
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        const context = await buildAnalyticsContext(userId);
        const analytics = await roleAwareAnalytics_service_1.default.getFinancialAnalytics(context);
        return res.json(analytics);
    }
    catch (err) {
        console.error('Error fetching financial analytics:', err);
        return res.status(500).json({ error: err.message });
    }
});
/**
 * GET /analytics/dashboard
 *
 * Returns combined dashboard data based on user role
 * This endpoint provides all analytics for the dashboard view
 */
router.get('/dashboard', auth_1.authMiddleware, async (req, res) => {
    try {
        const userId = req.user?.sub ? Number(req.user.sub) : undefined;
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        const context = await buildAnalyticsContext(userId);
        // Get both non-financial and financial analytics
        const [nonFinancial, financial] = await Promise.all([
            roleAwareAnalytics_service_1.default.getNonFinancialAnalytics(context),
            roleAwareAnalytics_service_1.default.getFinancialAnalytics(context),
        ]);
        // Get user profile for context
        const profile = await prisma_1.default.profile.findUnique({
            where: { userId },
        });
        return res.json({
            userRole: context.roles[0] || 'employee',
            isAdmin: context.isAdmin,
            isPartner: context.isPartner,
            isEmployee: context.isEmployee,
            userProfile: profile,
            nonFinancial,
            financial,
        });
    }
    catch (err) {
        console.error('Error fetching dashboard analytics:', err);
        return res.status(500).json({ error: err.message });
    }
});
/**
 * GET /analytics/company (Admin Only)
 *
 * Returns company-wide analytics aggregations
 * AUTHORIZATION: Admin/Super Admin only
 *
 * Shows:
 * - Company totals
 * - Department breakdowns
 * - Partner portfolio summaries
 * - Employee count
 */
router.get('/company', auth_1.authMiddleware, async (req, res) => {
    try {
        const userId = req.user?.sub ? Number(req.user.sub) : undefined;
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        // Check admin authorization
        const roles = await prisma_1.default.userRole.findMany({
            where: { userId },
        });
        const isAdmin = roles.some(r => r.role === 'admin' || r.role === 'super_admin');
        if (!isAdmin) {
            return res.status(403).json({
                error: 'Only admins can access company-wide analytics',
            });
        }
        const context = await buildAnalyticsContext(userId);
        const nonFinancial = await roleAwareAnalytics_service_1.default.getCompanyNonFinancialMetrics();
        const financial = await roleAwareAnalytics_service_1.default.getCompanyFinancialMetrics();
        return res.json({
            nonFinancial,
            financial,
        });
    }
    catch (err) {
        console.error('Error fetching company analytics:', err);
        return res.status(500).json({ error: err.message });
    }
});
exports.default = router;
