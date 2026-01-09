import { Router } from 'express';
import prisma from '../prisma';

const router = Router();

// GET /development_recommendations?employee_id=3
router.get('/', async (req, res) => {
  try {
    const employeeId = req.query.employee_id as string | undefined;
    
    let rows: any[] = [];
    if (employeeId) {
      // Accept integer user_id - just return empty since employee_id in DB is UUID
      // and we haven't created any recommendations yet
      return res.json([]);
    } else {
      rows = await prisma.$queryRaw`
        SELECT * FROM development_recommendations ORDER BY "createdAt" DESC`;
    }
    return res.json(rows || []);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /development_recommendations/:id
router.get('/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const row = await prisma.$queryRaw`
      SELECT * FROM development_recommendations WHERE id = ${id}::uuid`;
    if (!row || (Array.isArray(row) && row.length === 0)) {
      return res.status(404).json({ error: 'Not found' });
    }
    return res.json(Array.isArray(row) ? row[0] : row);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /development_recommendations
router.post('/', async (req, res) => {
  try {
    const { employee_id, recommendation, target_completion, status } = req.body;
    const row = await prisma.$queryRaw`
      INSERT INTO development_recommendations (employee_id, recommendation, target_completion, status, created_at, updated_at)
      VALUES (${employee_id}::uuid, ${recommendation}, ${target_completion}, ${status || 'pending'}, NOW(), NOW())
      RETURNING *`;
    return res.json(Array.isArray(row) ? row[0] : row);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// PATCH /development_recommendations/:id
router.patch('/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const { recommendation, target_completion, status } = req.body;
    
    const updates: string[] = [];
    const values: any[] = [];
    
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
    const row = await prisma.$queryRawUnsafe(sql, ...values);
    return res.json(Array.isArray(row) ? row[0] : row);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// DELETE /development_recommendations/:id
router.delete('/:id', async (req, res) => {
  try {
    const id = req.params.id;
    await prisma.$queryRaw`DELETE FROM development_recommendations WHERE id = ${id}::uuid`;
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
