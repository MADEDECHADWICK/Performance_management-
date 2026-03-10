/**
 * API Types - TypeScript interfaces matching Prisma schema
 */

// Enums
export type EmployeeStatus = 'active' | 'inactive' | 'separated';
export type OnboardingStatus = 'pending' | 'in_progress' | 'completed';
export type OffboardingStatus = 'initiated' | 'in_progress' | 'completed';
export type DocumentAccessLevel = 'employee' | 'manager' | 'hr' | 'admin';
export type DocumentVerificationStatus = 'pending' | 'verified' | 'rejected';
export type ClientStatus = 'active' | 'inactive';
export type ClientOnboardingStatus = 'pending_hr_review' | 'approved' | 'rejected' | 'client_created' | 'job_created';
export type EngagementLetterStatus = 'uploaded' | 'pending_review' | 'approved' | 'rejected';
export type JobStatus = 'planned' | 'in_progress' | 'on_hold' | 'completed' | 'cancelled';
export type BillingType = 'hourly' | 'fixed_fee';
export type Priority = 'low' | 'medium' | 'high' | 'urgent';
export type TaskStatus = 'pending' | 'in_progress' | 'blocked' | 'completed' | 'cancelled';
export type TimeEntryStatus = 'pending' | 'submitted' | 'approved' | 'rejected' | 'cancelled';
export type OverBudgetRequestStatus = 'pending' | 'manager_approved' | 'manager_rejected' | 'partner_approved' | 'partner_rejected' | 'auto_rejected';
export type TimeEntryApprovalRequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';
export type EvaluatorType = 'self' | 'manager' | 'peer' | 'direct_report' | 'client' | 'custom';
export type EvaluationDefinitionStatus = 'draft' | 'published' | 'closed';
export type EvaluationAssignmentStatus = 'pending' | 'in_progress' | 'submitted' | 'cancelled';
export type BackgroundCheckStatus = 'pending' | 'cleared' | 'flagged' | 'failed';
export type ChecklistStatus = 'pending' | 'in_progress' | 'completed';
export type JobCostingStatus = 'draft' | 'submitted' | 'partner_review' | 'approved' | 'rejected';
export type RecruitmentStage = 'applied' | 'shortlisted' | 'interviewed' | 'offered' | 'accepted' | 'rejected' | 'hired';

// Core Models
export interface User {
  id: number;
  email: string;
  isActive: boolean;
  isVerified: boolean;
  lastLogin?: string;
  createdAt: string;
  updatedAt: string;
  profileId?: number;
  profile_id?: number;
  isPartner?: boolean;
  is_partner?: boolean;
  moduleAccess?: Record<string, string[]>;
  profile?: Profile;
  roles?: UserAuthRole[];
}

export interface Profile {
  id: number;
  userId?: number;
  firstName: string;
  middleName?: string;
  lastName: string;
  phoneNumber?: string;
  profilePicture?: string;
  employeeId?: string;
  kraPin?: string;
  nssfNumber?: string;
  dateOfBirth?: string;
  status: EmployeeStatus;
  positionTitle?: string;
  departmentId?: number;
  roleId?: number;
  hireDate?: string;
  separationDate?: string;
  managerId?: number;
  isPartner: boolean;
  onboardingStatus: OnboardingStatus;
  onboardingChecklistCompleted: boolean;
  inductionCompleted: boolean;
  backgroundCheckRequired: boolean;
  backgroundCheckStatus?: BackgroundCheckStatus;
  backgroundCheckDate?: string;
  financialTarget?: number;
  utilizationTarget: number;
  createdAt: string;
  updatedAt: string;
  // Relations
  user?: User;
  department?: Department;
  role?: PositionRole;
  manager?: Profile;
  directReports?: Profile[];
}

