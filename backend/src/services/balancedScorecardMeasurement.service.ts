import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import prisma from "../prisma";
import {
  BalancedScorecardComputedDataQualityStatus,
  BalancedScorecardComputedTrace,
  computeBalancedScorecardKpiRecords,
} from "./balancedScorecardWorkspace.service";
import { resolveActiveBalancedScorecardVersionId } from "./balancedScorecardGovernance.service";

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

const uniqueKey = (prefix: string, value: string) =>
  `${prefix}-${slugify(value) || "item"}-${randomUUID().replace(/-/g, "").slice(0, 8)}`;

const numberValue = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const decimalOrNull = (value: number | null | undefined) =>
  value === null || value === undefined || !Number.isFinite(value) ? null : value;

const minDate = (left: Date, right: Date) =>
  left.getTime() <= right.getTime() ? left : right;

const mapNotFound = (message: string) => {
  const error = new Error(message) as Error & { statusCode?: number };
  error.statusCode = 404;
  return error;
};

const mapBadRequest = (message: string) => {
  const error = new Error(message) as Error & { statusCode?: number };
  error.statusCode = 400;
  return error;
};

const toDashboardStatus = (status: "on_track" | "at_risk" | "off_track") => status;

const mapDataQualityStatus = (status: BalancedScorecardComputedDataQualityStatus) => status;

const formatPeriodLabel = (start: Date, end: Date, fallback?: string | null) => {
  if (fallback && fallback.trim()) return fallback.trim();
  const startLabel = start.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const endLabel = end.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  return `${startLabel} - ${endLabel}`;
};

