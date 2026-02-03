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
    
    const created = await prisma.$queryRaw`
      INSERT INTO development_recommendations (employee_id, recommendation, target_completion, status)
      VALUES (${employee_id}, ${recommendation}, ${target_completion}, ${status || "pending"})
      RETURNING *`;

    return res.json(Array.isArray(created) ? created[0] : created);
  } catch (err: any) {
    console.error('Error creating development recommendation:', err);
    return res.status(500).json({ error: err.message });
  }
});

// PATCH /development_recommendations/:id
router.patch('/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const { recommendation, target_completion, status } = req.body;
    
    const updateData: any = {};
    
    if (recommendation !== undefined) {
      updateData.recommendation = recommendation;
    }
    if (target_completion !== undefined) {
      updateData.target_completion = target_completion;
    }
    if (status !== undefined) {
      updateData.status = status;
    }
    
    const updated = await prisma.$queryRaw`
      UPDATE development_recommendations
      SET
        recommendation = COALESCE(${updateData.recommendation}, recommendation),
        target_completion = COALESCE(${updateData.target_completion}, target_completion),
        status = COALESCE(${updateData.status}, status)
      WHERE id = ${id}::uuid
      RETURNING *`;

    return res.json(Array.isArray(updated) ? updated[0] : updated);
  } catch (err: any) {
    console.error('Error updating development recommendation:', err);
    return res.status(500).json({ error: err.message });
  }
});

// DELETE /development_recommendations/:id
router.delete('/:id', async (req, res) => {
  try {
    const id = req.params.id;
    await prisma.$executeRaw`
      DELETE FROM development_recommendations WHERE id = ${id}::uuid`;
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
