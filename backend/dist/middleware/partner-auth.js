"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkJobAccess = exports.requireAdmin = exports.requirePartner = exports.authMiddleware = exports.UserRole = void 0;
exports.getAuthContext = getAuthContext;
exports.hasRole = hasRole;
exports.hasAnyRole = hasAnyRole;
exports.canAccessJob = canAccessJob;
exports.canApproveTimeEntries = canApproveTimeEntries;
exports.canViewPartnerPortfolio = canViewPartnerPortfolio;
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
var UserRole;
(function (UserRole) {
    UserRole["SUPER_ADMIN"] = "super_admin";
    UserRole["HR_MANAGER"] = "hr_manager";
    UserRole["PARTNER"] = "partner";
    UserRole["MANAGER"] = "manager";
    UserRole["EMPLOYEE"] = "employee";
    UserRole["CLIENT"] = "client";
})(UserRole || (exports.UserRole = UserRole = {}));
/**
 * Get current user's auth context from user_id in request
 */
async function getAuthContext(userId) {
    if (!userId)
        return null;
    try {
        // Fetch user roles
        const roleData = await prisma.userRole.findMany({
            where: { userId },
            select: { role: true },
        });
        const roles = roleData.map((r) => r.role);
        // Check if user is a partner
        const profileData = await prisma.profile.findUnique({
            where: { userId },
            select: {
                id: true,
                is_partner: true,
            },
        });
        return {
            userId,
            roles,
            isPartner: profileData?.is_partner || false,
            partnerId: profileData?.id,
        };
    }
    catch (error) {
        console.error('Error getting auth context:', error);
        return null;
    }
}
/**
 * Verify if user has required role
 */
function hasRole(context, role) {
    return context.roles.includes(role);
}
/**
 * Verify if user has any of the required roles
 */
function hasAnyRole(context, roles) {
    return roles.some((role) => context.roles.includes(role));
}
/**
 * Verify user can access specific job
 */
async function canAccessJob(jobId, context) {
    // Verify job exists first
    const job = await prisma.job.findUnique({
        where: { id: jobId },
        select: {
            partner_id: true,
            assigned_to: true,
        },
    });
    if (!job)
        return false;
    // Super admin/HR can access all existing jobs
    if (hasAnyRole(context, [UserRole.SUPER_ADMIN, UserRole.HR_MANAGER])) {
        return true;
    }
    // Partner can access own jobs
    if (context.isPartner && job.partner_id === context.partnerId) {
        return true;
    }
    // Employee can access assigned jobs
    if (job.assigned_to === context.partnerId) {
        return true;
    }
    // Manager can access team jobs
    if (context.roles.includes(UserRole.MANAGER)) {
        const assignedEmployee = await prisma.profile.findUnique({
            where: { id: job.assigned_to || undefined },
            select: { manager_id: true },
        });
        if (assignedEmployee?.manager_id === context.partnerId) {
            return true;
        }
    }
    return false;
}
/**
 * Verify user can approve time entries for job
 */
async function canApproveTimeEntries(jobId, context) {
    // Only partners and HR can approve
    if (!hasAnyRole(context, [UserRole.SUPER_ADMIN, UserRole.HR_MANAGER])) {
        if (!context.isPartner) {
            return false;
        }
    }
    // Check if partner owns the job
    if (context.isPartner) {
        const job = await prisma.job.findUnique({
            where: { id: jobId },
            select: { partner_id: true },
        });
        if (job?.partner_id !== context.partnerId) {
            return false;
        }
    }
    return true;
}
/**
 * Verify user can view partner portfolio
 */
async function canViewPartnerPortfolio(portfolioOwnerId, context) {
    // Super admin/HR can view all
    if (hasAnyRole(context, [UserRole.SUPER_ADMIN, UserRole.HR_MANAGER])) {
        return true;
    }
    // Partner can view own portfolio
    if (context.isPartner && context.partnerId === portfolioOwnerId) {
        return true;
    }
    return false;
}
/**
 * Authentication middleware - extracts user ID from JWT token
 */
const authMiddleware = async (req, res, next) => {
    try {
        // Get user_id from JWT token (set by main auth middleware)
        let userId = null;
        if (req.user?.sub) {
            userId = req.user.sub;
        }
        else if (req.query.user_id) {
            userId = parseInt(req.query.user_id);
        }
        else if (req.body?.user_id) {
            userId = parseInt(req.body.user_id);
        }
        if (!userId) {
            res.status(401).json({ error: 'Unauthorized - user_id required' });
            return;
        }
        // Get auth context
        const authContext = await getAuthContext(userId);
        if (!authContext) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        // Attach to request
        req.authContext = authContext;
        req.userId = userId;
        next();
    }
    catch (error) {
        console.error('Auth middleware error:', error);
        res.status(500).json({ error: 'Authentication error' });
    }
};
exports.authMiddleware = authMiddleware;
/**
 * Partner role check middleware
 */
const requirePartner = (req, res, next) => {
    if (!req.authContext?.isPartner) {
        res.status(403).json({ error: 'Forbidden - Partner access required' });
        return;
    }
    next();
};
exports.requirePartner = requirePartner;
/**
 * Admin role check middleware
 */
const requireAdmin = (req, res, next) => {
    if (!req.authContext ||
        !hasAnyRole(req.authContext, [UserRole.SUPER_ADMIN, UserRole.HR_MANAGER])) {
        res.status(403).json({ error: 'Forbidden - Admin access required' });
        return;
    }
    next();
};
exports.requireAdmin = requireAdmin;
/**
 * Job access check middleware
 */
const checkJobAccess = async (req, res, next) => {
    try {
        const jobId = parseInt(req.params.jobId);
        if (!req.authContext) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        const canAccess = await canAccessJob(jobId, req.authContext);
        if (!canAccess) {
            res.status(403).json({ error: 'Forbidden - No access to this job' });
            return;
        }
        next();
    }
    catch (error) {
        console.error('Job access check error:', error);
        res.status(500).json({ error: 'Access check failed' });
    }
};
exports.checkJobAccess = checkJobAccess;
