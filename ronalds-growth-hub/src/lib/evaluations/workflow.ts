import type {
  EvaluationDefinition,
  EvaluationQuestionItem,
  EvaluationQuestionSection,
  EvaluationRatingScale,
  EvaluationWorkflowConfig,
  EvaluatorType,
} from "@/lib/api/types";

export interface EvaluationItemResponse {
  value?: string | number | boolean;
  score?: number;
  comment?: string;
}

const DEFAULT_RATING_SCALE: EvaluationRatingScale = {
  min: 1,
  max: 5,
  step: 1,
  lowLabel: "Needs improvement",
  highLabel: "Outstanding",
};

const SUPPORTED_EVALUATOR_TYPES: EvaluatorType[] = [
  "self",
  "manager",
  "peer",
  "direct_report",
  "client",
  "custom",
];

const QUESTION_KINDS = new Set([
  "rating",
  "metric",
  "text",
  "boolean",
  "select",
]);

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

const unique = <T,>(items: T[]) => Array.from(new Set(items));

const asRecord = (value: unknown): Record<string, any> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};

const normalizeEvaluatorTypes = (
  value: unknown,
  fallback: EvaluatorType[]
): EvaluatorType[] => {
  const raw = Array.isArray(value) ? value : fallback;
  const resolved = raw
    .map((entry) => String(entry || "").trim().toLowerCase())
    .filter((entry): entry is EvaluatorType =>
      SUPPORTED_EVALUATOR_TYPES.includes(entry as EvaluatorType)
    );
  return resolved.length > 0 ? unique(resolved) : unique(fallback);
};

const normalizeRatingScale = (value: unknown): EvaluationRatingScale => {
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
  input: unknown,
  sectionId: string,
  index: number,
  fallbackEvaluatorTypes: EvaluatorType[]
): EvaluationQuestionItem => {
  const payload = asRecord(input);
  const metricSource = asRecord(payload.metricSource || payload.metric_source);
  const kindCandidate = String(
    payload.kind || payload.type || (Object.keys(metricSource).length ? "metric" : "rating")
  ).toLowerCase();
  const kind = QUESTION_KINDS.has(kindCandidate)
    ? (kindCandidate as EvaluationQuestionItem["kind"])
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
      `${sectionId}_${slugify(label)}_${index + 1}`,
    label: String(label),
    description: payload.description ? String(payload.description) : undefined,
    kind,
    required:
      payload.required === undefined
        ? kind !== "text"
        : Boolean(payload.required),
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
      ? payload.options.map((option: unknown) => String(option))
      : undefined,
    placeholder: payload.placeholder ? String(payload.placeholder) : undefined,
    allowComment:
      payload.allowComment === undefined
        ? kind === "rating" || kind === "metric"
        : Boolean(payload.allowComment),
    metricSource:
      kind === "metric"
        ? {
            type: String(metricSource.type || "custom") as any,
            id: metricSource.id,
            name: String(metricSource.name || label),
            category: metricSource.category ? String(metricSource.category) : undefined,
            unit: metricSource.unit ? String(metricSource.unit) : undefined,
            targetValue: toNumber(metricSource.targetValue, undefined),
          }
        : undefined,
  };
};

export const normalizeEvaluationQuestions = (
  value: unknown,
  options?: {
    fallbackTitle?: string;
    evaluatorTypes?: EvaluatorType[];
  }
): EvaluationQuestionSection[] => {
  const fallbackEvaluatorTypes: EvaluatorType[] = options?.evaluatorTypes?.length
    ? options.evaluatorTypes
    : ["manager"];
  const source = Array.isArray(value) ? value : [];
  const isSectionArray = source.every(
    (item) =>
      item &&
      typeof item === "object" &&
      Array.isArray((item as Record<string, unknown>).items)
  );

  if (isSectionArray) {
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
        const items = Array.isArray(payload.items)
          ? payload.items.map((item, itemIndex) =>
              normalizeQuestionItem(
                item,
                sectionId,
                itemIndex,
                normalizeEvaluatorTypes(
                  payload.evaluatorTypes || payload.evaluator_types,
                  fallbackEvaluatorTypes
                )
              )
            )
          : [];

        return {
          id: sectionId,
          title: String(title),
          description: payload.description ? String(payload.description) : undefined,
          weight: toNumber(payload.weight, undefined),
          evaluatorTypes: normalizeEvaluatorTypes(
            payload.evaluatorTypes || payload.evaluator_types,
            fallbackEvaluatorTypes
          ),
          items,
        };
      })
      .filter((section) => section.items.length > 0);
  }

  if (source.length === 0) {
    return [];
  }

  const defaultSectionId = `section_${slugify(options?.fallbackTitle || "evaluation")}`;
  return [
    {
      id: defaultSectionId,
      title: options?.fallbackTitle || "Evaluation Metrics",
      evaluatorTypes: fallbackEvaluatorTypes,
      items: source.map((entry, index) =>
        normalizeQuestionItem(entry, defaultSectionId, index, fallbackEvaluatorTypes)
      ),
    },
  ];
};

