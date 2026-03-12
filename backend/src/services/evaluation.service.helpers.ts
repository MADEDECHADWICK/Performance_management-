import {
  EvaluationAssignmentStatus,
  EvaluationCycleType,
  EvaluationQuestionCategory,
  EvaluationRelationship,
  EvaluatorType,
} from "@prisma/client";

export type TemplateQuestionSeed = {
  text: string;
  category: EvaluationQuestionCategory;
  weight: number;
  order: number;
};

export const DEFAULT_TEMPLATE_NAME = "AssessTeam Streamlined 360 Template";

export const DEFAULT_TEMPLATE_QUESTIONS: Array<{
  text: string;
  category: EvaluationQuestionCategory;
  weight: number;
  order: number;
}> = [
  {
    text: "Demonstrates strong technical competence in current responsibilities.",
    category: "competency",
    weight: 1.2,
    order: 1,
  },
  {
    text: "Collaborates effectively with colleagues and stakeholders.",
    category: "behavior",
    weight: 1.1,
    order: 2,
  },
  {
    text: "Consistently delivers against agreed goals and commitments.",
    category: "goal",
    weight: 1.3,
    order: 3,
  },
  {
    text: "Reflects the firm's values and professional culture.",
    category: "culture",
    weight: 1,
    order: 4,
  },
  {
    text: "Shows initiative and ownership when challenges arise.",
    category: "behavior",
    weight: 1,
    order: 5,
  },
];

const MANAGER_ROLES = new Set(["super_admin", "hr", "manager"]);

const normalizeRole = (role: string) =>
  String(role || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");

export const toRoleSet = (roles: string[]) => new Set((roles || []).map(normalizeRole));

export const hasManagerPrivileges = (roles: string[]) => {
  const normalizedRoles = toRoleSet(roles);
  return Array.from(MANAGER_ROLES).some((role) => normalizedRoles.has(role));
};

export const parseDate = (value: string | Date | undefined | null, label: string) => {
  if (!value) {
    throw { statusCode: 400, message: `${label} is required` };
  }

  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw { statusCode: 400, message: `${label} is invalid` };
  }
  return parsed;
};

export const toNumber = (value: unknown) => {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const asRecord = (value: unknown): Record<string, any> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};

export const roundTo = (value: number, digits = 2) => {
  const scale = Math.pow(10, digits);
  return Math.round(value * scale) / scale;
};

export const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export const mapRelationshipToEvaluatorType = (
  relationship: EvaluationRelationship | string
): EvaluatorType => {
  const normalized = String(relationship || "").trim().toLowerCase();
  switch (normalized) {
    case "self":
      return "self";
    case "peer":
      return "peer";
    case "subordinate":
      return "direct_report";
    case "manager":
    default:
      return "manager";
  }
};

export const mapCycleType = (value?: string | EvaluationCycleType) => {
  const normalized = String(value || "annual").trim().toLowerCase();
  switch (normalized) {
    case "mid_year":
    case "mid-year":
      return "mid_year";
    case "quarterly":
      return "quarterly";
    case "probation":
      return "probation";
    default:
      return "annual";
  }
};

const inferQuestionCategory = (
  value: unknown,
  fallback: EvaluationQuestionCategory = "competency"
): EvaluationQuestionCategory => {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

  if (!normalized) return fallback;
  if (normalized.includes("goal")) return "goal";
  if (normalized.includes("culture") || normalized.includes("value")) return "culture";
  if (
    normalized.includes("behavior") ||
    normalized.includes("behaviour") ||
    normalized.includes("collaboration") ||
    normalized.includes("initiative")
  ) {
    return "behavior";
  }
  if (normalized.includes("competency") || normalized.includes("skill")) {
    return "competency";
  }
  return fallback;
};

const normalizeQuestionWeight = (value: unknown) => {
  const numeric = toNumber(value);
  return numeric > 0 ? roundTo(numeric) : 1;
};

const toTemplateQuestionSeed = (
  entry: unknown,
  index: number,
  fallbackCategory: EvaluationQuestionCategory = "competency"
): TemplateQuestionSeed | null => {
  if (!entry || typeof entry !== "object") return null;

  const record = entry as Record<string, any>;
  const text = String(
    record.text || record.label || record.title || record.name || ""
  ).trim();

  if (!text) return null;

  return {
    text,
    category: inferQuestionCategory(record.category, fallbackCategory),
    weight: normalizeQuestionWeight(record.weight),
    order: Number(record.order || record.displayOrder || index + 1) || index + 1,
  };
};

