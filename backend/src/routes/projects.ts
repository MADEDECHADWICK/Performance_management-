import { Router } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import prisma from '../prisma';
import { createAudit } from '../utils/audit';

const router = Router();

// GET /projects?status=active
router.get('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    return res.json([]);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /projects/:id
router.get('/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    return res.json({ id: Number(req.params.id), message: 'Project view not available.' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /projects
router.post('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { project_name, project_code, client_id, description, start_date, end_date, budget, status } = req.body;

    if (!project_name) {
      return res.status(400).json({ error: 'project_name required' });
    }

    const project = {
      id: 0,
      projectName: project_name,
      projectCode: project_code,
      clientId: client_id ? Number(client_id) : undefined,
      description,
      startDate: start_date ? new Date(start_date) : undefined,
      endDate: end_date ? new Date(end_date) : undefined,
      budget: budget ? Number(budget) : undefined,
      status: status || 'active',
    };

    const performedBy = req.user?.userId;
    await createAudit({
      action: 'project:create',
      entity_type: 'project',
      user_id: performedBy,
      ip_address: req.ip,
    });

    return res.status(201).json(project);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// PATCH /projects/:id
router.patch('/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { project_name, description, status, end_date, budget } = req.body;

    const project = {
      id: Number(id),
      projectName: project_name,
      description,
      status,
      endDate: end_date ? new Date(end_date) : undefined,
      budget: budget ? Number(budget) : undefined,
    };

    const performedBy = req.user?.userId;
    await createAudit({
      action: 'project:update',
      entity_type: 'project',
      user_id: performedBy,
      ip_address: req.ip,
    });

    return res.json(project);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// DELETE /projects/:id
router.delete('/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const performedBy = req.user?.userId;
    await createAudit({
      action: 'project:delete',
      entity_type: 'project',
      user_id: performedBy,
      ip_address: req.ip,
    });

    return res.json({ ok: true, id: Number(id) });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
