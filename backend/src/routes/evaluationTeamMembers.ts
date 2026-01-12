import { Router } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../prisma';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// GET /evaluation_team_members?team_id=...
router.get('/', async (req, res) => {
  try {
    const teamId = req.query.team_id as string | undefined;
    let rows;
    if (teamId) rows = await prisma.$queryRaw<any>`SELECT etm.*, p.first_name, p.last_name FROM evaluation_team_members etm LEFT JOIN profiles p ON p.id = etm.employee_id WHERE etm.team_id = ${teamId}`;
    else rows = await prisma.$queryRaw<any>`SELECT * FROM evaluation_team_members`;
    return res.json(rows || []);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /evaluation_team_members (accepts array or single object)
router.post('/', authMiddleware, async (req, res) => {
  try {
    const body = req.body;
    if (Array.isArray(body)) {
      if (body.length === 0) return res.status(400).json({ error: 'empty array' });
      
      const data = body.map((b: any) => ({
        team_id: b.team_id,
        employee_id: b.employee_id,
        role: b.role
      }));
      
      const rows = await prisma.evaluationTeamMember.createMany({
        data: data
      });
      
      // Fetch the created records to return them
      const created = await prisma.evaluationTeamMember.findMany({
        where: {
          team_id: { in: body.map((b: any) => b.team_id) },
          employee_id: { in: body.map((b: any) => b.employee_id) }
        },
        orderBy: { createdAt: 'desc' },
        take: body.length
      });
      
      return res.status(201).json(created);
    } else {
      const { team_id, employee_id, role } = body;
      if (!team_id || !employee_id) return res.status(400).json({ error: 'team_id and employee_id required' });
      
      const row = await prisma.evaluationTeamMember.create({
        data: {
          team_id: team_id,
          employee_id: employee_id,
          role: role
        }
      });
      
      return res.status(201).json(row);
    }
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// DELETE /evaluation_team_members?team_id=...
router.delete('/', authMiddleware, async (req, res) => {
  try {
    const teamId = req.query.team_id as string | undefined;
    if (!teamId) return res.status(400).json({ error: 'team_id required' });
    await prisma.$queryRaw`DELETE FROM evaluation_team_members WHERE team_id = ${teamId}`;
    return res.json({ ok: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