export interface Department {
  id: number;
  name: string;
  description?: string;
  departmentCode?: string;
  departmentHeadId?: number;
  partnerProfileId?: number;
  createdAt: string;
  updatedAt: string;
  departmentHead?: Profile;
  partner?: Profile;
  partner_name?: string;
}

export interface PositionRole {
  id: number;
  name: string;
  description?: string;
  billingRate: number;
  costRate?: number;
  isActive: boolean;
  defaultAccess: any;
  createdAt: string;
  updatedAt: string;
}

export interface RecruitmentCandidate {
  id: number;
  fullName: string;
  email?: string | null;
  phoneNumber?: string | null;
  positionApplied: string;
  departmentId?: number | null;
  stage: RecruitmentStage;
  notes?: string | null;
  createdByProfileId?: number | null;
  createdAt: string;
  updatedAt: string;
  department?: Department | null;
  createdBy?: Profile | null;
  offerLetterDocumentId?: number | null;
  offerLetterDocument?: Document | null;
  onboardingCase?: EmployeeOnboardingCase | null;
}

export interface AuthRole {
  id: number;
  name: string;
  description?: string;
  isActive: boolean;
}

export interface UserAuthRole {
  userId: number;
  roleId: number;
  role: AuthRole;
}

// Client & Job Models
export interface Client {
  id: number;
  clientName: string;
  clientCode?: string;
  industry?: string;
  notes?: string;
  contactPerson?: string;
  contactEmail?: string;
  contactPhone?: string;
  address?: string;
  location?: string;
  status: ClientStatus;
  partnerProfileId?: number;
  managerProfileId?: number;
  departmentId?: number;
  createdAt: string;
  updatedAt: string;
  // Relations
  partner?: Profile;
  manager?: Profile;
  department?: Department;
  jobs?: Job[];
}

export interface EngagementLetter {
  id: number;
  clientId: number;
  documentId?: number;
  jobTitle?: string;
  engagementType: string;
  startDate?: string;
  endDate?: string;
  feeAmount?: number;
  currency?: string;
  scopeDescription?: string;
  termsConditions?: string;
  status: EngagementLetterStatus;
  uploadedByProfileId?: number;
  approvedByProfileId?: number;
  approvedAt?: string;
  latestRejectionReason?: string | null;
  latestRejectionAt?: string | null;
  latestRejectedBy?: Profile | null;
  createdAt: string;
  updatedAt: string;
  document?: Document;
}

export interface ClientOnboarding {
  id: number;
  clientId?: number;
  engagementLetterId: number;
  clientName?: string;
  industry?: string;
  contactPerson?: string;
  contactEmail?: string;
  contactPhone?: string;
  location?: string;
  departmentId?: number;
  jobId?: number;
  status: ClientOnboardingStatus;
  notes?: string;
  uploadedByProfileId?: number;
  hrReviewerProfileId?: number;
  createdAt: string;
  updatedAt: string;
  // Relations
  client?: Client;
  engagementLetter?: EngagementLetter;
  department?: Department;
  uploadedBy?: Profile;
  hrReviewer?: Profile;
  job?: Job;
}

export interface Job {
  id: number;
  jobName: string;
  jobCode?: string;
  trackingPath?: string;
  description?: string;
  clientId?: number;
  departmentId?: number;
  partnerProfileId?: number;
  managerProfileId?: number;
  startDate?: string;
  dueDate?: string;
  completionDate?: string;
  status: JobStatus;
  priority: Priority;
  billingType: BillingType;
  fixedFeeAmount: number;
  budgetHours: number;
  engagementLetterId?: number;
  costingCompleted: boolean;
  teamAssigned: boolean;
  createdAt: string;
  updatedAt: string;
  // Relations
  client?: Client;
  partner?: Profile;
  manager?: Profile;
  department?: Department;
  engagementLetter?: EngagementLetter;
  staffing?: JobStaffAssignment[];
  tasks?: Task[];
  timeEntries?: TimeEntry[];
  jobCosting?: JobCosting;
  invoiceTracking?: JobInvoiceMilestoneTracking;
}

