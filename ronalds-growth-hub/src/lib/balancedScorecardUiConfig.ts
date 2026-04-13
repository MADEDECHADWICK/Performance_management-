import type { LucideIcon } from "lucide-react";
import {
  Activity,
  BarChart3,
  Briefcase,
  Calendar,
  CheckCircle2,
  CircleAlert,
  ClipboardCheck,
  FileText,
  Flag,
  Layers,
  LineChart,
  MessageSquare,
  ShieldCheck,
  Target,
  Users,
  Workflow,
} from "lucide-react";

export type StatusTone = "on_track" | "at_risk" | "off_track";
export type RoleKey =
  | "hr"
  | "gmp"
  | "partner"
  | "manager"
  | "finance"
  | "marketing"
  | "employee";
export type PerspectiveKey = "financial" | "customer" | "internal" | "people";
export type SetupSheetMode =
  | "flow"
  | "governance"
  | "createPerspective"
  | "editPerspective"
  | "createGoal"
  | null;
export type KpiSheetMode = "contract" | "rules" | "createKpi" | "createInitiative" | null;

export type RoleProfile = {
  label: string;
  subtitle: string;
  scope: string;
  primaryAction: string;
  focus: string[];
};

export type RoleHomeMetric = {
  label: string;
  value: string;
  hint: string;
  icon: LucideIcon;
};

export type RoleBoardItem = {
  label: string;
  value: string;
  note: string;
  status?: StatusTone;
  progress?: number;
};

export type RoleHomeConfig = {
  title: string;
  description: string;
  primaryBoardTitle: string;
  primaryBoardDescription: string;
  primaryBoardItems: RoleBoardItem[];
  secondaryBoardTitle: string;
  secondaryBoardDescription: string;
  secondaryBoardItems: RoleBoardItem[];
  allowedActions: string[];
  hiddenByDefault: string[];
  metrics: RoleHomeMetric[];
};

export type WorkflowCard = {
  id: string;
  title: string;
  owner: string;
  summary: string;
  dueDate: string;
  timeline: string;
  badge: string;
  status: StatusTone;
  progress: number;
};

export type ReviewPointGroup = {
  title: string;
  lines: string[];
};

export type WorkflowStep = {
  step: string;
  title: string;
  body: string;
  icon: LucideIcon;
};

export const roleProfiles: Record<RoleKey, RoleProfile> = {
  hr: {
    label: "HR / Admin",
    subtitle: "Owns the BSC structure, KPI definitions, and firm-wide initiatives.",
    scope: "Firm-wide strategy design and governance",
    primaryAction: "Create strategic goal",
    focus: ["Define perspectives", "Link goals to KPIs", "Launch firm initiatives"],
  },
  gmp: {
    label: "GMP",
    subtitle: "Validates strategy execution and drives executive sponsorship across the firm.",
    scope: "Executive oversight and sponsor cadence",
    primaryAction: "Review cascade health",
    focus: ["Approve top initiatives", "Track retention risk", "Remove executive blockers"],
  },
  partner: {
    label: "Partner",
    subtitle:
      "Creates aligned portfolio initiatives and turns strategic KPIs into practice-level plans.",
    scope: "Portfolio ownership and cross-practice growth",
    primaryAction: "Create partner initiative",
    focus: ["Own key accounts", "Convert opportunities", "Monitor practice delivery signals"],
  },
  manager: {
    label: "Manager",
    subtitle:
      "Translates partner plans into team deliverables, work cadence, and employee action ownership.",
    scope: "Department execution and staff accountability",
    primaryAction: "Assign team deliverable",
    focus: ["Set employee actions", "Monitor weekly delivery", "Coach against target"],
  },
  finance: {
    label: "Finance",
    subtitle:
      "Owns financial KPI inputs, actuals, and finance-led initiative commentary for the scorecard.",
    scope: "Financial performance and period-close support",
    primaryAction: "Update financial actuals",
    focus: ["Maintain realization data", "Track collections and margin", "Support close review"],
  },
  marketing: {
    label: "Marketing",
    subtitle:
      "Owns customer growth inputs, pipeline signals, and marketing-led initiatives linked to stakeholder KPIs.",
    scope: "Customer growth and brand execution support",
    primaryAction: "Update growth initiative",
    focus: ["Track retention signals", "Support cross-sell conversion", "Update client insight inputs"],
  },
  employee: {
    label: "Employee",
    subtitle:
      "Sees assigned contributions, acknowledges work, updates progress, and understands upward roll-up.",
    scope: "Personal contribution and execution clarity",
    primaryAction: "Update my contribution",
    focus: ["Acknowledge assigned actions", "Track progress", "See how work rolls up"],
  },
};

