export type OnboardingPolicyDefinition = {
  slug: string;
  title: string;
  summary: string;
  content: string;
  sectionKey: string;
  sectionLabel: string;
  orderIndex: number;
};

type SourceItem = {
  title: string;
  summary: string;
};

const toSlug = (value: string) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

const buildDefaultContent = (title: string, summary: string) =>
  [
    `${title}`,
    "",
    `Purpose`,
    `${summary}`,
    "",
    `What employees should review`,
    `- Read the guidance carefully and understand how it applies to your role.`,
    `- Raise any questions with HR or your manager before marking the item complete.`,
    `- Follow the standards in day-to-day work once onboarding is complete.`,
    "",
    `Employee acknowledgement`,
    `By marking this onboarding item complete, the employee confirms that the policy or guidance has been reviewed and understood.`,
  ].join("\n");

const buildSectionDefinitions = (
  sectionKey: string,
  sectionLabel: string,
  items: SourceItem[],
  startOrder: number
): OnboardingPolicyDefinition[] =>
  items.map((item, index) => ({
    slug: toSlug(item.title),
    title: item.title,
    summary: item.summary,
    content: buildDefaultContent(item.title, item.summary),
    sectionKey,
    sectionLabel,
    orderIndex: startOrder + index,
  }));

const firmOrientationDefinitions = buildSectionDefinitions(
  "firm_orientation",
  "About the Firm",
  [
    { title: "History of the firm", summary: "Take the employee through the history of the firm." },
    { title: "Vision", summary: "Brief the employee on the firm's vision." },
    { title: "Mission", summary: "Brief the employee on the firm's mission." },
    { title: "Firm services", summary: "Explain the firm's service lines and client work." },
    {
      title: "Organisation structure and departments",
      summary: "Review organisation structure, departments, and reporting lines.",
    },
    {
      title: "Management team introduction",
      summary: "Introduce partners, team leaders, and key contacts.",
    },
    { title: "Firm culture", summary: "Explain the culture, behaviours, and expected standards." },
    { title: "Culture manual", summary: "Share and explain the culture manual." },
    { title: "Time management", summary: "Review expected time management discipline." },
    { title: "Dress code", summary: "Review the firm's dress code expectations." },
    { title: "Email and phone etiquette", summary: "Explain professional communication standards." },
    {
      title: "Brand book and guidelines",
      summary: "Review brand standards and presentation expectations.",
    },
    { title: "Laptop policy", summary: "Review device handling and laptop policy." },
  ],
  1
);

const hrPolicyDefinitions = buildSectionDefinitions(
  "hr_policies",
  "HR Policies",
  [
    {
      title: "Recruitment and selection procedure",
      summary: "Walk through the recruitment policy context.",
    },
    {
      title: "Employee onboarding procedure",
      summary: "Explain how onboarding is governed internally.",
    },
    {
      title: "Attendance and time management",
      summary: "Cover attendance rules and time discipline.",
    },
    {
      title: "Staff training procedure",
      summary: "Explain learning and training expectations.",
    },
    {
      title: "Timesheets and workflow management system",
      summary: "Introduce Xero Practice Manager and timesheet expectations.",
    },
    {
      title: "Staff disciplinary procedure",
      summary: "Review disciplinary procedures and standards.",
    },
    {
      title: "Leave management procedure",
      summary: "Review leave approval rules and timelines.",
    },
    {
      title: "Leave management system",
      summary: "Introduce Wingubox or the active leave system.",
    },
    {
      title: "Employee separation procedure",
      summary: "Explain separation and exit process rules.",
    },
    {
      title: "Data protection policy",
      summary: "Review data privacy and data handling obligations.",
    },
    {
      title: "Confidentiality and non-disclosure policy",
      summary: "Review confidentiality obligations.",
    },
    {
      title: "Anti-money laundering policy",
      summary: "Review AML obligations and escalation expectations.",
    },
    {
      title: "Sexual harassment policy",
      summary: "Review anti-harassment policy and reporting channels.",
    },
  ],
  100
);

const financeDefinitions = buildSectionDefinitions(
  "finance_policies",
  "Finance Policies",
  [
    {
      title: "Travel allowances and expenses policy",
      summary: "Review travel and expense rules.",
    },
    {
      title: "Petty cash management policy",
      summary: "Explain petty cash request and control rules.",
    },
    {
      title: "Disbursement policy",
      summary: "Review disbursement controls and approvals.",
    },
  ],
  200
);

const performanceDefinitions = buildSectionDefinitions(
  "performance_management",
  "Performance Management",
  [
    {
      title: "Performance expectations",
      summary: "Introduce performance expectations and ownership.",
    },
    {
      title: "Performance appraisals",
      summary: "Explain evaluation and appraisal cadence.",
    },
    {
      title: "Rewards and performance consequences",
      summary: "Review reward, consequence, and accountability rules.",
    },
    {
      title: "Performance management policy",
      summary: "Review the performance management policy.",
    },
    {
      title: "Performance management system",
      summary: "Introduce the performance management system and required usage.",
    },
  ],
  300
);

export const DEFAULT_ONBOARDING_POLICY_DEFINITIONS: OnboardingPolicyDefinition[] = [
  ...firmOrientationDefinitions,
  ...hrPolicyDefinitions,
  ...financeDefinitions,
  ...performanceDefinitions,
];

const definitionBySlug = new Map(
  DEFAULT_ONBOARDING_POLICY_DEFINITIONS.map((definition) => [definition.slug, definition])
);

const definitionByChecklistKey = new Map(
  DEFAULT_ONBOARDING_POLICY_DEFINITIONS.map((definition) => [
    `${definition.sectionKey}:${toSlug(definition.title)}`,
    definition,
  ])
);

export const onboardingPolicyPath = (slug: string) => `/onboarding-policies/${slug}`;

export const findOnboardingPolicyDefinitionBySlug = (slug: string) =>
  definitionBySlug.get(toSlug(slug)) || null;

export const findOnboardingPolicyDefinitionForChecklistItem = (
  sectionKey?: string | null,
  itemName?: string | null
) => {
  const key = `${String(sectionKey || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_")}:${toSlug(String(itemName || ""))}`;
  return definitionByChecklistKey.get(key) || null;
};

export const buildDefaultOnboardingPolicyChecklistItems = () =>
  DEFAULT_ONBOARDING_POLICY_DEFINITIONS.map((definition) => ({
    itemName: definition.title,
    description: definition.summary,
    itemType: "policy_link" as const,
    resourceUrl: onboardingPolicyPath(definition.slug),
    sectionKey: definition.sectionKey,
    sectionLabel: definition.sectionLabel,
    ownerRole: "employee",
  }));
