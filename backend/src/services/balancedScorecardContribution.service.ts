import { DashboardStatus, Prisma } from "@prisma/client";
import prisma from "../prisma";
import { getBalancedScorecardWorkspace } from "./balancedScorecardWorkspace.service";
import { DocumentService } from "./documents.service";
import cacheService from "./cache.service";

type ContributionSourceType = "evaluation_cycle" | "learning_assignment";

const inferSourceType = (contributionKey: string): ContributionSourceType =>
  contributionKey.startsWith("learning-") ? "learning_assignment" : "evaluation_cycle";

const inferSourceReferenceId = (contributionKey: string) => {
  const parsed = Number(contributionKey.split("-").slice(1).join("-"));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const resolveContribution = async (params: {
  profileId: number;
  contributionKey: string;
  evaluationCycleId?: number | null;
}) => {
  const workspace = await getBalancedScorecardWorkspace({
    role: "employee",
    profileId: params.profileId,
    requestingProfileId: params.profileId,
    evaluationCycleId: params.evaluationCycleId ?? null,
  });

  const contribution = workspace.employeeContributions.find((item) => item.id === params.contributionKey);
  if (!contribution) {
    const error = new Error("Contribution item not found in the current scorecard window");
    (error as Error & { statusCode?: number }).statusCode = 404;
    throw error;
  }

  return contribution;
};

const invalidateBalancedScorecardWorkspaceCache = () => {
  cacheService.invalidate("^bsc:workspace:");
};

const selectContributionRecord = {
  id: true,
  profileId: true,
  contributionKey: true,
  linkedKpiKey: true,
  initiativeTitle: true,
  acknowledgedAt: true,
  acknowledgedByProfileId: true,
  latestProgress: true,
  latestComment: true,
  lastUpdatedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

const ensureContributionRecord = async (params: {
  profileId: number;
  contributionKey: string;
  evaluationCycleId?: number | null;
}) => {
  const existing = await prisma.balancedScorecardEmployeeContribution.findUnique({
    where: {
      profileId_contributionKey: {
        profileId: params.profileId,
        contributionKey: params.contributionKey,
      },
    },
    select: selectContributionRecord,
  });

  if (existing) {
    return { contribution: null, record: existing };
  }

  const contribution = await resolveContribution(params);
  const record = await prisma.balancedScorecardEmployeeContribution.create({
    data: {
      profileId: params.profileId,
      contributionKey: params.contributionKey,
      sourceType: inferSourceType(params.contributionKey),
      sourceReferenceId: contribution.sourceReferenceId ?? inferSourceReferenceId(params.contributionKey),
      title: contribution.title,
      initiativeTitle: contribution.initiative || null,
      linkedKpiKey: contribution.kpiId || null,
    },
    select: selectContributionRecord,
  });

  return { contribution, record };
};

export const getBalancedScorecardContributionDetail = async (params: {
  profileId: number;
  contributionKey: string;
  evaluationCycleId?: number | null;
}) => {
  const { contribution: seededContribution, record } = await ensureContributionRecord(params);
  const contribution = seededContribution ?? (await resolveContribution(params));
  const [updates, evidence] = await Promise.all([
    prisma.balancedScorecardEmployeeContributionUpdate.findMany({
      where: { contributionId: record.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        progress: true,
        comment: true,
        createdAt: true,
        createdByProfileId: true,
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
    }),
    prisma.document.findMany({
      where: {
        entityType: "BalancedScorecardContribution",
        entityId: record.id,
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        fileName: true,
        filePath: true,
        mimeType: true,
        description: true,
        createdAt: true,
        uploadedBy: true,
        uploader: { select: { id: true, firstName: true, lastName: true } },
      },
    }),
  ]);

  return {
    workflowId: record.id,
    profileId: params.profileId,
    contributionKey: contribution.id,
    title: contribution.title,
    initiative: contribution.initiative,
    kpiId: contribution.kpiId,
    dueDate: contribution.dueDate,
    progress: contribution.progress,
    score: contribution.score,
    status: contribution.status,
    acknowledged: contribution.acknowledged,
    acknowledgedAt: record.acknowledgedAt?.toISOString() ?? null,
    managerComment: contribution.managerComment,
    employeeComment: contribution.employeeComment,
    rollup: contribution.rollup,
    lastUpdatedAt: contribution.lastUpdatedAt,
    evidenceCount: contribution.evidenceCount,
    reviewContextPath: contribution.reviewContextPath,
    updates: updates.map((update) => ({
      id: update.id,
      progress: update.progress,
      comment: update.comment,
      createdAt: update.createdAt.toISOString(),
      createdByProfileId: update.createdByProfileId,
      createdByName: update.createdBy
        ? `${update.createdBy.firstName} ${update.createdBy.lastName}`.trim()
        : null,
    })),
    evidence: evidence.map((document) => ({
      id: document.id,
      fileName: document.fileName,
      filePath: document.filePath,
      mimeType: document.mimeType,
      description: document.description,
      createdAt: document.createdAt.toISOString(),
      uploadedBy: document.uploadedBy,
      uploaderName: document.uploader
        ? `${document.uploader.firstName} ${document.uploader.lastName}`.trim()
        : null,
    })),
  };
};

export const acknowledgeBalancedScorecardContribution = async (params: {
  profileId: number;
  contributionKey: string;
  actedByProfileId: number | null;
  evaluationCycleId?: number | null;
}) => {
  const { record } = await ensureContributionRecord(params);
  await prisma.balancedScorecardEmployeeContribution.update({
    where: { id: record.id },
    data: {
      acknowledgedAt: new Date(),
      acknowledgedByProfileId: params.actedByProfileId,
    },
  });
  invalidateBalancedScorecardWorkspaceCache();
  return getBalancedScorecardContributionDetail(params);
};

const progressToStatus = (progress: number): DashboardStatus =>
  progress >= 85
    ? DashboardStatus.on_track
    : progress >= 65
      ? DashboardStatus.at_risk
      : DashboardStatus.off_track;

const rollupInitiativeParents = async (
  tx: Prisma.TransactionClient,
  initiativeIds: number[]
) => {
  let parentIds = Array.from(new Set(initiativeIds));
  while (parentIds.length > 0) {
    const parents = await tx.balancedScorecardInitiative.findMany({
      where: { id: { in: parentIds }, parentInitiativeId: { not: null }, isActive: true },
      select: { parentInitiativeId: true },
    });
    const nextParentIds = Array.from(
      new Set(
        parents
          .map((initiative) => initiative.parentInitiativeId)
          .filter((id): id is number => typeof id === "number")
      )
    );
    if (nextParentIds.length === 0) return;

    for (const parentId of nextParentIds) {
      const children = await tx.balancedScorecardInitiative.findMany({
        where: { parentInitiativeId: parentId, isActive: true },
        select: { progress: true },
      });
      if (children.length === 0) continue;
      const progress = Math.round(
        children.reduce((sum, child) => sum + (child.progress ?? 0), 0) / children.length
      );
      await tx.balancedScorecardInitiative.update({
        where: { id: parentId },
        data: { progress, status: progressToStatus(progress) },
      });
    }

    parentIds = nextParentIds;
  }
};

const rollupInitiativeProgressForContribution = async (
  kpiKey: string | null,
  initiativeTitle: string | null
) => {
  if (!kpiKey) return;
  const kpi = await prisma.balancedScorecardKpi.findFirst({
    where: { key: kpiKey, isActive: true },
    select: { id: true },
  });
  if (!kpi) return;

  const contributions = await prisma.balancedScorecardEmployeeContribution.findMany({
    where: {
      linkedKpiKey: kpiKey,
      latestProgress: { not: null },
      ...(initiativeTitle ? { initiativeTitle } : {}),
    },
    select: { latestProgress: true },
  });
  if (contributions.length === 0) return;

  const averageProgress = Math.round(
    contributions.reduce((sum, c) => sum + (c.latestProgress ?? 0), 0) / contributions.length
  );

  await prisma.$transaction(async (tx) => {
    const initiatives = await tx.balancedScorecardInitiative.findMany({
      where: {
        kpiId: kpi.id,
        isActive: true,
        ...(initiativeTitle ? { title: initiativeTitle } : { scopeRole: "employee" }),
      },
      select: { id: true },
    });
    const initiativeIds = initiatives.map((initiative) => initiative.id);
    if (initiativeIds.length === 0) return;

    await tx.balancedScorecardInitiative.updateMany({
      where: { id: { in: initiativeIds } },
      data: { progress: averageProgress, status: progressToStatus(averageProgress) },
    });
    await rollupInitiativeParents(tx, initiativeIds);
  });
};

export const updateBalancedScorecardContributionProgress = async (params: {
  profileId: number;
  contributionKey: string;
  progress: number;
  comment?: string | null;
  actedByProfileId: number | null;
  evaluationCycleId?: number | null;
}) => {
  const { record } = await ensureContributionRecord(params);
  const clampedProgress = Math.min(100, Math.max(0, Math.round(params.progress)));
  await prisma.$transaction([
    prisma.balancedScorecardEmployeeContributionUpdate.create({
      data: {
        contributionId: record.id,
        progress: clampedProgress,
        comment: params.comment?.trim() || null,
        createdByProfileId: params.actedByProfileId,
      },
    }),
    prisma.balancedScorecardEmployeeContribution.update({
      where: { id: record.id },
      data: {
        acknowledgedAt: record.acknowledgedAt ?? new Date(),
        acknowledgedByProfileId: record.acknowledgedByProfileId ?? params.actedByProfileId,
        latestProgress: clampedProgress,
        latestComment: params.comment?.trim() || null,
        lastUpdatedAt: new Date(),
      },
    }),
  ]);
  await rollupInitiativeProgressForContribution(record.linkedKpiKey, record.initiativeTitle);
  invalidateBalancedScorecardWorkspaceCache();
  return getBalancedScorecardContributionDetail(params);
};

export const uploadBalancedScorecardContributionEvidence = async (params: {
  profileId: number;
  contributionKey: string;
  actedByProfileId: number | null;
  actedByUserId: number | null;
  actedByRoles?: string[];
  fileName: string;
  filePath: string;
  fileSize?: number;
  mimeType?: string | null;
  description?: string | null;
  documentType?: string | null;
  evaluationCycleId?: number | null;
}) => {
  if (!params.actedByProfileId || !params.actedByUserId) {
    const error = new Error("Authenticated user context is required for evidence uploads") as Error & {
      statusCode?: number;
    };
    error.statusCode = 400;
    throw error;
  }

  const { record } = await ensureContributionRecord(params);
  await DocumentService.uploadDocument(
    {
      fileName: params.fileName,
      filePath: params.filePath,
      fileSize: params.fileSize,
      mimeType: params.mimeType ?? undefined,
      documentType: params.documentType?.trim() || "balanced_scorecard_evidence",
      entityType: "BalancedScorecardContribution",
      entityId: record.id,
      accessLevel: "manager",
      description: params.description?.trim() || undefined,
    },
    {
      userId: params.actedByUserId,
      profileId: params.actedByProfileId,
      roles: params.actedByRoles ?? [],
    }
  );

  invalidateBalancedScorecardWorkspaceCache();
  return getBalancedScorecardContributionDetail(params);
};
