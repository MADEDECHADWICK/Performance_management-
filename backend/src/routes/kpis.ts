import { Router } from 'express';
import { OkrApprovalStatus, OkrStatus } from '@prisma/client';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { requireModuleAccess } from '../middleware/requireModuleAccess';
import prisma from '../prisma';

const router = Router();

const legacyKpiWriteBlocked = () => process.env.KPI_V2_HARD_CUTOVER !== "false";
router.use((req, res, next) => {
  if (req.method !== "GET" && legacyKpiWriteBlocked()) {
    return res.status(410).json({
      error: "Legacy KPI workflow is decommissioned. Use /api/kpi (cascade V2).",
      code: "LEGACY_KPI_DECOMMISSIONED",
    });
  }
  return next();
});

type InitiativeKeyResultInput = {
  title: string;
  unit?: string;
  targetValue?: number;
  weight?: number;
};

type InitiativeInput = {
  title: string;
  description?: string;
  targetValue?: number;
  unit?: string;
  weight?: number;
  keyResults: InitiativeKeyResultInput[];
};

const parseOptionalNumber = (value: unknown): number | undefined => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const parseOptionalInt = (value: unknown): number | undefined => {
  const parsed = parseOptionalNumber(value);
  if (parsed === undefined) return undefined;
  return Number.isInteger(parsed) ? parsed : undefined;
};

const parseAssignmentScope = (value: unknown): 'individual' | 'department' | undefined => {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase();
  if (normalized === 'individual') return 'individual';
  if (normalized === 'department') return 'department';
  return undefined;
};

const parseOptionalBoolean = (value: unknown): boolean | undefined => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'y'].includes(normalized)) return true;
    if (['false', '0', 'no', 'n'].includes(normalized)) return false;
  }
  return undefined;
};

const parseOptionalString = (value: unknown): string | undefined => {
  if (value === undefined || value === null) return undefined;
  const normalized = String(value).trim();
  return normalized ? normalized : undefined;
};

const parseInitiatives = (value: unknown): InitiativeInput[] => {
  if (!Array.isArray(value)) return [];

  const initiatives: InitiativeInput[] = [];

  value.forEach((item) => {
    if (typeof item === 'string') {
      const title = parseOptionalString(item);
      if (!title) return;
      initiatives.push({
        title,
        keyResults: [],
      });
      return;
    }

    if (!item || typeof item !== 'object') return;

    const row = item as Record<string, unknown>;
    const title = parseOptionalString(
      row.title ?? row.name ?? row.initiative ?? row.objective
    );
    if (!title) return;

    const description = parseOptionalString(row.description ?? row.notes);
    const targetValue = parseOptionalNumber(row.targetValue);
    const unit = parseOptionalString(row.unit ?? row.measurementUnit);
    const weight = parseOptionalNumber(row.weight);

    const keyResultsRaw = Array.isArray(row.keyResults) ? row.keyResults : [];

    const keyResults: InitiativeKeyResultInput[] = keyResultsRaw
      .map((keyResult) => {
        if (typeof keyResult === 'string') {
          const keyResultTitle = parseOptionalString(keyResult);
          if (!keyResultTitle) return null;
          return { title: keyResultTitle };
        }
        if (!keyResult || typeof keyResult !== 'object') return null;
        const parsed = keyResult as Record<string, unknown>;
        const keyResultTitle = parseOptionalString(
          parsed.title ?? parsed.name ?? parsed.metric
        );
        if (!keyResultTitle) return null;
        return {
          title: keyResultTitle,
          unit: parseOptionalString(parsed.unit ?? parsed.measurementUnit),
          targetValue: parseOptionalNumber(parsed.targetValue),
          weight: parseOptionalNumber(parsed.weight),
        };
      })
      .filter(Boolean) as InitiativeKeyResultInput[];

    initiatives.push({
      title,
      description,
      targetValue,
      unit,
      weight,
      keyResults,
    });
  });

  return initiatives;
};