export interface JobStaffAssignment {
  id: number;
  jobId: number;
  employeeProfileId: number;
  assignedRoleId: number;
  assignedHourlyRate: number;
  roleOnJob?: string;
  assignedAt: string;
  assignedByProfileId?: number;
  createdAt: string;
  updatedAt: string;
  // Relations
  job?: Job;
  employee?: Profile;
  role?: PositionRole;
  assignedBy?: Profile;
}

export interface JobCosting {
  id: number;
  jobId: number;
  status: JobCostingStatus;
  allocatedCost?: number;
  remainingBudget?: number;
  totalBudgetHours: number;
  totalBudgetAmount: number;
  totalBillableAmount: number;
  totalCostAmount: number;
  profitMargin: number;
  managerProfileId?: number;
  submittedAt?: string;
  approvedAt?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  allocations?: JobTimeAllocation[];
  budgetCap?: BudgetCap;
}

export interface JobTimeAllocation {
  id: number;
  jobCostingId: number;
  employeeProfileId: number;
  roleId: number;
  allocatedHours: number;
  hourlyRate: number;
  estimatedCost: number;
  billable: boolean;
  taskDescription?: string;
  createdAt: string;
  updatedAt: string;
  employee?: Profile;
  role?: PositionRole;
}

export interface BudgetCap {
  id: number;
  jobCostingId: number;
  totalAllocatedHours: number;
  capEnforced: boolean;
  allowOverage: boolean;
  maxOveragePercent: number;
  autoLockOnExceed: boolean;
}

export interface Task {
  id: number;
  jobId: number;
  title: string;
  description?: string;
  assignedToProfileId?: number;
  estimatedHours?: number;
  billable: boolean;
  status: TaskStatus;
  priority: Priority;
  dueDate?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
  // Relations
  job?: Job;
  assignedTo?: Profile;
}

export interface JobInvoiceMilestoneTrackingItem {
  taskId: number;
  title: string;
  targetPercent: number;
  dueDate?: string | null;
  requirements?: string | null;
  assignedToProfileId?: number | null;
  conditionStatus: TaskStatus;
  conditionCompleted: boolean;
  milestoneAmount: number;
  expectedCumulativeAmount: number;
  amountRemainingToMilestone: number;
  milestonePaid: boolean;
  readyForInvoice: boolean;
  invoiceNumberSuggestion: string;
}

export interface JobInvoiceMilestoneTracking {
  jobId: number;
  jobCode?: string | null;
  jobName: string;
  feeAmount: number;
  collectedAmount: number;
  outstandingAmount: number;
  milestoneCount: number;
  completedConditionCount: number;
  nextReadyMilestone?: JobInvoiceMilestoneTrackingItem | null;
  milestones: JobInvoiceMilestoneTrackingItem[];
}

export interface JobWorkflowOwnership {
  client?: {
    id?: number;
    clientName?: string;
    clientCode?: string;
  } | null;
  department?: {
    id?: number;
    name?: string;
  } | null;
  manager?: {
    id?: number;
    firstName?: string;
    lastName?: string;
  } | null;
  partner?: {
    id?: number;
    firstName?: string;
    lastName?: string;
  } | null;
  receivableOwner?: {
    id?: number;
    firstName?: string;
    lastName?: string;
  } | null;
}

export interface JobWorkflowExecutionState {
  currentStatus: JobStatus;
  canMoveToInProgress: boolean;
  canComplete: boolean;
  blockersForInProgress: string[];
  blockersForCompletion: string[];
  isOverdue: boolean;
  overdueDays: number;
}

export interface JobWorkflowTrackingEmployee {
  profileId: number;
  employeeName: string;
  positionTitle?: string | null;
  assignedRole?: string | null;
  assignedHourlyRate?: number;
  allocatedHours: number;
  loggedHours: number;
  approvedHours: number;
  billableHours: number;
  nonBillableHours: number;
  billableAmount: number;
  costAmount: number;
  remainingAllocatedHours: number;
  overrunHours: number;
  utilizationPercent: number;
}

