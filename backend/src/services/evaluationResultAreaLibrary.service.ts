import { EvaluationQuestionCategory } from "@prisma/client";

export type EvaluationResultAreaLibraryItem = {
  id: string;
  name: string;
  description: string;
  category: EvaluationQuestionCategory;
  domain: string;
  roleFamily: string;
  evaluatorTypes: string[];
  weight: number;
  order: number;
};

const DOMAINS = [
  "Audit and Assurance",
  "Tax Advisory",
  "Client Accounting",
  "Payroll Services",
  "Bookkeeping",
  "Financial Reporting",
  "Internal Controls",
  "Risk Advisory",
  "Compliance",
  "Forensics",
  "Business Advisory",
  "Corporate Finance",
  "Transaction Support",
  "Data Analytics",
  "Technology Consulting",
  "Project Delivery",
  "Client Relationship Management",
  "Practice Management",
  "People Management",
  "Learning and Development",
  "Quality Management",
  "Revenue Operations",
  "Marketing and Growth",
  "Procurement",
  "Administration",
  "Legal Coordination",
  "Treasury",
  "Sustainability Reporting",
  "Governance",
  "Strategy Execution",
];

const THEMES = [
  { text: "Technical accuracy", category: "competency" },
  { text: "Timely delivery", category: "competency" },
  { text: "Client communication", category: "behavior" },
  { text: "Issue escalation", category: "behavior" },
  { text: "Workpaper quality", category: "competency" },
  { text: "Data integrity", category: "competency" },
  { text: "Professional judgement", category: "competency" },
  { text: "Team collaboration", category: "behavior" },
  { text: "Ownership and accountability", category: "culture" },
  { text: "Commercial awareness", category: "competency" },
  { text: "Process improvement", category: "behavior" },
  { text: "Knowledge sharing", category: "culture" },
  { text: "Planning discipline", category: "competency" },
  { text: "Stakeholder management", category: "behavior" },
  { text: "Risk identification", category: "competency" },
  { text: "Documentation completeness", category: "competency" },
  { text: "Ethical conduct", category: "culture" },
  { text: "Coaching effectiveness", category: "behavior" },
  { text: "Innovation and automation", category: "behavior" },
  { text: "Quality review readiness", category: "competency" },
] satisfies Array<{ text: string; category: EvaluationQuestionCategory }>;

const CONTEXTS = [
  "core responsibilities",
  "client engagements",
  "team workflows",
  "manager review",
  "continuous improvement",
];

const ROLE_FAMILIES = [
  "Associate",
  "Senior Associate",
  "Manager",
  "Senior Manager",
  "Director",
  "Partner",
];

const EVALUATOR_MIXES = [
  ["manager"],
  ["self", "manager"],
  ["manager", "peer"],
  ["manager", "direct_report"],
  ["manager", "client"],
];

const csvEscape = (value: unknown) => {
  const text = String(value ?? "");
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
};

export const buildEvaluationResultAreaLibrary = (): EvaluationResultAreaLibraryItem[] => {
  const items: EvaluationResultAreaLibraryItem[] = [];

  DOMAINS.forEach((domain, domainIndex) => {
    THEMES.forEach((theme, themeIndex) => {
      CONTEXTS.forEach((context, contextIndex) => {
        const order = items.length + 1;
        const roleFamily = ROLE_FAMILIES[(domainIndex + themeIndex + contextIndex) % ROLE_FAMILIES.length];
        const evaluatorTypes = EVALUATOR_MIXES[(themeIndex + contextIndex) % EVALUATOR_MIXES.length];
        const weight = Number((1 + ((domainIndex + themeIndex + contextIndex) % 5) * 0.1).toFixed(1));
        const id = `ra-${String(order).padStart(4, "0")}`;

        items.push({
          id,
          name: `${theme.text} in ${context}`,
          description: `${domain} result area for ${roleFamily.toLowerCase()} performance expectations.`,
          category: theme.category,
          domain,
          roleFamily,
          evaluatorTypes,
          weight,
          order,
        });
      });
    });
  });

  return items;
};

const LIBRARY = buildEvaluationResultAreaLibrary();

export const searchEvaluationResultAreaLibrary = (params?: {
  search?: string;
  category?: string;
  domain?: string;
  roleFamily?: string;
  limit?: number;
  offset?: number;
}) => {
  const search = String(params?.search || "").trim().toLowerCase();
  const category = String(params?.category || "").trim().toLowerCase();
  const domain = String(params?.domain || "").trim().toLowerCase();
  const roleFamily = String(params?.roleFamily || "").trim().toLowerCase();
  const limit = Math.min(Math.max(Number(params?.limit || 50), 1), 500);
  const offset = Math.max(Number(params?.offset || 0), 0);

  const filtered = LIBRARY.filter((item) => {
    if (category && item.category !== category) return false;
    if (domain && item.domain.toLowerCase() !== domain) return false;
    if (roleFamily && item.roleFamily.toLowerCase() !== roleFamily) return false;
    if (!search) return true;
    const haystack = [
      item.name,
      item.description,
      item.category,
      item.domain,
      item.roleFamily,
      item.evaluatorTypes.join(" "),
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(search);
  });

  return {
    total: filtered.length,
    limit,
    offset,
    items: filtered.slice(offset, offset + limit),
    facets: {
      domains: DOMAINS,
      roleFamilies: ROLE_FAMILIES,
      categories: ["competency", "behavior", "culture"],
    },
  };
};

export const resultAreaLibraryToQuestions = (
  items: EvaluationResultAreaLibraryItem[]
) =>
  items.map((item, index) => ({
    text: item.name,
    category: item.category,
    weight: item.weight,
    order: index + 1,
  }));

export const resultAreaLibraryToCsv = (items = LIBRARY) => {
  const headers = [
    "id",
    "name",
    "description",
    "category",
    "domain",
    "roleFamily",
    "evaluatorTypes",
    "weight",
    "order",
  ];
  const rows = items.map((item) =>
    [
      item.id,
      item.name,
      item.description,
      item.category,
      item.domain,
      item.roleFamily,
      item.evaluatorTypes.join("|"),
      item.weight,
      item.order,
    ]
      .map(csvEscape)
      .join(",")
  );
  return [headers.join(","), ...rows].join("\n");
};

export const parseResultAreaImportPayload = (payload: unknown) => {
  const input = payload && typeof payload === "object" ? (payload as Record<string, any>) : {};
  const source = Array.isArray(input.questions)
    ? input.questions
    : Array.isArray(input.resultAreas)
      ? input.resultAreas
      : Array.isArray(input.items)
        ? input.items
        : [];

  return source
    .map((entry: unknown, index: number) => {
      const row = entry && typeof entry === "object" ? (entry as Record<string, any>) : {};
      const text = String(row.text || row.name || row.label || row.title || "").trim();
      if (!text) return null;
      const category = String(row.category || "competency").toLowerCase();
      return {
        text,
        category: ["competency", "behavior", "culture"].includes(category)
          ? (category as EvaluationQuestionCategory)
          : "competency",
        weight: Number(row.weight) > 0 ? Number(row.weight) : 1,
        order: Number(row.order) > 0 ? Number(row.order) : index + 1,
      };
    })
    .filter(Boolean);
};