export const rolePerspectiveScope: Record<RoleKey, PerspectiveKey[]> = {
  hr: ["financial", "customer", "internal", "people"],
  gmp: ["financial", "customer", "internal", "people"],
  partner: ["financial", "customer", "internal"],
  manager: ["internal", "people"],
  finance: ["financial"],
  marketing: ["customer"],
  employee: ["internal", "people"],
};

export const roleHomeConfigs: Record<RoleKey, RoleHomeConfig> = {
  hr: {
    title: "Strategy & Governance",
    description: "Own the scorecard design, KPI governance, and firm-level initiative launch.",
    primaryBoardTitle: "Governance queue",
    primaryBoardDescription: "What HR should control inside the KPI engine.",
    primaryBoardItems: [
      {
        label: "Perspective setup",
        value: "4 active perspectives",
        note: "Financial, customer, internal process, and people are live in the current cycle.",
        status: "on_track",
        progress: 100,
      },
      {
        label: "Strategic goals",
        value: "8 active goals",
        note: "Two goals per perspective are already mapped to measurable KPIs.",
        status: "on_track",
        progress: 100,
      },
      {
        label: "Firm initiatives",
        value: "4 ready for cascade",
        note: "One initiative still needs sharper due-date governance before launch.",
        status: "at_risk",
        progress: 82,
      },
    ],
    secondaryBoardTitle: "What HR can do",
    secondaryBoardDescription: "Actions reserved for the strategy owner.",
    secondaryBoardItems: [
      {
        label: "Create and edit BSC structure",
        value: "Allowed",
        note: "Perspectives, goals, owners, descriptions, and cycle structure.",
      },
      {
        label: "Define KPI contracts",
        value: "Allowed",
        note: "Targets, weights, frequency, status logic, and KPI ownership.",
      },
      {
        label: "Launch and close cycles",
        value: "Allowed",
        note: "Start the cascade, review readiness, and lock review periods.",
      },
    ],
    allowedActions: [
      "Create perspectives",
      "Create strategic goals",
      "Define KPI contracts",
      "Launch firm initiatives",
      "Close review period",
    ],
    hiddenByDefault: [
      "Employee task-level noise",
      "Manager daily action detail",
      "Unrelated client execution drilldowns",
    ],
    metrics: [
      { label: "Perspectives live", value: "4", hint: "Full BSC structure under HR governance.", icon: Layers },
      { label: "Goals governed", value: "8", hint: "Strategic goals remain firm-owned.", icon: Flag },
      { label: "KPIs defined", value: "10", hint: "Each KPI is linked to a goal and owner.", icon: Target },
      { label: "Cycles ready", value: "1 active", hint: "One scorecard cycle ready for cascade and close.", icon: Calendar },
    ],
  },
  gmp: {
    title: "Executive Review",
    description:
      "See the executive scorecard, approve firm initiatives, and intervene on strategic risk.",
    primaryBoardTitle: "Executive attention",
    primaryBoardDescription: "The items GMP should act on first.",
    primaryBoardItems: [
      {
        label: "Firm initiative approvals",
        value: "3 awaiting decision",
        note: "Review sponsor clarity, risk, and alignment before release.",
        status: "at_risk",
        progress: 64,
      },
      {
        label: "Strategic risk items",
        value: "2 red / amber goals",
        note: "Client retention and coaching discipline need executive attention this month.",
        status: "at_risk",
        progress: 58,
      },
      {
        label: "Close review",
        value: "1 snapshot pending",
        note: "Quarter close commentary is ready for executive review.",
        status: "on_track",
        progress: 88,
      },
    ],
    secondaryBoardTitle: "What GMP can do",
    secondaryBoardDescription: "Executive steering, not structural admin.",
    secondaryBoardItems: [
      {
        label: "Approve or reject firm initiatives",
        value: "Allowed",
        note: "Validate execution direction before the cascade moves further down.",
      },
      {
        label: "Add GMP initiatives",
        value: "Allowed",
        note: "Add executive sponsor actions that support the same KPI outcome.",
      },
      {
        label: "Escalate blockers",
        value: "Allowed",
        note: "Force action on cross-practice issues hurting strategic KPI performance.",
      },
    ],
    allowedActions: [
      "Approve firm initiatives",
      "Add GMP initiatives",
      "Escalate blockers",
      "Review close snapshot",
      "Comment on strategic risk",
    ],
    hiddenByDefault: [
      "KPI formula editor",
      "Employee action grid",
      "Detailed creation forms for every role layer",
    ],
    metrics: [
      { label: "Approval queue", value: "3", hint: "Firm initiatives awaiting executive decision.", icon: ShieldCheck },
      { label: "At-risk goals", value: "2", hint: "Goals that need intervention, not just more updates.", icon: CircleAlert },
      { label: "Cascade health", value: "74%", hint: "Average roll-down health across the active scorecard.", icon: Workflow },
      { label: "Next review", value: "Q2 close", hint: "Snapshot and commentary pack prepared for executive review.", icon: FileText },
    ],
  },
  partner: {
    title: "Portfolio Cascade Board",
    description:
      "Turn approved strategic initiatives into portfolio and account-level execution plans.",
    primaryBoardTitle: "Portfolio workspace",
    primaryBoardDescription: "What the partner needs to run the portfolio view.",
    primaryBoardItems: [
      {
        label: "Partner initiatives",
        value: "5 active",
        note: "Each initiative maps to an approved parent KPI and account-growth objective.",
        status: "on_track",
        progress: 73,
      },
      {
        label: "Manager alignment",
        value: "3 managers on plan",
        note: "One manager needs a clearer deliverable contract for the retention programme.",
        status: "at_risk",
        progress: 69,
      },
      {
        label: "Client/account risk",
        value: "2 accounts flagged",
        note: "Cross-practice opportunity movement is slower than target in two strategic accounts.",
        status: "at_risk",
        progress: 61,
      },
    ],
    secondaryBoardTitle: "What Partner can do",
    secondaryBoardDescription: "Portfolio execution actions.",
    secondaryBoardItems: [
      {
        label: "Create partner initiatives",
        value: "Allowed",
        note: "Translate the parent initiative into portfolio-level account plans.",
      },
      {
        label: "Push work to managers",
        value: "Allowed",
        note: "Assign manager deliverables and expected delivery windows.",
      },
      {
        label: "Comment and escalate",
        value: "Allowed",
        note: "Flag risk and request action on lagging manager-owned execution.",
      },
    ],
    allowedActions: [
      "Create partner initiative",
      "Align to parent initiative",
      "Assign manager deliverable",
      "Review account risk",
      "Add portfolio commentary",
    ],
    hiddenByDefault: [
      "Whole-firm setup controls",
      "Unrelated departments",
      "Employee actions outside the partner portfolio",
    ],
    metrics: [
      { label: "Portfolio initiatives", value: "5", hint: "Active partner-owned initiatives under approved parent work.", icon: Briefcase },
      { label: "Manager coverage", value: "4 teams", hint: "Managers currently contributing to portfolio KPIs.", icon: Users },
      { label: "Growth score", value: "71%", hint: "Portfolio-level weighted contribution against the selected KPIs.", icon: BarChart3 },
      { label: "Client risk", value: "2", hint: "Strategic accounts currently flagged as at risk.", icon: CircleAlert },
    ],
  },
  manager: {
    title: "Team Delivery Board",
    description:
      "Convert partner plans into team deliverables, employee actions, and coaching rhythms.",
    primaryBoardTitle: "Delivery board",
    primaryBoardDescription: "The manager's active execution surface.",
    primaryBoardItems: [
      {
        label: "Team deliverables",
        value: "9 active",
        note: "Manager-owned deliverables tied directly to parent partner initiatives.",
        status: "on_track",
        progress: 76,
      },
      {
        label: "Employee action queue",
        value: "14 assigned actions",
        note: "Three actions need acknowledgement and two are overdue for update.",
        status: "at_risk",
        progress: 68,
      },
      {
        label: "Coaching cadence",
        value: "6 of 8 done",
        note: "Coaching completion is lagging the target set under the people perspective.",
        status: "at_risk",
        progress: 75,
      },
    ],
    secondaryBoardTitle: "What Manager can do",
    secondaryBoardDescription: "Team execution and coaching actions.",
    secondaryBoardItems: [
      {
        label: "Assign employee actions",
        value: "Allowed",
        note: "Turn team deliverables into clear employee contribution items.",
      },
      {
        label: "Update deliverables",
        value: "Allowed",
        note: "Track weekly progress and note blockers early.",
      },
      {
        label: "Coach and comment",
        value: "Allowed",
        note: "Use notes to explain performance movement and next actions.",
      },
    ],
    allowedActions: [
      "Create team deliverable",
      "Assign employee action",
      "Update progress",
      "Add coaching note",
      "Flag blocker",
    ],
    hiddenByDefault: [
      "BSC setup controls",
      "Firm-wide executive queue",
      "Other partners' portfolios",
    ],
    metrics: [
      { label: "Deliverables active", value: "9", hint: "Manager-owned delivery items for the current cycle.", icon: ClipboardCheck },
      { label: "Employee actions", value: "14", hint: "Assigned employee contributions needing management attention.", icon: Users },
      { label: "Team contribution", value: "76%", hint: "Weighted contribution of the team to parent KPI outcomes.", icon: Workflow },
      { label: "Overdue items", value: "3", hint: "Actions needing immediate review and follow-up.", icon: CircleAlert },
    ],
  },
  finance: {
    title: "Financial KPI Board",
    description: "Own the financial perspective, actuals, and finance-led initiative commentary.",
    primaryBoardTitle: "Financial lens",
    primaryBoardDescription: "What Finance should see by default.",
    primaryBoardItems: [
      {
        label: "Realization",
        value: "84%",
        note: "Still below target. Discount discipline is improving, but write-offs remain uneven.",
        status: "at_risk",
        progress: 72,
      },
      {
        label: "Collections cycle",
        value: "47 days",
        note: "Needs action across legacy balances and owner follow-through.",
        status: "off_track",
        progress: 61,
      },
      {
        label: "Finance initiatives",
        value: "2 active",
        note: "Recovery and aging actions are mapped to the same financial KPI set.",
        status: "at_risk",
        progress: 53,
      },
    ],
    secondaryBoardTitle: "What Finance can do",
    secondaryBoardDescription: "Finance should own inputs, not the full cascade.",
    secondaryBoardItems: [
      {
        label: "Update KPI actuals",
        value: "Allowed",
        note: "Maintain finance-controlled measurements such as realization and collections.",
      },
      {
        label: "Manage finance initiatives",
        value: "Allowed",
        note: "Own finance-led execution items under firm or partner priorities.",
      },
      {
        label: "Support close review",
        value: "Allowed",
        note: "Add period commentary and review financial KPI movement.",
      },
    ],
    allowedActions: [
      "Update financial actuals",
      "Manage finance initiatives",
      "Add finance commentary",
      "Support period close",
    ],
    hiddenByDefault: [
      "Customer-growth boards",
      "Employee contribution grid",
      "Full strategy authoring controls",
    ],
    metrics: [
      { label: "Financial KPIs", value: "3 core", hint: "Realization, collections, and recovery are in focus.", icon: BarChart3 },
      { label: "Collections risk", value: "47 days", hint: "Current cycle-day performance against target.", icon: Activity },
      { label: "Weighted score", value: "71", hint: "Finance contribution to the financial perspective.", icon: Target },
      { label: "Close tasks", value: "4 open", hint: "Finance-led notes and close items still due.", icon: FileText },
    ],
  },
  marketing: {
    title: "Customer Growth Board",
    description:
      "Own customer/stakeholder inputs, campaign-linked initiatives, and growth commentary.",
    primaryBoardTitle: "Growth lens",
    primaryBoardDescription: "What Marketing should track by default.",
    primaryBoardItems: [
      {
        label: "Retention support",
        value: "88%",
        note: "Retention-related sponsorship inputs are healthy but still below target.",
        status: "at_risk",
        progress: 74,
      },
      {
        label: "Cross-sell conversion",
        value: "32%",
        note: "Proposal quality is solid; handoff into delivery still needs work.",
        status: "at_risk",
        progress: 68,
      },
      {
        label: "Client insight actions",
        value: "4 active",
        note: "Survey follow-up and opportunity nurturing are linked to the same KPI outcome.",
        status: "on_track",
        progress: 71,
      },
    ],
    secondaryBoardTitle: "What Marketing can do",
    secondaryBoardDescription: "Marketing updates the customer-growth lens, not the whole hierarchy.",
    secondaryBoardItems: [
      {
        label: "Update KPI inputs",
        value: "Allowed",
        note: "Maintain client-growth signals that feed the customer perspective.",
      },
      {
        label: "Manage marketing initiatives",
        value: "Allowed",
        note: "Own campaign and client-engagement actions tied to shared KPIs.",
      },
      {
        label: "Add customer commentary",
        value: "Allowed",
        note: "Explain movement in retention, proposal, and feedback indicators.",
      },
    ],
    allowedActions: [
      "Update growth signals",
      "Manage marketing initiatives",
      "Add client commentary",
      "Track survey and pipeline impact",
    ],
    hiddenByDefault: [
      "Financial controls",
      "Manager delivery board",
      "Full employee hierarchy",
    ],
    metrics: [
      { label: "Customer KPIs", value: "3 active", hint: "Retention, conversion, and sponsor-review support.", icon: Users },
      { label: "Cross-sell", value: "32%", hint: "Current conversion against target opportunity movement.", icon: Target },
      { label: "Client insight actions", value: "4", hint: "Open marketing-owned actions linked to customer KPIs.", icon: Workflow },
      { label: "Feedback watch", value: "2 risks", hint: "Signals needing follow-up with partner or manager owners.", icon: MessageSquare },
    ],
  },
  employee: {
    title: "My Contribution",
    description:
      "See what I own, what is due, how I am progressing, and how my work contributes upward.",
    primaryBoardTitle: "My action board",
    primaryBoardDescription: "The lightweight employee workspace.",
    primaryBoardItems: [
      {
        label: "Assigned actions",
        value: "3 active",
        note: "Employee-owned work linked to current team and portfolio initiatives.",
        status: "at_risk",
        progress: 60,
      },
      {
        label: "Acknowledgement",
        value: "2 of 3 done",
        note: "One action still needs acknowledgement before full tracking can begin.",
        status: "at_risk",
        progress: 67,
      },
      {
        label: "Manager notes",
        value: "2 recent comments",
        note: "Coaching notes explain what to improve and what matters most right now.",
        status: "on_track",
        progress: 100,
      },
    ],
    secondaryBoardTitle: "What Employee can do",
    secondaryBoardDescription: "Clear, limited actions for the contributor role.",
    secondaryBoardItems: [
      {
        label: "Acknowledge assigned work",
        value: "Allowed",
        note: "Confirm ownership of the assigned contribution item.",
      },
      {
        label: "Update progress",
        value: "Allowed",
        note: "Maintain progress and add supporting comments or evidence.",
      },
      {
        label: "See upward roll-up",
        value: "Allowed",
        note: "Understand how work feeds the manager, partner, and firm KPI.",
      },
    ],
    allowedActions: [
      "Acknowledge assigned work",
      "Update progress",
      "Add comment or evidence",
      "Track my score",
    ],
    hiddenByDefault: [
      "Full firm hierarchy",
      "Strategy setup pages",
      "Approval queues and unrelated role detail",
    ],
    metrics: [
      { label: "Assigned items", value: "3", hint: "Current contribution items I need to act on.", icon: ClipboardCheck },
      { label: "Progress", value: "60%", hint: "Average progress across my active items.", icon: Activity },
      { label: "My score", value: "64", hint: "Current weighted contribution score.", icon: BarChart3 },
      { label: "Pending ack", value: "1", hint: "Items still waiting for acknowledgement.", icon: CheckCircle2 },
    ],
  },
};