const mapTrace = (trace: BalancedScorecardComputedTrace) => ({
  sourceType: trace.sourceType,
  sourceKey: trace.sourceKey,
  sourceLabel: trace.sourceLabel,
  dataQualityStatus: mapDataQualityStatus(trace.dataQualityStatus),
  recordCount: trace.recordCount ?? null,
  rawValue: decimalOrNull(trace.rawValue ?? null),
  normalizedValue: decimalOrNull(trace.normalizedValue ?? null),
  note: trace.note ?? null,
  metadata: (trace.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
});

const initiativeProgressByKpiId = (
  structure: Awaited<ReturnType<typeof computeBalancedScorecardKpiRecords>>["structure"]
) => {
  const totals = new Map<number, number>();
  const counts = new Map<number, number>();

  structure.initiatives.forEach((initiative) => {
    totals.set(initiative.kpiId, (totals.get(initiative.kpiId) ?? 0) + (initiative.progress ?? 0));
    counts.set(initiative.kpiId, (counts.get(initiative.kpiId) ?? 0) + 1);
  });

  return new Map(
    Array.from(counts.entries()).map(([kpiId, count]) => [
      kpiId,
      count > 0 ? Math.round((totals.get(kpiId) ?? 0) / count) : 0,
    ])
  );
};

const resolveScorecardVersionId = async (scorecardVersionId?: number | null) => {
  if (scorecardVersionId) return scorecardVersionId;
  const activeVersionId = await resolveActiveBalancedScorecardVersionId();
  if (!activeVersionId) {
    throw mapBadRequest("No active scorecard version is available for measurement.");
  }
  return activeVersionId;
};

export type BalancedScorecardMeasurementReviewRecord = {
  id: number;
  action:
    | "generated"
    | "submitted"
    | "review_started"
    | "changes_requested"
    | "approved"
    | "closed"
    | "reopened";
  fromStatus: "draft" | "generated" | "submitted" | "in_review" | "approved" | "closed" | null;
  toStatus: "draft" | "generated" | "submitted" | "in_review" | "approved" | "closed";
  comment: string | null;
  actedByProfileId: number | null;
  actedAt: Date;
};

export type BalancedScorecardMeasurementPeriodSummary = {
  id: number;
  key: string;
  scorecardVersionId: number;
  scorecardCycleId: number;
  scorecardCycleName: string;
  scorecardLabel: string | null;
  cadence: "monthly" | "quarterly" | "annual";
  label: string;
  periodStart: Date;
  periodEnd: Date;
  status: "draft" | "generated" | "submitted" | "in_review" | "approved" | "closed";
  generatedAt: Date | null;
  submittedAt: Date | null;
  reviewedAt: Date | null;
  approvedAt: Date | null;
  closedAt: Date | null;
  latestComment: string | null;
  snapshotCount: number;
  offTrackCount: number;
  atRiskCount: number;
  warningCount: number;
  missingDataCount: number;
  reviewHistory: BalancedScorecardMeasurementReviewRecord[];
};

export type BalancedScorecardMeasurementSnapshotRecord = {
  id: number;
  kpiId: number;
  kpiKey: string;
  kpiName: string;
  metricKey: string;
  goalKey: string;
  goalTitle: string;
  perspectiveKey: string;
  perspectiveName: string;
  trackingMode: string;
  frequency: string;
  unit: string;
  weight: number;
  firmTarget: string;
  targetValue: number | null;
  targetLabel: string | null;
  actualValue: number | null;
  actualLabel: string;
  weightedScore: number;
  status: "on_track" | "at_risk" | "off_track";
  statusLogic: string | null;
  updateFrequency: string | null;
  initiativeProgress: number;
  trend: number[];
  ownerName: string | null;
  ownerUpdate: string | null;
  snapshotStatus: "generated" | "frozen" | "stale";
  dataQualityStatus: "healthy" | "warning" | "missing_data" | "stale_data" | "manual_override";
  dataQualityNote: string | null;
  actualAsOf: Date | null;
  measuredAt: Date;
  traces: Array<{
    id: number;
    sourceType: "metric_catalog" | "manual_actual" | "initiative_rollup" | "operational_signal";
    sourceKey: string;
    sourceLabel: string;
    dataQualityStatus: "healthy" | "warning" | "missing_data" | "stale_data" | "manual_override";
    recordCount: number | null;
    rawValue: number | null;
    normalizedValue: number | null;
    note: string | null;
    metadata: Record<string, unknown> | null;
  }>;
};

type ReviewDecision = "start_review" | "request_changes" | "approve";

const reviewTransitionMap: Record<
  ReviewDecision,
  {
    toStatus: "in_review" | "draft" | "approved";
    action: "review_started" | "changes_requested" | "approved";
    allowedFrom: Array<"submitted" | "in_review">;
  }
> = {
  start_review: {
    toStatus: "in_review",
    action: "review_started",
    allowedFrom: ["submitted"],
  },
  request_changes: {
    toStatus: "draft",
    action: "changes_requested",
    allowedFrom: ["submitted", "in_review"],
  },
  approve: {
    toStatus: "approved",
    action: "approved",
    allowedFrom: ["submitted", "in_review"],
  },
};

export async function listBalancedScorecardMeasurementPeriods(params?: {
  scorecardVersionId?: number | null;
}) {
  const scorecardVersionId = await resolveScorecardVersionId(params?.scorecardVersionId);
  const periods = await prisma.balancedScorecardMeasurementPeriod.findMany({
    where: { scorecardVersionId },
    orderBy: [{ periodStart: "desc" }, { id: "desc" }],
    include: {
      scorecardVersion: {
        select: {
          id: true,
          label: true,
          cycle: { select: { id: true, name: true } },
        },
      },
      snapshots: {
        select: {
          status: true,
          dataQualityStatus: true,
        },
      },
      reviews: {
        orderBy: [{ actedAt: "desc" }, { id: "desc" }],
      },
    },
  });

  return periods.map(
    (period) =>
      ({
        id: period.id,
        key: period.key,
        scorecardVersionId: period.scorecardVersionId,
        scorecardCycleId: period.scorecardVersion.cycle.id,
        scorecardCycleName: period.scorecardVersion.cycle.name,
        scorecardLabel: period.scorecardVersion.label ?? null,
        cadence: period.cadence,
        label: period.label,
        periodStart: period.periodStart,
        periodEnd: period.periodEnd,
        status: period.status,
        generatedAt: period.generatedAt ?? null,
        submittedAt: period.submittedAt ?? null,
        reviewedAt: period.reviewedAt ?? null,
        approvedAt: period.approvedAt ?? null,
        closedAt: period.closedAt ?? null,
        latestComment: period.latestComment ?? null,
        snapshotCount: period.snapshots.length,
        offTrackCount: period.snapshots.filter((snapshot) => snapshot.status === "off_track").length,
        atRiskCount: period.snapshots.filter((snapshot) => snapshot.status === "at_risk").length,
        warningCount: period.snapshots.filter((snapshot) => snapshot.dataQualityStatus === "warning").length,
        missingDataCount: period.snapshots.filter((snapshot) => snapshot.dataQualityStatus === "missing_data").length,
        reviewHistory: period.reviews.map(
          (review) =>
            ({
              id: review.id,
              action: review.action,
              fromStatus: review.fromStatus ?? null,
              toStatus: review.toStatus,
              comment: review.comment ?? null,
              actedByProfileId: review.actedByProfileId ?? null,
              actedAt: review.actedAt,
            }) satisfies BalancedScorecardMeasurementReviewRecord
        ),
      }) satisfies BalancedScorecardMeasurementPeriodSummary
  );
}

export async function createBalancedScorecardMeasurementPeriod(input: {
  scorecardVersionId?: number | null;
  label?: string | null;
  periodStart: string;
  periodEnd: string;
  createdByProfileId?: number | null;
}) {
  const scorecardVersionId = await resolveScorecardVersionId(input.scorecardVersionId);
  const periodStart = new Date(input.periodStart);
  const periodEnd = new Date(input.periodEnd);

  if (Number.isNaN(periodStart.getTime()) || Number.isNaN(periodEnd.getTime())) {
    throw mapBadRequest("Valid measurement period dates are required.");
  }
  if (periodEnd <= periodStart) {
    throw mapBadRequest("Measurement period end must be after the start date.");
  }

  const version = await prisma.balancedScorecardVersion.findUnique({
    where: { id: scorecardVersionId },
    include: { cycle: true },
  });

  if (!version) {
    throw mapNotFound("Scorecard version not found.");
  }

  return prisma.balancedScorecardMeasurementPeriod.create({
    data: {
      key: uniqueKey("measurement-period", `${version.cycle.name}-${periodStart.toISOString()}`),
      scorecardVersionId,
      label: formatPeriodLabel(periodStart, periodEnd, input.label),
      cadence: version.cycle.cadence,
      periodStart,
      periodEnd,
      createdByProfileId: input.createdByProfileId ?? null,
    },
  });
}

export async function generateBalancedScorecardMeasurementPeriod(input: {
  periodId: number;
  generatedByProfileId?: number | null;
  comment?: string | null;
}) {
  const period = await prisma.balancedScorecardMeasurementPeriod.findUnique({
    where: { id: input.periodId },
    include: {
      scorecardVersion: {
        include: { cycle: true },
      },
    },
  });

  if (!period) {
    throw mapNotFound("Measurement period not found.");
  }
  if (period.status === "closed") {
    throw mapBadRequest("Closed measurement periods cannot be regenerated.");
  }

  const asOfDate = minDate(new Date(), period.periodEnd);
  const computed = await computeBalancedScorecardKpiRecords({
    scorecardVersionId: period.scorecardVersionId,
    measurementWindow: {
      start: period.periodStart,
      end: period.periodEnd,
    },
    asOfDate,
    monthBucketCount: 6,
  });
  const initiativeProgress = initiativeProgressByKpiId(computed.structure);
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.balancedScorecardKpiSnapshot.deleteMany({
      where: { measurementPeriodId: period.id },
    });

    for (const kpi of computed.kpis) {
      await tx.balancedScorecardKpiSnapshot.create({
        data: {
          measurementPeriodId: period.id,
          kpiId: kpi.recordId,
          metricKey: kpi.metricKey,
          kpiKey: kpi.key,
          kpiName: kpi.name,
          goalKey: kpi.goalKey,
          goalTitle: kpi.goalTitle,
          perspectiveKey: kpi.perspectiveKey,
          perspectiveName: kpi.perspectiveName,
          trackingMode: kpi.trackingMode,
          frequency: kpi.frequency,
          unit: kpi.unit,
          weight: kpi.weight,
          firmTarget: kpi.firmTarget,
          targetValue: decimalOrNull(kpi.targetValue),
          targetLabel: kpi.targetLabel ?? null,
          actualValue: decimalOrNull(kpi.actualValue),
          actualLabel: kpi.actualLabel,
          weightedScore: kpi.weightedScore,
          status: toDashboardStatus(kpi.status),
          statusLogic: kpi.statusLogic || null,
          updateFrequency: kpi.updateFrequency || null,
          initiativeProgress: initiativeProgress.get(kpi.recordId) ?? kpi.weightedScore,
          trend: kpi.trend,
          ownerName: kpi.owner || null,
          ownerUpdate: kpi.ownerUpdate || null,
          snapshotStatus: "generated",
          dataQualityStatus: mapDataQualityStatus(kpi.dataQualityStatus),
          dataQualityNote: kpi.dataQualityNote ?? null,
          actualAsOf: kpi.actualAsOf ?? null,
          measuredAt: now,
          measurementContext: {
            periodStart: period.periodStart.toISOString(),
            periodEnd: period.periodEnd.toISOString(),
            generatedAt: now.toISOString(),
          },
          traces: {
            create: kpi.traces.map(mapTrace),
          },
        },
      });
    }

    const previousStatus = period.status;
    await tx.balancedScorecardMeasurementPeriod.update({
      where: { id: period.id },
      data: {
        status: "generated",
        generatedAt: now,
        generatedByProfileId: input.generatedByProfileId ?? null,
        latestComment: input.comment?.trim() || null,
      },
    });

    await tx.balancedScorecardMeasurementReview.create({
      data: {
        measurementPeriodId: period.id,
        action: "generated",
        fromStatus: previousStatus,
        toStatus: "generated",
        comment: input.comment?.trim() || null,
        actedByProfileId: input.generatedByProfileId ?? null,
        actedAt: now,
      },
    });
  });

  return prisma.balancedScorecardMeasurementPeriod.findUnique({
    where: { id: period.id },
  });
}

