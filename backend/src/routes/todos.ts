import { Router } from 'express';
import { TaskStatus } from '@prisma/client';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import prisma from '../prisma';
import { createAudit } from '../utils/audit';

const router = Router();
const ALLOWED_STATUSES = new Set<TaskStatus>(Object.values(TaskStatus));
const PRIVILEGED_ROLES = new Set(['admin', 'super_admin', 'hr', 'hr_manager']);
const MANAGEMENT_ROLES = new Set(['manager', 'partner']);

const normalizeRole = (value: string) => value.toLowerCase().trim();

const getRoleSet = (req: AuthRequest) => {
  const roleSet = new Set<string>();
  (req.user?.authRoles || []).forEach((role) => roleSet.add(normalizeRole(role)));
  if (req.profile?.role?.name) {
    roleSet.add(normalizeRole(req.profile.role.name));
  }
  return roleSet;
};

const hasPrivilegedRole = (roleSet: Set<string>) =>
  Array.from(PRIVILEGED_ROLES).some((role) => roleSet.has(role));

const hasManagementRole = (roleSet: Set<string>) =>
  Array.from(MANAGEMENT_ROLES).some((role) => roleSet.has(role));

const canManageTodo = (
  roleSet: Set<string>,
  requesterProfileId: number | undefined,
  todo: {
    assignedToProfileId: number | null;
    job: { managerProfileId: number | null; partnerProfileId: number | null } | null;
  }
) => {
  if (!requesterProfileId) return false;
  if (hasPrivilegedRole(roleSet)) return true;
  if (todo.assignedToProfileId === requesterProfileId) return true;
  if (!hasManagementRole(roleSet)) return false;

  return (
    todo.job?.managerProfileId === requesterProfileId ||
    todo.job?.partnerProfileId === requesterProfileId
  );
};

const ensureAssignmentTodos = async (profileId: number) => {
  const [assignments, existingTasks] = await Promise.all([
    prisma.jobStaffAssignment.findMany({
      where: {
        employeeProfileId: profileId,
        job: { status: { in: ['planned', 'in_progress', 'on_hold'] } },
      },
      select: {
        jobId: true,
        job: {
          select: {
            id: true,
            jobName: true,
            dueDate: true,
          },
        },
      },
    }),
    prisma.task.findMany({
      where: { assignedToProfileId: profileId },
      select: { jobId: true },
    }),
  ]);

  const existingJobIds = new Set(existingTasks.map((task) => task.jobId));
  const missing = assignments.filter(
    (assignment) => assignment.job && !existingJobIds.has(assignment.jobId)
  );

  if (missing.length === 0) return;

  await prisma.task.createMany({
    data: missing.map((assignment) => ({
      jobId: assignment.jobId,
      title: `Assigned job: ${assignment.job!.jobName}`,
      description:
        'Auto-created from staffing assignment. Start tracking time in Timesheets and update this to-do as work progresses.',
      assignedToProfileId: profileId,
      status: 'pending',
      priority: 'medium',
      billable: true,
      dueDate: assignment.job?.dueDate ?? null,
    })),
  });
};

