import { Router } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { resolveRequestAccessRoles } from "../auth/accessRoles";
import { Prisma } from '@prisma/client';
import prisma from '../prisma';
import createAudit from '../utils/audit';
import {
  awardAttendancePoints,
  issueCertificateIfEligible,
  recalculateLearningAssignment,
  submitLearningQuizAttempt,
  submitTrainingFeedbackEntry,
} from '../services/learningDevelopment.service';

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
const LEARNING_PROGRAM_STATUSES = new Set(['draft', 'published', 'archived']);
const LEARNING_PROGRAM_VERSION_STATUSES = new Set(['draft', 'published', 'retired']);
const LEARNING_MODULE_CONTENT_TYPES = new Set([
  'video',
  'document',
  'link',
  'knowledge_resource',
  'live_session',
]);
const LEARNING_QUESTION_TYPES = new Set([
  'single_choice',
  'multiple_choice',
  'true_false',
  'short_text',
]);
const LEARNING_ATTENDANCE_STATUSES = new Set(['invited', 'attended', 'missed', 'excused']);
const MIN_SKILL_LEVEL = 1;
const MAX_SKILL_LEVEL = 5;
const FRONTEND_APP_URL = String(
  process.env.FRONTEND_URL || process.env.APP_URL || 'http://localhost:8080'
)
  .trim()
  .replace(/\/+$/, '');

const learningKnowledgeResourceSelect = {
  id: true,
  title: true,
  assetKind: true,
  linkUrl: true,
  assetFileName: true,
  assetMimeType: true,
  content: true,
  completionMode: true,
  completionThresholdPercent: true,
  minReadSeconds: true,
  estimatedDurationMinutes: true,
} satisfies Prisma.KnowledgeHubResourceSelect;

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

const parseOptionalNonNegativeInt = (value: unknown) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
};

const parseOptionalPercentage = (value: unknown) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  if (parsed < 0) return 0;
  if (parsed > 100) return 100;
  return Math.round(parsed * 100) / 100;
};

const toNullableTrimmedString = (value: unknown) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const clampRating = (value: unknown) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return 0;
  if (parsed < 1) return 1;
  if (parsed > 5) return 5;
  return parsed;
};

const withStatusCode = (message: string, statusCode: number) => {
  const error = new Error(message) as Error & { statusCode?: number };
  error.statusCode = statusCode;
  return error;
};

const buildCertificateVerificationUrl = (verificationCode: string | null | undefined) =>
  verificationCode ? `${FRONTEND_APP_URL}/certificates/verify/${encodeURIComponent(String(verificationCode))}` : null;

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
    resolveRequestAccessRoles(req)
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
      role === 'manager'
    ) {
      return true;
    }
  }
  return false;
};

const isPartnerRole = (req: AuthRequest) => roleSet(req).has('partner');

// GET /team-management/team-performance
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

// GET /team-management/training-records
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

// GET /team-management/certifications
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
      learningAssignment: {
        include: {
          certificate: {
            select: {
              verificationCode: true,
            },
          },
        },
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
      verification_url:
        buildCertificateVerificationUrl(record.learningAssignment?.certificate?.verificationCode) ||
        record.certificateUrl ||
        undefined,
    };
  });

  res.json(payload);
});

// GET /team-management/skill-assessments
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