export const strategyReviewPoints: ReviewPointGroup[] = [
  {
    title: "What HR is validating",
    lines: [
      "Goals must belong to the BSC, not to individual employees or departments.",
      "Each perspective should have a small set of goals with clear business language and one named owner.",
      "No initiative should launch until the goal and KPI link is explicit.",
    ],
  },
  {
    title: "What should happen next",
    lines: [
      "Once the scorecard structure is clean, HR moves into KPI governance and firm-initiative launch.",
      "Employees should never arrive here first; they inherit execution through later cascade stages.",
      "This page should feel like strategy authoring, not daily operations.",
    ],
  },
];

export const kpiGovernanceRules = [
  "Every KPI must map back to one strategic goal and one perspective.",
  "Targets and status logic must be explicit before tracking begins.",
  "Ownership belongs to a named role, not a vague team label.",
  "Initiative progress should never be reviewed separately from the KPI it is meant to move.",
];

export const strategyFlowSteps: WorkflowStep[] = [
  {
    step: "01",
    title: "Create perspectives",
    body: "Define the strategic lenses: financial, customer, internal process, and people.",
    icon: Layers,
  },
  {
    step: "02",
    title: "Create strategic goals",
    body: "Add a goal under the correct perspective, with owner, narrative, and expected business outcome.",
    icon: Flag,
  },
  {
    step: "03",
    title: "Link KPIs",
    body: "Attach measurable indicators to each goal with targets, weights, and status logic.",
    icon: Target,
  },
  {
    step: "04",
    title: "Launch initiatives",
    body: "Create firm initiatives that later cascade into role-level execution work.",
    icon: Workflow,
  },
];

