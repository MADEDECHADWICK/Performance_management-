import { Router } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { loadProfile } from '../middleware/loadProfile';
import prisma from '../prisma';
import { createAudit } from '../utils/audit';
import { NotificationService } from '../services/notifications.service';

const router = Router();

const legacyKpiWriteBlocked = () => process.env.KPI_V2_HARD_CUTOVER !== "false";
router.use((req, res, next) => {
  if (req.method !== "GET" && legacyKpiWriteBlocked()) {
    return res.status(410).json({
      error: "Legacy KPI assignment workflow is decommissioned. Use /api/kpi (cascade V2).",
      code: "LEGACY_KPI_DECOMMISSIONED",
    });
  }
  return next();
});
const privilegedRoles = new Set([
  'super_admin',
  'hr',
  'gmp',
  'partner',
]);

const getRoleNames = (req: AuthRequest) => {
  const roles = [
    ...(req.userRoles || []),
    ...(req.userRoles || []),
    req.profile?.role?.name,
  ]
    .filter(Boolean)
    .map((role) => String(role).toLowerCase());
  return Array.from(new Set(roles));
};

const isPrivileged = (req: AuthRequest) =>
  getRoleNames(req).some((role) => privilegedRoles.has(role));

const isManagerRole = (req: AuthRequest) =>
  getRoleNames(req).some((role) => role.includes('manager') || role.includes('team lead'));

const resolveRequesterProfileId = (req: AuthRequest) =>
  req.profile?.id ?? (req.user?.profileId ? Number(req.user.profileId) : undefined);

const parseOptionalInt = (value: unknown): number | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : undefined;
};

