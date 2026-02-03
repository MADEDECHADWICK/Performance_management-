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
      where: is_active === 'true' ? { isActive: true } : undefined,
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
    const {
      name,
      template_name,
      description,
      templateType,
      template_type,
      bscCategory,
      bsc_category,
      competencies,
      questions,
    } = req.body;
    const userId = req.user?.userId ? Number(req.user.userId) : undefined;
    const templateName = name ?? template_name;
    const resolvedType = templateType ?? template_type;
    const resolvedCategory = bscCategory ?? bsc_category;
    
    if (!templateName) {
      return res.status(400).json({ error: 'Template name is required' });
    }
    
    const template = await prisma.evaluationTemplate.create({
      data: {
        name: templateName,
        description,
        templateType: resolvedType,
        bscCategory: resolvedCategory,
        competencies: competencies ?? undefined,
        questions,
        createdBy: userId,
        isActive: true,
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
    const {
      name,
      template_name,
      description,
      templateType,
      template_type,
      bscCategory,
      bsc_category,
      competencies,
      questions,
      is_active,
      isActive,
    } = req.body;
    const userId = req.user?.userId ? Number(req.user.userId) : undefined;
    
    const template = await prisma.evaluationTemplate.update({
      where: { id: parseInt(id) },
      data: {
        ...(name && { name }),
        ...(template_name && { name: template_name }),
        ...(description !== undefined && { description }),
        ...(templateType && { templateType }),
        ...(template_type && { templateType: template_type }),
        ...(bscCategory !== undefined && { bscCategory }),
        ...(bsc_category !== undefined && { bscCategory: bsc_category }),
        ...(competencies !== undefined && { competencies }),
        ...(questions !== undefined && { questions }),
        ...(is_active !== undefined && { isActive: is_active }),
        ...(isActive !== undefined && { isActive }),
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
    const userId = req.user?.userId ? Number(req.user.userId) : undefined;
    
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