export async function getBalancedScorecardMeasurementSnapshots(periodId: number) {
  const period = await prisma.balancedScorecardMeasurementPeriod.findUnique({
    where: { id: periodId },
    include: {
      scorecardVersion: {
        select: {
          id: true,
          label: true,
          cycle: { select: { id: true, name: true } },
        },
      },
      reviews: {
        orderBy: [{ actedAt: "desc" }, { id: "desc" }],
      },
      snapshots: {
        orderBy: [{ weightedScore: "asc" }, { id: "asc" }],
        include: {
          traces: {
            orderBy: [{ id: "asc" }],
          },
        },
      },
    },
  });

  if (!period) {
    throw mapNotFound("Measurement period not found.");
  }

  return {
    period: {
      id: period.id,
      key: period.key,
      scorecardVersionId: period.scorecardVersionId,
      scorecardCycleId: period.scorecardVersion.cycle.id,
      scorecardCycleName: period.scorecardVersion.cycle.name,
      scorecardLabel: period.scorecardVersion.label ?? null,
      cadence: period.cadence,
      label: period.label,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      status: period.status,
      generatedAt: period.generatedAt ?? null,
      submittedAt: period.submittedAt ?? null,
      reviewedAt: period.reviewedAt ?? null,
      approvedAt: period.approvedAt ?? null,
      closedAt: period.closedAt ?? null,
      latestComment: period.latestComment ?? null,
      snapshotCount: period.snapshots.length,
      offTrackCount: period.snapshots.filter((snapshot) => snapshot.status === "off_track").length,
      atRiskCount: period.snapshots.filter((snapshot) => snapshot.status === "at_risk").length,
      warningCount: period.snapshots.filter((snapshot) => snapshot.dataQualityStatus === "warning").length,
      missingDataCount: period.snapshots.filter((snapshot) => snapshot.dataQualityStatus === "missing_data").length,
      reviewHistory: period.reviews.map(
        (review) =>
          ({
            id: review.id,
            action: review.action,
            fromStatus: review.fromStatus ?? null,
            toStatus: review.toStatus,
            comment: review.comment ?? null,
            actedByProfileId: review.actedByProfileId ?? null,
            actedAt: review.actedAt,
          }) satisfies BalancedScorecardMeasurementReviewRecord
      ),
    } satisfies BalancedScorecardMeasurementPeriodSummary,
    snapshots: period.snapshots.map(
      (snapshot) =>
        ({
          id: snapshot.id,
          kpiId: snapshot.kpiId,
          kpiKey: snapshot.kpiKey,
          kpiName: snapshot.kpiName,
          metricKey: snapshot.metricKey,
          goalKey: snapshot.goalKey,
          goalTitle: snapshot.goalTitle,
          perspectiveKey: snapshot.perspectiveKey,
          perspectiveName: snapshot.perspectiveName,
          trackingMode: snapshot.trackingMode,
          frequency: snapshot.frequency,
          unit: snapshot.unit,
          weight: snapshot.weight,
          firmTarget: snapshot.firmTarget,
          targetValue: snapshot.targetValue === null ? null : numberValue(snapshot.targetValue),
          targetLabel: snapshot.targetLabel ?? null,
          actualValue: snapshot.actualValue === null ? null : numberValue(snapshot.actualValue),
          actualLabel: snapshot.actualLabel,
          weightedScore: snapshot.weightedScore,
          status: snapshot.status,
          statusLogic: snapshot.statusLogic ?? null,
          updateFrequency: snapshot.updateFrequency ?? null,
          initiativeProgress: snapshot.initiativeProgress,
          trend: Array.isArray(snapshot.trend)
            ? snapshot.trend.map((value) => numberValue(value))
            : [],
          ownerName: snapshot.ownerName ?? null,
          ownerUpdate: snapshot.ownerUpdate ?? null,
          snapshotStatus: snapshot.snapshotStatus,
          dataQualityStatus: snapshot.dataQualityStatus,
          dataQualityNote: snapshot.dataQualityNote ?? null,
          actualAsOf: snapshot.actualAsOf ?? null,
          measuredAt: snapshot.measuredAt,
          traces: snapshot.traces.map((trace) => ({
            id: trace.id,
            sourceType: trace.sourceType,
            sourceKey: trace.sourceKey,
            sourceLabel: trace.sourceLabel,
            dataQualityStatus: trace.dataQualityStatus,
            recordCount: trace.recordCount ?? null,
            rawValue: trace.rawValue === null ? null : numberValue(trace.rawValue),
            normalizedValue: trace.normalizedValue === null ? null : numberValue(trace.normalizedValue),
            note: trace.note ?? null,
            metadata:
              trace.metadata && typeof trace.metadata === "object"
                ? (trace.metadata as Record<string, unknown>)
                : null,
          })),
        }) satisfies BalancedScorecardMeasurementSnapshotRecord
    ),
  };
}

