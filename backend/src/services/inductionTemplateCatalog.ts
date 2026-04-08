import { buildDefaultOnboardingPolicyChecklistItems } from "./onboardingPolicyCatalog";

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

const employeeFileEmployeeOwnedItems = buildSection(
  "employee_file",
  "Employee File",
  "employee",
  [
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
  ]
);

const employeeFileHrOwnedItems = buildSection("employee_file", "Employee File", "hr", [
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
]);

const onboardingPolicyItems = buildDefaultOnboardingPolicyChecklistItems();

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
  ...employeeFileEmployeeOwnedItems,
  ...employeeFileHrOwnedItems,
  ...onboardingPolicyItems,
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