export interface JobWorkflowTrackingPayload {
  tasks: {
    total: number;
    pending: number;
    inProgress: number;
    blocked: number;
    completed: number;
    cancelled: number;
    incomplete: number;
  };
  staffing: {
    teamAssigned: boolean;
    headcount: number;
    allocatedHours: number;
    loggedHours: number;
    remainingAllocatedHours: number;
    overrunHours: number;
    employees: JobWorkflowTrackingEmployee[];
  };
  timesheets: {
    totalEntries: number;
    activeEntries: number;
    approvedEntries: number;
    pendingOrSubmittedEntries: number;
    totalHoursWorked: number;
    approvedHoursWorked: number;
    totalBillableHours: number;
    totalNonBillableHours: number;
    billableUtilizationPercent: number;
  };
  financials: {
    expectedFeeAmount: number;
    billedAmount: number;
    approvedBilledAmount: number;
    costToDate: number;
    profitToDate: number;
    marginPercent: number;
    billedVsExpectedPercent: number;
  };
  collections: {
    collectionStage?: string | null;
    paymentCount: number;
    collectedAmount: number;
    outstandingAmount: number;
    collectionPercent: number;
    readyForCollectionAt?: string | null;
  };
  revenueAllocations: {
    count: number;
    allocatedAmount: number;
    employeeBillableAmount: number;
    employeeProfitAmount: number;
    employeeLossAmount: number;
  };
  milestones?: JobInvoiceMilestoneTracking;
  documentReadiness: {
    missingForInProgress: string[];
    missingForCompletion: string[];
  };
}

export interface JobWorkflowTrackingResponse {
  job: {
    id: number;
    jobCode?: string | null;
    jobName: string;
    description?: string | null;
    status: JobStatus;
    effectiveStatus?: JobStatus | "overdue";
    isOverdue?: boolean;
    priority?: Priority;
    startDate?: string | null;
    dueDate?: string | null;
    completionDate?: string | null;
    billingType: BillingType;
    currency?: string | null;
    fixedFeeAmount?: number;
    budgetHours?: number;
    collectionStage?: string | null;
    readyForCollectionAt?: string | null;
    teamAssigned?: boolean;
    costingCompleted?: boolean;
  };
  ownership: JobWorkflowOwnership;
  workflow: {
    marketing: {
      clientOnboardingId?: number | null;
      onboardingStatus?: string | null;
      engagementLetterId?: number | null;
      engagementLetterStatus?: string | null;
      engagementLetterDocumentUploaded: boolean;
    };
    hr: {
      jobCreated: boolean;
      managerAssigned: boolean;
      partnerAssigned: boolean;
      departmentAssigned: boolean;
    };
    manager: {
      teamAssigned: boolean;
      staffCount: number;
      costingCompleted: boolean;
      costingStatus?: string | null;
      submittedAt?: string | null;
      approvedAt?: string | null;
      latestReviewReason?: string | null;
      latestReviewAt?: string | null;
      latestReviewBy?: {
        id?: number;
        firstName?: string;
        lastName?: string;
      } | null;
      budgetCapEnforced?: boolean | null;
      allowOverage?: boolean | null;
      maxOveragePercent?: number;
    };
    execution: JobWorkflowExecutionState;
  };
  tracking: JobWorkflowTrackingPayload;
  statusTimeline: Array<{
    id: number;
    fromStatus?: string | null;
    toStatus?: string | null;
    reason?: string | null;
    changedByProfileId?: number | null;
    createdAt?: string;
  }>;
  generatedAt?: string;
}