// GET /todos?userId=
router.get('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const roleSet = getRoleSet(req);
    const requesterProfileId = req.user?.profileId;
    const canViewOtherProfiles = hasPrivilegedRole(roleSet);
    const userIdRaw = req.query.userId as string | undefined;
    let profileId = requesterProfileId;

    if (userIdRaw) {
      const userId = Number(userIdRaw);
      if (Number.isNaN(userId)) {
        return res.status(400).json({ error: 'Invalid userId query parameter' });
      }

      const profile = await prisma.profile.findUnique({
        where: { userId },
        select: { id: true },
      });

      if (!profile) {
        return res.status(404).json({ error: 'Profile not found for userId' });
      }

      if (profile.id !== requesterProfileId && !canViewOtherProfiles) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      profileId = profile?.id;
    }

    if (!profileId) {
      return res.status(400).json({ error: 'profileId not available for user' });
    }

    if (profileId !== requesterProfileId && !canViewOtherProfiles) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    await ensureAssignmentTodos(profileId);

    const tasks = await prisma.task.findMany({
      where: { assignedToProfileId: profileId },
      include: {
        job: {
          select: {
            id: true,
            jobName: true,
            description: true,
            startDate: true,
            dueDate: true,
            status: true,
            budgetHours: true,
            fixedFeeAmount: true,
            jobCosting: {
              select: {
                totalEstimatedHours: true,
                budgetCap: { select: { totalAllocatedHours: true } },
              },
            },
            department: { select: { name: true } },
            client: { select: { clientName: true } },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const normalized = (tasks || []).map((task: any) => {
      const job = task.job;
      if (!job) return task;
      const budgetHours =
        Number(job.jobCosting?.budgetCap?.totalAllocatedHours ??
          job.jobCosting?.totalEstimatedHours ??
          job.budgetHours ??
          0);
      const fixedFeeAmount = Number(job.fixedFeeAmount ?? 0);
      return {
        ...task,
        job: {
          ...job,
          budgetHours,
          fixedFeeAmount: Number.isFinite(fixedFeeAmount) ? fixedFeeAmount : 0,
          jobCosting: undefined,
        },
      };
    });

    return res.json(normalized);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /todos/:id
router.get('/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const roleSet = getRoleSet(req);
    const requesterProfileId = req.user?.profileId;
    const todoId = Number(req.params.id);
    if (Number.isNaN(todoId)) {
      return res.status(400).json({ error: 'Invalid todo id' });
    }

    const todo = await prisma.task.findUnique({
      where: { id: todoId },
      include: {
        job: {
          select: {
            managerProfileId: true,
            partnerProfileId: true,
          },
        },
      },
    });

    if (!todo) return res.status(404).json({ error: 'Todo not found' });
    if (!canManageTodo(roleSet, requesterProfileId, todo)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    return res.json(todo);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /todos
router.post('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { jobId, title, description, priority, dueDate, assignedToProfileId } = req.body;
    const roleSet = getRoleSet(req);
    const requesterProfileId = req.user?.profileId;
    const canAssignOtherProfiles = hasPrivilegedRole(roleSet) || hasManagementRole(roleSet);

    if (!jobId || !title) {
      return res.status(400).json({ error: 'jobId and title required' });
    }

    const requestedAssignee =
      assignedToProfileId !== undefined && assignedToProfileId !== null
        ? Number(assignedToProfileId)
        : undefined;

    if (
      requestedAssignee &&
      requestedAssignee !== requesterProfileId &&
      !canAssignOtherProfiles
    ) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    if (!requesterProfileId && !requestedAssignee) {
      return res.status(400).json({ error: 'profileId not available for user' });
    }

    const assigneeProfileId = requestedAssignee ?? requesterProfileId!;
    const jobContext = await prisma.job.findUnique({
      where: { id: Number(jobId) },
      select: {
        id: true,
        managerProfileId: true,
        partnerProfileId: true,
        staffing: {
          where: { employeeProfileId: assigneeProfileId },
          select: { id: true },
        },
      },
    });

    if (!jobContext) {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (!hasPrivilegedRole(roleSet)) {
      const canManageJob =
        jobContext.managerProfileId === requesterProfileId ||
        jobContext.partnerProfileId === requesterProfileId;
      const assigneeOnJob = jobContext.staffing.length > 0;

      if (requestedAssignee && requestedAssignee !== requesterProfileId && !canManageJob) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      if (!canManageJob && !assigneeOnJob) {
        return res.status(403).json({ error: 'Assignee is not staffed on this job' });
      }
    }

    const todo = await prisma.task.create({
      data: {
        jobId: Number(jobId),
        title,
        description,
        priority,
        dueDate: dueDate ? new Date(dueDate) : undefined,
        assignedToProfileId: requestedAssignee ?? requesterProfileId,
        status: 'pending',
      },
    });

    const performedBy = req.user?.userId;
    await createAudit({
      action: 'todo:create',
      entity_type: 'todo',
      user_id: performedBy,
      ip_address: req.ip,
    });

    return res.status(201).json(todo);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// PATCH /todos/:id { status }
router.patch('/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const roleSet = getRoleSet(req);
    const requesterProfileId = req.user?.profileId;
    const parsedId = Number(id);
    const status = String(req.body?.status || '').trim() as TaskStatus;

    if (Number.isNaN(parsedId)) {
      return res.status(400).json({ error: 'Invalid todo id' });
    }

    if (!status) {
      return res.status(400).json({ error: 'status required' });
    }

    if (!ALLOWED_STATUSES.has(status)) {
      return res.status(400).json({ error: 'Invalid status value' });
    }

    const existing = await prisma.task.findUnique({
      where: { id: parsedId },
      include: {
        job: {
          select: {
            managerProfileId: true,
            partnerProfileId: true,
          },
        },
      },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Todo not found' });
    }

    if (!canManageTodo(roleSet, requesterProfileId, existing)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    if (
      status === 'completed' &&
      existing.assignedToProfileId !== requesterProfileId &&
      !hasPrivilegedRole(roleSet)
    ) {
      // IMPLEMENTED: Task completion authority - only the assigned staff member (or privileged admin) can mark task complete.
      return res.status(403).json({
        error: 'Only the assigned staff member can mark this task as complete',
      });
    }

    const todo = await prisma.task.update({
      where: { id: parsedId },
      data: {
        status,
      },
    });

    const performedBy = req.user?.userId;
    await createAudit({
      action: `todo:update:status->${status}`,
      entity_type: 'todo',
      user_id: performedBy,
      ip_address: req.ip,
    });

    return res.json(todo);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// PATCH /todos/:id/notes { description }
router.patch('/:id/notes', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { description } = req.body;
    const roleSet = getRoleSet(req);
    const requesterProfileId = req.user?.profileId;
    const parsedId = Number(id);

    if (Number.isNaN(parsedId)) {
      return res.status(400).json({ error: 'Invalid todo id' });
    }

    const existing = await prisma.task.findUnique({
      where: { id: parsedId },
      include: {
        job: {
          select: {
            managerProfileId: true,
            partnerProfileId: true,
          },
        },
      },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Todo not found' });
    }

    if (!canManageTodo(roleSet, requesterProfileId, existing)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const todo = await prisma.task.update({
      where: { id: parsedId },
      data: { description },
    });

    const performedBy = req.user?.userId;
    await createAudit({
      action: 'todo:update:notes',
      entity_type: 'todo',
      user_id: performedBy,
      ip_address: req.ip,
    });

    return res.json(todo);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// DELETE /todos/:id
router.delete('/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const roleSet = getRoleSet(req);
    const requesterProfileId = req.user?.profileId;
    const parsedId = Number(id);

    if (Number.isNaN(parsedId)) {
      return res.status(400).json({ error: 'Invalid todo id' });
    }

    const existing = await prisma.task.findUnique({
      where: { id: parsedId },
      include: {
        job: {
          select: {
            managerProfileId: true,
            partnerProfileId: true,
          },
        },
      },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Todo not found' });
    }

    if (!canManageTodo(roleSet, requesterProfileId, existing)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    await prisma.task.delete({
      where: { id: parsedId },
    });

    const performedBy = req.user?.userId;
    await createAudit({
      action: 'todo:delete',
      entity_type: 'todo',
      user_id: performedBy,
      ip_address: req.ip,
    });

    return res.json({ ok: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
