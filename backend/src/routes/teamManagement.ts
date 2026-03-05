import { Router } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { Prisma } from '@prisma/client';
import prisma from '../prisma';
import createAudit from '../utils/audit';

const router = Router();

const requireUser = (req: AuthRequest, res: any) => {
  if (!req.user?.userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }
  return req.user.userId;
};

const TRAINING_TYPES = new Set(['internal', 'external', 'certification', 'workshop']);
const TRAINING_STATUSES = new Set(['planned', 'in_progress', 'completed', 'cancelled']);
const DEVELOPMENT_GOAL_STATUSES = new Set(['active', 'completed', 'paused', 'cancelled']);
const MIN_SKILL_LEVEL = 1;
const MAX_SKILL_LEVEL = 5;

const toIsoStringOrNull = (value: Date | string | null | undefined) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
};

const parseDateOrNull = (value: unknown) => {
  if (!value) return null;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const parseOptionalPositiveInt = (value: unknown) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const normalizeTrainingType = (value: unknown): 'internal' | 'external' | 'certification' | 'workshop' => {
  const normalized = String(value || 'internal').trim().toLowerCase();
  if (TRAINING_TYPES.has(normalized)) {
    return normalized as 'internal' | 'external' | 'certification' | 'workshop';
  }
  return 'internal';
};

const normalizeTrainingStatus = (value: unknown): 'planned' | 'in_progress' | 'completed' | 'cancelled' => {
  const normalized = String(value || 'planned').trim().toLowerCase();
  if (TRAINING_STATUSES.has(normalized)) {
    return normalized as 'planned' | 'in_progress' | 'completed' | 'cancelled';
  }
  return 'planned';
};

const normalizeDevelopmentGoalStatus = (
  value: unknown
): 'active' | 'completed' | 'paused' | 'cancelled' => {
  const normalized = String(value || 'active').trim().toLowerCase();
  if (DEVELOPMENT_GOAL_STATUSES.has(normalized)) {
    return normalized as 'active' | 'completed' | 'paused' | 'cancelled';
  }
  return 'active';
};

const parseSkillLevel = (value: unknown, fallback = MIN_SKILL_LEVEL) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  if (parsed < MIN_SKILL_LEVEL) return MIN_SKILL_LEVEL;
  if (parsed > MAX_SKILL_LEVEL) return MAX_SKILL_LEVEL;
  return parsed;
};

const parseOptionalProgress = (value: unknown) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  if (parsed < 0) return 0;
  if (parsed > 100) return 100;
  return parsed;
};

const roleSet = (req: AuthRequest) =>
  new Set(
    [req.profile?.role?.name, ...(req.userRoles || [])]
      .filter(Boolean)
      .map((role) =>
        String(role || '')
          .toLowerCase()
          .trim()
          .replace(/[\s-]+/g, '_')
      )
  );

const canManageTeamDevelopment = (req: AuthRequest) => {
  const roles = roleSet(req);
  for (const role of roles) {
    if (
      role === 'super_admin' ||
      role === 'super_admin' ||
      role === 'hr' ||
      role === 'hr' ||
      role === 'gmp' ||
      role === 'gmp' ||
      role === 'partner' ||
      role.includes('manager')
    ) {
      return true;
    }
  }
  return false;
};

const isPartnerRole = (req: AuthRequest) => roleSet(req).has('partner');

// GET /manager/team-performance
router.get('/team-performance', authMiddleware, async (req: AuthRequest, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const profileId = req.user?.profileId;
  if (!profileId) return res.status(401).json({ error: 'Unauthorized' });
  if (!canManageTeamDevelopment(req)) {
    return res
      .status(403)
      .json({ error: 'Only managers, partners, or HR can access team performance' });
  }

  const scopedIds = await getScopedTeamMemberIds(req, profileId);
  const teamMemberIds = scopedIds.filter((id) => id !== profileId);
  if (teamMemberIds.length === 0) {
    return res.json({
      team_members: [],
      metrics: {
        team_size: 0,
        team_avg_performance: 0,
        team_avg_utilization: 0,
        total_billable_hours: 0,
        active_projects: 0,
        completed_evaluations: 0,
        pending_evaluations: 0,
        improvement_needed: 0,
        high_performers: 0,
      },
    });
  }

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const recentScoreStart = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);

  const [profiles, timeEntries, performanceScores, activeAssignments, evaluations] =
    await Promise.all([
      prisma.profile.findMany({
        where: { id: { in: teamMemberIds } },
        include: {
          role: { select: { name: true } },
          department: { select: { name: true } },
        },
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      }),
      prisma.timeEntry.findMany({
        where: {
          employeeProfileId: { in: teamMemberIds },
          status: 'approved',
          dateWorked: { gte: monthStart },
        },
        select: {
          employeeProfileId: true,
          hours: true,
          billable: true,
        },
      }),
      prisma.performanceScore.findMany({
        where: {
          employeeProfileId: { in: teamMemberIds },
          calculatedAt: { gte: recentScoreStart },
        },
        select: {
          employeeProfileId: true,
          totalScore: true,
          calculatedAt: true,
        },
        orderBy: [{ calculatedAt: 'desc' }],
      }),
      prisma.jobStaffAssignment.findMany({
        where: {
          employeeProfileId: { in: teamMemberIds },
          job: {
            status: { in: ['planned', 'in_progress', 'on_hold'] },
          },
        },
        select: { employeeProfileId: true, jobId: true },
      }),
      prisma.evaluationAssignment.findMany({
        where: {
          evaluateeProfileId: { in: teamMemberIds },
          evaluatorProfileId: profileId,
          status: { in: ['pending', 'in_progress', 'submitted'] },
        },
        select: {
          evaluateeProfileId: true,
          status: true,
        },
      }),
    ]);

  const hoursByEmployee = new Map<number, { total: number; billable: number }>();
  timeEntries.forEach((entry) => {
    const current = hoursByEmployee.get(entry.employeeProfileId) || { total: 0, billable: 0 };
    const entryHours = toNumber(entry.hours);
    current.total += entryHours;
    if (entry.billable) {
      current.billable += entryHours;
    }
    hoursByEmployee.set(entry.employeeProfileId, current);
  });

  const performanceByEmployee = new Map<number, { total: number; count: number; lastReviewDate: Date | null }>();
  performanceScores.forEach((score) => {
    const current = performanceByEmployee.get(score.employeeProfileId) || {
      total: 0,
      count: 0,
      lastReviewDate: null,
    };
    current.total += toNumber(score.totalScore);
    current.count += 1;
    if (!current.lastReviewDate || score.calculatedAt > current.lastReviewDate) {
      current.lastReviewDate = score.calculatedAt;
    }
    performanceByEmployee.set(score.employeeProfileId, current);
  });

  const activeProjectsByEmployee = new Map<number, Set<number>>();
  const activeProjectIds = new Set<number>();
  activeAssignments.forEach((assignment) => {
    activeProjectIds.add(assignment.jobId);
    const current = activeProjectsByEmployee.get(assignment.employeeProfileId) || new Set<number>();
    current.add(assignment.jobId);
    activeProjectsByEmployee.set(assignment.employeeProfileId, current);
  });

  const evaluationsByEmployee = new Map<number, { pending: number; completed: number }>();
  evaluations.forEach((assignment) => {
    const current = evaluationsByEmployee.get(assignment.evaluateeProfileId) || {
      pending: 0,
      completed: 0,
    };
    if (assignment.status === 'submitted') {
      current.completed += 1;
    } else {
      current.pending += 1;
    }
    evaluationsByEmployee.set(assignment.evaluateeProfileId, current);
  });

  const teamMembers = profiles.map((member) => {
    const hours = hoursByEmployee.get(member.id) || { total: 0, billable: 0 };
    const performance = performanceByEmployee.get(member.id) || { total: 0, count: 0, lastReviewDate: null };
    const evaluationsSummary = evaluationsByEmployee.get(member.id) || { pending: 0, completed: 0 };
    const avgPerformance =
      performance.count > 0 ? performance.total / performance.count : 0;
    const utilization =
      hours.total > 0 ? (hours.billable / hours.total) * 100 : 0;

    return {
      employee_id: member.id,
      employee_name: `${member.firstName} ${member.lastName}`.trim(),
      role: member.positionTitle || member.role?.name || 'Employee',
      department_name: member.department?.name || null,
      performance_score: avgPerformance,
      utilization_rate: utilization,
      billable_hours: hours.billable,
      total_hours: hours.total,
      active_projects: activeProjectsByEmployee.get(member.id)?.size || 0,
      completed_evaluations: evaluationsSummary.completed,
      pending_evaluations: evaluationsSummary.pending,
      last_review_date: toIsoStringOrNull(performance.lastReviewDate),
    };
  });

  const average = (values: number[]) =>
    values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

  const completedEvaluations = teamMembers.reduce(
    (sum, member) => sum + toNumber(member.completed_evaluations),
    0
  );
  const pendingEvaluations = teamMembers.reduce(
    (sum, member) => sum + toNumber(member.pending_evaluations),
    0
  );

  return res.json({
    team_members: teamMembers,
    metrics: {
      team_size: teamMembers.length,
      team_avg_performance: average(teamMembers.map((member) => toNumber(member.performance_score))),
      team_avg_utilization: average(teamMembers.map((member) => toNumber(member.utilization_rate))),
      total_billable_hours: teamMembers.reduce(
        (sum, member) => sum + toNumber(member.billable_hours),
        0
      ),
      active_projects: activeProjectIds.size,
      completed_evaluations: completedEvaluations,
      pending_evaluations: pendingEvaluations,
      improvement_needed: teamMembers.filter((member) => toNumber(member.performance_score) < 70)
        .length,
      high_performers: teamMembers.filter((member) => toNumber(member.performance_score) >= 85)
        .length,
    },
  });
});