// GET /team-management/development-metrics
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
  const [trainingRecords, skillAssessments] = await Promise.all([
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

  res.json({
    total_employees: Math.max(0, teamMemberIds.length - 1),
    active_training: activeTraining,
    completed_courses: completedCourses,
    certifications_expiring: certificationsExpiring,
    avg_skill_level: avgSkillLevel,
    training_budget_used: trainingBudgetUsed,
    training_budget_total: trainingBudgetUsed,
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

const ensureAssignmentAccess = async (
  req: AuthRequest,
  assignmentId: number,
  profileId: number
) => {
  const assignment = await prisma.learningAssignment.findUnique({
    where: { id: assignmentId },
    include: {
      employee: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          managerId: true,
        },
      },
      programVersion: {
        include: {
          program: {
            select: {
              id: true,
              title: true,
            },
          },
          trainer: {
            select: {
              firstName: true,
              lastName: true,
            },
          },
          modules: {
            orderBy: { sequenceNo: 'asc' },
            include: {
              knowledgeHubResource: {
                select: learningKnowledgeResourceSelect,
              },
            },
          },
          sessions: {
            orderBy: { startsAt: 'asc' },
          },
          quizzes: {
            orderBy: { id: 'asc' },
            include: {
              questions: {
                orderBy: { displayOrder: 'asc' },
                include: {
                  options: {
                    orderBy: { displayOrder: 'asc' },
                  },
                },
              },
            },
          },
          certificateTemplates: {
            orderBy: [{ isDefault: 'desc' }, { id: 'asc' }],
          },
        },
      },
      moduleProgressEntries: {
        orderBy: { moduleId: 'asc' },
      },
      attendanceRecords: {
        orderBy: { sessionId: 'asc' },
      },
      quizAttempts: {
        orderBy: [{ submittedAt: 'desc' }, { id: 'desc' }],
      },
      trainingFeedback: true,
      certificate: {
        include: {
          document: true,
        },
      },
      impactAssessmentTask: {
        include: {
          response: true,
        },
      },
    },
  });

  if (!assignment) {
    throw withStatusCode('Learning assignment not found', 404);
  }

  if (assignment.employeeProfileId === profileId) {
    return assignment;
  }

  if (!canManageTeamDevelopment(req)) {
    throw withStatusCode('You do not have access to this learning assignment', 403);
  }

  const scopedIds = await getScopedTeamMemberIds(req, profileId);
  if (!scopedIds.includes(assignment.employeeProfileId)) {
    throw withStatusCode('Learning assignment is outside your team scope', 403);
  }

  return assignment;
};

const serializeLearningAssignment = (assignment: any) => ({
  ...assignment,
  progressPercent: toNumber(assignment.progressPercent),
  programVersion: assignment.programVersion
    ? serializeLearningProgramVersion(assignment.programVersion)
    : null,
  moduleProgressEntries: Array.isArray(assignment.moduleProgressEntries)
    ? assignment.moduleProgressEntries.map((entry: any) => ({
        ...entry,
        completionPercent: toNumber(entry.completionPercent),
        watchPercent: toNumber(entry.watchPercent),
        scrollPercent: toNumber(entry.scrollPercent),
      }))
    : [],
  quizAttempts: Array.isArray(assignment.quizAttempts)
    ? assignment.quizAttempts.map((attempt: any) => ({
        ...attempt,
        score: toNumber(attempt.score),
      }))
    : [],
  certificate: assignment.certificate
    ? {
        ...assignment.certificate,
        verificationUrl: buildCertificateVerificationUrl(assignment.certificate.verificationCode),
      }
    : null,
});

const serializeLearningProgramVersion = (version: any) => ({
  ...version,
  cost: toNumber(version.cost),
  modules: Array.isArray(version.modules)
    ? version.modules.map((module: any) => ({
        ...module,
        knowledgeHubResource: module.knowledgeHubResource
          ? {
              ...module.knowledgeHubResource,
              completionThresholdPercent: toNumber(
                module.knowledgeHubResource.completionThresholdPercent
              ),
            }
          : null,
      }))
    : [],
});

const serializeLearningProgram = (program: any) => ({
  ...program,
  versions: Array.isArray(program.versions)
    ? program.versions.map(serializeLearningProgramVersion)
    : [],
});

const normalizeLearningQuestionInput = (question: any, index: number) => {
  const questionType = String(question?.questionType || '').trim();
  if (!LEARNING_QUESTION_TYPES.has(questionType)) {
    throw withStatusCode(`Invalid questionType at question ${index + 1}`, 400);
  }

  const prompt = String(question?.prompt || '').trim();
  if (!prompt) {
    throw withStatusCode(`Question prompt is required at question ${index + 1}`, 400);
  }

  const options = Array.isArray(question?.options) ? question.options : [];
  const normalizedOptions = options.map((option: any, optionIndex: number) => {
    const label = String(option?.label || '').trim();
    if (!label) {
      throw withStatusCode(`Option label is required at question ${index + 1}`, 400);
    }
    return {
      label,
      isCorrect: Boolean(option?.isCorrect),
      displayOrder: Number(option?.displayOrder || optionIndex + 1),
    };
  });

  return {
    questionType,
    prompt,
    displayOrder: Number(question?.displayOrder || index + 1),
    required: question?.required === undefined ? true : Boolean(question.required),
    explanation: toNullableTrimmedString(question?.explanation),
    options: normalizedOptions,
  };
};

const normalizeLearningVersionInput = (input: any) => {
  const title = String(input?.title || '').trim();
  if (!title) {
    throw withStatusCode('Version title is required', 400);
  }

  const trainingType = normalizeTrainingType(input?.trainingType ?? input?.training_type);
  const status = String(input?.status || 'draft').trim().toLowerCase();
  if (!LEARNING_PROGRAM_VERSION_STATUSES.has(status)) {
    throw withStatusCode('Invalid version status', 400);
  }

  const modulesInput = Array.isArray(input?.modules) ? input.modules : [];
  const sessionsInput = Array.isArray(input?.sessions) ? input.sessions : [];
  const quizzesInput = Array.isArray(input?.quizzes) ? input.quizzes : [];
  const certificateTemplateInput = input?.certificateTemplate || input?.certificate_template || null;

  const modules = modulesInput.map((module: any, index: number) => {
    const contentType = String(module?.contentType || module?.content_type || '').trim();
    if (!LEARNING_MODULE_CONTENT_TYPES.has(contentType)) {
      throw withStatusCode(`Invalid module contentType at module ${index + 1}`, 400);
    }

    const title = String(module?.title || '').trim();
    if (!title) {
      throw withStatusCode(`Module title is required at module ${index + 1}`, 400);
    }

    return {
      title,
      description: toNullableTrimmedString(module?.description),
      contentType,
      knowledgeHubResourceId: parseOptionalPositiveInt(
        module?.knowledgeHubResourceId ?? module?.knowledge_hub_resource_id
      ),
      documentId: parseOptionalPositiveInt(module?.documentId ?? module?.document_id),
      contentUrl: toNullableTrimmedString(module?.contentUrl ?? module?.content_url),
      sequenceNo: Number(module?.sequenceNo || module?.sequence_no || index + 1),
      required: module?.required === undefined ? true : Boolean(module.required),
      estimatedMinutes: parseOptionalNonNegativeInt(module?.estimatedMinutes ?? module?.estimated_minutes),
    };
  });

  const moduleSequenceSet = new Set(modules.map((module: { sequenceNo: number }) => module.sequenceNo));
  const sessions = sessionsInput.map((session: any, index: number) => {
    const startsAt = parseDateOrNull(session?.startsAt ?? session?.starts_at);
    const endsAt = parseDateOrNull(session?.endsAt ?? session?.ends_at);
    if (!startsAt || !endsAt) {
      throw withStatusCode(`Session startsAt and endsAt are required at session ${index + 1}`, 400);
    }
    const moduleSequenceNo = parseOptionalPositiveInt(
      session?.moduleSequenceNo ?? session?.module_sequence_no
    );
    if (moduleSequenceNo && !moduleSequenceSet.has(moduleSequenceNo)) {
      throw withStatusCode(`Session ${index + 1} references an unknown moduleSequenceNo`, 400);
    }

    return {
      title: String(session?.title || '').trim(),
      startsAt,
      endsAt,
      location: toNullableTrimmedString(session?.location),
      trainerProfileId: parseOptionalPositiveInt(session?.trainerProfileId ?? session?.trainer_profile_id),
      externalTrainerName: toNullableTrimmedString(
        session?.externalTrainerName ?? session?.external_trainer_name
      ),
      attendancePoints: Math.max(
        0,
        parseOptionalNonNegativeInt(session?.attendancePoints ?? session?.attendance_points) ?? 0
      ),
      attendanceRequired:
        session?.attendanceRequired === undefined ? true : Boolean(session.attendanceRequired),
      moduleSequenceNo,
    };
  });

  const quizzes = quizzesInput.map((quiz: any, index: number) => {
    const passMark = parseOptionalPercentage(quiz?.passMark ?? quiz?.pass_mark);
    if (!quiz?.title || passMark === null) {
      throw withStatusCode(`Quiz title and passMark are required at quiz ${index + 1}`, 400);
    }

    const moduleSequenceNo = parseOptionalPositiveInt(
      quiz?.moduleSequenceNo ?? quiz?.module_sequence_no
    );
    if (moduleSequenceNo && !moduleSequenceSet.has(moduleSequenceNo)) {
      throw withStatusCode(`Quiz ${index + 1} references an unknown moduleSequenceNo`, 400);
    }

    return {
      title: String(quiz.title).trim(),
      instructions: toNullableTrimmedString(quiz?.instructions),
      passMark,
      pointsOnPass: Math.max(0, parseOptionalNonNegativeInt(quiz?.pointsOnPass ?? quiz?.points_on_pass) ?? 0),
      attemptLimit: parseOptionalPositiveInt(quiz?.attemptLimit ?? quiz?.attempt_limit),
      isMandatory: quiz?.isMandatory === undefined ? true : Boolean(quiz.isMandatory),
      isActive: quiz?.isActive === undefined ? true : Boolean(quiz.isActive),
      moduleSequenceNo,
      questions: (Array.isArray(quiz?.questions) ? quiz.questions : []).map(normalizeLearningQuestionInput),
    };
  });

  return {
    title,
    description: toNullableTrimmedString(input?.description),
    trainingType,
    deliveryMode: toNullableTrimmedString(input?.deliveryMode ?? input?.delivery_mode),
    provider: toNullableTrimmedString(input?.provider),
    cost: Math.max(0, Number(input?.cost || 0) || 0),
    trainerProfileId: parseOptionalPositiveInt(input?.trainerProfileId ?? input?.trainer_profile_id),
    externalTrainerName: toNullableTrimmedString(
      input?.externalTrainerName ?? input?.external_trainer_name
    ),
    isMandatory: input?.isMandatory === undefined ? true : Boolean(input.isMandatory),
    feedbackPoints: Math.max(0, parseOptionalNonNegativeInt(input?.feedbackPoints ?? input?.feedback_points) ?? 0),
    impactAssessmentDelayDays: parseOptionalNonNegativeInt(
      input?.impactAssessmentDelayDays ?? input?.impact_assessment_delay_days
    ),
    status,
    publishedAt: parseDateOrNull(input?.publishedAt ?? input?.published_at),
    modules,
    sessions,
    quizzes,
    certificateTemplate: certificateTemplateInput
      ? {
          name: String(certificateTemplateInput?.name || '').trim() || 'Completion Certificate',
          templateDefinition:
            certificateTemplateInput?.templateDefinition ??
            certificateTemplateInput?.template_definition ??
            {},
          backgroundDocumentId: parseOptionalPositiveInt(
            certificateTemplateInput?.backgroundDocumentId ??
              certificateTemplateInput?.background_document_id
          ),
          signatureDocumentId: parseOptionalPositiveInt(
            certificateTemplateInput?.signatureDocumentId ??
              certificateTemplateInput?.signature_document_id
          ),
          issuedByLabel: toNullableTrimmedString(
            certificateTemplateInput?.issuedByLabel ?? certificateTemplateInput?.issued_by_label
          ),
          isDefault:
            certificateTemplateInput?.isDefault === undefined
              ? true
              : Boolean(certificateTemplateInput.isDefault),
        }
      : null,
  };
};

const createLearningProgramVersionGraph = async (
  tx: Prisma.TransactionClient,
  programId: number,
  createdByProfileId: number,
  input: ReturnType<typeof normalizeLearningVersionInput>
) => {
  const nextVersion = await tx.learningProgramVersion.aggregate({
    where: { programId },
    _max: { versionNo: true },
  });

  const programVersion = await tx.learningProgramVersion.create({
    data: {
      programId,
      versionNo: (nextVersion._max.versionNo ?? 0) + 1,
      title: input.title,
      description: input.description,
      trainingType: input.trainingType,
      deliveryMode: input.deliveryMode,
      provider: input.provider,
      cost: input.cost,
      trainerProfileId: input.trainerProfileId,
      externalTrainerName: input.externalTrainerName,
      isMandatory: input.isMandatory,
      feedbackPoints: input.feedbackPoints,
      impactAssessmentDelayDays: input.impactAssessmentDelayDays,
      status: input.status as any,
      publishedAt: input.status === 'published' ? input.publishedAt ?? new Date() : input.publishedAt,
      createdByProfileId,
    },
  });

  const moduleIdBySequence = new Map<number, number>();
  for (const module of input.modules) {
    const createdModule = await tx.learningModule.create({
      data: {
        programVersionId: programVersion.id,
        title: module.title,
        description: module.description,
        contentType: module.contentType as any,
        knowledgeHubResourceId: module.knowledgeHubResourceId,
        documentId: module.documentId,
        contentUrl: module.contentUrl,
        sequenceNo: module.sequenceNo,
        required: module.required,
        estimatedMinutes: module.estimatedMinutes,
      },
    });
    moduleIdBySequence.set(module.sequenceNo, createdModule.id);
  }

  for (const session of input.sessions) {
    await tx.learningSession.create({
      data: {
        programVersionId: programVersion.id,
        moduleId: session.moduleSequenceNo ? moduleIdBySequence.get(session.moduleSequenceNo) ?? null : null,
        title: session.title,
        startsAt: session.startsAt,
        endsAt: session.endsAt,
        location: session.location,
        trainerProfileId: session.trainerProfileId,
        externalTrainerName: session.externalTrainerName,
        attendancePoints: session.attendancePoints,
        attendanceRequired: session.attendanceRequired,
      },
    });
  }

  for (const quiz of input.quizzes) {
    await tx.learningQuiz.create({
      data: {
        programVersionId: programVersion.id,
        moduleId: quiz.moduleSequenceNo ? moduleIdBySequence.get(quiz.moduleSequenceNo) ?? null : null,
        title: quiz.title,
        instructions: quiz.instructions,
        passMark: quiz.passMark,
        pointsOnPass: quiz.pointsOnPass,
        attemptLimit: quiz.attemptLimit,
        isMandatory: quiz.isMandatory,
        isActive: quiz.isActive,
        questions: {
          create: quiz.questions.map((question: { questionType: string; prompt: string; displayOrder: number; required: boolean; explanation: string | null; options: Array<{ label: string; isCorrect: boolean; displayOrder: number }> }) => ({
            questionType: question.questionType as any,
            prompt: question.prompt,
            displayOrder: question.displayOrder,
            required: question.required,
            explanation: question.explanation,
            options:
              question.options.length > 0
                ? {
                    create: question.options.map((option: { label: string; isCorrect: boolean; displayOrder: number }) => ({
                      label: option.label,
                      isCorrect: option.isCorrect,
                      displayOrder: option.displayOrder,
                    })),
                  }
                : undefined,
          })),
        },
      },
    });
  }

  if (input.certificateTemplate) {
    await tx.certificateTemplate.create({
      data: {
        programVersionId: programVersion.id,
        name: input.certificateTemplate.name,
        templateDefinition: input.certificateTemplate.templateDefinition as Prisma.InputJsonValue,
        backgroundDocumentId: input.certificateTemplate.backgroundDocumentId,
        signatureDocumentId: input.certificateTemplate.signatureDocumentId,
        issuedByLabel: input.certificateTemplate.issuedByLabel,
        isDefault: input.certificateTemplate.isDefault,
      },
    });
  }

  return tx.learningProgramVersion.findUniqueOrThrow({
    where: { id: programVersion.id },
    include: {
      program: true,
      trainer: { select: { firstName: true, lastName: true } },
      modules: {
        orderBy: { sequenceNo: 'asc' },
        include: {
          knowledgeHubResource: {
            select: learningKnowledgeResourceSelect,
          },
        },
      },
      sessions: { orderBy: { startsAt: 'asc' } },
      quizzes: {
        orderBy: { id: 'asc' },
        include: {
          questions: {
            orderBy: { displayOrder: 'asc' },
            include: {
              options: {
                orderBy: { displayOrder: 'asc' },
              },
            },
          },
        },
      },
      certificateTemplates: {
        orderBy: [{ isDefault: 'desc' }, { id: 'asc' }],
      },
    },
  });
};

// GET /team-management/workload-analysis
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

// GET /team-management/workload-metrics
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

// GET /team-management/project-assignments
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

// GET /team-management/capacity-recommendations
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

// POST /team-management/training-records
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

// POST /team-management/skill-assessments
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

// POST /team-management/redistribute-workload
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

router.get('/learning-programs', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = requireUser(req, res);
    if (!userId) return;
    const profileId = req.user?.profileId;
    if (!profileId) return res.status(401).json({ error: 'Unauthorized' });
    if (!canManageTeamDevelopment(req)) {
      return res.status(403).json({ error: 'Only managers, partners, or HR can access learning programs' });
    }

    const status = String(req.query.status || '').trim().toLowerCase();
    if (status && !LEARNING_PROGRAM_STATUSES.has(status)) {
      return res.status(400).json({ error: 'Invalid learning program status' });
    }

    const programs = await prisma.learningProgram.findMany({
      where: status ? { status: status as any } : undefined,
      include: {
        department: { select: { id: true, name: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        versions: {
          orderBy: [{ versionNo: 'desc' }],
          include: {
            trainer: { select: { id: true, firstName: true, lastName: true } },
            modules: {
              orderBy: { sequenceNo: 'asc' },
              include: {
                knowledgeHubResource: {
                  select: learningKnowledgeResourceSelect,
                },
              },
            },
            sessions: { orderBy: { startsAt: 'asc' } },
            quizzes: {
              include: {
                questions: {
                  include: {
                    options: true,
                  },
                },
              },
            },
            certificateTemplates: {
              orderBy: [{ isDefault: 'desc' }, { id: 'asc' }],
            },
            _count: {
              select: {
                assignments: true,
              },
            },
          },
        },
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    });

    return res.json(programs.map(serializeLearningProgram));
  } catch (error) {
    return res.status(500).json({ error: 'Failed to load learning programs' });
  }
});

router.post('/learning-programs', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = requireUser(req, res);
    if (!userId) return;
    const profileId = req.user?.profileId;
    if (!profileId) return res.status(401).json({ error: 'Unauthorized' });
    if (!canManageTeamDevelopment(req)) {
      return res.status(403).json({ error: 'Only managers, partners, or HR can create learning programs' });
    }

    const title = String(req.body?.title || '').trim();
    if (!title) {
      return res.status(400).json({ error: 'Program title is required' });
    }

    const status = String(req.body?.status || 'draft').trim().toLowerCase();
    if (!LEARNING_PROGRAM_STATUSES.has(status)) {
      return res.status(400).json({ error: 'Invalid learning program status' });
    }

    const versionInput = normalizeLearningVersionInput(req.body?.version || req.body);

    const program = await prisma.$transaction(async (tx) => {
      const createdProgram = await tx.learningProgram.create({
        data: {
          title,
          description: toNullableTrimmedString(req.body?.description),
          departmentId: parseOptionalPositiveInt(req.body?.departmentId ?? req.body?.department_id),
          createdByProfileId: profileId,
          status: status as any,
        },
      });

      const version = await createLearningProgramVersionGraph(tx, createdProgram.id, profileId, versionInput);
      return { createdProgram, version };
    });

    await createAudit({
      action: 'learning_program_created',
      entity_type: 'learning_program',
      entity_id: program.createdProgram.id,
      user_id: userId,
      metadata: {
        actorProfileId: profileId,
        learningProgramId: program.createdProgram.id,
        learningProgramVersionId: program.version.id,
      },
    });

    return res.status(201).json({
      ...program.createdProgram,
      version: serializeLearningProgramVersion(program.version),
    });
  } catch (error: any) {
    const statusCode = Number(error?.statusCode || 500);
    return res.status(statusCode).json({
      error: statusCode >= 500 ? 'Failed to create learning program' : error.message,
    });
  }
});

router.get('/learning-programs/:programId', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = requireUser(req, res);
    if (!userId) return;
    if (!canManageTeamDevelopment(req)) {
      return res.status(403).json({ error: 'Only managers, partners, or HR can access learning programs' });
    }

    const programId = parseOptionalPositiveInt(req.params.programId);
    if (!programId) {
      return res.status(400).json({ error: 'Invalid programId' });
    }

    const program = await prisma.learningProgram.findUnique({
      where: { id: programId },
      include: {
        department: { select: { id: true, name: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        versions: {
          orderBy: [{ versionNo: 'desc' }],
          include: {
            trainer: { select: { id: true, firstName: true, lastName: true } },
            modules: {
              orderBy: { sequenceNo: 'asc' },
              include: {
                knowledgeHubResource: {
                  select: learningKnowledgeResourceSelect,
                },
              },
            },
            sessions: { orderBy: { startsAt: 'asc' } },
            quizzes: {
              include: {
                questions: {
                  orderBy: { displayOrder: 'asc' },
                  include: {
                    options: {
                      orderBy: { displayOrder: 'asc' },
                    },
                  },
                },
              },
            },
            certificateTemplates: {
              orderBy: [{ isDefault: 'desc' }, { id: 'asc' }],
            },
            assignments: {
              take: 10,
              orderBy: [{ createdAt: 'desc' }],
              include: {
                employee: { select: { id: true, firstName: true, lastName: true } },
              },
            },
            _count: {
              select: {
                assignments: true,
              },
            },
          },
        },
      },
    });

    if (!program) {
      return res.status(404).json({ error: 'Learning program not found' });
    }

    return res.json(serializeLearningProgram(program));
  } catch {
    return res.status(500).json({ error: 'Failed to load learning program' });
  }
});

router.post('/learning-programs/:programId/versions', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = requireUser(req, res);
    if (!userId) return;
    const profileId = req.user?.profileId;
    if (!profileId) return res.status(401).json({ error: 'Unauthorized' });
    if (!canManageTeamDevelopment(req)) {
      return res.status(403).json({ error: 'Only managers, partners, or HR can create learning versions' });
    }

    const programId = parseOptionalPositiveInt(req.params.programId);
    if (!programId) {
      return res.status(400).json({ error: 'Invalid programId' });
    }

    const program = await prisma.learningProgram.findUnique({
      where: { id: programId },
      select: { id: true },
    });
    if (!program) {
      return res.status(404).json({ error: 'Learning program not found' });
    }

    const versionInput = normalizeLearningVersionInput(req.body);
    const version = await prisma.$transaction((tx) =>
      createLearningProgramVersionGraph(tx, programId, profileId, versionInput)
    );

    await createAudit({
      action: 'learning_program_version_created',
      entity_type: 'learning_program_version',
      entity_id: version.id,
      user_id: userId,
      metadata: {
        actorProfileId: profileId,
        learningProgramId: programId,
        learningProgramVersionId: version.id,
      },
    });

    return res.status(201).json({
      ...serializeLearningProgramVersion(version),
    });
  } catch (error: any) {
    const statusCode = Number(error?.statusCode || 500);
    return res.status(statusCode).json({
      error: statusCode >= 500 ? 'Failed to create learning version' : error.message,
    });
  }
});