export const kpiContractSteps: WorkflowStep[] = [
  {
    step: "01",
    title: "Context",
    body: "Choose the perspective, linked strategic goal, and accountable owner before the KPI is approved.",
    icon: Layers,
  },
  {
    step: "02",
    title: "Measurement contract",
    body: "Set formula, unit, frequency, target, and what counts as a valid source signal.",
    icon: LineChart,
  },
  {
    step: "03",
    title: "Status logic",
    body: "Define on-track, at-risk, and off-track thresholds so the board stays decision-ready.",
    icon: Activity,
  },
  {
    step: "04",
    title: "Execution handoff",
    body: "Attach the KPI to the firm initiative layer so the cascade begins from a governed measurement contract.",
    icon: Workflow,
  },
];

export const moduleTabs = [
  { value: "dashboard", label: "Role Home" },
  { value: "setup", label: "BSC Setup" },
  { value: "kpis", label: "KPI Library" },
  { value: "cascade", label: "Initiative Cascade" },
  { value: "tracking", label: "Performance Tracking" },
  { value: "employee", label: "Employee View" },
  { value: "reports", label: "Reports" },
] as const;

export type ModuleTabValue = (typeof moduleTabs)[number]["value"];

export const roleTabVisibility: Record<RoleKey, ModuleTabValue[]> = {
  hr: ["dashboard", "setup", "kpis", "cascade", "tracking", "employee", "reports"],
  gmp: ["dashboard", "cascade", "tracking", "reports"],
  partner: ["dashboard", "cascade", "tracking", "reports"],
  manager: ["dashboard", "cascade", "tracking", "employee"],
  finance: ["dashboard", "tracking", "reports"],
  marketing: ["dashboard", "cascade", "tracking", "reports"],
  employee: ["dashboard", "employee"],
};

