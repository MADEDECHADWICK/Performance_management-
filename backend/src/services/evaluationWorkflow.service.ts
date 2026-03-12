type EvaluatorTypeValue =
  | "self"
  | "manager"
  | "peer"
  | "direct_report"
  | "client"
  | "custom";

type QuestionKind = "rating" | "metric" | "text" | "boolean" | "select";

type RatingScaleShape = {
  min: number;
  max: number;
  step?: number;
  lowLabel?: string;
  highLabel?: string;
  labels?: Record<string, string>;
};

type QuestionItemShape = {
  id: string;
  label: string;
  description?: string;
  kind: QuestionKind;
  required?: boolean;
  weight?: number;
  evaluatorTypes?: EvaluatorTypeValue[];
  ratingScale?: RatingScaleShape;
  options?: string[];
  placeholder?: string;
  allowComment?: boolean;
  metricSource?: {
    type: string;
    id?: string | number;
    name: string;
    category?: string;
    unit?: string;
    targetValue?: number;
  };
};

export type EvaluationQuestionSectionShape = {
  id: string;
  title: string;
  description?: string;
  weight?: number;
  evaluatorTypes?: EvaluatorTypeValue[];
  items: QuestionItemShape[];
};

const DEFAULT_RATING_SCALE: RatingScaleShape = {
  min: 1,
  max: 5,
  step: 1,
  lowLabel: "Needs improvement",
  highLabel: "Outstanding",
};

const SUPPORTED_EVALUATOR_TYPES: EvaluatorTypeValue[] = [
  "self",
  "manager",
  "peer",
  "direct_report",
  "client",
  "custom",
];

const QUESTION_KINDS = new Set<QuestionKind>([
  "rating",
  "metric",
  "text",
  "boolean",
  "select",
]);

const asRecord = (value: unknown): Record<string, any> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};

const unique = <T,>(values: T[]) => Array.from(new Set(values));

const slugify = (value: string) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "item";

