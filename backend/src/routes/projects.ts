import { Router } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import prisma from '../prisma';
import { createAudit } from '../utils/audit';

const router = Router();

// GET /projects?status=active
router.get('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const status = req.query.status as string | undefined;

    const where: any = {};
    if (status) {
      where.status = status;
    }

    const projects = await prisma.project.findMany({
      where: Object.keys(where).length > 0 ? where : undefined,
      include: {
        client: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return res.json(projects || []);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /projects/:id
router.get('/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const project = await prisma.project.findUnique({
      where: { id: parseInt(req.params.id) },
      include: {
        client: true,
        workLogs: true,
        projectFinancials: true,
      },
    });

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    return res.json(project);
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

    const project = await prisma.project.create({
      data: {
        project_name,
        project_code,
        client_id: client_id ? parseInt(client_id) : undefined,
        description,
        start_date: start_date ? new Date(start_date) : undefined,
        end_date: end_date ? new Date(end_date) : undefined,
        budget: budget ? parseFloat(budget) : undefined,
        status: status || 'active',
      },
      include: { client: true },
    });

    const performedBy = req.user?.sub ? Number(req.user.sub) : undefined;
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

    const project = await prisma.project.update({
      where: { id: parseInt(id) },
      data: {
        project_name,
        description,
        status,
        end_date: end_date ? new Date(end_date) : undefined,
        budget: budget ? parseFloat(budget) : undefined,
      },
      include: { client: true },
    });

    const performedBy = req.user?.sub ? Number(req.user.sub) : undefined;
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

    await prisma.project.delete({
      where: { id: parseInt(id) },
    });

    const performedBy = req.user?.sub ? Number(req.user.sub) : undefined;
    await createAudit({
      action: 'project:delete',
      entity_type: 'project',
      user_id: performedBy,
      ip_address: req.ip,
    });

    return res.json({ ok: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
