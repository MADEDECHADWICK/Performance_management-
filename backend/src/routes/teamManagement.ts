import { Router } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
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

// GET /manager/team-performance
router.get('/team-performance', authMiddleware, async (req: AuthRequest, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;

  res.json({
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
});

// GET /manager/training-records
router.get('/training-records', authMiddleware, async (req: AuthRequest, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  res.json([]);
});

// GET /manager/certifications
router.get('/certifications', authMiddleware, async (req: AuthRequest, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  res.json([]);
});

// GET /manager/skill-assessments
router.get('/skill-assessments', authMiddleware, async (req: AuthRequest, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  res.json([]);
});

// GET /manager/development-goals
router.get('/development-goals', authMiddleware, async (req: AuthRequest, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  res.json([]);
});

// GET /manager/development-metrics
router.get('/development-metrics', authMiddleware, async (req: AuthRequest, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  res.json({
    total_employees: 0,
    active_training: 0,
    completed_courses: 0,
    certifications_expiring: 0,
    avg_skill_level: 0,
    training_budget_used: 0,
    training_budget_total: 0,
    development_goals_completed: 0,
  });
});

const resolvePeriodRange = (period?: string) => {
  const now = new Date();
  const end = new Date(now);
  let start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30);
  if (period === 'current_week') {
    const day = now.getDay();
    const diff = (day + 6) % 7;
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diff);
  } else if (period === 'current_month') {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
  } else if (period === 'current_quarter') {
    const quarter = Math.floor(now.getMonth() / 3);
    start = new Date(now.getFullYear(), quarter * 3, 1);
  }
  return { start, end };
};

const toNumber = (value: any) => (value ? Number(value) : 0);

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

// GET /manager/workload-analysis
router.get('/workload-analysis', authMiddleware, async (req: AuthRequest, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const profileId = req.user?.profileId;
  if (!profileId) return res.status(401).json({ error: 'Unauthorized' });

  const period = (req.query.period as string | undefined) || 'current_month';
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

  const { start, end } = resolvePeriodRange('current_month');
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
  res.json({
    id: Math.floor(Math.random() * 100000),
    message: 'Training scheduled successfully',
    ...req.body,
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
        roleSnapshot: existingAssignment.roleSnapshot,
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