// GET /manager/training-records
router.get('/training-records', authMiddleware, async (req: AuthRequest, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const profileId = req.user?.profileId;
  if (!profileId) return res.status(401).json({ error: 'Unauthorized' });
  if (!canManageTeamDevelopment(req)) {
    return res
      .status(403)
      .json({ error: 'Only managers, partners, or HR can access training records' });
  }

  const teamMemberIds = await getScopedTeamMemberIds(req, profileId);
  const employeeFilterRaw = String(req.query.employee || '').trim().toLowerCase();
  const employeeFilter =
    !employeeFilterRaw || employeeFilterRaw === 'all'
      ? null
      : parseOptionalPositiveInt(employeeFilterRaw);

  if (employeeFilter && !teamMemberIds.includes(employeeFilter)) {
    return res.status(403).json({ error: 'Selected employee is outside your team scope' });
  }

  const where: Prisma.TrainingRecordWhereInput = {
    OR: [{ createdByProfileId: profileId }, { employeeProfileId: { in: teamMemberIds } }],
  };
  if (employeeFilter) {
    where.employeeProfileId = employeeFilter;
  }

  const records = await prisma.trainingRecord.findMany({
    where,
    include: {
      employee: {
        select: { firstName: true, lastName: true },
      },
    },
    orderBy: [{ startDate: 'desc' }, { id: 'desc' }],
    take: 500,
  });

  res.json(records.map((record) => mapTrainingRecordResponse(record)));
});

// GET /manager/certifications
router.get('/certifications', authMiddleware, async (req: AuthRequest, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const profileId = req.user?.profileId;
  if (!profileId) return res.status(401).json({ error: 'Unauthorized' });
  if (!canManageTeamDevelopment(req)) {
    return res
      .status(403)
      .json({ error: 'Only managers, partners, or HR can access certifications' });
  }

  const teamMemberIds = await getScopedTeamMemberIds(req, profileId);
  const now = new Date();
  const expiringSoonCutoff = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const records = await prisma.trainingRecord.findMany({
    where: {
      trainingType: 'certification',
      OR: [{ createdByProfileId: profileId }, { employeeProfileId: { in: teamMemberIds } }],
    },
    include: {
      employee: {
        select: { firstName: true, lastName: true },
      },
    },
    orderBy: [{ endDate: 'asc' }, { startDate: 'desc' }],
    take: 500,
  });

  const payload = records.map((record) => {
    const expiryDate = record.endDate;
    let status: 'active' | 'expired' | 'expiring_soon' = 'active';
    if (expiryDate && expiryDate.getTime() < now.getTime()) {
      status = 'expired';
    } else if (expiryDate && expiryDate.getTime() <= expiringSoonCutoff.getTime()) {
      status = 'expiring_soon';
    }

    return {
      id: record.id,
      employee_id: record.employeeProfileId,
      employee_name: record.employee
        ? `${record.employee.firstName} ${record.employee.lastName}`.trim()
        : 'Team Session',
      certification_name: record.courseName,
      issuing_organization: record.provider || 'Internal',
      issue_date: toIsoStringOrNull(record.startDate),
      expiry_date: toIsoStringOrNull(record.endDate),
      status,
      certificate_number: `CERT-${record.id}`,
      verification_url: record.certificateUrl || undefined,
    };
  });

  res.json(payload);
});

