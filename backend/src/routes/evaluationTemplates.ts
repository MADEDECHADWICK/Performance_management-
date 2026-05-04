import { Router } from 'express';
import prisma from '../prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { resolveRequestAccessRoles } from "../auth/accessRoles";
import { loadProfile } from '../middleware/loadProfile';
import { requireModuleAccess } from '../middleware/requireModuleAccess';
import {
  normalizeEvaluationQuestions,
  summarizeEvaluationQuestions,
} from '../services/evaluationWorkflow.service';
import {
  parseResultAreaImportPayload,
  resultAreaLibraryToCsv,
  searchEvaluationResultAreaLibrary,
} from '../services/evaluationResultAreaLibrary.service';
import { createAudit } from '../utils/audit';

const router = Router();

const resolveRoles = (req: AuthRequest) => {
  return resolveRequestAccessRoles(req).map((role) => role.toLowerCase());
};

const isPrivileged = (roles: string[]) =>
  roles.includes('super_admin') ||
  roles.includes('hr');

const normalizeTemplateResponse = (template: any) => {
  const questions = normalizeEvaluationQuestions(template.questions, {
    fallbackTitle: template.name,
    competencies: template.competencies,
    evaluatorTypes: ['self', 'manager', 'peer', 'direct_report', 'client'],
  });

  return {
    ...template,
    questions,
    questionSummary: summarizeEvaluationQuestions(questions),
  };
};

// GET /evaluation-templates?isActive=true
router.get('/', authMiddleware, loadProfile, async (req: AuthRequest, res) => {
  try {
    const { isActive } = req.query;
    const roles = resolveRoles(req);
    const privileged = isPrivileged(roles);

    const templates = await prisma.evaluationTemplate.findMany({
      where: privileged
        ? isActive === 'true'
          ? { isActive: true }
          : undefined
        : { isActive: true },
      orderBy: { createdAt: 'desc' },
    });
    
    return res.json(templates.map((template) => normalizeTemplateResponse(template)));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/result-area-library', authMiddleware, loadProfile, async (req: AuthRequest, res) => {
  try {
    const library = searchEvaluationResultAreaLibrary({
      search: req.query.search as string | undefined,
      category: req.query.category as string | undefined,
      domain: req.query.domain as string | undefined,
      roleFamily: req.query.roleFamily as string | undefined,
      limit: Number(req.query.limit || 50),
      offset: Number(req.query.offset || 0),
    });
    return res.json(library);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/result-area-library/export.csv', authMiddleware, loadProfile, async (_req: AuthRequest, res) => {
  try {
    const csv = resultAreaLibraryToCsv();
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="evaluation-result-area-library.csv"');
    return res.send(csv);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.post(
  '/import',
  authMiddleware,
  loadProfile,
  requireModuleAccess('evaluations', 'admin'),
  async (req: AuthRequest, res) => {
    try {
      const userId = req.user?.userId ? Number(req.user.userId) : undefined;
      const name = String(req.body?.name || '').trim();
      const questions = parseResultAreaImportPayload(req.body);

      if (!name) {
        return res.status(400).json({ error: 'Template name is required' });
      }
      if (questions.length === 0) {
        return res.status(400).json({ error: 'At least one result area is required' });
      }

      const template = await prisma.evaluationTemplate.create({
        data: {
          name,
          description: req.body?.description,
          templateType: req.body?.templateType || 'imported_result_area_library',
          bscCategory: req.body?.bscCategory,
          questions: normalizeEvaluationQuestions(questions, {
            fallbackTitle: name,
            evaluatorTypes: ['self', 'manager', 'peer', 'direct_report', 'client'],
          }),
          createdBy: userId,
          isActive: true,
        },
      });

      await createAudit({
        action: 'import_evaluation_template',
        entity_type: 'evaluation_template',
        user_id: userId,
        ip_address: req.ip,
      });

      return res.status(201).json(normalizeTemplateResponse(template));
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  }
);

// GET /evaluation-templates/:id
router.get('/:id', authMiddleware, loadProfile, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const roles = resolveRoles(req);
    const privileged = isPrivileged(roles);

    const template = await prisma.evaluationTemplate.findUnique({
      where: { id: parseInt(id) },
    });
    
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    if (!privileged && !template.isActive) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    return res.json(normalizeTemplateResponse(template));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /evaluation-templates
router.post(
  '/',
  authMiddleware,
  loadProfile,
  requireModuleAccess('evaluations', 'admin'),
  async (req: AuthRequest, res) => {
  try {
    const {
      name,
      description,
      templateType,
      bscCategory,
      competencies,
      questions,
    } = req.body;
    const userId = req.user?.userId ? Number(req.user.userId) : undefined;
    const templateName = name;
    const resolvedType = templateType;
    const resolvedCategory = bscCategory;
    
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
        questions: normalizeEvaluationQuestions(questions, {
          fallbackTitle: templateName,
          competencies,
          evaluatorTypes: ['self', 'manager', 'peer', 'direct_report', 'client'],
        }),
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
    
    return res.status(201).json(normalizeTemplateResponse(template));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// PATCH /evaluation-templates/:id
router.patch(
  '/:id',
  authMiddleware,
  loadProfile,
  requireModuleAccess('evaluations', 'admin'),
  async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      description,
      templateType,
      bscCategory,
      competencies,
      questions,
      isActive,
    } = req.body;
    const userId = req.user?.userId ? Number(req.user.userId) : undefined;
    
    const template = await prisma.evaluationTemplate.update({
      where: { id: parseInt(id) },
      data: {
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(templateType && { templateType }),
        ...(bscCategory !== undefined && { bscCategory }),
        ...(competencies !== undefined && { competencies }),
        ...(questions !== undefined && {
          questions: normalizeEvaluationQuestions(questions, {
            fallbackTitle: name,
            competencies,
            evaluatorTypes: ['self', 'manager', 'peer', 'direct_report', 'client'],
          }),
        }),
        ...(isActive !== undefined && { isActive }),
      },
    });
    
    await createAudit({
      action: 'update_evaluation_template',
      entity_type: 'evaluation_template',
      user_id: userId,
      ip_address: req.ip,
    });
    
    return res.json(normalizeTemplateResponse(template));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// DELETE /evaluation-templates/:id
router.delete(
  '/:id',
  authMiddleware,
  loadProfile,
  requireModuleAccess('evaluations', 'admin'),
  async (req: AuthRequest, res) => {
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
