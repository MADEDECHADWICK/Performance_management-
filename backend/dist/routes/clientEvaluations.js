"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const client_1 = require("@prisma/client");
const prisma_1 = __importDefault(require("../prisma"));
const router = (0, express_1.Router)();
// GET /client_evaluations?employee_ids=1,2&fields=overall_rating,submitted_at,would_recommend
router.get('/', async (req, res) => {
    try {
        const ids = req.query.employee_ids?.split(',').map(s => s.trim()).filter(Boolean) || [];
        const fieldsRequested = req.query.fields || '';
        const allowedFields = ['overall_rating', 'submitted_at', 'would_recommend', 'employee_id'];
        const fields = fieldsRequested
            ? fieldsRequested.split(',').map(f => f.trim()).filter(f => allowedFields.includes(f)).join(',')
            : 'overall_rating,submitted_at,would_recommend,employee_id';
        const where = ids.length > 0 ? client_1.Prisma.sql `WHERE employee_id IN (${client_1.Prisma.join(ids.map(id => client_1.Prisma.sql `${id}`))})` : client_1.Prisma.empty;
        const sql = client_1.Prisma.sql `SELECT ${client_1.Prisma.raw(fields)} FROM client_evaluations ${where}`;
        const rows = await prisma_1.default.$queryRaw(sql);
        return res.json(rows || []);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
exports.default = router;
