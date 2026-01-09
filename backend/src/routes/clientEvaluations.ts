import { Router } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../prisma';

const router = Router();

// GET /client_evaluations?employee_ids=1,2&fields=overall_rating,submitted_at,would_recommend
router.get('/', async (req, res) => {
  try {
    const ids = (req.query.employee_ids as string | undefined)?.split(',').map(s => s.trim()).filter(Boolean) || [];
    const fieldsRequested = (req.query.fields as string | undefined) || '';

    const allowedFields = ['overall_rating','submitted_at','would_recommend','employee_id'];
    const fields = fieldsRequested
      ? fieldsRequested.split(',').map(f => f.trim()).filter(f => allowedFields.includes(f)).join(',')
      : 'overall_rating,submitted_at,would_recommend,employee_id';

    const where = ids.length > 0 ? Prisma.sql`WHERE employee_id IN (${Prisma.join(ids.map(id => Prisma.sql`${id}`))})` : Prisma.empty;
    const sql = Prisma.sql`SELECT ${Prisma.raw(fields)} FROM client_evaluations ${where}`;
    const rows = await prisma.$queryRaw(sql);
    return res.json(rows || []);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
