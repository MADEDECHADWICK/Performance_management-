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
    
    const inserted = await prisma.evaluationTeam.create({
      data: {
        name: payload.team_name,
        description: payload.description,
        department_id: payload.department_id,
        created_by: payload.created_by
      }
    });
    
    return res.status(201).json(inserted);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// PUT /evaluation_teams/:id
router.put('/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    const payload = req.body || {};
    if (!payload.team_name) return res.status(400).json({ error: 'team_name required' });
    
    const updated = await prisma.evaluationTeam.update({
      where: { id: id },
      data: {
        name: payload.team_name,
        description: payload.description
      }
    });
    
    return res.json(updated);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// DELETE /evaluation_teams/:id
router.delete('/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    await prisma.evaluationTeam.delete({
      where: { id: id }
    });
    return res.json({ ok: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