export const flattenQuestionSource = (
  value: unknown,
  fallbackCategory: EvaluationQuestionCategory = "competency"
): TemplateQuestionSeed[] => {
  if (!Array.isArray(value)) return [];

  const normalized: TemplateQuestionSeed[] = [];

  value.forEach((entry, index) => {
    if (!entry || typeof entry !== "object") {
      const text = String(entry || "").trim();
      if (text) {
        normalized.push({
          text,
          category: fallbackCategory,
          weight: 1,
          order: normalized.length + 1,
        });
      }
      return;
    }

    const record = entry as Record<string, any>;
    const nestedItems = Array.isArray(record.items) ? record.items : null;

    if (nestedItems) {
      const sectionCategory = inferQuestionCategory(
        record.category || record.title || record.label || record.id,
        fallbackCategory
      );
      flattenQuestionSource(nestedItems, sectionCategory).forEach((question) => {
        normalized.push({
          ...question,
          order: normalized.length + 1,
        });
      });
      return;
    }

    const question = toTemplateQuestionSeed(record, index, fallbackCategory);
    if (question) {
      normalized.push({
        ...question,
        order: normalized.length + 1,
      });
    }
  });

  return normalized;
};

export const legacyQuestionPayload = (
  questions: Array<{ id: number; text: string; category: string; weight: number }>
) =>
  questions.map((question) => ({
    id: `question_${question.id}`,
    label: question.text,
    category: question.category,
    weight: question.weight,
    scale: { min: 1, max: 5 },
  }));

export const buildCycleProgress = (
  assignments: Array<{
    status: EvaluationAssignmentStatus | string;
    evaluatee?: { department?: { id: number; name: string } | null } | null;
  }>
) => {
  const totalAssignments = assignments.length;
  const submittedAssignments = assignments.filter(
    (assignment) => assignment.status === "submitted"
  ).length;
  const completionPercent =
    totalAssignments > 0 ? roundTo((submittedAssignments / totalAssignments) * 100) : 0;

  const departmentMap = new Map<
    string,
    { departmentId: number | null; departmentName: string; total: number; submitted: number }
  >();

  assignments.forEach((assignment) => {
    const departmentId = assignment.evaluatee?.department?.id ?? null;
    const departmentName = assignment.evaluatee?.department?.name || "Unassigned";
    const key = String(departmentId ?? "none");
    const current =
      departmentMap.get(key) || {
        departmentId,
        departmentName,
        total: 0,
        submitted: 0,
      };

    current.total += 1;
    if (assignment.status === "submitted") {
      current.submitted += 1;
    }

    departmentMap.set(key, current);
  });

  const departmentProgress = Array.from(departmentMap.values()).map((row) => ({
    ...row,
    completionPercent: row.total > 0 ? roundTo((row.submitted / row.total) * 100) : 0,
  }));

  return {
    totalAssignments,
    submittedAssignments,
    pendingAssignments: totalAssignments - submittedAssignments,
    completionPercent,
    departmentProgress,
  };
};

export const formatProfileName = (
  profile?: {
    firstName?: string | null;
    lastName?: string | null;
  } | null
) => [profile?.firstName, profile?.lastName].filter(Boolean).join(" ").trim() || "Unknown person";

const toNumberRecord = (value: unknown) =>
  Object.fromEntries(
    Object.entries(asRecord(value)).map(([key, entryValue]) => [key, roundTo(toNumber(entryValue))])
  );

export const buildAnonymousEvaluatorLabel = (relationship: string, index?: number) => {
  const label = String(relationship || "manager")
    .trim()
    .toLowerCase()
    .replace(/_/g, " ");
  const prefix =
    label === "subordinate"
      ? "Upward evaluator"
      : `${label.charAt(0).toUpperCase()}${label.slice(1)} evaluator`;
  return index && index > 1 ? `${prefix} ${index}` : prefix;
};

export const mapPerformanceScoreToReport = (score: {
  evaluationCycleId: number | null;
  employeeProfileId: number;
  evaluationScore: unknown;
  totalScore: unknown;
  grade: string | null;
  scoreBreakdown: unknown;
}) => {
  const breakdown = asRecord(score.scoreBreakdown);

  return {
    cycleId: score.evaluationCycleId || 0,
    evaluateeId: score.employeeProfileId,
    overall: roundTo(toNumber(score.evaluationScore) / 20),
    byCategory: toNumberRecord(breakdown.byCategory),
    ratingBand: String(score.grade || breakdown.ratingBand || ""),
    kpiCompletionPercent: roundTo(toNumber(breakdown.kpiCompletionPercent)),
    developmentGoalProgress: roundTo(toNumber(breakdown.developmentGoalProgress)),
    peerVsManagerVariance: roundTo(toNumber(breakdown.peerVsManagerVariance)),
    averageByRelationship: toNumberRecord(breakdown.averageByRelationship),
    totalScore: roundTo(toNumber(score.totalScore)),
  };
};