// GET /kpis - List all KPIs
router.get('/', async (req, res) => {
  try {
    const isActiveQuery = req.query.isActive;
    const isActive =
      typeof isActiveQuery === 'string'
        ? isActiveQuery.toLowerCase() === 'true'
        : undefined;

    const kpis = await prisma.kpi.findMany({
      where: typeof isActive === 'boolean' ? { isActive } : undefined,
      include: {
        department: true,
        role: true,
        employeeAssignments: true,
        employeeScores: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return res.json(kpis || []);
  } catch (err: any) {
    console.error('Error fetching KPIs:', err);
    return res.status(500).json({ error: 'Failed to fetch KPIs' });
  }
});

// GET /kpis/:id
router.get('/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const kpi = await prisma.kpi.findUnique({
      where: { id: parseInt(id) },
      include: {
        department: true,
        role: true,
        employeeAssignments: true,
        employeeScores: true,
      },
    });
    if (!kpi) {
      return res.status(404).json({ error: 'KPI not found' });
    }
    return res.json(kpi);
  } catch (err: any) {
    console.error('Error fetching KPI:', err);
    return res.status(500).json({ error: 'Failed to fetch KPI' });
  }
});

// POST /kpis
router.post(
  '/',
  authMiddleware,
  requireModuleAccess('kpis', 'admin'),
  async (req: AuthRequest, res) => {
  try {
    const {
      name,
      description,
      category,
      kpiType,
      measurementUnit,
      targetValue,
      targetFrequency,
      targetDescription,
      targetType,
      targetText,
      baselineText,
      redThreshold,
      amberThreshold,
      greenThreshold,
      weight,
      departmentId,
      roleId,
      strategicTheme,
      strategicObjective,
      criticalSuccessFactor,
      indicatorType,
      kpiCategory,
      reviewOwnerProfileId,
      reviewFrequency,
      approvalRequired,
      evidenceRequired,
      commentaryRequired,
      dataSourceType,
      sourceReference,
      formulaLocked,
      parentKpiId,
      rollupMethod,
      inheritWeight,
      isActive,
      assignmentScope,
      ownerProfileId,
      autoAssignDepartment,
      initiatives,
      initiativeObjectives,
    } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'KPI name is required' });
    }

    const resolvedTargetValue = parseOptionalNumber(targetValue);
    const resolvedWeight = parseOptionalNumber(weight);
    const resolvedDepartmentId = parseOptionalInt(departmentId);
    const resolvedRoleId = parseOptionalInt(roleId);
    const resolvedOwnerProfileId = parseOptionalInt(ownerProfileId);
    const resolvedReviewOwnerProfileId = parseOptionalInt(reviewOwnerProfileId);
    const resolvedParentKpiId = parseOptionalInt(parentKpiId);
    const resolvedTargetType = targetType as string | undefined;
    const resolvedTargetText = targetText as string | undefined;
    const resolvedBaselineText = baselineText as string | undefined;
    const resolvedRedThreshold = parseOptionalNumber(redThreshold);
    const resolvedAmberThreshold = parseOptionalNumber(amberThreshold);
    const resolvedGreenThreshold = parseOptionalNumber(greenThreshold);
    const resolvedApprovalRequired = parseOptionalBoolean(approvalRequired);
    const resolvedEvidenceRequired = parseOptionalBoolean(evidenceRequired);
    const resolvedCommentaryRequired = parseOptionalBoolean(commentaryRequired);
    const resolvedFormulaLocked = parseOptionalBoolean(formulaLocked);
    const resolvedInheritWeight = parseOptionalBoolean(inheritWeight);
    const resolvedScope =
      parseAssignmentScope(assignmentScope) ??
      (autoAssignDepartment === true ? 'department' : undefined);
    const resolvedInitiatives = parseInitiatives(initiatives ?? initiativeObjectives);

    if (resolvedScope === 'individual' && !resolvedOwnerProfileId) {
      return res
        .status(400)
        .json({ error: 'ownerProfileId is required when assignmentScope is individual' });
    }

    if (resolvedScope === 'department' && !resolvedDepartmentId) {
      return res
        .status(400)
        .json({ error: 'departmentId is required when assignmentScope is department' });
    }

    if (resolvedOwnerProfileId) {
      const owner = await prisma.profile.findUnique({
        where: { id: resolvedOwnerProfileId },
        select: { id: true },
      });
      if (!owner) {
        return res.status(404).json({ error: 'KPI owner profile not found' });
      }
    }

    if (resolvedReviewOwnerProfileId) {
      const reviewer = await prisma.profile.findUnique({
        where: { id: resolvedReviewOwnerProfileId },
        select: { id: true },
      });
      if (!reviewer) {
        return res.status(404).json({ error: 'Review owner profile not found' });
      }
    }

    if (resolvedScope === 'department' && resolvedDepartmentId) {
      const department = await prisma.department.findUnique({
        where: { id: resolvedDepartmentId },
        select: { id: true },
      });
      if (!department) {
        return res.status(404).json({ error: 'Department not found' });
      }
    }

    if (resolvedParentKpiId) {
      const parent = await prisma.kpi.findUnique({
        where: { id: resolvedParentKpiId },
        select: { id: true },
      });
      if (!parent) {
        return res.status(404).json({ error: 'Parent KPI not found' });
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      const createdKpi = await tx.kpi.create({
        data: {
          name,
          description,
          category: category || 'general',
          kpiType: kpiType || 'general',
          strategicTheme,
          strategicObjective,
          criticalSuccessFactor,
          indicatorType,
          kpiCategory,
          measurementUnit,
          targetValue: resolvedTargetValue,
          targetFrequency,
          targetDescription,
          targetType: resolvedTargetType,
          targetText: resolvedTargetText,
          baselineText: resolvedBaselineText,
          redThreshold: resolvedRedThreshold,
          amberThreshold: resolvedAmberThreshold,
          greenThreshold: resolvedGreenThreshold,
          weight: resolvedWeight,
          departmentId: resolvedDepartmentId,
          roleId: resolvedRoleId,
          parentKpiId: resolvedParentKpiId,
          reviewOwnerProfileId: resolvedReviewOwnerProfileId,
          reviewFrequency,
          approvalRequired: resolvedApprovalRequired,
          evidenceRequired: resolvedEvidenceRequired,
          commentaryRequired: resolvedCommentaryRequired,
          dataSourceType,
          sourceReference,
          formulaLocked: resolvedFormulaLocked,
          rollupMethod,
          inheritWeight: resolvedInheritWeight,
          isActive: typeof isActive === 'boolean' ? isActive : undefined,
        },
      });

      let assignedEmployeeIds: number[] = [];
      let createdObjectiveCount = 0;
      let createdKeyResultCount = 0;

      if (resolvedScope === 'department' && resolvedDepartmentId) {
        const departmentEmployees = await tx.profile.findMany({
          where: {
            departmentId: resolvedDepartmentId,
            status: 'active',
          },
          select: { id: true },
        });

        assignedEmployeeIds = departmentEmployees.map((employee) => employee.id);

        if (assignedEmployeeIds.length > 0) {
          await tx.employeeKpiAssignment.createMany({
            data: assignedEmployeeIds.map((employeeId) => ({
              employeeProfileId: employeeId,
              kpiId: createdKpi.id,
              targetValue: resolvedTargetValue,
              weight: resolvedWeight,
              status: 'active',
            })),
          });
        }
      } else if (resolvedScope === 'individual' && resolvedOwnerProfileId) {
        await tx.employeeKpiAssignment.create({
          data: {
            employeeProfileId: resolvedOwnerProfileId,
            kpiId: createdKpi.id,
            targetValue: resolvedTargetValue,
            weight: resolvedWeight,
            status: 'active',
          },
        });
        assignedEmployeeIds = [resolvedOwnerProfileId];
      }

      const objectiveOwnerIds =
        resolvedScope === 'department'
          ? assignedEmployeeIds
          : resolvedOwnerProfileId
          ? [resolvedOwnerProfileId]
          : [];

      if (resolvedInitiatives.length > 0 && objectiveOwnerIds.length > 0) {
        for (const ownerId of objectiveOwnerIds) {
          for (const initiative of resolvedInitiatives) {
            const keyResultsToCreate =
              initiative.keyResults.length > 0
                ? initiative.keyResults.map((keyResult) => ({
                    title: keyResult.title,
                    unit: keyResult.unit ?? initiative.unit,
                    targetValue: keyResult.targetValue ?? initiative.targetValue ?? 100,
                    currentValue: 0,
                    weight: keyResult.weight ?? initiative.weight ?? undefined,
                    status: OkrStatus.draft,
                  }))
                : [
                    {
                      title: `${initiative.title} completion`,
                      unit: initiative.unit,
                      targetValue: initiative.targetValue ?? 100,
                      currentValue: 0,
                      weight: initiative.weight ?? undefined,
                      status: OkrStatus.draft,
                    },
                  ];

            await tx.okrObjective.create({
              data: {
                title: initiative.title,
                description: initiative.description,
                ownerProfileId: ownerId,
                kpiId: createdKpi.id,
                departmentId: resolvedDepartmentId ?? undefined,
                status: OkrStatus.draft,
                approvalStatus: OkrApprovalStatus.draft,
                keyResults: {
                  create: keyResultsToCreate,
                },
              },
            });

            createdObjectiveCount += 1;
            createdKeyResultCount += keyResultsToCreate.length;
          }
        }
      }

      return {
        kpi: createdKpi,
        assignmentSummary: {
          scope: resolvedScope ?? 'none',
          assignedCount: assignedEmployeeIds.length,
          assignedEmployeeIds,
        },
        initiativeSummary: {
          requestedInitiativeCount: resolvedInitiatives.length,
          ownerCount: objectiveOwnerIds.length,
          createdObjectiveCount,
          createdKeyResultCount,
          skippedNoOwners:
            resolvedInitiatives.length > 0 && objectiveOwnerIds.length === 0,
        },
      };
    });

    return res.status(201).json({
      ...result.kpi,
      assignmentSummary: result.assignmentSummary,
      initiativeSummary: result.initiativeSummary,
    });
  } catch (err: any) {
    console.error('Error creating KPI:', err);
    return res.status(500).json({ error: 'Failed to create KPI' });
  }
});

