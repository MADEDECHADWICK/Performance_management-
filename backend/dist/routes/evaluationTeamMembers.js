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
// GET /evaluation_team_members?team_id=...
router.get('/', async (req, res) => {
    try {
        const teamId = req.query.team_id;
        let rows;
        if (teamId)
            rows = await prisma_1.default.$queryRaw `SELECT etm.*, p.first_name, p.last_name FROM evaluation_team_members etm LEFT JOIN profiles p ON p.id = etm.employee_id WHERE etm.team_id = ${teamId}`;
        else
            rows = await prisma_1.default.$queryRaw `SELECT * FROM evaluation_team_members`;
        return res.json(rows || []);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// POST /evaluation_team_members (accepts array or single object)
router.post('/', auth_1.authMiddleware, async (req, res) => {
    try {
        const body = req.body;
        if (Array.isArray(body)) {
            if (body.length === 0)
                return res.status(400).json({ error: 'empty array' });
            const values = client_1.Prisma.join(body.map((b) => client_1.Prisma.sql `(${b.team_id}, ${b.employee_id})`));
            const rows = await prisma_1.default.$queryRaw(client_1.Prisma.sql `INSERT INTO evaluation_team_members(team_id, employee_id) VALUES ${values} RETURNING *`);
            return res.status(201).json(rows || []);
        }
        else {
            const { team_id, employee_id } = body;
            if (!team_id || !employee_id)
                return res.status(400).json({ error: 'team_id and employee_id required' });
            const row = await prisma_1.default.$queryRaw(client_1.Prisma.sql `INSERT INTO evaluation_team_members(team_id, employee_id) VALUES (${team_id}, ${employee_id}) RETURNING *`);
            return res.status(201).json(row[0] ?? null);
        }
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// DELETE /evaluation_team_members?team_id=...
router.delete('/', auth_1.authMiddleware, async (req, res) => {
    try {
        const teamId = req.query.team_id;
        if (!teamId)
            return res.status(400).json({ error: 'team_id required' });
        await prisma_1.default.$queryRaw `DELETE FROM evaluation_team_members WHERE team_id = ${teamId}`;
        return res.json({ ok: true });
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
exports.default = router;