export const getEnabledEvaluatorTypes = (
  definition?: Partial<EvaluationDefinition> | null
): EvaluatorType[] => {
  if (!definition) return [] as EvaluatorType[];
  const explicit: EvaluatorType[] = Array.isArray(definition.enabledEvaluatorTypes)
    ? normalizeEvaluatorTypes(definition.enabledEvaluatorTypes, ["manager"])
    : [];
  if (explicit.length > 0) return explicit;

  const resolved: EvaluatorType[] = [];
  if (definition.enableSelfEvaluation) resolved.push("self");
  if (definition.enableDownwardEvaluation) resolved.push("manager");
  if (definition.enablePeerEvaluation) resolved.push("peer");
  if (definition.enableUpwardEvaluation) resolved.push("direct_report");
  if (definition.enableClientEvaluation) resolved.push("client");
  return resolved;
};

export const getWorkflowConfig = (
  definition?: Partial<EvaluationDefinition> | null
): EvaluationWorkflowConfig => {
  const enabledEvaluatorTypes = getEnabledEvaluatorTypes(definition);
  const current = asRecord(definition?.scoringConfig?.evaluationWorkflow);
  const evaluatorMix = asRecord(current.evaluatorMix || current.evaluator_mix);
  return {
    remindersEnabled:
      current.remindersEnabled === undefined ? true : Boolean(current.remindersEnabled),
    reminderCadence:
      current.reminderCadence === "daily" ||
      current.reminderCadence === "custom"
        ? current.reminderCadence
        : "weekly",
    schedules: Array.isArray(current.schedules)
      ? current.schedules
          .map((entry) => {
            const row = asRecord(entry);
            const evaluatorType = String(
              row.evaluatorType || row.evaluator_type || ""
            ) as EvaluatorType;
            if (!SUPPORTED_EVALUATOR_TYPES.includes(evaluatorType)) return null;
            return {
              evaluatorType,
              opensAt: row.opensAt || row.opens_at,
              dueAt: row.dueAt || row.due_at,
            };
          })
          .filter(Boolean) as EvaluationWorkflowConfig["schedules"]
      : enabledEvaluatorTypes.map((evaluatorType) => ({
          evaluatorType,
          dueAt: definition?.dueDate,
        })),
    evaluatorMix: Object.fromEntries(
      SUPPORTED_EVALUATOR_TYPES.map((type) => [
        type,
        evaluatorMix[type] === undefined
          ? enabledEvaluatorTypes.includes(type)
          : Boolean(evaluatorMix[type]),
      ])
    ),
    launchSummary: current.launchSummary ? String(current.launchSummary) : undefined,
  };
};