router.patch('/learning-program-versions/:versionId', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = requireUser(req, res);
    if (!userId) return;
    const profileId = req.user?.profileId;
    if (!profileId) return res.status(401).json({ error: 'Unauthorized' });
    if (!canManageTeamDevelopment(req)) {
      return res.status(403).json({ error: 'Only managers, partners, or HR can update learning versions' });
    }

    const versionId = parseOptionalPositiveInt(req.params.versionId);
    if (!versionId) {
      return res.status(400).json({ error: 'Invalid versionId' });
    }

    const existingVersion = await prisma.learningProgramVersion.findUnique({
      where: { id: versionId },
      include: {
        _count: {
          select: {
            assignments: true,
          },
        },
      },
    });

    if (!existingVersion) {
      return res.status(404).json({ error: 'Learning version not found' });
    }

    if (existingVersion._count.assignments > 0) {
      return res.status(409).json({
        error: 'Learning versions with assignments cannot be edited in place; create a new version instead',
      });
    }

    const versionInput = normalizeLearningVersionInput({
      ...existingVersion,
      ...req.body,
    });

    const updatedVersion = await prisma.$transaction(async (tx) => {
      await tx.certificateTemplate.deleteMany({
        where: { programVersionId: versionId },
      });
      await tx.learningQuiz.deleteMany({
        where: { programVersionId: versionId },
      });
      await tx.learningSession.deleteMany({
        where: { programVersionId: versionId },
      });
      await tx.learningModule.deleteMany({
        where: { programVersionId: versionId },
      });

      await tx.learningProgramVersion.update({
        where: { id: versionId },
        data: {
          title: versionInput.title,
          description: versionInput.description,
          trainingType: versionInput.trainingType,
          deliveryMode: versionInput.deliveryMode,
          provider: versionInput.provider,
          cost: versionInput.cost,
          trainerProfileId: versionInput.trainerProfileId,
          externalTrainerName: versionInput.externalTrainerName,
          isMandatory: versionInput.isMandatory,
          feedbackPoints: versionInput.feedbackPoints,
          impactAssessmentDelayDays: versionInput.impactAssessmentDelayDays,
          status: versionInput.status as any,
          publishedAt:
            versionInput.status === 'published'
              ? versionInput.publishedAt ?? existingVersion.publishedAt ?? new Date()
              : versionInput.publishedAt,
          createdByProfileId: profileId,
        },
      });

      const moduleIdBySequence = new Map<number, number>();
      for (const module of versionInput.modules) {
        const createdModule = await tx.learningModule.create({
          data: {
            programVersionId: versionId,
            title: module.title,
            description: module.description,
            contentType: module.contentType as any,
            knowledgeHubResourceId: module.knowledgeHubResourceId,
            documentId: module.documentId,
            contentUrl: module.contentUrl,
            sequenceNo: module.sequenceNo,
            required: module.required,
            estimatedMinutes: module.estimatedMinutes,
          },
        });
        moduleIdBySequence.set(module.sequenceNo, createdModule.id);
      }

      for (const session of versionInput.sessions) {
        await tx.learningSession.create({
          data: {
            programVersionId: versionId,
            moduleId: session.moduleSequenceNo ? moduleIdBySequence.get(session.moduleSequenceNo) ?? null : null,
            title: session.title,
            startsAt: session.startsAt,
            endsAt: session.endsAt,
            location: session.location,
            trainerProfileId: session.trainerProfileId,
            externalTrainerName: session.externalTrainerName,
            attendancePoints: session.attendancePoints,
            attendanceRequired: session.attendanceRequired,
          },
        });
      }

      for (const quiz of versionInput.quizzes) {
        await tx.learningQuiz.create({
          data: {
            programVersionId: versionId,
            moduleId: quiz.moduleSequenceNo ? moduleIdBySequence.get(quiz.moduleSequenceNo) ?? null : null,
            title: quiz.title,
            instructions: quiz.instructions,
            passMark: quiz.passMark,
            pointsOnPass: quiz.pointsOnPass,
            attemptLimit: quiz.attemptLimit,
            isMandatory: quiz.isMandatory,
            isActive: quiz.isActive,
            questions: {
              create: quiz.questions.map((question: { questionType: string; prompt: string; displayOrder: number; required: boolean; explanation: string | null; options: Array<{ label: string; isCorrect: boolean; displayOrder: number }> }) => ({
                questionType: question.questionType as any,
                prompt: question.prompt,
                displayOrder: question.displayOrder,
                required: question.required,
                explanation: question.explanation,
                options:
                  question.options.length > 0
                    ? {
                        create: question.options.map((option: { label: string; isCorrect: boolean; displayOrder: number }) => ({
                          label: option.label,
                          isCorrect: option.isCorrect,
                          displayOrder: option.displayOrder,
                        })),
                      }
                    : undefined,
              })),
            },
          },
        });
      }

      if (versionInput.certificateTemplate) {
        await tx.certificateTemplate.create({
          data: {
            programVersionId: versionId,
            name: versionInput.certificateTemplate.name,
            templateDefinition: versionInput.certificateTemplate.templateDefinition as Prisma.InputJsonValue,
            backgroundDocumentId: versionInput.certificateTemplate.backgroundDocumentId,
            signatureDocumentId: versionInput.certificateTemplate.signatureDocumentId,
            issuedByLabel: versionInput.certificateTemplate.issuedByLabel,
            isDefault: versionInput.certificateTemplate.isDefault,
          },
        });
      }

      return tx.learningProgramVersion.findUniqueOrThrow({
        where: { id: versionId },
        include: {
          program: true,
          trainer: { select: { id: true, firstName: true, lastName: true } },
          modules: {
            orderBy: { sequenceNo: 'asc' },
            include: {
              knowledgeHubResource: {
                select: learningKnowledgeResourceSelect,
              },
            },
          },
          sessions: { orderBy: { startsAt: 'asc' } },
          quizzes: {
            include: {
              questions: {
                orderBy: { displayOrder: 'asc' },
                include: {
                  options: {
                    orderBy: { displayOrder: 'asc' },
                  },
                },
              },
            },
          },
          certificateTemplates: {
            orderBy: [{ isDefault: 'desc' }, { id: 'asc' }],
          },
        },
      });
    });

    await createAudit({
      action: 'learning_program_version_updated',
      entity_type: 'learning_program_version',
      entity_id: versionId,
      user_id: userId,
      metadata: {
        actorProfileId: profileId,
        learningProgramVersionId: versionId,
      },
    });

    return res.json(serializeLearningProgramVersion(updatedVersion));
  } catch (error: any) {
    const statusCode = Number(error?.statusCode || 500);
    return res.status(statusCode).json({
      error: statusCode >= 500 ? 'Failed to update learning version' : error.message,
    });
  }
});

