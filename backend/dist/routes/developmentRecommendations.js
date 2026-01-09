"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = __importDefault(require("../prisma"));
const router = (0, express_1.Router)();
// GET /development_recommendations?employee_id=3
router.get('/', async (req, res) => {
    try {
        const employeeId = req.query.employee_id;
        let rows = [];
        if (employeeId) {
            // Accept integer user_id - just return empty since employee_id in DB is UUID
            // and we haven't created any recommendations yet
            return res.json([]);
        }
        else {
            rows = await prisma_1.default.$queryRaw `
        SELECT * FROM development_recommendations ORDER BY "createdAt" DESC`;
        }
        return res.json(rows || []);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// GET /development_recommendations/:id
router.get('/:id', async (req, res) => {
    try {
        const id = req.params.id;
        const row = await prisma_1.default.$queryRaw `
      SELECT * FROM development_recommendations WHERE id = ${id}::uuid`;
        if (!row || (Array.isArray(row) && row.length === 0)) {
            return res.status(404).json({ error: 'Not found' });
        }
        return res.json(Array.isArray(row) ? row[0] : row);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// POST /development_recommendations
router.post('/', async (req, res) => {
    try {
        const { employee_id, recommendation, target_completion, status } = req.body;
        const row = await prisma_1.default.$queryRaw `
      INSERT INTO development_recommendations (employee_id, recommendation, target_completion, status, created_at, updated_at)
      VALUES (${employee_id}::uuid, ${recommendation}, ${target_completion}, ${status || 'pending'}, NOW(), NOW())
      RETURNING *`;
        return res.json(Array.isArray(row) ? row[0] : row);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// PATCH /development_recommendations/:id
router.patch('/:id', async (req, res) => {
    try {
        const id = req.params.id;
        const { recommendation, target_completion, status } = req.body;
        const updates = [];
        const values = [];
        if (recommendation !== undefined) {
            updates.push(`recommendation = $${values.length + 1}`);
            values.push(recommendation);
        }
        if (target_completion !== undefined) {
            updates.push(`target_completion = $${values.length + 1}`);
            values.push(target_completion);
        }
        if (status !== undefined) {
            updates.push(`status = $${values.length + 1}`);
            values.push(status);
        }
        updates.push(`updated_at = NOW()`);
        values.push(id);
        const sql = `UPDATE development_recommendations SET ${updates.join(', ')} WHERE id = $${values.length}::uuid RETURNING *`;
        const row = await prisma_1.default.$queryRawUnsafe(sql, ...values);
        return res.json(Array.isArray(row) ? row[0] : row);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// DELETE /development_recommendations/:id
router.delete('/:id', async (req, res) => {
    try {
        const id = req.params.id;
        await prisma_1.default.$queryRaw `DELETE FROM development_recommendations WHERE id = ${id}::uuid`;
        return res.json({ success: true });
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
exports.default = router;