export async function submitBalancedScorecardMeasurementPeriod(input: {
  periodId: number;
  actedByProfileId?: number | null;
  comment?: string | null;
}) {
  const period = await prisma.balancedScorecardMeasurementPeriod.findUnique({
    where: { id: input.periodId },
  });
  if (!period) throw mapNotFound("Measurement period not found.");
  if (!["draft", "generated"].includes(period.status)) {
    throw mapBadRequest("Only draft or generated periods can be submitted for review.");
  }

  const now = new Date();
  await prisma.$transaction([
    prisma.balancedScorecardMeasurementPeriod.update({
      where: { id: period.id },
      data: {
        status: "submitted",
        submittedAt: now,
        submittedByProfileId: input.actedByProfileId ?? null,
        latestComment: input.comment?.trim() || null,
      },
    }),
    prisma.balancedScorecardMeasurementReview.create({
      data: {
        measurementPeriodId: period.id,
        action: "submitted",
        fromStatus: period.status,
        toStatus: "submitted",
        comment: input.comment?.trim() || null,
        actedByProfileId: input.actedByProfileId ?? null,
        actedAt: now,
      },
    }),
  ]);

  return prisma.balancedScorecardMeasurementPeriod.findUnique({ where: { id: period.id } });
}

export async function reviewBalancedScorecardMeasurementPeriod(input: {
  periodId: number;
  decision: ReviewDecision;
  actedByProfileId?: number | null;
  comment?: string | null;
}) {
  const period = await prisma.balancedScorecardMeasurementPeriod.findUnique({
    where: { id: input.periodId },
  });
  if (!period) throw mapNotFound("Measurement period not found.");

  const transition = reviewTransitionMap[input.decision];
  if (!transition.allowedFrom.includes(period.status as "submitted" | "in_review")) {
    throw mapBadRequest(`Cannot apply ${input.decision} while the period is ${period.status}.`);
  }

  const now = new Date();
  await prisma.$transaction([
    prisma.balancedScorecardMeasurementPeriod.update({
      where: { id: period.id },
      data: {
        status: transition.toStatus,
        reviewedAt:
          transition.toStatus === "in_review" || transition.toStatus === "draft" ? now : period.reviewedAt,
        reviewedByProfileId:
          transition.toStatus === "in_review" || transition.toStatus === "draft"
            ? input.actedByProfileId ?? null
            : period.reviewedByProfileId,
        approvedAt: transition.toStatus === "approved" ? now : period.approvedAt,
        approvedByProfileId:
          transition.toStatus === "approved" ? input.actedByProfileId ?? null : period.approvedByProfileId,
        latestComment: input.comment?.trim() || null,
      },
    }),
    prisma.balancedScorecardMeasurementReview.create({
      data: {
        measurementPeriodId: period.id,
        action: transition.action,
        fromStatus: period.status,
        toStatus: transition.toStatus,
        comment: input.comment?.trim() || null,
        actedByProfileId: input.actedByProfileId ?? null,
        actedAt: now,
      },
    }),
  ]);

  return prisma.balancedScorecardMeasurementPeriod.findUnique({ where: { id: period.id } });
}