export const summarizeEvaluationSections = (sections: EvaluationQuestionSection[]) => {
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

export const buildQuestionsFromKpis = (
  selectedKpis: Array<{ kpi_id: string; weight: number }>,
  kpis: Array<{ id: string; name: string; category?: string | null }>
): EvaluationQuestionSection[] => {
  if (selectedKpis.length === 0) return [];

  return [
    {
      id: "performance_metrics",
      title: "Metrics / Result Areas / KPIs",
      description: "Score each KPI or result area against its expected delivery level.",
      weight: 60,
      evaluatorTypes: ["self", "manager", "peer", "direct_report"],
      items: selectedKpis
        .map(({ kpi_id, weight }) => {
          const kpi = kpis.find((entry) => String(entry.id) === String(kpi_id));
          if (!kpi) return null;
          return {
            id: `kpi_${kpi.id}`,
            label: kpi.name,
            description: kpi.category ? `Category: ${kpi.category}` : undefined,
            kind: "metric" as const,
            required: true,
            weight: weight || undefined,
            evaluatorTypes: ["self", "manager", "peer", "direct_report"],
            allowComment: true,
            ratingScale: DEFAULT_RATING_SCALE,
            metricSource: {
              type: "kpi" as const,
              id: kpi.id,
              name: kpi.name,
              category: kpi.category || undefined,
            },
          };
        })
        .filter(Boolean) as EvaluationQuestionItem[],
    },
  ];
};

export const buildTemplateSections = (
  template: any,
  fallbackEvaluatorTypes: EvaluatorType[]
): EvaluationQuestionSection[] => {
  const questions = normalizeEvaluationQuestions(template?.questions, {
    fallbackTitle: template?.name || "Template Questions",
    evaluatorTypes: fallbackEvaluatorTypes,
  });
  if (questions.length > 0) {
    return questions;
  }

  if (!Array.isArray(template?.competencies)) {
    return [];
  }

  return [
    {
      id: "competencies",
      title: "Competencies",
      description: "Core capabilities to be rated during the evaluation.",
      weight: 40,
      evaluatorTypes: fallbackEvaluatorTypes,
      items: template.competencies.map((entry: any, index: number) =>
        normalizeQuestionItem(
          {
            id: `competency_${slugify(String(entry?.name || entry || index + 1))}`,
            label: entry?.name || entry?.title || String(entry),
            description: entry?.description,
            kind: "rating",
            weight: entry?.weight,
            allowComment: true,
          },
          "competencies",
          index,
          fallbackEvaluatorTypes
        )
      ),
    },
  ];
};

export const buildDefaultEvaluationSections = ({
  template,
  selectedKpis,
  kpis,
  enabledEvaluatorTypes,
}: {
  template?: any;
  selectedKpis: Array<{ kpi_id: string; weight: number }>;
  kpis: Array<{ id: string; name: string; category?: string | null }>;
  enabledEvaluatorTypes: EvaluatorType[];
}): EvaluationQuestionSection[] => {
  const sections: EvaluationQuestionSection[] = [];
  sections.push(...buildTemplateSections(template, enabledEvaluatorTypes));
  sections.push(...buildQuestionsFromKpis(selectedKpis, kpis));

  if (sections.length === 0) {
    sections.push({
      id: "core_performance",
      title: "Core Performance",
      description: "Baseline competency ratings for this evaluation.",
      weight: 70,
      evaluatorTypes: enabledEvaluatorTypes,
      items: [
        {
          id: "overall_delivery",
          label: "Overall delivery quality",
          description: "How effectively did the employee deliver against expectations?",
          kind: "rating",
          required: true,
          weight: 50,
          evaluatorTypes: enabledEvaluatorTypes,
          ratingScale: DEFAULT_RATING_SCALE,
          allowComment: true,
        },
        {
          id: "collaboration_effectiveness",
          label: "Collaboration and teamwork",
          kind: "rating",
          required: true,
          weight: 50,
          evaluatorTypes: enabledEvaluatorTypes,
          ratingScale: DEFAULT_RATING_SCALE,
          allowComment: true,
        },
      ],
    });
  }

  sections.push({
    id: "development_feedback",
    title: "Development and Comments",
    description: "Capture qualitative feedback and recommendations.",
    weight: 0,
    evaluatorTypes: enabledEvaluatorTypes,
    items: [
      {
        id: "strengths_comment",
        label: "Key strengths",
        kind: "text",
        required: false,
        evaluatorTypes: enabledEvaluatorTypes,
        placeholder: "What should this employee continue doing?",
      },
      {
        id: "development_actions",
        label: "Development actions",
        kind: "text",
        required: false,
        evaluatorTypes: enabledEvaluatorTypes,
        placeholder: "What should improve before the next cycle?",
      },
    ],
  });

  return sections;
};

const readNumericValue = (
  response: EvaluationItemResponse | number | string | boolean | undefined
) => {
  if (typeof response === "number") return response;
  if (response && typeof response === "object") {
    if (typeof response.score === "number") return response.score;
    if (typeof response.value === "number") return response.value;
  }
  return undefined;
};

export const calculateAssignmentScore = (
  sections: EvaluationQuestionSection[],
  responses: Record<string, EvaluationItemResponse>
) => {
  let totalWeightedScore = 0;
  let totalWeight = 0;

  sections.forEach((section) => {
    section.items.forEach((item) => {
      const numericValue = readNumericValue(responses[item.id]);
      if (numericValue === undefined) return;
      const scale = item.ratingScale || DEFAULT_RATING_SCALE;
      const normalized = clamp((numericValue / Math.max(scale.max || 5, 1)) * 100, 0, 100);
      const weight = item.weight ?? 1;
      totalWeightedScore += normalized * weight;
      totalWeight += weight;
    });
  });

  if (totalWeight === 0) return undefined;
  return Number((totalWeightedScore / totalWeight).toFixed(2));
};

export const getResponseValue = (response: EvaluationItemResponse | undefined) => {
  if (!response) return undefined;
  if (response.value !== undefined) return response.value;
  if (response.score !== undefined) return response.score;
  return undefined;
};