router.get('/global-certificate-template', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = requireUser(req, res);
    if (!userId) return;
    if (!canManageTeamDevelopment(req)) {
      return res.status(403).json({ error: 'Only managers, partners, or HR can access the global certificate template' });
    }

    const template = await prisma.globalCertificateTemplate.findFirst({
      where: {
        key: 'default',
      },
      include: {
        backgroundDocument: true,
        signatureDocument: true,
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    });

    if (!template) {
      return res.json({
        key: 'default',
        name: 'Standard Completion Certificate',
        templateDefinition: {
          title: 'Certificate of Completion',
          body: 'has successfully completed the training "{{trainingName}}".',
          titleColor: '#0f172a',
          textColor: '#334155',
          accentColor: '#0f766e',
        },
        backgroundDocumentId: null,
        signatureDocumentId: null,
        issuedByLabel: null,
        isActive: true,
      });
    }

    return res.json(template);
  } catch {
    return res.status(500).json({ error: 'Failed to load the global certificate template' });
  }
});

router.put('/global-certificate-template', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = requireUser(req, res);
    if (!userId) return;
    const profileId = req.user?.profileId;
    if (!profileId) return res.status(401).json({ error: 'Unauthorized' });
    if (!canManageTeamDevelopment(req)) {
      return res.status(403).json({ error: 'Only managers, partners, or HR can update the global certificate template' });
    }

    const name = String(req.body?.name || '').trim() || 'Standard Completion Certificate';
    const templateDefinitionRaw = req.body?.templateDefinition ?? req.body?.template_definition ?? {};
    const templateDefinition =
      templateDefinitionRaw && typeof templateDefinitionRaw === 'object' && !Array.isArray(templateDefinitionRaw)
        ? templateDefinitionRaw
        : {};

    const saved = await prisma.globalCertificateTemplate.upsert({
      where: {
        key: 'default',
      },
      update: {
        name,
        templateDefinition: templateDefinition as Prisma.InputJsonValue,
        backgroundDocumentId: parseOptionalPositiveInt(
          req.body?.backgroundDocumentId ?? req.body?.background_document_id
        ),
        signatureDocumentId: parseOptionalPositiveInt(
          req.body?.signatureDocumentId ?? req.body?.signature_document_id
        ),
        issuedByLabel: toNullableTrimmedString(req.body?.issuedByLabel ?? req.body?.issued_by_label),
        isActive: req.body?.isActive === undefined ? true : Boolean(req.body.isActive),
        updatedByProfileId: profileId,
      },
      create: {
        key: 'default',
        name,
        templateDefinition: templateDefinition as Prisma.InputJsonValue,
        backgroundDocumentId: parseOptionalPositiveInt(
          req.body?.backgroundDocumentId ?? req.body?.background_document_id
        ),
        signatureDocumentId: parseOptionalPositiveInt(
          req.body?.signatureDocumentId ?? req.body?.signature_document_id
        ),
        issuedByLabel: toNullableTrimmedString(req.body?.issuedByLabel ?? req.body?.issued_by_label),
        isActive: req.body?.isActive === undefined ? true : Boolean(req.body.isActive),
        createdByProfileId: profileId,
        updatedByProfileId: profileId,
      },
      include: {
        backgroundDocument: true,
        signatureDocument: true,
      },
    });

    await createAudit({
      action: 'global_certificate_template_updated',
      entity_type: 'global_certificate_template',
      entity_id: saved.id,
      user_id: userId,
      metadata: {
        actorProfileId: profileId,
        globalCertificateTemplateId: saved.id,
      },
    });

    return res.json(saved);
  } catch {
    return res.status(500).json({ error: 'Failed to update the global certificate template' });
  }
});