// Time Entry Models
export interface TimeEntry {
  id: number;
  jobId: number;
  employeeProfileId: number;
  taskId?: number;
  date: string;
  dateWorked?: string;
  startedAt?: string | null;
  endedAt?: string | null;
  hours: number;
  description?: string;
  billable?: boolean;
  hourlyRate: number;
  billableAmount: number;
  costAmount: number;
  profitLoss: number;
  status: TimeEntryStatus;
  submittedAt?: string;
  approvedByProfileId?: number;
  approvedAt?: string;
  rejectionReason?: string;
  createdAt: string;
  updatedAt: string;
  // Relations
  job?: Job;
  employee?: Profile;
  task?: Task;
  approvedBy?: Profile;
}

export interface TimeEntryApprovalRequest {
  id: number;
  timeEntryId?: number;
  jobId: number;
  employeeProfileId: number;
  currentAllocatedHours: number;
  currentLoggedHours: number;
  additionalHoursRequested: number;
  justification: string;
  requestType: 'additional_hours' | 'over_budget';
  status: TimeEntryApprovalRequestStatus;
  approvedByProfileId?: number;
  approvalNotes?: string;
  approvedAt?: string;
  requestedAt: string;
  createdAt: string;
  updatedAt: string;
  trackingPath?: string | null;
  requiresPartnerApproval?: boolean;
  managerApproved?: boolean;
  pendingPartnerApproval?: boolean;
}

export interface TimeOverBudgetRequest {
  id: number;
  employeeProfileId: number;
  jobId: number;
  requestedHours: number;
  reason: string;
  billable?: boolean;
  status: OverBudgetRequestStatus;
  managerApprovedAt?: string;
  partnerApprovedAt?: string;
  rejectionReason?: string;
  createdAt: string;
  updatedAt: string;
}

// Document Models
export interface Document {
  id: number;
  fileName: string;
  filePath: string;
  fileSize?: number;
  mimeType?: string;
  documentType: string;
  entityType: string;
  entityId?: number;
  accessLevel: DocumentAccessLevel;
  isRequired: boolean;
  verificationStatus: DocumentVerificationStatus;
  rejectionReason?: string;
  uploadedBy?: number;
  verifiedBy?: number;
  verifiedAt?: string;
  createdAt: string;
  updatedAt: string;
}

