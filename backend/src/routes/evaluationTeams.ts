import { Router } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

// GET /evaluation_teams?department_id=...
router.get('/', async (req, res) => {
  try {
    const dept = req.query.department_id as string | undefined;
    let rows;
    if (dept) rows = await prisma.$queryRaw<any>`SELECT * FROM evaluation_teams WHERE department_id = ${dept} ORDER BY "createdAt" DESC`;
    else rows = await prisma.$queryRaw<any>`SELECT * FROM evaluation_teams ORDER BY "createdAt" DESC`;
    return res.json(rows || []);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /evaluation_teams
router.post('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const payload = req.body || {};
    if (!payload.team_name || !payload.department_id) return res.status(400).json({ error: 'team_name and department_id required' });
    const inserted = await prisma.$queryRaw<any>(Prisma.sql`INSERT INTO evaluation_teams(team_name, description, department_id, created_by) VALUES (${payload.team_name}, ${payload.description}, ${payload.department_id}, ${payload.created_by}) RETURNING *` as any);
    return res.status(201).json((inserted as any[])[0] ?? null);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// PUT /evaluation_teams/:id
router.put('/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const id = req.params.id;
    const payload = req.body || {};
    if (!payload.team_name) return res.status(400).json({ error: 'team_name required' });
    const updated = await prisma.$queryRaw<any>(Prisma.sql`UPDATE evaluation_teams SET team_name=${payload.team_name}, description=${payload.description} WHERE id=${id} RETURNING *` as any);
    return res.json((updated as any[])[0] ?? null);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// DELETE /evaluation_teams/:id
router.delete('/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const id = req.params.id;
    await prisma.$queryRaw`DELETE FROM evaluation_teams WHERE id = ${id}`;
    return res.json({ ok: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
