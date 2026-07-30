import { Prisma, TaskStatus } from '@prisma/client';
import prisma from '../prisma';

export interface JobMilestoneInput {
  title: string;
  targetPercent: number;
  dueDate?: Date | string;
  requirements?: string;
  assignedToProfileId?: number;
}

export type NormalizedJobMilestone = {
  title: string;
  targetPercent: number;
  dueDate?: Date;
  requirements?: string;
  assignedToProfileId?: number;
  orderIndex: number;
};

type MilestoneTaskMetadata = {
  targetPercent: number;
  requirements?: string | null;
  orderIndex?: number;
};

type MilestoneDbClient = Pick<Prisma.TransactionClient, 'task'>;

const JOB_MILESTONE_META_PREFIX = '[[RG_JOB_MILESTONE]]';

const roundCurrency = (value: number) =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const coerceDate = (value?: unknown): Date | undefined => {
  if (!value) return undefined;
  if (value instanceof Date) return value;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
};

export const normalizeMilestonesInput = (
  milestones?: JobMilestoneInput[]
): NormalizedJobMilestone[] => {
  if (!Array.isArray(milestones) || milestones.length === 0) {
    return [];
  }

  if (milestones.length > 20) {
    throw new Error('A maximum of 20 milestones is allowed per job.');
  }

  const normalized: NormalizedJobMilestone[] = milestones.map((milestone, index) => {
    const title = String(milestone?.title || '').trim();
    if (!title) {
      throw new Error(`Milestone #${index + 1} requires a title.`);
    }

    const targetPercent = Number(milestone?.targetPercent);
    if (!Number.isFinite(targetPercent) || targetPercent <= 0 || targetPercent > 100) {
      throw new Error(
        `Milestone "${title}" has an invalid targetPercent. Use a value between 1 and 100.`
      );
    }

    const dueDate = coerceDate(milestone?.dueDate);
    const requirements = String(milestone?.requirements || '').trim() || undefined;
    let assignedToProfileId: number | undefined;
    if (
      milestone?.assignedToProfileId !== undefined &&
      milestone?.assignedToProfileId !== null &&
      String(milestone?.assignedToProfileId).trim() !== ''
    ) {
      const parsedAssignee = Number(milestone?.assignedToProfileId);
      if (!Number.isFinite(parsedAssignee) || parsedAssignee <= 0) {
        throw new Error(
          `Milestone "${title}" has an invalid assignedToProfileId. Use a valid employee profile id.`
        );
      }
      assignedToProfileId = Math.trunc(parsedAssignee);
    }

    return {
      title,
      targetPercent: roundCurrency(targetPercent),
      dueDate,
      requirements,
      assignedToProfileId,
      orderIndex: index + 1,
    };
  });

  const percentSet = new Set<number>();
  for (const milestone of normalized) {
    if (percentSet.has(milestone.targetPercent)) {
      throw new Error(
        `Duplicate milestone percentage detected: ${milestone.targetPercent}%.`
      );
    }
    percentSet.add(milestone.targetPercent);
  }

  if (!percentSet.has(100)) {
    throw new Error('Milestones must include a final 100% payment point.');
  }

  return normalized.sort((a, b) => {
    if (a.targetPercent === b.targetPercent) {
      return a.orderIndex - b.orderIndex;
    }
    return a.targetPercent - b.targetPercent;
  });
};

const buildMilestoneTaskDescription = (milestone: NormalizedJobMilestone) => {
  const metadata: MilestoneTaskMetadata = {
    targetPercent: milestone.targetPercent,
    requirements: milestone.requirements || null,
    orderIndex: milestone.orderIndex,
  };
  const metadataLine = `${JOB_MILESTONE_META_PREFIX}${JSON.stringify(metadata)}`;
  if (!milestone.requirements) {
    return metadataLine;
  }
  return `${metadataLine}\n${milestone.requirements}`;
};

export const parseMilestoneTask = (task: {
  id: number;
  title: string;
  description: string | null;
  status: TaskStatus;
  dueDate: Date | null;
  assignedToProfileId?: number | null;
}) => {
  const description = String(task.description || '');
  if (!description.startsWith(JOB_MILESTONE_META_PREFIX)) {
    return null;
  }

  const metadataWithBody = description.slice(JOB_MILESTONE_META_PREFIX.length);
  const firstNewline = metadataWithBody.indexOf('\n');
  const metadataRaw =
    firstNewline === -1
      ? metadataWithBody.trim()
      : metadataWithBody.slice(0, firstNewline).trim();
  const fallbackRequirements =
    firstNewline === -1
      ? ''
      : metadataWithBody.slice(firstNewline + 1).trim();

  try {
    const metadata = JSON.parse(metadataRaw) as MilestoneTaskMetadata;
    const targetPercent = Number(metadata?.targetPercent);
    if (!Number.isFinite(targetPercent) || targetPercent <= 0 || targetPercent > 100) {
      return null;
    }

    const requirements =
      String(metadata?.requirements || '').trim() || fallbackRequirements || null;
    const orderIndex = Number(metadata?.orderIndex || 0) || 0;

    return {
      taskId: task.id,
      title: task.title,
      targetPercent: roundCurrency(targetPercent),
      dueDate: task.dueDate,
      requirements,
      assignedToProfileId: task.assignedToProfileId ?? null,
      conditionStatus: task.status,
      conditionCompleted: task.status === 'completed',
      orderIndex,
    };
  } catch (_error) {
    return null;
  }
};