router.post('/learning-assignments', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = requireUser(req, res);
    if (!userId) return;
    const profileId = req.user?.profileId;
    if (!profileId) return res.status(401).json({ error: 'Unauthorized' });
    if (!canManageTeamDevelopment(req)) {
      return res.status(403).json({ error: 'Only managers, partners, or HR can assign learning' });
    }

    const programVersionId = parseOptionalPositiveInt(req.body?.programVersionId ?? req.body?.program_version_id);
    const employeeIds = Array.isArray(req.body?.employeeIds ?? req.body?.employee_ids)
      ? (req.body.employeeIds ?? req.body.employee_ids)
          .map((value: unknown) => parseOptionalPositiveInt(value))
          .filter((value: number | null): value is number => Boolean(value))
      : [];
    const dueAt = parseDateOrNull(req.body?.dueAt ?? req.body?.due_at);
    if (!programVersionId || employeeIds.length === 0) {
      return res.status(400).json({ error: 'programVersionId and at least one employeeId are required' });
    }

    const scopedIds = await getScopedTeamMemberIds(req, profileId);
    const outOfScope = employeeIds.filter((employeeId: number) => !scopedIds.includes(employeeId));
    if (outOfScope.length > 0) {
      return res.status(403).json({ error: 'One or more employees are outside your team scope' });
    }

    const version = await prisma.learningProgramVersion.findUnique({
      where: { id: programVersionId },
      include: {
        modules: true,
        sessions: true,
      },
    });
    if (!version) {
      return res.status(404).json({ error: 'Learning version not found' });
    }
    if (version.status !== 'published') {
      return res.status(400).json({ error: 'Only published learning versions can be assigned' });
    }

    const employees = await prisma.profile.findMany({
      where: { id: { in: employeeIds } },
      select: { id: true, managerId: true },
    });
    const employeesById = new Map(employees.map((employee) => [employee.id, employee]));

    const assignments = await prisma.$transaction(async (tx) => {
      const createdAssignments = [] as any[];

      for (const employeeId of employeeIds) {
        const employee = employeesById.get(employeeId);
        const assignment = await tx.learningAssignment.upsert({
          where: {
            programVersionId_employeeProfileId: {
              programVersionId,
              employeeProfileId: employeeId,
            },
          },
          update: {
            assignedByProfileId: profileId,
            managerProfileId: employee?.managerId ?? null,
            dueAt,
            status: 'assigned',
          },
          create: {
            programVersionId,
            employeeProfileId: employeeId,
            assignedByProfileId: profileId,
            managerProfileId: employee?.managerId ?? null,
            dueAt,
          },
        });

        if (version.modules.length > 0) {
          await tx.learningModuleProgress.createMany({
            data: version.modules.map((module) => ({
              assignmentId: assignment.id,
              moduleId: module.id,
            })),
            skipDuplicates: true,
          });
        }

        if (version.sessions.length > 0) {
          await tx.learningAttendanceRecord.createMany({
            data: version.sessions.map((session) => ({
              assignmentId: assignment.id,
              sessionId: session.id,
            })),
            skipDuplicates: true,
          });
        }

        const recalculated = await recalculateLearningAssignment(tx, assignment.id);
        createdAssignments.push(recalculated.assignment);
      }

      return createdAssignments;
    });

    await createAudit({
      action: 'learning_assignments_created',
      entity_type: 'learning_assignment',
      user_id: userId,
      metadata: {
        actorProfileId: profileId,
        programVersionId,
        employeeIds,
      },
    });

    return res.status(201).json(assignments.map(serializeLearningAssignment));
  } catch (error: any) {
    const statusCode = Number(error?.statusCode || 500);
    return res.status(statusCode).json({
      error: statusCode >= 500 ? 'Failed to create learning assignments' : error.message,
    });
  }
});