// Evaluation Models
export interface EvaluationCycle {
  id: number;
  name: string;
  description?: string;
  startDate: string;
  endDate: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface EvaluationDefinition {
  id: number;
  cycleId?: number;
  name: string;
  description?: string;
  evaluatorType: EvaluatorType;
  isAnonymous: boolean;
  hideFromEvaluatee: boolean;
  requireSignature: boolean;
  excludeFromScoreComputation: boolean;
  financialWeight: number;
  nonFinancialWeight: number;
  status: EvaluationDefinitionStatus;
  dueDate?: string;
  departmentId?: number;
  createdByProfileId?: number;
  createdAt: string;
  updatedAt: string;
}

export interface EvaluationAssignment {
  id: number;
  definitionId: number;
  evaluatorProfileId: number;
  evaluateeProfileId: number;
  status: EvaluationAssignmentStatus;
  dueDate?: string;
  submittedAt?: string;
  overallScore?: number;
  financialScore?: number;
  nonFinancialScore?: number;
  comments?: string;
  createdAt: string;
  updatedAt: string;
  // Relations
  definition?: EvaluationDefinition;
  evaluator?: Profile;
  evaluatee?: Profile;
}

// KPI Models
export interface Kpi {
  id: number;
  name: string;
  description?: string;
  category?: string;
  kpiType?: string;
  departmentId?: number;
  roleId?: number;
  measurementUnit?: string;
  targetValue?: number;
  targetFrequency?: string;
  targetType?: string;
  targetText?: string;
  weight?: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  department?: Department;
  role?: PositionRole;
}

export interface EmployeeKpiAssignment {
  id: number;
  employeeProfileId: number;
  kpiId: number;
  targetValue?: number;
  achievedValue?: number;
  weight?: number;
  status: string;
  periodStart?: string;
  periodEnd?: string;
  createdAt: string;
  updatedAt: string;
  employee?: Profile;
  kpi?: Kpi;
  tracking?: {
    targetValue?: number | null;
    achievedValue?: number | null;
    resolvedAchievedValue?: number | null;
    derivedAchievedValueFromOkrs?: number | null;
    progressPercent?: number;
    achievement?: {
      status: "not_started" | "behind" | "on_track" | "met" | "exceeded";
      achievedFrom: "manual" | "okr_derived" | "none";
      varianceToTarget?: number | null;
      remainingToTarget?: number | null;
      formula?: string | null;
      asOf?: string | null;
    };
    history?: Array<{
      id: number;
      at: string;
      action: string;
      source: "manual_progress_update" | "assignment_update" | "assignment_closed";
      actorProfileId?: number | null;
      previousAchievedValue?: number | null;
      newAchievedValue?: number | null;
      note?: string | null;
    }>;
    okr?: {
      objectiveCount: number;
      approvedObjectiveCount: number;
      completedObjectiveCount: number;
      keyResultCount: number;
      overallCompletionPercent: number;
      lastUpdatedAt?: string | null;
    };
  };
}

// Notification
export interface Notification {
  id: number;
  profileId: number;
  type: string;
  title: string;
  message: string;
  link?: string;
  isRead: boolean;
  createdAt: string;
}

// Induction & Onboarding
export interface InductionChecklist {
  id: number;
  onboardingCaseId?: number;
  employeeProfileId: number;
  checklistName: string;
  status: ChecklistStatus;
  totalItems: number;
  completedItems: number;
  completionPercent: number;
  assignedByProfileId?: number;
  dueDate?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
  items?: InductionChecklistItem[];
}

export interface InductionChecklistItem {
  id: number;
  checklistId: number;
  itemName: string;
  description?: string;
  orderIndex: number;
  isCompleted: boolean;
  completedByProfileId?: number;
  completedAt?: string;
  requiresDocument: boolean;
  documentId?: number;
  createdAt: string;
  updatedAt: string;
}

export interface EmployeeOnboardingCase {
  id: number;
  candidateId?: number;
  profileId?: number;
  status: OnboardingStatus;
  startDate?: string;
  dueDate?: string;
  hrOwnerProfileId?: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  employee?: Profile;
  hrOwner?: Profile;
  inductionChecklist?: InductionChecklist;
}

export interface EmployeeOffboardingCase {
  id: number;
  profileId?: number;
  hrOwnerProfileId?: number;
  status: OffboardingStatus;
  reason?: string;
  notes?: string;
  initiatedAt: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
  employee?: Profile;
  hrOwner?: Profile;
}

// API Response Types
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// Dashboard Types
export interface DashboardMetrics {
  totalEmployees: number;
  activeJobs: number;
  pendingTimeEntries: number;
  completedEvaluations: number;
  totalRevenue: number;
  totalProfit: number;
  utilizationRate: number;
}

export interface PartnerDashboardData {
  totalJobs: number;
  totalRevenue: number;
  profit: number;
  teamSize: number;
  pendingJobs: number;
  overdueJobs: number;
  completedJobs: number;
  utilizationRate: number;
  jobs: Job[];
}

export interface GMPDashboardData {
  firmOverview: {
    totalEmployees: number;
    activeJobs: number;
    totalPartners: number;
    totalDepartments: number;
  };
  financials: {
    totalRevenue: number;
    totalProfit: number;
    projectedRevenue: number;
    collectedAmount: number;
  };
  jobStatus: {
    planned: number;
    ongoing: number;
    onHold: number;
    completed: number;
    overdue: number;
  };
  departmentPerformance: Array<{
    departmentId: number;
    departmentName: string;
    revenue: number;
    profit: number;
    utilization: number;
  }>;
}