export async function closeBalancedScorecardMeasurementPeriod(input: {
  periodId: number;
  actedByProfileId?: number | null;
  comment?: string | null;
}) {
  const period = await prisma.balancedScorecardMeasurementPeriod.findUnique({
    where: { id: input.periodId },
  });
  if (!period) throw mapNotFound("Measurement period not found.");
  if (period.status !== "approved") {
    throw mapBadRequest("Only approved periods can be closed.");
  }

  const now = new Date();
  await prisma.$transaction([
    prisma.balancedScorecardMeasurementPeriod.update({
      where: { id: period.id },
      data: {
        status: "closed",
        closedAt: now,
        closedByProfileId: input.actedByProfileId ?? null,
        latestComment: input.comment?.trim() || null,
        snapshots: {
          updateMany: {
            where: { measurementPeriodId: period.id },
            data: { snapshotStatus: "frozen" },
          },
        },
      },
    }),
    prisma.balancedScorecardMeasurementReview.create({
      data: {
        measurementPeriodId: period.id,
        action: "closed",
        fromStatus: period.status,
        toStatus: "closed",
        comment: input.comment?.trim() || null,
        actedByProfileId: input.actedByProfileId ?? null,
        actedAt: now,
      },
    }),
  ]);

  return prisma.balancedScorecardMeasurementPeriod.findUnique({ where: { id: period.id } });
}