const parseOptionalBoolean = (value: unknown): boolean | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).toLowerCase().trim();
  if (['1', 'true', 'yes', 'y'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n'].includes(normalized)) return false;
  return undefined;
};

const toNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const canAccessEmployee = async (req: AuthRequest, employeeId: number) => {
  if (isPrivileged(req)) return true;

  const requesterId = resolveRequesterProfileId(req);
  if (!requesterId) return false;

  if (requesterId === employeeId) return true;

  if (isManagerRole(req)) {
    const employee = await prisma.profile.findUnique({
      where: { id: employeeId },
      select: { managerId: true },
    });
    return employee?.managerId === requesterId;
  }

  return false;
};

type OkrTrackingObjective = {
  id: number;
  ownerProfileId: number;
  kpiId: number | null;
  status: string;
  approvalStatus: string;
  updatedAt: Date;
  keyResults: Array<{
    targetValue: unknown;
    currentValue: unknown;
    weight: unknown;
    status: string;
  }>;
};

type KpiTrackingHistoryEntry = {
  id: number;
  at: string;
  action: string;
  source: 'manual_progress_update' | 'assignment_update' | 'assignment_closed';
  actorProfileId: number | null;
  previousAchievedValue: number | null;
  newAchievedValue: number | null;
  note: string | null;
};

const buildOkrTrackingKey = (ownerProfileId: number, kpiId: number) =>
  `${ownerProfileId}:${kpiId}`;

const clampPercent = (value: number) => Math.min(100, Math.max(0, value));

const computeObjectiveCompletion = (objective: OkrTrackingObjective) => {
  if (!objective.keyResults?.length) {
    return objective.status === 'completed' ? 100 : 0;
  }

  const weightedResults = objective.keyResults
    .filter((kr) => kr.status !== 'archived')
    .map((kr) => {
      const target = toNumber(kr.targetValue, 0);
      const current = toNumber(kr.currentValue, 0);
      const weight = toNumber(kr.weight, 0);
      const progress = target > 0 ? clampPercent((current / target) * 100) : 0;
      return { progress, weight };
    });

  if (!weightedResults.length) {
    return objective.status === 'completed' ? 100 : 0;
  }

  const totalWeight = weightedResults.reduce((sum, item) => sum + item.weight, 0);
  if (totalWeight > 0) {
    const weightedProgress = weightedResults.reduce(
      (sum, item) => sum + item.progress * item.weight,
      0
    );
    return clampPercent(weightedProgress / totalWeight);
  }

  const avgProgress =
    weightedResults.reduce((sum, item) => sum + item.progress, 0) / weightedResults.length;
  return clampPercent(avgProgress);
};

const computeOkrSummary = (objectives: OkrTrackingObjective[]) => {
  const relevantObjectives = objectives.filter((objective) => objective.status !== 'archived');
  if (!relevantObjectives.length) {
    return {
      objectiveCount: 0,
      approvedObjectiveCount: 0,
      completedObjectiveCount: 0,
      keyResultCount: 0,
      overallCompletionPercent: 0,
      lastUpdatedAt: null as string | null,
    };
  }

  const approvedObjectiveCount = relevantObjectives.filter(
    (objective) => objective.approvalStatus === 'approved'
  ).length;

  const objectiveCompletions = relevantObjectives.map((objective) => ({
    objective,
    percent: computeObjectiveCompletion(objective),
  }));

  const overallCompletionPercent =
    objectiveCompletions.reduce((sum, item) => sum + item.percent, 0) /
    objectiveCompletions.length;

  const completedObjectiveCount = objectiveCompletions.filter(
    (item) => item.objective.status === 'completed' || item.percent >= 100
  ).length;

  const keyResultCount = relevantObjectives.reduce(
    (sum, objective) => sum + objective.keyResults.length,
    0
  );

  const lastUpdatedAt = relevantObjectives
    .map((objective) => objective.updatedAt)
    .sort((a, b) => b.getTime() - a.getTime())[0];

  return {
    objectiveCount: relevantObjectives.length,
    approvedObjectiveCount,
    completedObjectiveCount,
    keyResultCount,
    overallCompletionPercent: Number(overallCompletionPercent.toFixed(2)),
    lastUpdatedAt: lastUpdatedAt?.toISOString() ?? null,
  };
};

const toNullableNumber = (value: unknown): number | null => {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const toMetadataObject = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
};

const normalizeHistorySource = (
  action: string
): KpiTrackingHistoryEntry['source'] => {
  if (action === 'employee_kpi_assignment:progress') return 'manual_progress_update';
  if (action === 'employee_kpi_assignment:close') return 'assignment_closed';
  return 'assignment_update';
};

const buildHistoryMap = async (assignmentIds: number[]) => {
  const map = new Map<number, KpiTrackingHistoryEntry[]>();
  if (!assignmentIds.length) return map;

  const logs = await prisma.auditLog.findMany({
    where: {
      entityType: 'employee_kpi_assignment',
      entityId: { in: assignmentIds },
      action: {
        in: [
          'employee_kpi_assignment:progress',
          'employee_kpi_assignment:update',
          'employee_kpi_assignment:close',
        ],
      },
    },
    orderBy: { createdAt: 'desc' },
    take: Math.max(assignmentIds.length * 15, 50),
  });

  for (const log of logs) {
    if (!log.entityId) continue;
    if (!map.has(log.entityId)) {
      map.set(log.entityId, []);
    }
    const entries = map.get(log.entityId)!;
    if (entries.length >= 8) continue;

    const metadata = toMetadataObject(log.metadata);
    const previousAchievedValue = toNullableNumber(
      metadata?.previousAchievedValue ?? metadata?.previousValue
    );
    const newAchievedValue = toNullableNumber(
      metadata?.newAchievedValue ?? metadata?.newValue ?? metadata?.value
    );
    const actorProfileId = toNullableNumber(
      metadata?.actorProfileId ??
        metadata?.profileId ??
        metadata?.performedByProfileId
    );

    entries.push({
      id: log.id,
      at: log.createdAt.toISOString(),
      action: log.action,
      source: normalizeHistorySource(log.action),
      actorProfileId,
      previousAchievedValue,
      newAchievedValue,
      note:
        typeof metadata?.notes === 'string'
          ? metadata.notes
          : typeof metadata?.note === 'string'
          ? metadata.note
          : null,
    });
  }

  return map;
};

const buildTrackingPayload = (
  assignment: any,
  summary: ReturnType<typeof computeOkrSummary>,
  history: KpiTrackingHistoryEntry[]
) => {
  const targetValue = toNumber(assignment.targetValue ?? assignment.kpi?.targetValue, 0);
  const hasManualAchieved =
    assignment.achievedValue !== undefined &&
    assignment.achievedValue !== null &&
    assignment.achievedValue !== '';
  const achievedValue = hasManualAchieved ? toNumber(assignment.achievedValue, 0) : null;
  const derivedAchievedValueFromOkrs =
    targetValue > 0
      ? Number(((summary.overallCompletionPercent / 100) * targetValue).toFixed(2))
      : null;
  const resolvedAchievedValue =
    achievedValue !== null ? achievedValue : derivedAchievedValueFromOkrs;
  const progressPercent =
    targetValue > 0 && resolvedAchievedValue !== null
      ? Number(clampPercent((resolvedAchievedValue / targetValue) * 100).toFixed(2))
      : summary.overallCompletionPercent;

  const varianceToTarget =
    targetValue > 0 && resolvedAchievedValue !== null
      ? Number((resolvedAchievedValue - targetValue).toFixed(2))
      : null;
  const remainingToTarget =
    targetValue > 0
      ? Number(
          Math.max(0, targetValue - (resolvedAchievedValue ?? 0)).toFixed(2)
        )
      : null;

  let achievementStatus: 'not_started' | 'behind' | 'on_track' | 'met' | 'exceeded' =
    'not_started';
  if (resolvedAchievedValue !== null && targetValue > 0) {
    if (resolvedAchievedValue > targetValue) {
      achievementStatus = 'exceeded';
    } else if (resolvedAchievedValue >= targetValue) {
      achievementStatus = 'met';
    } else if (progressPercent >= 75) {
      achievementStatus = 'on_track';
    } else if (progressPercent > 0) {
      achievementStatus = 'behind';
    }
  }

  const achievedFrom: 'manual' | 'okr_derived' | 'none' =
    achievedValue !== null ? 'manual' : derivedAchievedValueFromOkrs !== null ? 'okr_derived' : 'none';

  return {
    targetValue: targetValue > 0 ? targetValue : null,
    achievedValue,
    resolvedAchievedValue,
    derivedAchievedValueFromOkrs,
    progressPercent,
    achievement: {
      status: achievementStatus,
      achievedFrom,
      varianceToTarget,
      remainingToTarget,
      formula:
        targetValue > 0 && resolvedAchievedValue !== null
          ? `${resolvedAchievedValue.toFixed(2)} / ${targetValue.toFixed(2)} * 100`
          : null,
      asOf:
        history[0]?.at ??
        summary.lastUpdatedAt ??
        (assignment.updatedAt ? new Date(assignment.updatedAt).toISOString() : null),
    },
    history,
    okr: summary,
  };
};

const withTracking = async (assignments: any[]) => {
  if (!assignments.length) return assignments;

  const historyMap = await buildHistoryMap(
    assignments
      .map((assignment) => Number(assignment?.id))
      .filter((id) => Number.isInteger(id))
  );

  const scopedPairs = Array.from(
    new Set(
      assignments
        .filter((assignment) => Number.isInteger(assignment?.kpiId))
        .map((assignment) => buildOkrTrackingKey(assignment.employeeProfileId, assignment.kpiId))
    )
  );

  if (!scopedPairs.length) {
    return assignments.map((assignment) => ({
      ...assignment,
      tracking: buildTrackingPayload(
        assignment,
        computeOkrSummary([]),
        historyMap.get(Number(assignment.id)) ?? []
      ),
    }));
  }

  const ownerIds = Array.from(
    new Set(assignments.map((assignment) => Number(assignment.employeeProfileId)))
  );
  const kpiIds = Array.from(
    new Set(assignments.map((assignment) => Number(assignment.kpiId)).filter(Number.isFinite))
  );

  const objectives = await prisma.okrObjective.findMany({
    where: {
      ownerProfileId: { in: ownerIds },
      kpiId: { in: kpiIds },
    },
    select: {
      id: true,
      ownerProfileId: true,
      kpiId: true,
      status: true,
      approvalStatus: true,
      updatedAt: true,
      keyResults: {
        select: {
          targetValue: true,
          currentValue: true,
          weight: true,
          status: true,
        },
      },
    },
  });

  const grouped = objectives.reduce((map, objective) => {
    if (!objective.kpiId) return map;
    const key = buildOkrTrackingKey(objective.ownerProfileId, objective.kpiId);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(objective as OkrTrackingObjective);
    return map;
  }, new Map<string, OkrTrackingObjective[]>());

  return assignments.map((assignment) => {
    const key = buildOkrTrackingKey(assignment.employeeProfileId, assignment.kpiId);
    const summary = computeOkrSummary(grouped.get(key) ?? []);

    return {
      ...assignment,
      tracking: buildTrackingPayload(
        assignment,
        summary,
        historyMap.get(Number(assignment.id)) ?? []
      ),
    };
  });
};

// GET /employee_kpi_assignments
router.get('/', authMiddleware, loadProfile, async (req: AuthRequest, res) => {
  try {
    const requesterId = resolveRequesterProfileId(req);
    if (!requesterId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const requestedEmployeeId = parseOptionalInt(
      req.query.employeeProfileId
    );
    const requestedKpiId = parseOptionalInt(req.query.kpiId);
    const requestedStatus =
      typeof req.query.status === 'string' ? String(req.query.status).toLowerCase() : undefined;
    const includeTracking =
      parseOptionalBoolean(req.query.includeTracking) === true;

    let where: any = {};
    if (!isPrivileged(req)) {
      if (isManagerRole(req)) {
        const directReports = await prisma.profile.findMany({
          where: { managerId: requesterId },
          select: { id: true },
        });
        const allowedIds = Array.from(
          new Set([requesterId, ...directReports.map((p) => p.id)])
        );
        where.employeeProfileId = { in: allowedIds };
      } else {
        where.employeeProfileId = requesterId;
      }
    }
    if (requestedEmployeeId) {
      if (!(await canAccessEmployee(req, requestedEmployeeId))) {
        return res.status(403).json({ error: 'Access denied' });
      }
      where.employeeProfileId = requestedEmployeeId;
    }
    if (requestedKpiId) {
      where.kpiId = requestedKpiId;
    }
    if (requestedStatus && ['active', 'paused', 'closed'].includes(requestedStatus)) {
      where.status = requestedStatus;
    }

    const assignments = await prisma.employeeKpiAssignment.findMany({
      where,
      include: {
        employee: true,
        kpi: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!includeTracking) {
      return res.json(assignments || []);
    }

    return res.json(await withTracking(assignments || []));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /employee_kpi_assignments/my - current user's assignments only
router.get('/my', authMiddleware, loadProfile, async (req: AuthRequest, res) => {
  try {
    const requesterId = resolveRequesterProfileId(req);
    if (!requesterId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const requestedKpiId = parseOptionalInt(req.query.kpiId);
    const requestedStatus =
      typeof req.query.status === 'string' ? String(req.query.status).toLowerCase() : undefined;
    const includeTracking =
      parseOptionalBoolean(req.query.includeTracking) === true;

    const assignments = await prisma.employeeKpiAssignment.findMany({
      where: {
        employeeProfileId: requesterId,
        ...(requestedKpiId ? { kpiId: requestedKpiId } : {}),
        ...(requestedStatus && ['active', 'paused', 'closed'].includes(requestedStatus)
          ? { status: requestedStatus as any }
          : {}),
      },
      include: {
        employee: true,
        kpi: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!includeTracking) {
      return res.json(assignments || []);
    }

    return res.json(await withTracking(assignments || []));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /employee_kpi_assignments/bulk-department
router.post('/bulk-department', authMiddleware, loadProfile, async (req: AuthRequest, res) => {
  try {
    if (!isPrivileged(req)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const departmentId = parseOptionalInt(req.body?.departmentId);
    const kpiIds = Array.isArray(req.body?.kpiIds)
      ? req.body.kpiIds.map((value: unknown) => parseOptionalInt(value)).filter(Boolean)
      : [];

    if (!departmentId || kpiIds.length === 0) {
      return res
        .status(400)
        .json({ error: 'departmentId and non-empty kpiIds are required' });
    }

    const department = await prisma.department.findUnique({
      where: { id: departmentId },
      select: { id: true },
    });
    if (!department) {
      return res.status(404).json({ error: 'Department not found' });
    }

    const kpis = await prisma.kpi.findMany({
      where: {
        id: { in: kpiIds as number[] },
        isActive: true,
      },
      select: {
        id: true,
        targetValue: true,
        weight: true,
      },
    });
    if (kpis.length !== kpiIds.length) {
      return res
        .status(404)
        .json({ error: 'One or more KPI records were not found or are inactive' });
    }

    const employees = await prisma.profile.findMany({
      where: {
        departmentId,
        status: 'active',
      },
      select: { id: true },
    });

    if (employees.length === 0) {
      return res.json({ assigned: 0 });
    }

    const rows = employees.flatMap((employee) =>
      kpis.map((kpi) => ({
        employeeProfileId: employee.id,
        kpiId: kpi.id,
        targetValue: kpi.targetValue,
        weight: kpi.weight,
        status: 'active' as const,
      }))
    );

    const created = await prisma.employeeKpiAssignment.createMany({
      data: rows,
      skipDuplicates: true,
    });

    const performedBy = req.user?.userId ? Number(req.user.userId) : undefined;
    await createAudit({
      action: 'employee_kpi_assignment:bulk_department',
      entity_type: 'employee_kpi_assignment',
      user_id: performedBy,
      ip_address: req.ip,
    });

    return res.json({ assigned: created.count });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /employee_kpi_assignments/:id
router.get('/:id', authMiddleware, loadProfile, async (req: AuthRequest, res) => {
  try {
    const includeTracking =
      parseOptionalBoolean(req.query.includeTracking) === true;
    const assignment = await prisma.employeeKpiAssignment.findUnique({
      where: { id: parseInt(req.params.id) },
      include: {
        employee: true,
        kpi: true,
      },
    });

    if (!assignment) {
      return res.status(404).json({ error: 'KPI assignment not found' });
    }

    if (!(await canAccessEmployee(req, assignment.employeeProfileId))) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (!includeTracking) {
      return res.json(assignment);
    }

    const [tracked] = await withTracking([assignment]);
    return res.json(tracked);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /employee_kpi_assignments
router.post('/', authMiddleware, loadProfile, async (req: AuthRequest, res) => {
  try {
    const {
      employeeProfileId,
      kpiId,
      targetValue,
      weight,
      periodStart,
      periodEnd,
      status,
    } = req.body;

    const resolvedEmployeeId = employeeProfileId;
    const resolvedKpiId = kpiId;

    if (!resolvedEmployeeId || !resolvedKpiId) {
      return res.status(400).json({ error: 'employeeProfileId and kpiId required' });
    }

    if (!(await canAccessEmployee(req, Number(resolvedEmployeeId)))) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const assignment = await prisma.employeeKpiAssignment.create({
      data: {
        employeeProfileId: Number(resolvedEmployeeId),
        kpiId: Number(resolvedKpiId),
        targetValue: targetValue ? Number(targetValue) : undefined,
        weight: weight ? Number(weight) : undefined,
        periodStart: periodStart ? new Date(periodStart) : undefined,
        periodEnd: periodEnd ? new Date(periodEnd) : undefined,
        status,
      },
      include: {
        employee: true,
        kpi: true,
      },
    });

    const performedBy = req.user?.userId ? Number(req.user.userId) : undefined;
    await createAudit({
      action: 'employee_kpi_assignment:create',
      entity_type: 'employee_kpi_assignment',
      entity_id: assignment.id,
      user_id: performedBy,
      ip_address: req.ip,
      metadata: {
        actorProfileId: req.profile?.id ?? null,
        kpiId: assignment.kpiId,
        employeeProfileId: assignment.employeeProfileId,
      },
    });

    await NotificationService.createNotification(
      {
        recipientProfileId: assignment.employeeProfileId,
        type: 'info',
        title: 'New KPI assigned',
        message: `A KPI "${assignment.kpi?.name ?? 'KPI'}" has been assigned to you.`,
        actionRequired: false,
        link: '/kpi-management',
      },
      {
        userId: req.user?.userId ?? 0,
        profileId: req.profile?.id ?? 0,
        roleName: req.profile?.role?.name,
      }
    );

    const [tracked] = await withTracking([assignment]);
    return res.status(201).json(tracked);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /employee_kpi_assignments/:id/progress - update achieved value
router.post('/:id/progress', authMiddleware, loadProfile, async (req: AuthRequest, res) => {
  try {
    const assignmentId = Number(req.params.id);
    if (!Number.isFinite(assignmentId)) {
      return res.status(400).json({ error: 'Invalid assignment id' });
    }

    const value = req.body.value ?? req.body.achievedValue;
    if (value === undefined || value === null || value === '') {
      return res.status(400).json({ error: 'Progress value is required' });
    }

    const parsedValue = Number(value);
    if (Number.isNaN(parsedValue)) {
      return res.status(400).json({ error: 'Progress value must be a number' });
    }

    const current = await prisma.employeeKpiAssignment.findUnique({
      where: { id: assignmentId },
      select: { employeeProfileId: true, achievedValue: true },
    });
    if (!current) {
      return res.status(404).json({ error: 'KPI assignment not found' });
    }

    if (!(await canAccessEmployee(req, current.employeeProfileId))) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const assignment = await prisma.employeeKpiAssignment.update({
      where: { id: assignmentId },
      data: {
        achievedValue: parsedValue,
      },
      include: {
        employee: true,
        kpi: true,
      },
    });

    const performedBy = req.user?.userId ? Number(req.user.userId) : undefined;
    const notes =
      typeof req.body?.notes === 'string'
        ? req.body.notes.trim()
        : typeof req.body?.note === 'string'
        ? req.body.note.trim()
        : '';
    await createAudit({
      action: 'employee_kpi_assignment:progress',
      entity_type: 'employee_kpi_assignment',
      entity_id: assignment.id,
      user_id: performedBy,
      ip_address: req.ip,
      metadata: {
        actorProfileId: req.profile?.id ?? null,
        previousAchievedValue:
          current.achievedValue !== null && current.achievedValue !== undefined
            ? Number(current.achievedValue)
            : null,
        newAchievedValue: parsedValue,
        value: parsedValue,
        notes: notes || null,
      },
    });

    const [tracked] = await withTracking([assignment]);
    return res.json(tracked);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /employee_kpi_assignments/:id/close
router.post('/:id/close', authMiddleware, loadProfile, async (req: AuthRequest, res) => {
  try {
    const assignmentId = Number(req.params.id);
    if (!Number.isFinite(assignmentId)) {
      return res.status(400).json({ error: 'Invalid assignment id' });
    }

    const current = await prisma.employeeKpiAssignment.findUnique({
      where: { id: assignmentId },
      select: { employeeProfileId: true },
    });
    if (!current) {
      return res.status(404).json({ error: 'KPI assignment not found' });
    }

    if (!(await canAccessEmployee(req, current.employeeProfileId))) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const assignment = await prisma.employeeKpiAssignment.update({
      where: { id: assignmentId },
      data: {
        status: 'closed',
        periodEnd: new Date(),
      },
      include: {
        employee: true,
        kpi: true,
      },
    });

    const performedBy = req.user?.userId ? Number(req.user.userId) : undefined;
    await createAudit({
      action: 'employee_kpi_assignment:close',
      entity_type: 'employee_kpi_assignment',
      entity_id: assignment.id,
      user_id: performedBy,
      ip_address: req.ip,
      metadata: {
        actorProfileId: req.profile?.id ?? null,
        status: 'closed',
      },
    });

    const [tracked] = await withTracking([assignment]);
    return res.json(tracked);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// PATCH /employee_kpi_assignments/:id
router.patch('/:id', authMiddleware, loadProfile, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const {
      targetValue,
      weight,
      periodStart,
      periodEnd,
      status,
    } = req.body;

    const current = await prisma.employeeKpiAssignment.findUnique({
      where: { id: parseInt(id) },
      select: { employeeProfileId: true },
    });
    if (!current) {
      return res.status(404).json({ error: 'KPI assignment not found' });
    }

    if (!(await canAccessEmployee(req, current.employeeProfileId))) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const assignment = await prisma.employeeKpiAssignment.update({
      where: { id: parseInt(id) },
      data: {
        targetValue: targetValue ? Number(targetValue) : undefined,
        weight: weight ? Number(weight) : undefined,
        periodStart: periodStart ? new Date(periodStart) : undefined,
        periodEnd: periodEnd ? new Date(periodEnd) : undefined,
        status,
      },
      include: {
        employee: true,
        kpi: true,
      },
    });

    const performedBy = req.user?.userId ? Number(req.user.userId) : undefined;
    await createAudit({
      action: 'employee_kpi_assignment:update',
      entity_type: 'employee_kpi_assignment',
      entity_id: assignment.id,
      user_id: performedBy,
      ip_address: req.ip,
      metadata: {
        actorProfileId: req.profile?.id ?? null,
        status: assignment.status,
        targetValue:
          assignment.targetValue !== null && assignment.targetValue !== undefined
            ? Number(assignment.targetValue)
            : null,
        weight:
          assignment.weight !== null && assignment.weight !== undefined
            ? Number(assignment.weight)
            : null,
      },
    });

    await NotificationService.createNotification(
      {
        recipientProfileId: assignment.employeeProfileId,
        type: 'info',
        title: 'KPI updated',
        message: `Your KPI "${assignment.kpi?.name ?? 'KPI'}" was updated.`,
        actionRequired: false,
        link: '/kpi-management',
      },
      {
        userId: req.user?.userId ?? 0,
        profileId: req.profile?.id ?? 0,
        roleName: req.profile?.role?.name,
      }
    );

    const [tracked] = await withTracking([assignment]);
    return res.json(tracked);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// DELETE /employee_kpi_assignments/:id
router.delete('/:id', authMiddleware, loadProfile, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const current = await prisma.employeeKpiAssignment.findUnique({
      where: { id: parseInt(id) },
      select: { employeeProfileId: true },
    });
    if (!current) {
      return res.status(404).json({ error: 'KPI assignment not found' });
    }

    if (!(await canAccessEmployee(req, current.employeeProfileId))) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await prisma.employeeKpiAssignment.delete({
      where: { id: parseInt(id) },
    });

    const performedBy = req.user?.userId ? Number(req.user.userId) : undefined;
    await createAudit({
      action: 'employee_kpi_assignment:delete',
      entity_type: 'employee_kpi_assignment',
      entity_id: parseInt(id),
      user_id: performedBy,
      ip_address: req.ip,
      metadata: {
        actorProfileId: req.profile?.id ?? null,
      },
    });

    return res.json({ ok: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