// GET /manager/skill-assessments
router.get('/skill-assessments', authMiddleware, async (req: AuthRequest, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const profileId = req.user?.profileId;
  if (!profileId) return res.status(401).json({ error: 'Unauthorized' });
  if (!canManageTeamDevelopment(req)) {
    return res
      .status(403)
      .json({ error: 'Only managers, partners, or HR can access skill assessments' });
  }

  const teamMemberIds = await getScopedTeamMemberIds(req, profileId);
  const employeeFilterRaw = String(req.query.employee || '').trim().toLowerCase();
  const employeeFilter =
    !employeeFilterRaw || employeeFilterRaw === 'all'
      ? null
      : parseOptionalPositiveInt(employeeFilterRaw);

  if (employeeFilter && !teamMemberIds.includes(employeeFilter)) {
    return res.status(403).json({ error: 'Selected employee is outside your team scope' });
  }

  const where: Prisma.SkillAssessmentWhereInput = {
    OR: [{ assessorProfileId: profileId }, { employeeProfileId: { in: teamMemberIds } }],
  };
  if (employeeFilter) {
    where.employeeProfileId = employeeFilter;
  }

  const assessments = await prisma.skillAssessment.findMany({
    where,
    include: {
      employee: { select: { firstName: true, lastName: true } },
      assessor: { select: { firstName: true, lastName: true } },
    },
    orderBy: [{ assessmentDate: 'desc' }, { id: 'desc' }],
    take: 500,
  });

  res.json(assessments.map((assessment) => mapSkillAssessmentResponse(assessment)));
});

// GET /manager/development-goals
router.get('/development-goals', authMiddleware, async (req: AuthRequest, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const profileId = req.user?.profileId;
  if (!profileId) return res.status(401).json({ error: 'Unauthorized' });
  if (!canManageTeamDevelopment(req)) {
    return res
      .status(403)
      .json({ error: 'Only managers, partners, or HR can access development goals' });
  }

  const teamMemberIds = await getScopedTeamMemberIds(req, profileId);
  const employeeFilterRaw = String(req.query.employee || '').trim().toLowerCase();
  const employeeFilter =
    !employeeFilterRaw || employeeFilterRaw === 'all'
      ? null
      : parseOptionalPositiveInt(employeeFilterRaw);

  if (employeeFilter && !teamMemberIds.includes(employeeFilter)) {
    return res.status(403).json({ error: 'Selected employee is outside your team scope' });
  }

  const where: Prisma.DevelopmentGoalWhereInput = {
    OR: [{ createdByProfileId: profileId }, { employeeProfileId: { in: teamMemberIds } }],
  };
  if (employeeFilter) {
    where.employeeProfileId = employeeFilter;
  }

  const goals = await prisma.developmentGoal.findMany({
    where,
    include: {
      employee: { select: { firstName: true, lastName: true } },
      assignedMentor: { select: { firstName: true, lastName: true } },
    },
    orderBy: [{ targetCompletion: 'asc' }, { id: 'desc' }],
    take: 500,
  });

  res.json(goals.map((goal) => mapDevelopmentGoalResponse(goal)));
});

// GET /manager/development-metrics
router.get('/development-metrics', authMiddleware, async (req: AuthRequest, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const profileId = req.user?.profileId;
  if (!profileId) return res.status(401).json({ error: 'Unauthorized' });
  if (!canManageTeamDevelopment(req)) {
    return res
      .status(403)
      .json({ error: 'Only managers, partners, or HR can access development metrics' });
  }

  const teamMemberIds = await getScopedTeamMemberIds(req, profileId);
  const [trainingRecords, skillAssessments, developmentGoals] = await Promise.all([
    prisma.trainingRecord.findMany({
      where: {
        OR: [{ createdByProfileId: profileId }, { employeeProfileId: { in: teamMemberIds } }],
      },
      select: {
        id: true,
        status: true,
        trainingType: true,
        cost: true,
        endDate: true,
      },
    }),
    prisma.skillAssessment.findMany({
      where: {
        OR: [{ assessorProfileId: profileId }, { employeeProfileId: { in: teamMemberIds } }],
      },
      select: {
        id: true,
        currentLevel: true,
      },
    }),
    prisma.developmentGoal.findMany({
      where: {
        OR: [{ createdByProfileId: profileId }, { employeeProfileId: { in: teamMemberIds } }],
      },
      select: {
        id: true,
        status: true,
      },
    }),
  ]);

  const now = new Date();
  const expiringSoonCutoff = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const activeTraining = trainingRecords.filter(
    (record) => record.status === 'planned' || record.status === 'in_progress'
  ).length;
  const completedCourses = trainingRecords.filter((record) => record.status === 'completed').length;
  const certificationsExpiring = trainingRecords.filter(
    (record) =>
      record.trainingType === 'certification' &&
      !!record.endDate &&
      record.endDate.getTime() >= now.getTime() &&
      record.endDate.getTime() <= expiringSoonCutoff.getTime()
  ).length;
  const trainingBudgetUsed = trainingRecords.reduce((sum, record) => sum + toNumber(record.cost), 0);
  const avgSkillLevel =
    skillAssessments.length > 0
      ? skillAssessments.reduce((sum, assessment) => sum + toNumber(assessment.currentLevel), 0) /
        skillAssessments.length
      : 0;
  const completedGoals = developmentGoals.filter((goal) => goal.status === 'completed').length;

  res.json({
    total_employees: Math.max(0, teamMemberIds.length - 1),
    active_training: activeTraining,
    completed_courses: completedCourses,
    certifications_expiring: certificationsExpiring,
    avg_skill_level: avgSkillLevel,
    training_budget_used: trainingBudgetUsed,
    training_budget_total: trainingBudgetUsed,
    development_goals_completed: completedGoals,
  });
});

const resolvePeriodRange = (period?: string) => {
  const now = new Date();
  const end = new Date(now);
  let start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30);
  if (period === 'currentWeek') {
    const day = now.getDay();
    const diff = (day + 6) % 7;
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diff);
  } else if (period === 'currentMonth') {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
  } else if (period === 'currentQuarter') {
    const quarter = Math.floor(now.getMonth() / 3);
    start = new Date(now.getFullYear(), quarter * 3, 1);
  }
  return { start, end };
};

const toNumber = (value: unknown) => (value ? Number(value) : 0);