router.get('/learning-assignments', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = requireUser(req, res);
    if (!userId) return;
    const profileId = req.user?.profileId;
    if (!profileId) return res.status(401).json({ error: 'Unauthorized' });

    const mineOnly = String(req.query.mine || '').trim().toLowerCase() === 'true';
    const employeeId = parseOptionalPositiveInt(req.query.employeeId ?? req.query.employee_id);
    const where: Prisma.LearningAssignmentWhereInput = {};

    if (!canManageTeamDevelopment(req) || mineOnly) {
      where.employeeProfileId = profileId;
    } else if (employeeId) {
      const scopedIds = await getScopedTeamMemberIds(req, profileId);
      if (!scopedIds.includes(employeeId)) {
        return res.status(403).json({ error: 'Selected employee is outside your team scope' });
      }
      where.employeeProfileId = employeeId;
    } else {
      const scopedIds = await getScopedTeamMemberIds(req, profileId);
      where.employeeProfileId = { in: scopedIds };
    }

    const assignments = await prisma.learningAssignment.findMany({
      where,
      include: {
        employee: { select: { id: true, firstName: true, lastName: true, managerId: true } },
        assignedBy: { select: { id: true, firstName: true, lastName: true } },
        manager: { select: { id: true, firstName: true, lastName: true } },
        programVersion: {
          include: {
            program: { select: { id: true, title: true } },
            trainer: { select: { id: true, firstName: true, lastName: true } },
            modules: {
              orderBy: { sequenceNo: 'asc' },
              include: {
                knowledgeHubResource: {
                  select: learningKnowledgeResourceSelect,
                },
              },
            },
            sessions: { orderBy: { startsAt: 'asc' } },
            quizzes: {
              orderBy: { id: 'asc' },
              include: {
                questions: {
                  orderBy: { displayOrder: 'asc' },
                  include: {
                    options: {
                      orderBy: { displayOrder: 'asc' },
                    },
                  },
                },
              },
            },
          },
        },
        moduleProgressEntries: {
          orderBy: { moduleId: 'asc' },
        },
        attendanceRecords: {
          orderBy: { sessionId: 'asc' },
        },
        quizAttempts: {
          orderBy: [{ submittedAt: 'desc' }, { id: 'desc' }],
        },
        certificate: {
          include: {
            document: true,
          },
        },
        trainingFeedback: true,
        impactAssessmentTask: {
          include: {
            response: true,
          },
        },
      },
      orderBy: [{ dueAt: 'asc' }, { createdAt: 'desc' }],
    });

    return res.json(assignments.map(serializeLearningAssignment));
  } catch {
    return res.status(500).json({ error: 'Failed to load learning assignments' });
  }
});

router.get('/learning-assignments/:assignmentId', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = requireUser(req, res);
    if (!userId) return;
    const profileId = req.user?.profileId;
    if (!profileId) return res.status(401).json({ error: 'Unauthorized' });

    const assignmentId = parseOptionalPositiveInt(req.params.assignmentId);
    if (!assignmentId) {
      return res.status(400).json({ error: 'Invalid assignmentId' });
    }

    const assignment = await ensureAssignmentAccess(req, assignmentId, profileId);
    return res.json(serializeLearningAssignment(assignment));
  } catch (error: any) {
    const statusCode = Number(error?.statusCode || 500);
    return res.status(statusCode).json({
      error: statusCode >= 500 ? 'Failed to load learning assignment' : error.message,
    });
  }
});

router.post('/learning-assignments/:assignmentId/modules/:moduleId/progress', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = requireUser(req, res);
    if (!userId) return;
    const profileId = req.user?.profileId;
    if (!profileId) return res.status(401).json({ error: 'Unauthorized' });

    const assignmentId = parseOptionalPositiveInt(req.params.assignmentId);
    const moduleId = parseOptionalPositiveInt(req.params.moduleId);
    if (!assignmentId || !moduleId) {
      return res.status(400).json({ error: 'Invalid assignmentId or moduleId' });
    }

    const assignment = await ensureAssignmentAccess(req, assignmentId, profileId);
    const module = assignment.programVersion.modules.find((item: any) => item.id === moduleId);
    if (!module) {
      return res.status(404).json({ error: 'Learning module not found on this assignment' });
    }

    if (assignment.employeeProfileId !== profileId && !canManageTeamDevelopment(req)) {
      return res.status(403).json({ error: 'Only the assigned learner can update module progress' });
    }

    const completionPercent = parseOptionalPercentage(
      req.body?.completionPercent ?? req.body?.completion_percent
    );
    const watchPercent = parseOptionalPercentage(req.body?.watchPercent ?? req.body?.watch_percent);
    const scrollPercent = parseOptionalPercentage(req.body?.scrollPercent ?? req.body?.scroll_percent);
    const timeSpentSeconds = parseOptionalNonNegativeInt(
      req.body?.timeSpentSeconds ?? req.body?.time_spent_seconds
    );
    const completed = Boolean(req.body?.completed);

    const updated = await prisma.$transaction(async (tx) => {
      const existing = await tx.learningModuleProgress.findUnique({
        where: {
          assignmentId_moduleId: {
            assignmentId,
            moduleId,
          },
        },
      });

      const now = new Date();
      const progress = await tx.learningModuleProgress.upsert({
        where: {
          assignmentId_moduleId: {
            assignmentId,
            moduleId,
          },
        },
        create: {
          assignmentId,
          moduleId,
          status: completed ? 'completed' : 'in_progress',
          startedAt: now,
          lastInteractedAt: now,
          completedAt: completed ? now : null,
          completionPercent: completed ? 100 : completionPercent ?? 0,
          watchPercent: watchPercent ?? 0,
          scrollPercent: scrollPercent ?? 0,
          timeSpentSeconds: timeSpentSeconds ?? 0,
        },
        update: {
          status: completed ? 'completed' : ((completionPercent ?? 0) > 0 || (watchPercent ?? 0) > 0 || (scrollPercent ?? 0) > 0 || (timeSpentSeconds ?? 0) > 0 ? 'in_progress' : existing?.status ?? 'not_started'),
          startedAt: existing?.startedAt ?? now,
          lastInteractedAt: now,
          completedAt: completed ? existing?.completedAt ?? now : existing?.completedAt,
          completionPercent: Math.max(toNumber(existing?.completionPercent), completed ? 100 : completionPercent ?? 0),
          watchPercent: Math.max(toNumber(existing?.watchPercent), watchPercent ?? 0),
          scrollPercent: Math.max(toNumber(existing?.scrollPercent), scrollPercent ?? 0),
          timeSpentSeconds: Math.max(existing?.timeSpentSeconds ?? 0, timeSpentSeconds ?? 0),
        },
      });

      const assignmentState = await recalculateLearningAssignment(tx, assignmentId);
      return { progress, assignment: assignmentState.assignment, completedNow: assignmentState.completedNow };
    });

    if (updated.completedNow) {
      await issueCertificateIfEligible({
        assignmentId,
        actorProfileId: profileId,
      });
    }

    return res.json({
      progress: {
        ...updated.progress,
        completionPercent: toNumber(updated.progress.completionPercent),
        watchPercent: toNumber(updated.progress.watchPercent),
        scrollPercent: toNumber(updated.progress.scrollPercent),
      },
      assignment: serializeLearningAssignment(updated.assignment),
      completedNow: updated.completedNow,
    });
  } catch (error: any) {
    const statusCode = Number(error?.statusCode || 500);
    return res.status(statusCode).json({
      error: statusCode >= 500 ? 'Failed to update learning module progress' : error.message,
    });
  }
});

