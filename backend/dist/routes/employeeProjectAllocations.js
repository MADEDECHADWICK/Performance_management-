"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = __importDefault(require("../prisma"));
const router = (0, express_1.Router)();
// GET /employee_project_allocations?employee_ids=1,2&fields=allocation_amount
router.get('/', async (req, res) => {
    try {
        const { employee_ids } = req.query;
        let ids = [];
        if (employee_ids) {
            ids = employee_ids.split(',').map(id => parseInt(id.trim()));
        }
        const allocations = await prisma_1.default.employeeProjectAllocation.findMany({
            where: ids.length > 0 ? { employee_id: { in: ids } } : undefined,
            include: {
                employee: true,
                project: true,
            },
        });
        return res.json(allocations);
    }
    catch (err) {
        console.error('Error fetching employee project allocations:', err);
        return res.status(500).json({ error: 'Failed to fetch allocations' });
    }
});
exports.default = router;
