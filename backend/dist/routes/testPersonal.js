"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = __importDefault(require("../prisma"));
const router = (0, express_1.Router)();
// Test endpoint to debug personal data issues
router.get('/test-personal', async (req, res) => {
    try {
        console.log('Testing personal endpoint components...');
        const profileId = 4; // GMP profile ID
        // Test each query individually
        console.log('1. Testing personal jobs...');
        const personalJobs = await prisma_1.default.job.findMany({
            where: {
                OR: [
                    { partner_id: profileId },
                    { manager_id: profileId }
                ],
                status: 'active'
            },
            include: {
                client: true,
                jobStaffAssignments: {
                    include: {
                        employee: {
                            select: {
                                id: true,
                                first_name: true,
                                last_name: true,
                                position: true
                            }
                        }
                    }
                }
            }
        });
        console.log('✓ Personal jobs count:', personalJobs.length);
        console.log('2. Testing direct reports...');
        const directReports = await prisma_1.default.profile.findMany({
            where: { manager_id: profileId },
            include: {
                department: true,
                employeeEvaluations: {
                    orderBy: { createdAt: 'desc' },
                    take: 1
                }
            }
        });
        console.log('✓ Direct reports count:', directReports.length);
        console.log('3. Testing personal performance...');
        const personalPerformance = await prisma_1.default.employeeEvaluation.findFirst({
            where: { employee_id: profileId },
            orderBy: { createdAt: 'desc' }
        });
        console.log('✓ Personal performance found:', personalPerformance ? 'Yes' : 'No');
        res.json({
            success: true,
            personalJobs: personalJobs.length,
            directReports: directReports.length,
            personalPerformance: !!personalPerformance
        });
    }
    catch (error) {
        console.error('Test personal endpoint error:', error);
        res.status(500).json({
            error: error.message,
            stack: error.stack
        });
    }
});
exports.default = router;