// PATCH /kpis/:id
router.patch(
  '/:id',
  authMiddleware,
  requireModuleAccess('kpis', 'admin'),
  async (req: AuthRequest, res) => {
  try {
    const id = req.params.id;
    const {
      name,
      description,
      category,
      kpiType,
      measurementUnit,
      targetValue,
      targetFrequency,
      targetDescription,
      targetType,
      targetText,
      baselineText,
      redThreshold,
      amberThreshold,
      greenThreshold,
      weight,
      departmentId,
      roleId,
      strategicTheme,
      strategicObjective,
      criticalSuccessFactor,
      indicatorType,
      kpiCategory,
      reviewOwnerProfileId,
      reviewFrequency,
      approvalRequired,
      evidenceRequired,
      commentaryRequired,
      dataSourceType,
      sourceReference,
      formulaLocked,
      parentKpiId,
      rollupMethod,
      inheritWeight,
      isActive,
    } = req.body;

    const resolvedRedThreshold = parseOptionalNumber(redThreshold);
    const resolvedAmberThreshold = parseOptionalNumber(amberThreshold);
    const resolvedGreenThreshold = parseOptionalNumber(greenThreshold);
    const resolvedApprovalRequired = parseOptionalBoolean(approvalRequired);
    const resolvedEvidenceRequired = parseOptionalBoolean(evidenceRequired);
    const resolvedCommentaryRequired = parseOptionalBoolean(commentaryRequired);
    const resolvedFormulaLocked = parseOptionalBoolean(formulaLocked);
    const resolvedInheritWeight = parseOptionalBoolean(inheritWeight);
    const hasRedThreshold = redThreshold !== undefined;
    const hasAmberThreshold = amberThreshold !== undefined;
    const hasGreenThreshold = greenThreshold !== undefined;
    const hasApprovalRequired = approvalRequired !== undefined;
    const hasEvidenceRequired = evidenceRequired !== undefined;
    const hasCommentaryRequired = commentaryRequired !== undefined;
    const hasFormulaLocked = formulaLocked !== undefined;
    const hasInheritWeight = inheritWeight !== undefined;

    const kpi = await prisma.kpi.update({
      where: { id: parseInt(id) },
      data: {
        ...(name && { name }),
        ...(description && { description }),
        ...(category && { category }),
        ...(kpiType ? { kpiType } : {}),
        ...(strategicTheme ? { strategicTheme } : {}),
        ...(strategicObjective ? { strategicObjective } : {}),
        ...(criticalSuccessFactor ? { criticalSuccessFactor } : {}),
        ...(indicatorType ? { indicatorType } : {}),
        ...(kpiCategory ? { kpiCategory } : {}),
        ...(measurementUnit ? { measurementUnit } : {}),
        ...(targetValue !== undefined ? { targetValue: parseFloat(targetValue) } : {}),
        ...(targetFrequency ? { targetFrequency } : {}),
        ...(targetDescription ? { targetDescription } : {}),
        ...(targetType ? { targetType } : {}),
        ...(targetText ? { targetText } : {}),
        ...(baselineText ? { baselineText } : {}),
        ...(hasRedThreshold ? { redThreshold: resolvedRedThreshold } : {}),
        ...(hasAmberThreshold ? { amberThreshold: resolvedAmberThreshold } : {}),
        ...(hasGreenThreshold ? { greenThreshold: resolvedGreenThreshold } : {}),
        ...(weight && { weight: parseFloat(weight) }),
        ...(departmentId ? { departmentId: parseInt(departmentId) } : {}),
        ...(roleId ? { roleId: parseInt(roleId) } : {}),
        ...(parentKpiId ? { parentKpiId: parseInt(parentKpiId) } : {}),
        ...(reviewOwnerProfileId ? { reviewOwnerProfileId: parseInt(reviewOwnerProfileId) } : {}),
        ...(reviewFrequency ? { reviewFrequency } : {}),
        ...(hasApprovalRequired ? { approvalRequired: resolvedApprovalRequired } : {}),
        ...(hasEvidenceRequired ? { evidenceRequired: resolvedEvidenceRequired } : {}),
        ...(hasCommentaryRequired ? { commentaryRequired: resolvedCommentaryRequired } : {}),
        ...(dataSourceType ? { dataSourceType } : {}),
        ...(sourceReference ? { sourceReference } : {}),
        ...(hasFormulaLocked ? { formulaLocked: resolvedFormulaLocked } : {}),
        ...(rollupMethod ? { rollupMethod } : {}),
        ...(hasInheritWeight ? { inheritWeight: resolvedInheritWeight } : {}),
        ...(typeof isActive === 'boolean' ? { isActive } : {}),
      },
    });
    return res.json(kpi);
  } catch (err: any) {
    console.error('Error updating KPI:', err);
    return res.status(500).json({ error: 'Failed to update KPI' });
  }
});

// DELETE /kpis/:id
router.delete(
  '/:id',
  authMiddleware,
  requireModuleAccess('kpis', 'admin'),
  async (req: AuthRequest, res) => {
  try {
    const id = req.params.id;
    await prisma.kpi.delete({
      where: { id: parseInt(id) },
    });
    return res.json({ ok: true });
  } catch (err: any) {
    console.error('Error deleting KPI:', err);
    return res.status(500).json({ error: 'Failed to delete KPI' });
  }
});

export default router;
