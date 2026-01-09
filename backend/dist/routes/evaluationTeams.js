"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const client_1 = require("@prisma/client");
const prisma_1 = __importDefault(require("../prisma"));
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
// GET /evaluation_teams?department_id=...
router.get('/', async (req, res) => {
    try {
        const dept = req.query.department_id;
        let rows;
        if (dept)
            rows = await prisma_1.default.$queryRaw `SELECT * FROM evaluation_teams WHERE department_id = ${dept} ORDER BY "createdAt" DESC`;
        else
            rows = await prisma_1.default.$queryRaw `SELECT * FROM evaluation_teams ORDER BY "createdAt" DESC`;
        return res.json(rows || []);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// POST /evaluation_teams
router.post('/', auth_1.authMiddleware, async (req, res) => {
    try {
        const payload = req.body || {};
        if (!payload.team_name || !payload.department_id)
            return res.status(400).json({ error: 'team_name and department_id required' });
        const inserted = await prisma_1.default.$queryRaw(client_1.Prisma.sql `INSERT INTO evaluation_teams(team_name, description, department_id, created_by) VALUES (${payload.team_name}, ${payload.description}, ${payload.department_id}, ${payload.created_by}) RETURNING *`);
        return res.status(201).json(inserted[0] ?? null);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// PUT /evaluation_teams/:id
router.put('/:id', auth_1.authMiddleware, async (req, res) => {
    try {
        const id = req.params.id;
        const payload = req.body || {};
        if (!payload.team_name)
            return res.status(400).json({ error: 'team_name required' });
        const updated = await prisma_1.default.$queryRaw(client_1.Prisma.sql `UPDATE evaluation_teams SET team_name=${payload.team_name}, description=${payload.description} WHERE id=${id} RETURNING *`);
        return res.json(updated[0] ?? null);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// DELETE /evaluation_teams/:id
router.delete('/:id', auth_1.authMiddleware, async (req, res) => {
    try {
        const id = req.params.id;
        await prisma_1.default.$queryRaw `DELETE FROM evaluation_teams WHERE id = ${id}`;
        return res.json({ ok: true });
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
exports.default = router;
