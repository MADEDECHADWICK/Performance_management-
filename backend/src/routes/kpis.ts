import { Router } from 'express';
import { OkrApprovalStatus, OkrStatus } from '@prisma/client';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { requireRole } from '../middleware/reqiureRole';
import prisma from '../prisma';

const router = Router();

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
    const targetValue = parseOptionalNumber(row.targetValue ?? row.target_value);
    const unit = parseOptionalString(row.unit ?? row.measurementUnit ?? row.measurement_unit);
    const weight = parseOptionalNumber(row.weight);

    const keyResultsRaw = Array.isArray(row.keyResults)
      ? row.keyResults
      : Array.isArray(row.key_results)
      ? row.key_results
      : [];

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
          targetValue: parseOptionalNumber(parsed.targetValue ?? parsed.target_value),
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
    const isActiveQuery = req.query.is_active ?? req.query.isActive;
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
  requireRole('admin', 'super_admin', 'hr', 'hr_manager'),
  async (req: AuthRequest, res) => {
  try {
    const {
      name,
      description,
      category,
      kpiType,
      kpi_type,
      measurementUnit,
      measurement_unit,
      targetValue,
      target_value,
      targetFrequency,
      target_frequency,
      targetDescription,
      target_description,
      targetType,
      target_type,
      targetText,
      target_text,
      baselineText,
      baseline_text,
      redThreshold,
      red_threshold,
      amberThreshold,
      amber_threshold,
      greenThreshold,
      green_threshold,
      weight,
      departmentId,
      department_id,
      roleId,
      role_id,
      strategicTheme,
      strategic_theme,
      strategicObjective,
      strategic_objective,
      criticalSuccessFactor,
      critical_success_factor,
      indicatorType,
      indicator_type,
      kpiCategory,
      kpi_category,
      reviewOwnerProfileId,
      review_owner_profile_id,
      reviewFrequency,
      review_frequency,
      approvalRequired,
      approval_required,
      evidenceRequired,
      evidence_required,
      commentaryRequired,
      commentary_required,
      dataSourceType,
      data_source_type,
      sourceReference,
      source_reference,
      formulaLocked,
      formula_locked,
      parentKpiId,
      parent_kpi_id,
      rollupMethod,
      rollup_method,
      inheritWeight,
      inherit_weight,
      isActive,
      is_active,
      assignmentScope,
      assignment_scope,
      ownerProfileId,
      owner_profile_id,
      autoAssignDepartment,
      auto_assign_department,
      initiatives,
      initiativeObjectives,
    } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'KPI name is required' });
    }

    const resolvedTargetValue = parseOptionalNumber(targetValue ?? target_value);
    const resolvedWeight = parseOptionalNumber(weight);
    const resolvedDepartmentId = parseOptionalInt(departmentId ?? department_id);
    const resolvedRoleId = parseOptionalInt(roleId ?? role_id);
    const resolvedOwnerProfileId = parseOptionalInt(ownerProfileId ?? owner_profile_id);
    const resolvedReviewOwnerProfileId = parseOptionalInt(
      reviewOwnerProfileId ?? review_owner_profile_id
    );
    const resolvedParentKpiId = parseOptionalInt(parentKpiId ?? parent_kpi_id);
    const resolvedTargetType = (targetType || target_type) as string | undefined;
    const resolvedTargetText = (targetText || target_text) as string | undefined;
    const resolvedBaselineText = (baselineText || baseline_text) as string | undefined;
    const resolvedRedThreshold = parseOptionalNumber(redThreshold ?? red_threshold);
    const resolvedAmberThreshold = parseOptionalNumber(amberThreshold ?? amber_threshold);
    const resolvedGreenThreshold = parseOptionalNumber(greenThreshold ?? green_threshold);
    const resolvedApprovalRequired = parseOptionalBoolean(
      approvalRequired ?? approval_required
    );
    const resolvedEvidenceRequired = parseOptionalBoolean(
      evidenceRequired ?? evidence_required
    );
    const resolvedCommentaryRequired = parseOptionalBoolean(
      commentaryRequired ?? commentary_required
    );
    const resolvedFormulaLocked = parseOptionalBoolean(formulaLocked ?? formula_locked);
    const resolvedInheritWeight = parseOptionalBoolean(inheritWeight ?? inherit_weight);
    const resolvedScope =
      parseAssignmentScope(assignmentScope ?? assignment_scope) ??
      ((autoAssignDepartment ?? auto_assign_department) === true ? 'department' : undefined);
    const resolvedInitiatives = parseInitiatives(
      initiatives ?? initiativeObjectives ?? req.body?.initiative_objectives
    );

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
          kpiType: kpiType || kpi_type || 'general',
          strategicTheme: strategicTheme || strategic_theme,
          strategicObjective: strategicObjective || strategic_objective,
          criticalSuccessFactor: criticalSuccessFactor || critical_success_factor,
          indicatorType: indicatorType || indicator_type,
          kpiCategory: kpiCategory || kpi_category,
          measurementUnit: measurementUnit || measurement_unit,
          targetValue: resolvedTargetValue,
          targetFrequency: targetFrequency || target_frequency,
          targetDescription: targetDescription || target_description,
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
          reviewFrequency: reviewFrequency || review_frequency,
          approvalRequired: resolvedApprovalRequired,
          evidenceRequired: resolvedEvidenceRequired,
          commentaryRequired: resolvedCommentaryRequired,
          dataSourceType: dataSourceType || data_source_type,
          sourceReference: sourceReference || source_reference,
          formulaLocked: resolvedFormulaLocked,
          rollupMethod: rollupMethod || rollup_method,
          inheritWeight: resolvedInheritWeight,
          isActive:
            typeof isActive === 'boolean'
              ? isActive
              : typeof is_active === 'boolean'
              ? is_active
              : undefined,
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
  requireRole('admin', 'super_admin', 'hr', 'hr_manager'),
  async (req: AuthRequest, res) => {
  try {
    const id = req.params.id;
    const {
      name,
      description,
      category,
      kpiType,
      kpi_type,
      measurementUnit,
      measurement_unit,
      targetValue,
      target_value,
      targetFrequency,
      target_frequency,
      targetDescription,
      target_description,
      targetType,
      target_type,
      targetText,
      target_text,
      baselineText,
      baseline_text,
      redThreshold,
      red_threshold,
      amberThreshold,
      amber_threshold,
      greenThreshold,
      green_threshold,
      weight,
      departmentId,
      department_id,
      roleId,
      role_id,
      strategicTheme,
      strategic_theme,
      strategicObjective,
      strategic_objective,
      criticalSuccessFactor,
      critical_success_factor,
      indicatorType,
      indicator_type,
      kpiCategory,
      kpi_category,
      reviewOwnerProfileId,
      review_owner_profile_id,
      reviewFrequency,
      review_frequency,
      approvalRequired,
      approval_required,
      evidenceRequired,
      evidence_required,
      commentaryRequired,
      commentary_required,
      dataSourceType,
      data_source_type,
      sourceReference,
      source_reference,
      formulaLocked,
      formula_locked,
      parentKpiId,
      parent_kpi_id,
      rollupMethod,
      rollup_method,
      inheritWeight,
      inherit_weight,
      isActive,
      is_active,
    } = req.body;

    const resolvedRedThreshold = parseOptionalNumber(redThreshold ?? red_threshold);
    const resolvedAmberThreshold = parseOptionalNumber(amberThreshold ?? amber_threshold);
    const resolvedGreenThreshold = parseOptionalNumber(greenThreshold ?? green_threshold);
    const resolvedApprovalRequired = parseOptionalBoolean(approvalRequired ?? approval_required);
    const resolvedEvidenceRequired = parseOptionalBoolean(evidenceRequired ?? evidence_required);
    const resolvedCommentaryRequired = parseOptionalBoolean(commentaryRequired ?? commentary_required);
    const resolvedFormulaLocked = parseOptionalBoolean(formulaLocked ?? formula_locked);
    const resolvedInheritWeight = parseOptionalBoolean(inheritWeight ?? inherit_weight);
    const hasRedThreshold = redThreshold !== undefined || red_threshold !== undefined;
    const hasAmberThreshold = amberThreshold !== undefined || amber_threshold !== undefined;
    const hasGreenThreshold = greenThreshold !== undefined || green_threshold !== undefined;
    const hasApprovalRequired =
      approvalRequired !== undefined || approval_required !== undefined;
    const hasEvidenceRequired =
      evidenceRequired !== undefined || evidence_required !== undefined;
    const hasCommentaryRequired =
      commentaryRequired !== undefined || commentary_required !== undefined;
    const hasFormulaLocked = formulaLocked !== undefined || formula_locked !== undefined;
    const hasInheritWeight = inheritWeight !== undefined || inherit_weight !== undefined;

    const kpi = await prisma.kpi.update({
      where: { id: parseInt(id) },
      data: {
        ...(name && { name }),
        ...(description && { description }),
        ...(category && { category }),
        ...(kpiType || kpi_type ? { kpiType: kpiType || kpi_type } : {}),
        ...(strategicTheme || strategic_theme
          ? { strategicTheme: strategicTheme || strategic_theme }
          : {}),
        ...(strategicObjective || strategic_objective
          ? { strategicObjective: strategicObjective || strategic_objective }
          : {}),
        ...(criticalSuccessFactor || critical_success_factor
          ? { criticalSuccessFactor: criticalSuccessFactor || critical_success_factor }
          : {}),
        ...(indicatorType || indicator_type
          ? { indicatorType: indicatorType || indicator_type }
          : {}),
        ...(kpiCategory || kpi_category
          ? { kpiCategory: kpiCategory || kpi_category }
          : {}),
        ...(measurementUnit || measurement_unit ? { measurementUnit: measurementUnit || measurement_unit } : {}),
        ...(targetValue || target_value ? { targetValue: targetValue ?? parseFloat(target_value) } : {}),
        ...(targetFrequency || target_frequency ? { targetFrequency: targetFrequency || target_frequency } : {}),
        ...(targetDescription || target_description ? { targetDescription: targetDescription || target_description } : {}),
        ...(targetType || target_type ? { targetType: targetType || target_type } : {}),
        ...(targetText || target_text ? { targetText: targetText || target_text } : {}),
        ...(baselineText || baseline_text ? { baselineText: baselineText || baseline_text } : {}),
        ...(hasRedThreshold ? { redThreshold: resolvedRedThreshold } : {}),
        ...(hasAmberThreshold ? { amberThreshold: resolvedAmberThreshold } : {}),
        ...(hasGreenThreshold ? { greenThreshold: resolvedGreenThreshold } : {}),
        ...(weight && { weight: parseFloat(weight) }),
        ...(departmentId || department_id ? { departmentId: departmentId ?? parseInt(department_id) } : {}),
        ...(roleId || role_id ? { roleId: roleId ?? parseInt(role_id) } : {}),
        ...(parentKpiId || parent_kpi_id
          ? { parentKpiId: parentKpiId ?? parseInt(parent_kpi_id) }
          : {}),
        ...(reviewOwnerProfileId || review_owner_profile_id
          ? { reviewOwnerProfileId: reviewOwnerProfileId ?? parseInt(review_owner_profile_id) }
          : {}),
        ...(reviewFrequency || review_frequency
          ? { reviewFrequency: reviewFrequency || review_frequency }
          : {}),
        ...(hasApprovalRequired ? { approvalRequired: resolvedApprovalRequired } : {}),
        ...(hasEvidenceRequired ? { evidenceRequired: resolvedEvidenceRequired } : {}),
        ...(hasCommentaryRequired ? { commentaryRequired: resolvedCommentaryRequired } : {}),
        ...(dataSourceType || data_source_type
          ? { dataSourceType: dataSourceType || data_source_type }
          : {}),
        ...(sourceReference || source_reference
          ? { sourceReference: sourceReference || source_reference }
          : {}),
        ...(hasFormulaLocked ? { formulaLocked: resolvedFormulaLocked } : {}),
        ...(rollupMethod || rollup_method
          ? { rollupMethod: rollupMethod || rollup_method }
          : {}),
        ...(hasInheritWeight ? { inheritWeight: resolvedInheritWeight } : {}),
        ...(typeof isActive === 'boolean' ? { isActive } : typeof is_active === 'boolean' ? { isActive: is_active } : {}),
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
  requireRole('admin', 'super_admin', 'hr', 'hr_manager'),
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