const mapTrainingRecordResponse = (record: {
  id: number;
  employeeProfileId: number | null;
  courseName: string;
  trainingType: string;
  status: string;
  startDate: Date;
  endDate: Date | null;
  provider: string | null;
  cost: Prisma.Decimal | number;
  completionPercentage: Prisma.Decimal | number;
  certificateUrl: string | null;
  notes: string | null;
  employee?: { firstName: string; lastName: string } | null;
}) => ({
  id: record.id,
  employee_id: record.employeeProfileId,
  employee_name: record.employee
    ? `${record.employee.firstName} ${record.employee.lastName}`.trim()
    : 'Team Session',
  course_name: record.courseName,
  training_type: String(record.trainingType || 'internal'),
  status: String(record.status || 'planned'),
  start_date: toIsoStringOrNull(record.startDate),
  end_date: toIsoStringOrNull(record.endDate) || toIsoStringOrNull(record.startDate),
  provider: record.provider || 'Internal',
  cost: toNumber(record.cost),
  completion_percentage: toNumber(record.completionPercentage),
  certificate_url: record.certificateUrl || undefined,
  notes: record.notes || undefined,
});

const mapSkillAssessmentResponse = (assessment: {
  id: number;
  employeeProfileId: number;
  skillCategory: string;
  skillName: string;
  currentLevel: number;
  targetLevel: number;
  assessmentDate: Date;
  notes: string | null;
  employee?: { firstName: string; lastName: string } | null;
  assessor?: { firstName: string; lastName: string } | null;
}) => ({
  id: assessment.id,
  employee_id: assessment.employeeProfileId,
  employee_name: assessment.employee
    ? `${assessment.employee.firstName} ${assessment.employee.lastName}`.trim()
    : `Employee #${assessment.employeeProfileId}`,
  skill_category: assessment.skillCategory,
  skill_name: assessment.skillName,
  current_level: toNumber(assessment.currentLevel),
  target_level: toNumber(assessment.targetLevel),
  assessment_date: toIsoStringOrNull(assessment.assessmentDate),
  assessor_name: assessment.assessor
    ? `${assessment.assessor.firstName} ${assessment.assessor.lastName}`.trim()
    : 'Manager',
  notes: assessment.notes || undefined,
});

const mapDevelopmentGoalResponse = (goal: {
  id: number;
  employeeProfileId: number;
  goalTitle: string;
  goalDescription: string;
  targetCompletion: Date;
  currentProgress: Prisma.Decimal | number;
  status: string;
  createdAt: Date;
  employee?: { firstName: string; lastName: string } | null;
  assignedMentor?: { firstName: string; lastName: string } | null;
}) => ({
  id: goal.id,
  employee_id: goal.employeeProfileId,
  employee_name: goal.employee
    ? `${goal.employee.firstName} ${goal.employee.lastName}`.trim()
    : `Employee #${goal.employeeProfileId}`,
  goal_title: goal.goalTitle,
  goal_description: goal.goalDescription,
  target_completion: toIsoStringOrNull(goal.targetCompletion),
  current_progress: toNumber(goal.currentProgress),
  status: goal.status,
  assigned_mentor: goal.assignedMentor
    ? `${goal.assignedMentor.firstName} ${goal.assignedMentor.lastName}`.trim()
    : undefined,
  created_date: toIsoStringOrNull(goal.createdAt),
});

const getManagerJobData = async (managerProfileId: number) => {
  const jobs = await prisma.job.findMany({
    where: { managerProfileId },
    select: {
      id: true,
      jobName: true,
      status: true,
      dueDate: true,
      startDate: true,
      client: { select: { clientName: true } },
      staffing: { select: { employeeProfileId: true } },
    },
  });

  const jobIds = jobs.map((job) => job.id);
  const staffingIds = Array.from(
    new Set(
      jobs.flatMap((job) =>
        job.staffing.map((staff) => Number(staff.employeeProfileId))
      )
    )
  );

  const directReports = await prisma.profile.findMany({
    where: { managerId: managerProfileId, status: 'active' },
    select: { id: true },
  });

  const teamMemberIds = Array.from(
    new Set([...staffingIds, ...directReports.map((report) => report.id)])
  );

  return { jobs, jobIds, teamMemberIds };
};

const getPartnerTeamMemberIds = async (partnerProfileId: number) => {
  const partnerDepartments = await prisma.department.findMany({
    where: { partnerProfileId },
    select: { id: true },
  });
  const departmentIds = partnerDepartments.map((department) => department.id);
  if (departmentIds.length === 0) return [];

  const members = await prisma.profile.findMany({
    where: {
      departmentId: { in: departmentIds },
      status: 'active',
    },
    select: { id: true },
  });

  return members.map((member) => member.id);
};

const getScopedTeamMemberIds = async (req: AuthRequest, actorProfileId: number) => {
  const managerData = await getManagerJobData(actorProfileId);
  const scopedIds = new Set<number>(managerData.teamMemberIds);

  if (isPartnerRole(req)) {
    const partnerIds = await getPartnerTeamMemberIds(actorProfileId);
    partnerIds.forEach((profileId) => scopedIds.add(profileId));
  }

  scopedIds.add(actorProfileId);
  return Array.from(scopedIds);
};

// GET /manager/workload-analysis
router.get('/workload-analysis', authMiddleware, async (req: AuthRequest, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const profileId = req.user?.profileId;
  if (!profileId) return res.status(401).json({ error: 'Unauthorized' });

  const period = (req.query.period as string | undefined) || 'currentMonth';
  const { start, end } = resolvePeriodRange(period);

  const { jobs, jobIds, teamMemberIds } = await getManagerJobData(profileId);

  if (teamMemberIds.length === 0) {
    return res.json([]);
  }

  const [profiles, allocations, timeEntries] = await Promise.all([
    prisma.profile.findMany({
      where: { id: { in: teamMemberIds } },
      select: { id: true, firstName: true, lastName: true, positionTitle: true },
    }),
    jobIds.length > 0
      ? prisma.jobTimeAllocation.findMany({
          where: { jobCosting: { jobId: { in: jobIds } } },
          select: { employeeProfileId: true, allocatedHours: true },
        })
      : Promise.resolve([]),
    jobIds.length > 0
      ? prisma.timeEntry.findMany({
          where: {
            jobId: { in: jobIds },
            employeeProfileId: { in: teamMemberIds },
            dateWorked: { gte: start, lte: end },
          },
          select: { employeeProfileId: true, hours: true, billable: true, dateWorked: true },
        })
      : Promise.resolve([]),
  ]);

  const allocationByEmployee = new Map<number, number>();
  allocations.forEach((alloc) => {
    const key = Number(alloc.employeeProfileId);
    allocationByEmployee.set(
      key,
      (allocationByEmployee.get(key) || 0) + toNumber(alloc.allocatedHours)
    );
  });

  const hoursByEmployee = new Map<number, { total: number; billable: number; lastDate?: Date }>();
  timeEntries.forEach((entry) => {
    const key = Number(entry.employeeProfileId);
    const current = hoursByEmployee.get(key) || { total: 0, billable: 0 };
    current.total += toNumber(entry.hours);
    if (entry.billable) current.billable += toNumber(entry.hours);
    if (!current.lastDate || entry.dateWorked > current.lastDate) {
      current.lastDate = entry.dateWorked;
    }
    hoursByEmployee.set(key, current);
  });

  const analysis = profiles.map((profile) => {
    const allocated = allocationByEmployee.get(profile.id) || 0;
    const hours = hoursByEmployee.get(profile.id) || { total: 0, billable: 0 };
    const utilization = allocated > 0 ? hours.billable / allocated : 0;
    const assignedJobs = jobs.filter((job) =>
      job.staffing.some((staff) => staff.employeeProfileId === profile.id)
    ).length;
    return {
      employeeId: profile.id,
      name: `${profile.firstName} ${profile.lastName}`,
      role: profile.positionTitle || 'Team member',
      allocatedHours: allocated,
      loggedHours: hours.total,
      billableHours: hours.billable,
      utilizationRate: utilization,
      jobsAssigned: assignedJobs,
      lastWorked: hours.lastDate ? hours.lastDate.toISOString() : null,
      status:
        utilization > 1
          ? 'overloaded'
          : utilization < 0.6
          ? 'underutilized'
          : 'balanced',
    };
  });

  res.json(analysis);
});

