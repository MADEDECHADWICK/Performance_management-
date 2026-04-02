export type InductionTemplateItem = {
  itemName: string;
  description?: string;
  itemType?: "task" | "document_upload" | "video_watch" | "policy_link" | "external_link";
  resourceUrl?: string;
  requiresDocument?: boolean;
  sectionKey: string;
  sectionLabel: string;
  ownerRole?: string;
  comments?: string;
};

export type InductionTemplate = {
  checklistName: string;
  items: InductionTemplateItem[];
};

export const DEFAULT_INDUCTION_CHECKLIST_NAME = "Employee Induction & Compliance";

const buildSection = (
  sectionKey: string,
  sectionLabel: string,
  ownerRole: string,
  items: Array<Omit<InductionTemplateItem, "sectionKey" | "sectionLabel" | "ownerRole">>
): InductionTemplateItem[] =>
  items.map((item) => ({
    ...item,
    sectionKey,
    sectionLabel,
    ownerRole,
  }));

const employeeFileItems = buildSection("employee_file", "Employee File", "hr", [
  {
    itemName: "Application letter & CV",
    description: "Employee file must contain the application letter and CV.",
    itemType: "document_upload",
    requiresDocument: true,
  },
  {
    itemName: "Certified education certificates",
    description: "Upload certified copies of all education certificates.",
    itemType: "document_upload",
    requiresDocument: true,
  },
  {
    itemName: "Offer letter",
    description: "Attach the signed offer letter to the employee file.",
    itemType: "document_upload",
    requiresDocument: true,
  },
  {
    itemName: "Appointment letter",
    description: "Attach the appointment letter to the employee file.",
    itemType: "document_upload",
    requiresDocument: true,
  },
  {
    itemName: "Personal details form",
    description: "Employee must complete the personal details form.",
    itemType: "document_upload",
    requiresDocument: true,
  },
  {
    itemName: "Certificate of good conduct",
    description: "Upload the certificate of good conduct.",
    itemType: "document_upload",
    requiresDocument: true,
  },
  {
    itemName: "Copy of ID",
    description: "Upload a national ID or passport copy.",
    itemType: "document_upload",
    requiresDocument: true,
  },
  {
    itemName: "Copy of NHIF card",
    description: "Upload the NHIF card copy.",
    itemType: "document_upload",
    requiresDocument: true,
  },
  {
    itemName: "Copy of KRA PIN",
    description: "Upload the KRA PIN certificate or card copy.",
    itemType: "document_upload",
    requiresDocument: true,
  },
  {
    itemName: "Copy of NSSF card",
    description: "Upload the NSSF card copy.",
    itemType: "document_upload",
    requiresDocument: true,
  },
  {
    itemName: "Passport-size photos",
    description: "Upload two passport-size photos.",
    itemType: "document_upload",
    requiresDocument: true,
  },
]);

const firmOrientationItems = buildSection("firm_orientation", "About the Firm", "hr", [
  { itemName: "History of the firm", description: "Take the employee through the history of the firm." },
  { itemName: "Vision", description: "Brief the employee on the firm's vision." },
  { itemName: "Mission", description: "Brief the employee on the firm's mission." },
  { itemName: "Firm services", description: "Explain the firm's service lines and client work." },
  {
    itemName: "Organisation structure and departments",
    description: "Review organisation structure, departments, and reporting lines.",
  },
  {
    itemName: "Management team introduction",
    description: "Introduce partners, team leaders, and key contacts.",
  },
  { itemName: "Firm culture", description: "Explain the culture, behaviours, and expected standards." },
  { itemName: "Culture manual", description: "Share and explain the culture manual." },
  { itemName: "Time management", description: "Review expected time management discipline." },
  { itemName: "Dress code", description: "Review the firm's dress code expectations." },
  { itemName: "Email and phone etiquette", description: "Explain professional communication standards." },
  { itemName: "Brand book and guidelines", description: "Review brand standards and presentation expectations." },
  { itemName: "Laptop policy", description: "Review device handling and laptop policy." },
]);

