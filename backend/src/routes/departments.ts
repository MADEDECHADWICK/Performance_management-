import { Router } from 'express';
import prisma from '../prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

// GET /departments
router.get('/', async (_req, res) => {
  try {
    const departments = await prisma.department.findMany({
      orderBy: { name: 'asc' },
    });
    return res.json(departments || []);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /departments - Create a new department
router.post('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { name, description, department_code, department_head_id } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Department name is required' });
    }

    const department = await prisma.department.create({
      data: {
        name: name.trim(),
        description: description ? description.trim() : null,
        department_code: department_code ? department_code.trim() : null,
        department_head_id: department_head_id ? Number(department_head_id) : null,
      },
    });

    return res.json(department);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// PATCH /departments/:id - Update a department
router.patch('/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { name, description, department_code, department_head_id } = req.body;

    const updateData: any = {};
    if (name !== undefined) updateData.name = name.trim();
    if (description !== undefined) updateData.description = description ? description.trim() : null;
    if (department_code !== undefined) updateData.department_code = department_code ? department_code.trim() : null;
    if (department_head_id !== undefined) updateData.department_head_id = department_head_id ? Number(department_head_id) : null;

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    const department = await prisma.department.update({
      where: { id: Number(id) },
      data: updateData,
    });

    return res.json(department);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// DELETE /departments/:id - Delete a department
router.delete('/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    await prisma.department.delete({
      where: { id: Number(id) },
    });

    return res.json({ success: true, message: 'Department deleted successfully' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