export function getRoleTabLabel(role: RoleKey, value: ModuleTabValue) {
  if (role === "hr") {
    if (value === "setup") return "Strategy Setup";
    if (value === "kpis") return "KPI Governance";
    if (value === "reports") return "Review Packs";
    if (value === "employee") return "Workforce View";
  }
  if (value === "cascade") {
    if (role === "gmp") return "Approval Flow";
    if (role === "partner") return "Portfolio Cascade";
    if (role === "manager") return "Delivery Cascade";
    if (role === "marketing") return "Growth Alignment";
  }
  if (value === "tracking") {
    if (role === "finance") return "Financial Tracking";
    if (role === "marketing") return "Growth Tracking";
    if (role === "manager") return "Team Tracking";
    if (role === "gmp") return "Executive Tracking";
  }
  if (value === "employee") {
    if (role === "employee") return "My Contribution";
    if (role === "manager") return "Team Actions";
    if (role === "hr") return "Workforce View";
  }
  if (value === "reports") {
    if (role === "gmp") return "Executive Review";
    if (role === "partner") return "Portfolio Review";
    if (role === "finance") return "Financial Review";
    if (role === "marketing") return "Growth Review";
  }
  return moduleTabs.find((tab) => tab.value === value)?.label ?? value;
}

export const routeRoleOrder: RoleKey[] = [
  "hr",
  "gmp",
  "partner",
  "manager",
  "finance",
  "marketing",
  "employee",
];

export function isRoleKey(value: string | undefined): value is RoleKey {
  return routeRoleOrder.includes(value as RoleKey);
}

export function getPreferredRoleView(roles: string[]): RoleKey {
  if (roles.includes("super_admin") || roles.includes("hr")) return "hr";
  if (roles.includes("gmp")) return "gmp";
  if (roles.includes("partner")) return "partner";
  if (roles.includes("manager")) return "manager";
  if (roles.includes("finance")) return "finance";
  if (roles.includes("marketing")) return "marketing";
  return "employee";
}