const toNumber = (value: unknown, fallback?: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const normalizeEvaluatorTypes = (
  value: unknown,
  fallback: EvaluatorTypeValue[]
): EvaluatorTypeValue[] => {
  const source = Array.isArray(value) ? value : fallback;
  const resolved = source
    .map((entry) => String(entry || "").trim().toLowerCase())
    .filter((entry): entry is EvaluatorTypeValue =>
      SUPPORTED_EVALUATOR_TYPES.includes(entry as EvaluatorTypeValue)
    );
  return resolved.length > 0 ? unique(resolved) : unique(fallback);
};

const normalizeRatingScale = (value: unknown): RatingScaleShape => {
  const payload = asRecord(value);
  const min = clamp(toNumber(payload.min, DEFAULT_RATING_SCALE.min) || 1, 0, 10);
  const max = clamp(
    toNumber(payload.max, Math.max(min, DEFAULT_RATING_SCALE.max)) || 5,
    min || 1,
    10
  );
  return {
    min,
    max,
    step: clamp(toNumber(payload.step, DEFAULT_RATING_SCALE.step) || 1, 1, 5),
    lowLabel: payload.lowLabel || payload.low_label || DEFAULT_RATING_SCALE.lowLabel,
    highLabel:
      payload.highLabel || payload.high_label || DEFAULT_RATING_SCALE.highLabel,
    labels:
      payload.labels && typeof payload.labels === "object"
        ? Object.fromEntries(
            Object.entries(payload.labels).map(([key, label]) => [String(key), String(label)])
          )
        : undefined,
  };
};

const normalizeQuestionItem = (
  value: unknown,
  sectionId: string,
  index: number,
  fallbackEvaluatorTypes: EvaluatorTypeValue[]
): QuestionItemShape => {
  const payload = asRecord(value);
  const metricSource = asRecord(payload.metricSource || payload.metric_source);
  const kindCandidate = String(
    payload.kind || payload.type || (Object.keys(metricSource).length ? "metric" : "rating")
  ).toLowerCase();
  const kind = QUESTION_KINDS.has(kindCandidate as QuestionKind)
    ? (kindCandidate as QuestionKind)
    : "rating";
  const label =
    payload.label ||
    payload.title ||
    payload.name ||
    metricSource.name ||
    `Question ${index + 1}`;

  return {
    id:
      String(payload.id || "").trim() ||
      `${sectionId}_${slugify(String(label))}_${index + 1}`,
    label: String(label),
    description: payload.description ? String(payload.description) : undefined,
    kind,
    required:
      payload.required === undefined ? kind !== "text" : Boolean(payload.required),
    weight: toNumber(payload.weight, undefined),
    evaluatorTypes: normalizeEvaluatorTypes(
      payload.evaluatorTypes || payload.evaluator_types,
      fallbackEvaluatorTypes
    ),
    ratingScale:
      kind === "rating" || kind === "metric"
        ? normalizeRatingScale(payload.ratingScale || payload.rating_scale)
        : undefined,
    options: Array.isArray(payload.options)
      ? payload.options.map((entry: unknown) => String(entry))
      : undefined,
    placeholder: payload.placeholder ? String(payload.placeholder) : undefined,
    allowComment:
      payload.allowComment === undefined
        ? kind === "rating" || kind === "metric"
        : Boolean(payload.allowComment),
    metricSource:
      kind === "metric"
        ? {
            type: String(metricSource.type || "custom"),
            id: metricSource.id,
            name: String(metricSource.name || label),
            category: metricSource.category ? String(metricSource.category) : undefined,
            unit: metricSource.unit ? String(metricSource.unit) : undefined,
            targetValue: toNumber(metricSource.targetValue, undefined),
          }
        : undefined,
  };
};

const buildCompetencySections = (
  competencies: unknown,
  fallbackTitle: string,
  evaluatorTypes: EvaluatorTypeValue[]
): EvaluationQuestionSectionShape[] => {
  if (!Array.isArray(competencies) || competencies.length === 0) return [];
  return [
    {
      id: "competencies",
      title: fallbackTitle,
      evaluatorTypes,
      items: competencies.map((entry, index) =>
        normalizeQuestionItem(
          {
            id: `competency_${index + 1}`,
            label:
              asRecord(entry).name ||
              asRecord(entry).title ||
              asRecord(entry).label ||
              String(entry),
            description: asRecord(entry).description,
            kind: "rating",
            weight: asRecord(entry).weight,
          },
          "competencies",
          index,
          evaluatorTypes
        )
      ),
    },
  ];
};

export const resolveEnabledEvaluatorTypes = (
  definition: Record<string, any>
): EvaluatorTypeValue[] => {
  const explicit: EvaluatorTypeValue[] = Array.isArray(definition.enabledEvaluatorTypes)
    ? normalizeEvaluatorTypes(definition.enabledEvaluatorTypes, ["manager"])
    : [];
  if (explicit.length > 0) {
    return explicit;
  }

  const enabled: EvaluatorTypeValue[] = [];
  if (definition.enableSelfEvaluation) enabled.push("self");
  if (definition.enableDownwardEvaluation) enabled.push("manager");
  if (definition.enablePeerEvaluation) enabled.push("peer");
  if (definition.enableUpwardEvaluation) enabled.push("direct_report");
  if (definition.enableClientEvaluation) enabled.push("client");
  return enabled.length > 0 ? enabled : ["manager"];
};

export const normalizeEvaluationQuestions = (
  questions: unknown,
  options?: {
    fallbackTitle?: string;
    competencies?: unknown;
    evaluatorTypes?: EvaluatorTypeValue[];
  }
): EvaluationQuestionSectionShape[] => {
  const fallbackEvaluatorTypes: EvaluatorTypeValue[] = options?.evaluatorTypes?.length
    ? options.evaluatorTypes
    : ["manager"];
  const source = Array.isArray(questions) ? questions : [];
  const isSectionArray = source.every(
    (entry) =>
      entry &&
      typeof entry === "object" &&
      Array.isArray((entry as Record<string, unknown>).items)
  );

  if (isSectionArray && source.length > 0) {
    return source
      .map((entry, index) => {
        const payload = asRecord(entry);
        const title =
          payload.title ||
          payload.name ||
          payload.label ||
          `${options?.fallbackTitle || "Section"} ${index + 1}`;
        const sectionId =
          String(payload.id || "").trim() || `section_${slugify(String(title))}_${index + 1}`;
        const evaluatorTypes = normalizeEvaluatorTypes(
          payload.evaluatorTypes || payload.evaluator_types,
          fallbackEvaluatorTypes
        );
        const items = Array.isArray(payload.items)
          ? payload.items.map((item, itemIndex) =>
              normalizeQuestionItem(item, sectionId, itemIndex, evaluatorTypes)
            )
          : [];

        return {
          id: sectionId,
          title: String(title),
          description: payload.description ? String(payload.description) : undefined,
          weight: toNumber(payload.weight, undefined),
          evaluatorTypes,
          items,
        };
      })
      .filter((section) => section.items.length > 0);
  }

  if (source.length > 0) {
    const sectionId = `section_${slugify(options?.fallbackTitle || "evaluation")}`;
    return [
      {
        id: sectionId,
        title: options?.fallbackTitle || "Evaluation Metrics",
        evaluatorTypes: fallbackEvaluatorTypes,
        items: source.map((entry, index) =>
          normalizeQuestionItem(entry, sectionId, index, fallbackEvaluatorTypes)
        ),
      },
    ];
  }

  const competencySections = buildCompetencySections(
    options?.competencies,
    options?.fallbackTitle || "Competencies",
    fallbackEvaluatorTypes
  );
  if (competencySections.length > 0) {
    return competencySections;
  }

  return [
    {
      id: "core_performance",
      title: options?.fallbackTitle || "Core Performance",
      evaluatorTypes: fallbackEvaluatorTypes,
      items: [
        {
          id: "overall_delivery",
          label: "Overall delivery quality",
          kind: "rating",
          required: true,
          weight: 60,
          evaluatorTypes: fallbackEvaluatorTypes,
          ratingScale: DEFAULT_RATING_SCALE,
          allowComment: true,
        },
        {
          id: "collaboration_and_growth",
          label: "Collaboration and growth mindset",
          kind: "rating",
          required: true,
          weight: 40,
          evaluatorTypes: fallbackEvaluatorTypes,
          ratingScale: DEFAULT_RATING_SCALE,
          allowComment: true,
        },
      ],
    },
  ];
};

export const normalizeEvaluationWorkflowConfig = (
  value: unknown,
  evaluatorTypes: EvaluatorTypeValue[],
  dueDate?: string | Date | null
) => {
  const payload = asRecord(value);
  const evaluatorMix = asRecord(payload.evaluatorMix || payload.evaluator_mix);
  const schedules = Array.isArray(payload.schedules)
    ? payload.schedules
        .map((entry) => {
          const row = asRecord(entry);
          const evaluatorType = String(
            row.evaluatorType || row.evaluator_type || ""
          ) as EvaluatorTypeValue;
          if (!SUPPORTED_EVALUATOR_TYPES.includes(evaluatorType)) return null;
          return {
            evaluatorType,
            opensAt: row.opensAt || row.opens_at || null,
            dueAt: row.dueAt || row.due_at || dueDate || null,
          };
        })
        .filter(Boolean)
    : evaluatorTypes.map((evaluatorType) => ({
        evaluatorType,
        opensAt: null,
        dueAt: dueDate || null,
      }));

  return {
    remindersEnabled:
      payload.remindersEnabled === undefined ? true : Boolean(payload.remindersEnabled),
    reminderCadence:
      payload.reminderCadence === "daily" || payload.reminderCadence === "custom"
        ? payload.reminderCadence
        : "weekly",
    evaluatorMix: Object.fromEntries(
      SUPPORTED_EVALUATOR_TYPES.map((type) => [
        type,
        evaluatorMix[type] === undefined ? evaluatorTypes.includes(type) : Boolean(evaluatorMix[type]),
      ])
    ),
    schedules,
    launchSummary: payload.launchSummary ? String(payload.launchSummary) : undefined,
  };
};

export const summarizeEvaluationQuestions = (
  sections: EvaluationQuestionSectionShape[]
) => {
  const itemCount = sections.reduce((total, section) => total + section.items.length, 0);
  const metricCount = sections.reduce(
    (total, section) =>
      total + section.items.filter((item) => item.kind === "metric").length,
    0
  );
  const evaluatorTypes = unique(
    sections.flatMap((section) =>
      section.items.flatMap((item) => item.evaluatorTypes || section.evaluatorTypes || [])
    )
  );
  return {
    sectionCount: sections.length,
    itemCount,
    metricCount,
    evaluatorTypes,
  };
};

const readNumericResponse = (value: unknown) => {
  if (typeof value === "number") return value;
  if (value && typeof value === "object") {
    const payload = asRecord(value);
    if (typeof payload.score === "number") return payload.score;
    if (typeof payload.value === "number") return payload.value;
  }
  return undefined;
};

export const calculateEvaluationAssignmentScore = (
  sections: EvaluationQuestionSectionShape[],
  responses: unknown
) => {
  const payload = asRecord(responses);
  let totalWeightedScore = 0;
  let totalWeight = 0;

  sections.forEach((section) => {
    section.items.forEach((item) => {
      const numericValue = readNumericResponse(payload[item.id]);
      if (numericValue === undefined) return;

      const scale = item.ratingScale || DEFAULT_RATING_SCALE;
      const max = Math.max(scale.max || 5, 1);
      const normalized = clamp((numericValue / max) * 100, 0, 100);
      const weight = item.weight ?? 1;
      totalWeightedScore += normalized * weight;
      totalWeight += weight;
    });
  });

  if (totalWeight === 0) return undefined;
  return Number((totalWeightedScore / totalWeight).toFixed(2));
};