// GET /manager/workload-metrics
router.get('/workload-metrics', authMiddleware, async (req: AuthRequest, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const profileId = req.user?.profileId;
  if (!profileId) return res.status(401).json({ error: 'Unauthorized' });

  const { jobs, jobIds, teamMemberIds } = await getManagerJobData(profileId);
  if (teamMemberIds.length === 0) {
    return res.json({
      total_team_members: 0,
      avg_utilization: 0,
      overloaded_employees: 0,
      underutilized_employees: 0,
      critical_deadlines: 0,
      capacity_variance: 0,
      burnout_risk: 0,
    });
  }

  const { start, end } = resolvePeriodRange('currentMonth');
  const allocations = jobIds.length > 0
    ? await prisma.jobTimeAllocation.findMany({
        where: { jobCosting: { jobId: { in: jobIds } } },
        select: { employeeProfileId: true, allocatedHours: true },
      })
    : [];
  const timeEntries = jobIds.length > 0
    ? await prisma.timeEntry.findMany({
        where: {
          jobId: { in: jobIds },
          employeeProfileId: { in: teamMemberIds },
          dateWorked: { gte: start, lte: end },
        },
        select: { employeeProfileId: true, hours: true, billable: true },
      })
    : [];

  const allocationByEmployee = new Map<number, number>();
  allocations.forEach((alloc) => {
    const key = Number(alloc.employeeProfileId);
    allocationByEmployee.set(
      key,
      (allocationByEmployee.get(key) || 0) + toNumber(alloc.allocatedHours)
    );
  });

  const billableByEmployee = new Map<number, number>();
  timeEntries.forEach((entry) => {
    if (!entry.billable) return;
    const key = Number(entry.employeeProfileId);
    billableByEmployee.set(key, (billableByEmployee.get(key) || 0) + toNumber(entry.hours));
  });

  const utilizations = teamMemberIds.map((id) => {
    const allocated = allocationByEmployee.get(id) || 0;
    const billable = billableByEmployee.get(id) || 0;
    return allocated > 0 ? billable / allocated : 0;
  });

  const avgUtilization =
    utilizations.length > 0
      ? utilizations.reduce((sum, value) => sum + value, 0) / utilizations.length
      : 0;

  const overloaded = utilizations.filter((value) => value > 1).length;
  const underutilized = utilizations.filter((value) => value < 0.6).length;

  const criticalDeadlines = jobs.filter((job) => {
    if (!job.dueDate) return false;
    const daysLeft = (job.dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    return daysLeft <= 7 && job.status !== 'completed';
  }).length;

  res.json({
    total_team_members: teamMemberIds.length,
    avg_utilization: avgUtilization * 100,
    overloaded_employees: overloaded,
    underutilized_employees: underutilized,
    critical_deadlines: criticalDeadlines,
    capacity_variance: (avgUtilization - 0.8) * 100,
    burnout_risk: teamMemberIds.length > 0 ? (overloaded / teamMemberIds.length) * 100 : 0,
  });
});

// GET /manager/project-assignments
router.get('/project-assignments', authMiddleware, async (req: AuthRequest, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const profileId = req.user?.profileId;
  if (!profileId) return res.status(401).json({ error: 'Unauthorized' });

  const assignments = await prisma.jobStaffAssignment.findMany({
    where: {
      job: { managerProfileId: profileId },
    },
    include: {
      job: {
        select: {
          id: true,
          jobName: true,
          dueDate: true,
          status: true,
          client: { select: { clientName: true } },
        },
      },
      employee: { select: { id: true, firstName: true, lastName: true } },
      role: { select: { name: true } },
    },
  });

  const jobCostings = await prisma.jobCosting.findMany({
    where: { jobId: { in: assignments.map((assignment) => assignment.jobId) } },
    select: { id: true, jobId: true },
  });

  const jobCostingByJob = new Map<number, number>();
  jobCostings.forEach((costing) => {
    jobCostingByJob.set(costing.jobId, costing.id);
  });

  const allocations = await prisma.jobTimeAllocation.findMany({
    where: {
      jobCostingId: { in: jobCostings.map((costing) => costing.id) },
    },
    select: { jobCostingId: true, employeeProfileId: true, allocatedHours: true },
  });

  const allocationByJobEmployee = new Map<string, number>();
  allocations.forEach((alloc) => {
    const key = `${alloc.jobCostingId}:${alloc.employeeProfileId}`;
    allocationByJobEmployee.set(key, toNumber(alloc.allocatedHours));
  });

  const response = assignments.map((assignment) => {
    const jobCostingId = jobCostingByJob.get(assignment.jobId);
    const allocationKey = jobCostingId
      ? `${jobCostingId}:${assignment.employeeProfileId}`
      : '';
    const allocatedHours = allocationKey
      ? allocationByJobEmployee.get(allocationKey) || 0
      : 0;

    return {
      id: assignment.id,
      jobId: assignment.jobId,
      jobName: assignment.job?.jobName ?? 'Job',
      clientName: assignment.job?.client?.clientName ?? 'Client',
      employeeId: assignment.employee?.id ?? assignment.employeeProfileId,
      employeeName: assignment.employee
        ? `${assignment.employee.firstName} ${assignment.employee.lastName}`
        : 'Team member',
      role: assignment.role?.name ?? assignment.roleOnJob ?? 'Team',
      allocatedHours,
      dueDate: assignment.job?.dueDate,
      priority: 'medium',
      completionPercentage: 0,
      estimatedRemainingHours: Math.max(0, allocatedHours),
    };
  });

  res.json(response);
});

// GET /manager/capacity-recommendations
router.get('/capacity-recommendations', authMiddleware, async (req: AuthRequest, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const profileId = req.user?.profileId;
  if (!profileId) return res.status(401).json({ error: 'Unauthorized' });

  const { jobs, jobIds, teamMemberIds } = await getManagerJobData(profileId);
  if (teamMemberIds.length === 0) return res.json([]);

  const allocations = await prisma.jobTimeAllocation.findMany({
    where: { jobCosting: { jobId: { in: jobIds } } },
    select: { employeeProfileId: true, allocatedHours: true },
  });
  const timeEntries = await prisma.timeEntry.findMany({
    where: { jobId: { in: jobIds }, employeeProfileId: { in: teamMemberIds } },
    select: { employeeProfileId: true, hours: true, billable: true },
  });

  const allocationByEmployee = new Map<number, number>();
  allocations.forEach((alloc) => {
    const key = Number(alloc.employeeProfileId);
    allocationByEmployee.set(
      key,
      (allocationByEmployee.get(key) || 0) + toNumber(alloc.allocatedHours)
    );
  });
  const billableByEmployee = new Map<number, number>();
  timeEntries.forEach((entry) => {
    if (!entry.billable) return;
    const key = Number(entry.employeeProfileId);
    billableByEmployee.set(key, (billableByEmployee.get(key) || 0) + toNumber(entry.hours));
  });

  const profiles = await prisma.profile.findMany({
    where: { id: { in: teamMemberIds } },
    select: { id: true, firstName: true, lastName: true },
  });

  const recommendations = profiles.map((profile) => {
    const allocated = allocationByEmployee.get(profile.id) || 0;
    const billable = billableByEmployee.get(profile.id) || 0;
    const utilization = allocated > 0 ? billable / allocated : 0;
    let action = 'balanced';
    if (utilization > 1) action = 'reduce load';
    if (utilization < 0.6) action = 'assign more work';
    return {
      employeeId: profile.id,
      name: `${profile.firstName} ${profile.lastName}`,
      utilizationRate: utilization,
      recommendation: action,
    };
  });

  res.json(recommendations);
});

// POST /manager/training-records
router.post('/training-records', authMiddleware, async (req: AuthRequest, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const profileId = req.user?.profileId;
  if (!profileId) return res.status(401).json({ error: 'Unauthorized' });
  if (!canManageTeamDevelopment(req)) {
    return res.status(403).json({ error: 'Only managers, partners, or HR can schedule trainings' });
  }

  const teamMemberIds = await getScopedTeamMemberIds(req, profileId);
  const employeeId = parseOptionalPositiveInt(
    req.body?.employeeId ?? req.body?.employee_id
  );
  if (employeeId && !teamMemberIds.includes(employeeId)) {
    return res.status(403).json({ error: 'Selected employee is outside your team scope' });
  }

  const courseName = String(req.body?.courseName || req.body?.course_name || '').trim();
  if (!courseName) {
    return res.status(400).json({ error: 'courseName is required' });
  }

  const startDate = parseDateOrNull(req.body?.startDate ?? req.body?.start_date) || new Date();
  const endDate = parseDateOrNull(req.body?.endDate ?? req.body?.end_date);
  if (endDate && endDate < startDate) {
    return res.status(400).json({ error: 'endDate cannot be before startDate' });
  }

  const trainingType = normalizeTrainingType(req.body?.trainingType ?? req.body?.training_type);
  const status = normalizeTrainingStatus(req.body?.status);
  const deliveryMode = String(req.body?.deliveryMode || req.body?.delivery_mode || '').trim() || null;
  const provider = String(req.body?.provider || '').trim() || null;
  const notes = String(req.body?.notes || '').trim() || null;
  const certificateUrl = String(req.body?.certificateUrl || req.body?.certificate_url || '').trim() || null;
  const completionPercentage = Math.max(
    0,
    Math.min(100, toNumber(req.body?.completionPercentage ?? req.body?.completion_percentage))
  );
  const cost = Math.max(0, toNumber(req.body?.cost));

  let departmentId: number | null = null;
  if (employeeId) {
    const employee = await prisma.profile.findUnique({
      where: { id: employeeId },
      select: { id: true, departmentId: true },
    });
    if (!employee) {
      return res.status(404).json({ error: 'Selected employee was not found' });
    }
    departmentId = employee.departmentId ?? null;
  } else {
    const actorProfile = await prisma.profile.findUnique({
      where: { id: profileId },
      select: { departmentId: true },
    });
    departmentId = actorProfile?.departmentId ?? null;
  }

  const created = await prisma.trainingRecord.create({
    data: {
      employeeProfileId: employeeId ?? null,
      createdByProfileId: profileId,
      departmentId,
      courseName,
      trainingType,
      status,
      deliveryMode,
      startDate,
      endDate,
      provider,
      cost: new Prisma.Decimal(cost),
      completionPercentage: new Prisma.Decimal(completionPercentage),
      certificateUrl,
      notes,
    },
    include: {
      employee: {
        select: { firstName: true, lastName: true },
      },
    },
  });

  await createAudit({
    action: 'training_record_created',
    entity_type: 'training_record',
    entity_id: created.id,
    user_id: userId,
    metadata: {
      actorProfileId: profileId,
      employeeProfileId: created.employeeProfileId,
      courseName: created.courseName,
      trainingType: created.trainingType,
      status: created.status,
    },
  });

  res.status(201).json({
    message: 'Training scheduled successfully',
    ...mapTrainingRecordResponse(created),
  });
});

// POST /manager/skill-assessments
router.post('/skill-assessments', authMiddleware, async (req: AuthRequest, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const profileId = req.user?.profileId;
  if (!profileId) return res.status(401).json({ error: 'Unauthorized' });
  if (!canManageTeamDevelopment(req)) {
    return res
      .status(403)
      .json({ error: 'Only managers, partners, or HR can add skill assessments' });
  }

  const teamMemberIds = await getScopedTeamMemberIds(req, profileId);
  const employeeId = parseOptionalPositiveInt(req.body?.employeeId ?? req.body?.employee_id);
  if (!employeeId) {
    return res.status(400).json({ error: 'employeeId is required' });
  }
  if (!teamMemberIds.includes(employeeId)) {
    return res.status(403).json({ error: 'Selected employee is outside your team scope' });
  }

  const skillCategory = String(
    req.body?.skillCategory ?? req.body?.skill_category ?? ''
  ).trim();
  const skillName = String(req.body?.skillName ?? req.body?.skill_name ?? '').trim();
  if (!skillCategory || !skillName) {
    return res.status(400).json({ error: 'skillCategory and skillName are required' });
  }

  const currentLevel = parseSkillLevel(req.body?.currentLevel ?? req.body?.current_level);
  const targetLevel = parseSkillLevel(
    req.body?.targetLevel ?? req.body?.target_level,
    currentLevel
  );
  const assessmentDate =
    parseDateOrNull(req.body?.assessmentDate ?? req.body?.assessment_date) || new Date();
  const notes = String(req.body?.notes || '').trim() || null;

  const employee = await prisma.profile.findUnique({
    where: { id: employeeId },
    select: { id: true, departmentId: true },
  });
  if (!employee) {
    return res.status(404).json({ error: 'Selected employee was not found' });
  }

  const created = await prisma.skillAssessment.create({
    data: {
      employeeProfileId: employeeId,
      assessorProfileId: profileId,
      departmentId: employee.departmentId ?? null,
      skillCategory,
      skillName,
      currentLevel,
      targetLevel,
      assessmentDate,
      notes,
    },
    include: {
      employee: { select: { firstName: true, lastName: true } },
      assessor: { select: { firstName: true, lastName: true } },
    },
  });

  await createAudit({
    action: 'skill_assessment_created',
    entity_type: 'skill_assessment',
    entity_id: created.id,
    user_id: userId,
    metadata: {
      actorProfileId: profileId,
      employeeProfileId: created.employeeProfileId,
      skillCategory: created.skillCategory,
      skillName: created.skillName,
      currentLevel: created.currentLevel,
      targetLevel: created.targetLevel,
    },
  });

  res.status(201).json({
    message: 'Skill assessment recorded successfully',
    ...mapSkillAssessmentResponse(created),
  });
});

// POST /manager/development-goals
router.post('/development-goals', authMiddleware, async (req: AuthRequest, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const profileId = req.user?.profileId;
  if (!profileId) return res.status(401).json({ error: 'Unauthorized' });
  if (!canManageTeamDevelopment(req)) {
    return res
      .status(403)
      .json({ error: 'Only managers, partners, or HR can add development goals' });
  }

  const teamMemberIds = await getScopedTeamMemberIds(req, profileId);
  const employeeId = parseOptionalPositiveInt(req.body?.employeeId ?? req.body?.employee_id);
  if (!employeeId) {
    return res.status(400).json({ error: 'employeeId is required' });
  }
  if (!teamMemberIds.includes(employeeId)) {
    return res.status(403).json({ error: 'Selected employee is outside your team scope' });
  }

  const goalTitle = String(req.body?.goalTitle ?? req.body?.goal_title ?? '').trim();
  const goalDescription = String(
    req.body?.goalDescription ?? req.body?.goal_description ?? ''
  ).trim();
  if (!goalTitle) {
    return res.status(400).json({ error: 'goalTitle is required' });
  }
  if (!goalDescription) {
    return res.status(400).json({ error: 'goalDescription is required' });
  }

  const targetCompletion = parseDateOrNull(
    req.body?.targetCompletion ?? req.body?.target_completion
  );
  if (!targetCompletion) {
    return res.status(400).json({ error: 'targetCompletion must be a valid date' });
  }

  const progress = parseOptionalProgress(
    req.body?.currentProgress ?? req.body?.current_progress
  );
  const status = normalizeDevelopmentGoalStatus(req.body?.status);
  const assignedMentorId = parseOptionalPositiveInt(
    req.body?.assignedMentorId ?? req.body?.assigned_mentor_id
  );
  if (assignedMentorId) {
    const mentor = await prisma.profile.findUnique({
      where: { id: assignedMentorId },
      select: { id: true, status: true },
    });
    if (!mentor || mentor.status !== 'active') {
      return res.status(400).json({ error: 'Assigned mentor was not found or is inactive' });
    }
  }

  const employee = await prisma.profile.findUnique({
    where: { id: employeeId },
    select: { id: true, departmentId: true },
  });
  if (!employee) {
    return res.status(404).json({ error: 'Selected employee was not found' });
  }

  const created = await prisma.developmentGoal.create({
    data: {
      employeeProfileId: employeeId,
      createdByProfileId: profileId,
      assignedMentorProfileId: assignedMentorId ?? null,
      departmentId: employee.departmentId ?? null,
      goalTitle,
      goalDescription,
      targetCompletion,
      currentProgress: new Prisma.Decimal(progress ?? 0),
      status,
    },
    include: {
      employee: { select: { firstName: true, lastName: true } },
      assignedMentor: { select: { firstName: true, lastName: true } },
    },
  });

  await createAudit({
    action: 'development_goal_created',
    entity_type: 'development_goal',
    entity_id: created.id,
    user_id: userId,
    metadata: {
      actorProfileId: profileId,
      employeeProfileId: created.employeeProfileId,
      goalTitle: created.goalTitle,
      status: created.status,
      currentProgress: toNumber(created.currentProgress),
    },
  });

  res.status(201).json({
    message: 'Development goal created successfully',
    ...mapDevelopmentGoalResponse(created),
  });
});

// PATCH /manager/development-goals/:goalId
router.patch('/development-goals/:goalId', authMiddleware, async (req: AuthRequest, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const profileId = req.user?.profileId;
  if (!profileId) return res.status(401).json({ error: 'Unauthorized' });
  if (!canManageTeamDevelopment(req)) {
    return res
      .status(403)
      .json({ error: 'Only managers, partners, or HR can update development goals' });
  }

  const goalId = parseOptionalPositiveInt(req.params.goalId);
  if (!goalId) {
    return res.status(400).json({ error: 'Valid goalId is required' });
  }

  const existing = await prisma.developmentGoal.findUnique({
    where: { id: goalId },
    include: {
      employee: { select: { firstName: true, lastName: true } },
      assignedMentor: { select: { firstName: true, lastName: true } },
    },
  });
  if (!existing) {
    return res.status(404).json({ error: 'Development goal was not found' });
  }

  const teamMemberIds = await getScopedTeamMemberIds(req, profileId);
  const hasScope =
    existing.createdByProfileId === profileId || teamMemberIds.includes(existing.employeeProfileId);
  if (!hasScope) {
    return res.status(403).json({ error: 'Selected goal is outside your team scope' });
  }

  const nextGoalTitle =
    req.body?.goalTitle !== undefined || req.body?.goal_title !== undefined
      ? String(req.body?.goalTitle ?? req.body?.goal_title ?? '').trim()
      : undefined;
  const nextGoalDescription =
    req.body?.goalDescription !== undefined || req.body?.goal_description !== undefined
      ? String(req.body?.goalDescription ?? req.body?.goal_description ?? '').trim()
      : undefined;
  if (nextGoalTitle !== undefined && !nextGoalTitle) {
    return res.status(400).json({ error: 'goalTitle cannot be empty' });
  }
  if (nextGoalDescription !== undefined && !nextGoalDescription) {
    return res.status(400).json({ error: 'goalDescription cannot be empty' });
  }

  const nextTargetCompletion =
    req.body?.targetCompletion !== undefined || req.body?.target_completion !== undefined
      ? parseDateOrNull(req.body?.targetCompletion ?? req.body?.target_completion)
      : undefined;
  if (
    (req.body?.targetCompletion !== undefined || req.body?.target_completion !== undefined) &&
    !nextTargetCompletion
  ) {
    return res.status(400).json({ error: 'targetCompletion must be a valid date' });
  }

  const nextStatus =
    req.body?.status !== undefined
      ? normalizeDevelopmentGoalStatus(req.body?.status)
      : undefined;
  const progress = parseOptionalProgress(
    req.body?.currentProgress ?? req.body?.current_progress
  );
  const mentorIdProvided =
    req.body?.assignedMentorId !== undefined || req.body?.assigned_mentor_id !== undefined;
  const nextMentorId = mentorIdProvided
    ? parseOptionalPositiveInt(req.body?.assignedMentorId ?? req.body?.assigned_mentor_id)
    : undefined;
  if (mentorIdProvided && nextMentorId) {
    const mentor = await prisma.profile.findUnique({
      where: { id: nextMentorId },
      select: { id: true, status: true },
    });
    if (!mentor || mentor.status !== 'active') {
      return res.status(400).json({ error: 'Assigned mentor was not found or is inactive' });
    }
  }

  const updateData: Prisma.DevelopmentGoalUncheckedUpdateInput = {};
  if (nextGoalTitle !== undefined) {
    updateData.goalTitle = nextGoalTitle;
  }
  if (nextGoalDescription !== undefined) {
    updateData.goalDescription = nextGoalDescription;
  }
  if (nextTargetCompletion !== undefined && nextTargetCompletion !== null) {
    updateData.targetCompletion = nextTargetCompletion;
  }
  if (nextStatus !== undefined) {
    updateData.status = nextStatus;
  }
  if (progress !== null) {
    updateData.currentProgress = new Prisma.Decimal(progress);
  }
  if (mentorIdProvided) {
    updateData.assignedMentorProfileId = nextMentorId ?? null;
  }

  const updated = await prisma.developmentGoal.update({
    where: { id: goalId },
    data: updateData,
    include: {
      employee: { select: { firstName: true, lastName: true } },
      assignedMentor: { select: { firstName: true, lastName: true } },
    },
  });

  await createAudit({
    action: 'development_goal_updated',
    entity_type: 'development_goal',
    entity_id: updated.id,
    user_id: userId,
    metadata: {
      actorProfileId: profileId,
      employeeProfileId: updated.employeeProfileId,
      status: updated.status,
      currentProgress: toNumber(updated.currentProgress),
    },
  });

  res.json({
    message: 'Development goal updated successfully',
    ...mapDevelopmentGoalResponse(updated),
  });
});

// POST /manager/redistribute-workload
router.post('/redistribute-workload', authMiddleware, async (req: AuthRequest, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const profileId = req.user?.profileId;
  const { jobId, fromEmployeeId, toEmployeeId, notes } = req.body || {};

  if (!jobId || !fromEmployeeId || !toEmployeeId) {
    return res.status(400).json({ error: 'jobId, fromEmployeeId, and toEmployeeId are required' });
  }

  if (Number(fromEmployeeId) === Number(toEmployeeId)) {
    return res.status(400).json({ error: 'Reassignment target must be different' });
  }

  const existingAssignment = await prisma.jobStaffAssignment.findUnique({
    where: {
      jobId_employeeProfileId: {
        jobId: Number(jobId),
        employeeProfileId: Number(fromEmployeeId),
      },
    },
  });

  if (!existingAssignment) {
    return res.status(404).json({ error: 'Assignment not found for selected employee' });
  }

  const alreadyAssigned = await prisma.jobStaffAssignment.findUnique({
    where: {
      jobId_employeeProfileId: {
        jobId: Number(jobId),
        employeeProfileId: Number(toEmployeeId),
      },
    },
  });

  if (alreadyAssigned) {
    return res.status(409).json({ error: 'Target employee is already assigned to this job' });
  }

  const jobCosting = await prisma.jobCosting.findUnique({
    where: { jobId: Number(jobId) },
    select: { id: true },
  });

  await prisma.$transaction(async (tx) => {
    await tx.jobStaffAssignment.create({
      data: {
        jobId: existingAssignment.jobId,
        employeeProfileId: Number(toEmployeeId),
        assignedRoleId: existingAssignment.assignedRoleId,
        assignedHourlyRate: existingAssignment.assignedHourlyRate,
        roleSnapshot: existingAssignment.roleSnapshot ?? Prisma.DbNull,
        roleOnJob: existingAssignment.roleOnJob,
        assignedByProfileId: profileId || existingAssignment.assignedByProfileId || null,
      },
    });

    await tx.jobStaffAssignment.delete({
      where: {
        jobId_employeeProfileId: {
          jobId: existingAssignment.jobId,
          employeeProfileId: existingAssignment.employeeProfileId,
        },
      },
    });

    if (jobCosting?.id) {
      await tx.jobTimeAllocation.updateMany({
        where: {
          jobCostingId: jobCosting.id,
          employeeProfileId: Number(fromEmployeeId),
        },
        data: { employeeProfileId: Number(toEmployeeId) },
      });
    }
  });

  await createAudit({
    action: 'workload_reassigned',
    entity_type: 'job_staff_assignment',
    entity_id: Number(jobId),
    user_id: userId,
    metadata: {
      jobId: Number(jobId),
      fromEmployeeId: Number(fromEmployeeId),
      toEmployeeId: Number(toEmployeeId),
      notes: notes || null,
      actorProfileId: profileId || null,
    },
  });

  res.json({
    message: 'Workload redistributed successfully',
    jobId: Number(jobId),
    fromEmployeeId: Number(fromEmployeeId),
    toEmployeeId: Number(toEmployeeId),
    notes: notes || null,
  });
});

export default router;
