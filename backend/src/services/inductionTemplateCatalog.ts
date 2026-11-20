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

export const DEFAULT_INDUCTION_CHECKLIST_NAME = "Employee Checklist & Induction";

const employeeChecklistItems: InductionTemplateItem[] = [
  {
    itemName: "Application letter & CV",
    description: "Upload the application letter and CV.",
    itemType: "document_upload",
    requiresDocument: true,
    sectionKey: "employee_checklist",
    sectionLabel: "Employee Checklist",
    ownerRole: "employee",
  },
  {
    itemName: "Certified education certificates",
    description: "Upload certified copies of all education certificates.",
    itemType: "document_upload",
    requiresDocument: true,
    sectionKey: "employee_checklist",
    sectionLabel: "Employee Checklist",
    ownerRole: "employee",
  },
  {
    itemName: "Confirmation letter",
    description: "HR uploads the signed confirmation letter.",
    itemType: "document_upload",
    requiresDocument: true,
    sectionKey: "employee_checklist",
    sectionLabel: "Employee Checklist",
    ownerRole: "hr",
  },
  {
    itemName: "Appointment letter",
    description: "HR uploads the appointment letter.",
    itemType: "document_upload",
    requiresDocument: true,
    sectionKey: "employee_checklist",
    sectionLabel: "Employee Checklist",
    ownerRole: "hr",
  },
  {
    itemName: "Completely filled personal details form",
    description: "Upload the completed personal details form.",
    itemType: "document_upload",
    requiresDocument: true,
    sectionKey: "employee_checklist",
    sectionLabel: "Employee Checklist",
    ownerRole: "employee",
  },
  {
    itemName: "Certificate of good conduct",
    description: "Upload the certificate of good conduct.",
    itemType: "document_upload",
    requiresDocument: true,
    sectionKey: "employee_checklist",
    sectionLabel: "Employee Checklist",
    ownerRole: "employee",
  },
  {
    itemName: "Copy of ID",
    description: "Upload a national ID or passport copy.",
    itemType: "document_upload",
    requiresDocument: true,
    sectionKey: "employee_checklist",
    sectionLabel: "Employee Checklist",
    ownerRole: "employee",
  },
  {
    itemName: "Copy of NHIF card",
    description: "Upload the NHIF card copy.",
    itemType: "document_upload",
    requiresDocument: true,
    sectionKey: "employee_checklist",
    sectionLabel: "Employee Checklist",
    ownerRole: "employee",
  },
  {
    itemName: "Copy of KRA PIN",
    description: "Upload the KRA PIN certificate or card copy.",
    itemType: "document_upload",
    requiresDocument: true,
    sectionKey: "employee_checklist",
    sectionLabel: "Employee Checklist",
    ownerRole: "employee",
  },
  {
    itemName: "Copy of NSSF card",
    description: "Upload the NSSF card copy.",
    itemType: "document_upload",
    requiresDocument: true,
    sectionKey: "employee_checklist",
    sectionLabel: "Employee Checklist",
    ownerRole: "employee",
  },
  {
    itemName: "2 passport-size photos",
    description: "Upload two passport-size photos.",
    itemType: "document_upload",
    requiresDocument: true,
    sectionKey: "employee_checklist",
    sectionLabel: "Employee Checklist",
    ownerRole: "employee",
  },
];

const onboardingPolicyItems = buildDefaultOnboardingPolicyChecklistItems();

const DEFAULT_TEMPLATE_ITEMS: InductionTemplateItem[] = [
  ...employeeChecklistItems,
  ...onboardingPolicyItems,
].map((item, index) => ({
  ...item,
  itemType: item.itemType || "task",
  orderIndex: index + 1,
})) as InductionTemplateItem[];

export const getDefaultInductionTemplate = (): InductionTemplate => ({
  checklistName: DEFAULT_INDUCTION_CHECKLIST_NAME,
  items: DEFAULT_TEMPLATE_ITEMS.map((item) => ({ ...item })),
});