router.post('/learning-sessions/:sessionId/attendance', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = requireUser(req, res);
    if (!userId) return;
    const profileId = req.user?.profileId;
    if (!profileId) return res.status(401).json({ error: 'Unauthorized' });
    if (!canManageTeamDevelopment(req)) {
      return res.status(403).json({ error: 'Only managers, partners, or HR can mark attendance' });
    }

    const sessionId = parseOptionalPositiveInt(req.params.sessionId);
    if (!sessionId) {
      return res.status(400).json({ error: 'Invalid sessionId' });
    }

    const recordsInput = Array.isArray(req.body?.records) ? req.body.records : [];
    if (recordsInput.length === 0) {
      return res.status(400).json({ error: 'At least one attendance record is required' });
    }

    const session = await prisma.learningSession.findUnique({
      where: { id: sessionId },
      select: { id: true, attendancePoints: true },
    });
    if (!session) {
      return res.status(404).json({ error: 'Learning session not found' });
    }

    const scopedIds = await getScopedTeamMemberIds(req, profileId);
    const updatedRecords = [] as any[];

    for (const record of recordsInput) {
      const assignmentId = parseOptionalPositiveInt(record?.assignmentId ?? record?.assignment_id);
      const attendanceStatus = String((record?.attendanceStatus ?? record?.attendance_status) || '')
        .trim()
        .toLowerCase();
      if (!assignmentId || !LEARNING_ATTENDANCE_STATUSES.has(attendanceStatus)) {
        return res.status(400).json({ error: 'Each record requires assignmentId and a valid attendanceStatus' });
      }

      const assignment = await prisma.learningAssignment.findUnique({
        where: { id: assignmentId },
        select: { id: true, employeeProfileId: true, programVersionId: true },
      });
      if (!assignment) {
        return res.status(404).json({ error: `Learning assignment ${assignmentId} not found` });
      }
      if (!scopedIds.includes(assignment.employeeProfileId)) {
        return res.status(403).json({ error: 'A learning assignment is outside your team scope' });
      }

      const updated = await prisma.$transaction(async (tx) => {
        const attendance = await tx.learningAttendanceRecord.upsert({
          where: {
            sessionId_assignmentId: {
              sessionId,
              assignmentId,
            },
          },
          create: {
            sessionId,
            assignmentId,
            attendanceStatus: attendanceStatus as any,
            attendedAt: attendanceStatus === 'attended' ? new Date() : null,
            markedByProfileId: profileId,
            notes: toNullableTrimmedString(record?.notes),
          },
          update: {
            attendanceStatus: attendanceStatus as any,
            attendedAt: attendanceStatus === 'attended' ? new Date() : null,
            markedByProfileId: profileId,
            notes: toNullableTrimmedString(record?.notes),
          },
        });

        if (attendanceStatus === 'attended') {
          await awardAttendancePoints({
            assignmentId,
            sessionId,
            employeeProfileId: assignment.employeeProfileId,
            points: session.attendancePoints,
            actorProfileId: profileId,
          });
        }

        const assignmentState = await recalculateLearningAssignment(tx, assignmentId);
        return {
          attendance,
          assignment: assignmentState.assignment,
          completedNow: assignmentState.completedNow,
        };
      });

      if (updated.completedNow) {
        await issueCertificateIfEligible({
          assignmentId,
          actorProfileId: profileId,
        });
      }

      updatedRecords.push({
        attendance: updated.attendance,
        assignment: serializeLearningAssignment(updated.assignment),
        completedNow: updated.completedNow,
      });
    }

    await createAudit({
      action: 'learning_attendance_marked',
      entity_type: 'learning_session',
      entity_id: sessionId,
      user_id: userId,
      metadata: {
        actorProfileId: profileId,
        sessionId,
        assignmentIds: updatedRecords.map((item) => item.assignment.id),
      },
    });

    return res.json(updatedRecords);
  } catch (error: any) {
    const statusCode = Number(error?.statusCode || 500);
    return res.status(statusCode).json({
      error: statusCode >= 500 ? 'Failed to update attendance' : error.message,
    });
  }
});

router.post('/learning-quizzes/:quizId/attempts', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = requireUser(req, res);
    if (!userId) return;
    const profileId = req.user?.profileId;
    if (!profileId) return res.status(401).json({ error: 'Unauthorized' });

    const quizId = parseOptionalPositiveInt(req.params.quizId);
    const assignmentId = parseOptionalPositiveInt(req.body?.assignmentId ?? req.body?.assignment_id);
    if (!quizId || !assignmentId) {
      return res.status(400).json({ error: 'quizId and assignmentId are required' });
    }

    const assignment = await ensureAssignmentAccess(req, assignmentId, profileId);
    if (assignment.employeeProfileId !== profileId && !canManageTeamDevelopment(req)) {
      return res.status(403).json({ error: 'Only the assigned learner can submit this quiz' });
    }

    const answers = Array.isArray(req.body?.answers) ? req.body.answers : [];
    const result = await submitLearningQuizAttempt({
      quizId,
      assignmentId,
      actorProfileId: profileId,
      answers: answers.map((answer: any) => ({
        questionId: Number(answer?.questionId),
        optionIds: Array.isArray(answer?.optionIds)
          ? answer.optionIds.map((optionId: unknown) => Number(optionId))
          : [],
        freeTextAnswer: toNullableTrimmedString(answer?.freeTextAnswer),
      })),
    });

    if (result.completedNow) {
      await issueCertificateIfEligible({
        assignmentId,
        actorProfileId: profileId,
      });
    }

    return res.status(201).json({
      ...result,
      attempt: {
        ...result.attempt,
        score: toNumber(result.attempt.score),
      },
      assignment: serializeLearningAssignment(result.assignment),
    });
  } catch (error: any) {
    const statusCode = Number(error?.statusCode || 500);
    return res.status(statusCode).json({
      error: statusCode >= 500 ? 'Failed to submit learning quiz' : error.message,
    });
  }
});