const hrPolicyItems = buildSection("hr_policies", "HR Policies", "hr", [
  { itemName: "Recruitment and selection procedure", description: "Walk through the recruitment policy context." },
  { itemName: "Employee onboarding procedure", description: "Explain how onboarding is governed internally." },
  { itemName: "Attendance and time management", description: "Cover attendance rules and time discipline." },
  { itemName: "Staff training procedure", description: "Explain learning and training expectations." },
  {
    itemName: "Timesheets and workflow management system",
    description: "Introduce Xero Practice Manager and timesheet expectations.",
  },
  { itemName: "Staff disciplinary procedure", description: "Review disciplinary procedures and standards." },
  { itemName: "Leave management procedure", description: "Review leave approval rules and timelines." },
  { itemName: "Leave management system", description: "Introduce Wingubox or the active leave system." },
  { itemName: "Employee separation procedure", description: "Explain separation and exit process rules." },
  { itemName: "Data protection policy", description: "Review data privacy and data handling obligations." },
  { itemName: "Confidentiality and non-disclosure policy", description: "Review confidentiality obligations." },
  { itemName: "Anti-money laundering policy", description: "Review AML obligations and escalation expectations." },
  { itemName: "Sexual harassment policy", description: "Review anti-harassment policy and reporting channels." },
]);

const financeAndPerformanceItems = [
  ...buildSection("finance_policies", "Finance Policies", "hr", [
    { itemName: "Travel allowances and expenses policy", description: "Review travel and expense rules." },
    { itemName: "Petty cash management policy", description: "Explain petty cash request and control rules." },
    { itemName: "Disbursement policy", description: "Review disbursement controls and approvals." },
  ]),
  ...buildSection("performance_management", "Performance Management", "hr", [
    { itemName: "Performance expectations", description: "Introduce performance expectations and ownership." },
    { itemName: "Performance appraisals", description: "Explain evaluation and appraisal cadence." },
    {
      itemName: "Rewards and performance consequences",
      description: "Review reward, consequence, and accountability rules.",
    },
    { itemName: "Performance management policy", description: "Review the performance management policy." },
    {
      itemName: "Performance management system",
      description: "Introduce the performance management system and required usage.",
    },
  ]),
];

const accessAndRoleReadinessItems = [
  ...buildSection("tools_access", "Tools & Access", "hr", [
    { itemName: "Email account activated", description: "Confirm email account is active and accessible." },
    { itemName: "Device and workstation ready", description: "Confirm laptop, accessories, and workstation setup." },
    { itemName: "Core system access", description: "Confirm the employee can access all required systems." },
  ]),
  ...buildSection("role_training", "Role Training", "hr", [
    { itemName: "Department introduction", description: "Manager introduces the employee to the department team." },
    { itemName: "Role expectations briefing", description: "Explain role scope, targets, and immediate priorities." },
    { itemName: "Buddy or shadowing assignment", description: "Assign a buddy or initial shadowing plan." },
  ]),
  ...buildSection("employee_acknowledgement", "Employee Acknowledgement", "employee", [
    {
      itemName: "Confirm understanding of induction content",
      description: "Employee confirms that the induction content has been understood.",
    },
  ]),
];

const DEFAULT_TEMPLATE_ITEMS: InductionTemplateItem[] = [
  ...employeeFileItems,
  ...firmOrientationItems,
  ...hrPolicyItems,
  ...financeAndPerformanceItems,
  ...accessAndRoleReadinessItems,
].map((item, index) => ({
  ...item,
  itemType: item.itemType || "task",
  orderIndex: index + 1,
})) as InductionTemplateItem[];

export const getDefaultInductionTemplate = (): InductionTemplate => ({
  checklistName: DEFAULT_INDUCTION_CHECKLIST_NAME,
  items: DEFAULT_TEMPLATE_ITEMS.map((item) => ({ ...item })),
});
