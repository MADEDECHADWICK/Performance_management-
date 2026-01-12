import { Router } from 'express';
import prisma from '../prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { createAudit } from '../utils/audit';

const router = Router();

// GET /evaluation_templates?is_active=true
router.get('/', async (req, res) => {
  try {
    const { is_active } = req.query;
    
    const templates = await prisma.evaluationTemplate.findMany({
      where: is_active === 'true' ? { is_active: true } : undefined,
      orderBy: { createdAt: 'desc' },
    });
    
    return res.json(templates);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /evaluation_templates/:id
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const template = await prisma.evaluationTemplate.findUnique({
      where: { id: parseInt(id) },
    });
    
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    
    return res.json(template);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /evaluation_templates
router.post('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { template_name, description, template_type, questions } = req.body;
    const userId = req.user?.sub ? Number(req.user.sub) : undefined;
    
    if (!template_name) {
      return res.status(400).json({ error: 'Template name is required' });
    }
    
    const template = await prisma.evaluationTemplate.create({
      data: {
        template_name,
        description,
        template_type,
        questions,
        created_by: userId,
        is_active: true,
      },
    });
    
    await createAudit({
      action: 'create_evaluation_template',
      entity_type: 'evaluation_template',
      user_id: userId,
      ip_address: req.ip,
    });
    
    return res.status(201).json(template);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// PATCH /evaluation_templates/:id
router.patch('/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { template_name, description, template_type, questions, is_active } = req.body;
    const userId = req.user?.sub ? Number(req.user.sub) : undefined;
    
    const template = await prisma.evaluationTemplate.update({
      where: { id: parseInt(id) },
      data: {
        ...(template_name && { template_name }),
        ...(description !== undefined && { description }),
        ...(template_type && { template_type }),
        ...(questions !== undefined && { questions }),
        ...(is_active !== undefined && { is_active }),
      },
    });
    
    await createAudit({
      action: 'update_evaluation_template',
      entity_type: 'evaluation_template',
      user_id: userId,
      ip_address: req.ip,
    });
    
    return res.json(template);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// DELETE /evaluation_templates/:id
router.delete('/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.sub ? Number(req.user.sub) : undefined;
    
    await prisma.evaluationTemplate.delete({
      where: { id: parseInt(id) },
    });
    
    await createAudit({
      action: 'delete_evaluation_template',
      entity_type: 'evaluation_template',
      user_id: userId,
      ip_address: req.ip,
    });
    
    return res.json({ ok: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;