router.post('/learning-assignments/:assignmentId/feedback', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = requireUser(req, res);
    if (!userId) return;
    const profileId = req.user?.profileId;
    if (!profileId) return res.status(401).json({ error: 'Unauthorized' });

    const assignmentId = parseOptionalPositiveInt(req.params.assignmentId);
    if (!assignmentId) {
      return res.status(400).json({ error: 'Invalid assignmentId' });
    }

    const assignment = await prisma.learningAssignment.findUnique({
      where: { id: assignmentId },
      select: {
        id: true,
        employeeProfileId: true,
        status: true,
        trainingFeedback: { select: { id: true } },
      },
    });

    if (!assignment) {
      return res.status(404).json({ error: 'Learning assignment not found' });
    }
    if (assignment.employeeProfileId !== profileId) {
      return res.status(403).json({ error: 'Only the assigned learner can submit training feedback' });
    }
    if (assignment.trainingFeedback) {
      return res.status(409).json({ error: 'Training feedback has already been submitted' });
    }
    if (assignment.status !== 'completed') {
      return res.status(400).json({ error: 'Training feedback can only be submitted after completion' });
    }

    const result = await submitTrainingFeedbackEntry({
      assignmentId,
      actorProfileId: profileId,
      overallRating: clampRating(req.body?.overallRating ?? req.body?.overall_rating),
      contentRating: clampRating(req.body?.contentRating ?? req.body?.content_rating),
      deliveryRating: clampRating(req.body?.deliveryRating ?? req.body?.delivery_rating),
      relevanceRating: clampRating(req.body?.relevanceRating ?? req.body?.relevance_rating),
      comment: toNullableTrimmedString(req.body?.comment),
    });
    const certificate = await issueCertificateIfEligible({
      assignmentId,
      actorProfileId: profileId,
    });

    await createAudit({
      action: 'training_feedback_submitted',
      entity_type: 'learning_assignment',
      entity_id: assignmentId,
      user_id: userId,
      metadata: {
        actorProfileId: profileId,
        assignmentId,
        feedbackId: result.feedback.id,
      },
    });

    return res.status(201).json({
      ...result,
      certificate,
    });
  } catch (error: any) {
    const statusCode = Number(error?.statusCode || 500);
    return res.status(statusCode).json({
      error: statusCode >= 500 ? 'Failed to submit training feedback' : error.message,
    });
  }
});

router.get('/learning-impact-tasks', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = requireUser(req, res);
    if (!userId) return;
    const profileId = req.user?.profileId;
    if (!profileId) return res.status(401).json({ error: 'Unauthorized' });
    if (!canManageTeamDevelopment(req)) {
      return res.status(403).json({ error: 'Only managers, partners, or HR can access impact assessments' });
    }

    const scopedIds = await getScopedTeamMemberIds(req, profileId);
    const tasks = await prisma.impactAssessmentTask.findMany({
      where: {
        OR: [
          { managerProfileId: profileId },
          { assignment: { employeeProfileId: { in: scopedIds } } },
        ],
      },
      include: {
        manager: { select: { id: true, firstName: true, lastName: true } },
        assignment: {
          include: {
            employee: { select: { id: true, firstName: true, lastName: true } },
            programVersion: {
              include: {
                program: { select: { id: true, title: true } },
              },
            },
          },
        },
        response: true,
      },
      orderBy: [{ dueAt: 'asc' }, { id: 'desc' }],
    });

    return res.json(tasks.map((task) => ({
      ...task,
      assignment: serializeLearningAssignment(task.assignment),
    })));
  } catch {
    return res.status(500).json({ error: 'Failed to load impact assessment tasks' });
  }
});

router.post('/learning-impact-tasks/:taskId/response', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = requireUser(req, res);
    if (!userId) return;
    const profileId = req.user?.profileId;
    if (!profileId) return res.status(401).json({ error: 'Unauthorized' });

    const taskId = parseOptionalPositiveInt(req.params.taskId);
    if (!taskId) {
      return res.status(400).json({ error: 'Invalid taskId' });
    }

    const task = await prisma.impactAssessmentTask.findUnique({
      where: { id: taskId },
      include: {
        assignment: {
          select: {
            employeeProfileId: true,
          },
        },
        response: true,
      },
    });

    if (!task) {
      return res.status(404).json({ error: 'Impact assessment task not found' });
    }
    if (task.response) {
      return res.status(409).json({ error: 'Impact assessment response has already been submitted' });
    }

    const scopedIds = canManageTeamDevelopment(req) ? await getScopedTeamMemberIds(req, profileId) : [profileId];
    if (task.managerProfileId !== profileId && !scopedIds.includes(task.assignment.employeeProfileId)) {
      return res.status(403).json({ error: 'You do not have access to this impact assessment task' });
    }

    const response = await prisma.$transaction(async (tx) => {
      const created = await tx.impactAssessmentResponse.create({
        data: {
          taskId,
          submittedByProfileId: profileId,
          behaviorChangeScore: parseOptionalNonNegativeInt(req.body?.behaviorChangeScore ?? req.body?.behavior_change_score),
          productivityImpactScore: parseOptionalNonNegativeInt(req.body?.productivityImpactScore ?? req.body?.productivity_impact_score),
          qualityImpactScore: parseOptionalNonNegativeInt(req.body?.qualityImpactScore ?? req.body?.quality_impact_score),
          businessImpactScore: parseOptionalNonNegativeInt(req.body?.businessImpactScore ?? req.body?.business_impact_score),
          comment: toNullableTrimmedString(req.body?.comment),
        },
      });

      await tx.impactAssessmentTask.update({
        where: { id: taskId },
        data: {
          status: 'submitted',
        },
      });

      return created;
    });

    await createAudit({
      action: 'impact_assessment_submitted',
      entity_type: 'impact_assessment_task',
      entity_id: taskId,
      user_id: userId,
      metadata: {
        actorProfileId: profileId,
        taskId,
      },
    });

    return res.status(201).json(response);
  } catch (error: any) {
    const statusCode = Number(error?.statusCode || 500);
    return res.status(statusCode).json({
      error: statusCode >= 500 ? 'Failed to submit impact assessment' : error.message,
    });
  }
});

router.post('/learning-assignments/:assignmentId/certificate/issue', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = requireUser(req, res);
    if (!userId) return;
    const profileId = req.user?.profileId;
    if (!profileId) return res.status(401).json({ error: 'Unauthorized' });

    const assignmentId = parseOptionalPositiveInt(req.params.assignmentId);
    if (!assignmentId) {
      return res.status(400).json({ error: 'Invalid assignmentId' });
    }

    const assignment = await ensureAssignmentAccess(req, assignmentId, profileId);
    if (assignment.employeeProfileId !== profileId && !canManageTeamDevelopment(req)) {
      return res.status(403).json({ error: 'You do not have access to issue this certificate' });
    }

    const certificate = await issueCertificateIfEligible({
      assignmentId,
      actorProfileId: profileId,
    });

    if (!certificate) {
      return res.status(400).json({ error: 'Certificate is not available for this assignment yet' });
    }

    await createAudit({
      action: 'learning_certificate_issued',
      entity_type: 'issued_certificate',
      entity_id: certificate.id,
      user_id: userId,
      metadata: {
        actorProfileId: profileId,
        assignmentId,
      },
    });

    return res.json(certificate);
  } catch (error: any) {
    const statusCode = Number(error?.statusCode || 500);
    return res.status(statusCode).json({
      error: statusCode >= 500 ? 'Failed to issue certificate' : error.message,
    });
  }
});

router.get('/learning-points', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = requireUser(req, res);
    if (!userId) return;
    const profileId = req.user?.profileId;
    if (!profileId) return res.status(401).json({ error: 'Unauthorized' });

    const requestedEmployeeId = parseOptionalPositiveInt(req.query.employeeId ?? req.query.employee_id);
    let targetProfileId = profileId;

    if (requestedEmployeeId && requestedEmployeeId !== profileId) {
      if (!canManageTeamDevelopment(req)) {
        return res.status(403).json({ error: 'Only managers, partners, or HR can view other employees learning points' });
      }
      const scopedIds = await getScopedTeamMemberIds(req, profileId);
      if (!scopedIds.includes(requestedEmployeeId)) {
        return res.status(403).json({ error: 'Selected employee is outside your team scope' });
      }
      targetProfileId = requestedEmployeeId;
    }

    const [entries, aggregate] = await Promise.all([
      prisma.learningPointLedger.findMany({
        where: { profileId: targetProfileId },
        orderBy: [{ awardedAt: 'desc' }, { id: 'desc' }],
        take: 100,
      }),
      prisma.learningPointLedger.aggregate({
        where: { profileId: targetProfileId },
        _sum: { points: true },
      }),
    ]);

    return res.json({
      profileId: targetProfileId,
      totalPoints: aggregate._sum.points ?? 0,
      entries,
    });
  } catch {
    return res.status(500).json({ error: 'Failed to load learning points' });
  }
});

export default router;