export const createMilestoneTasksForJob = async (
  jobId: number,
  milestones: NormalizedJobMilestone[],
  defaultAssigneeProfileId?: number | null,
  dbClient: MilestoneDbClient = prisma
) => {
  if (!milestones.length) return;

  await dbClient.task.createMany({
    data: milestones.map((milestone) => ({
      jobId,
      title: milestone.title,
      description: buildMilestoneTaskDescription(milestone),
      assignedToProfileId: milestone.assignedToProfileId ?? defaultAssigneeProfileId ?? null,
      estimatedHours: null,
      billable: false,
      status: 'pending',
      priority: 'medium',
      dueDate: milestone.dueDate ?? null,
    })),
  });
};

export const syncMilestoneTasksForJob = async (
  jobId: number,
  milestones: NormalizedJobMilestone[],
  defaultAssigneeProfileId?: number | null,
  dbClient: MilestoneDbClient = prisma
) => {
  const existingTasks = await dbClient.task.findMany({
    where: {
      jobId,
      description: { startsWith: JOB_MILESTONE_META_PREFIX },
    },
    select: {
      id: true,
      title: true,
      description: true,
      status: true,
      dueDate: true,
      assignedToProfileId: true,
    },
  });

  const existingMilestones = existingTasks
    .map((task) => {
      const parsed = parseMilestoneTask(task);
      if (!parsed) return null;
      return { task, parsed };
    })
    .filter((item): item is { task: (typeof existingTasks)[number]; parsed: NonNullable<ReturnType<typeof parseMilestoneTask>> } => Boolean(item));

  const existingByPercent = new Map<number, { task: (typeof existingTasks)[number]; parsed: NonNullable<ReturnType<typeof parseMilestoneTask>> }>();
  existingMilestones.forEach((item) => {
    if (!existingByPercent.has(item.parsed.targetPercent)) {
      existingByPercent.set(item.parsed.targetPercent, item);
    }
  });

  const nextPercents = new Set(milestones.map((milestone) => milestone.targetPercent));
  const removedMilestones = existingMilestones.filter(
    (item) => !nextPercents.has(item.parsed.targetPercent)
  );

  const blockedRemoval = removedMilestones.find(
    (item) => item.task.status !== 'pending'
  );
  if (blockedRemoval) {
    throw new Error(
      `Cannot remove milestone "${blockedRemoval.task.title}" after execution has started on it.`
    );
  }

  if (removedMilestones.length > 0) {
    await dbClient.task.deleteMany({
      where: {
        id: { in: removedMilestones.map((item) => item.task.id) },
      },
    });
  }

  for (const milestone of milestones) {
    const nextAssignee = milestone.assignedToProfileId ?? defaultAssigneeProfileId ?? null;
    const nextDescription = buildMilestoneTaskDescription(milestone);
    const existing = existingByPercent.get(milestone.targetPercent);

    if (!existing) {
      await dbClient.task.create({
        data: {
          jobId,
          title: milestone.title,
          description: nextDescription,
          assignedToProfileId: nextAssignee,
          estimatedHours: null,
          billable: false,
          status: 'pending',
          priority: 'medium',
          dueDate: milestone.dueDate ?? null,
        },
      });
      continue;
    }

    const existingDueDate = existing.task.dueDate
      ? new Date(existing.task.dueDate).toISOString().slice(0, 10)
      : null;
    const nextDueDate = milestone.dueDate
      ? new Date(milestone.dueDate).toISOString().slice(0, 10)
      : null;
    const hasStructuralChange =
      existing.task.title !== milestone.title ||
      String(existing.task.description || '') !== nextDescription ||
      existingDueDate !== nextDueDate ||
      (existing.task.assignedToProfileId ?? null) !== nextAssignee;

    if (existing.task.status !== 'pending' && hasStructuralChange) {
      throw new Error(
        `Cannot change milestone "${existing.task.title}" after work has started on it.`
      );
    }

    await dbClient.task.update({
      where: { id: existing.task.id },
      data: {
        title: milestone.title,
        description: nextDescription,
        assignedToProfileId: nextAssignee,
        dueDate: milestone.dueDate ?? null,
      },
    });
  }
};
