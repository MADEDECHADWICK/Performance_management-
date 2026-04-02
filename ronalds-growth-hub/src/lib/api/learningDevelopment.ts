import { api, apiFetch } from "./client";

export interface LearningProgramVersionPayload {
  title: string;
  description?: string | null;
  trainingType?: "internal" | "external" | "certification" | "workshop";
  deliveryMode?: string | null;
  provider?: string | null;
  cost?: number;
  trainerProfileId?: number | null;
  externalTrainerName?: string | null;
  isMandatory?: boolean;
  feedbackPoints?: number;
  impactAssessmentDelayDays?: number | null;
  status?: "draft" | "published" | "retired";
  publishedAt?: string | null;
  modules?: Array<{
    title: string;
    description?: string | null;
    contentType: "video" | "document" | "link" | "knowledge_resource" | "live_session";
    knowledgeHubResourceId?: number | null;
    documentId?: number | null;
    contentUrl?: string | null;
    sequenceNo?: number;
    required?: boolean;
    estimatedMinutes?: number | null;
  }>;
  sessions?: Array<{
    title: string;
    startsAt: string;
    endsAt: string;
    location?: string | null;
    trainerProfileId?: number | null;
    externalTrainerName?: string | null;
    attendancePoints?: number;
    attendanceRequired?: boolean;
    moduleSequenceNo?: number | null;
  }>;
  quizzes?: Array<{
    title: string;
    instructions?: string | null;
    passMark: number;
    pointsOnPass?: number;
    attemptLimit?: number | null;
    isMandatory?: boolean;
    isActive?: boolean;
    moduleSequenceNo?: number | null;
    questions?: Array<{
      questionType: "single_choice" | "multiple_choice" | "true_false" | "short_text";
      prompt: string;
      displayOrder?: number;
      required?: boolean;
      explanation?: string | null;
      options?: Array<{
        label: string;
        isCorrect?: boolean;
        displayOrder?: number;
      }>;
    }>;
  }>;
  certificateTemplate?: {
    name: string;
    templateDefinition?: Record<string, unknown>;
    backgroundDocumentId?: number | null;
    signatureDocumentId?: number | null;
    issuedByLabel?: string | null;
    isDefault?: boolean;
  } | null;
}

export interface LearningPersonSummary {
  id: number;
  firstName: string;
  lastName: string;
  managerId?: number | null;
}

export interface LearningProgramSummary {
  id: number;
  title: string;
}

export interface LearningDocumentSummary {
  id: number;
  fileUrl?: string | null;
  fileName?: string | null;
  originalName?: string | null;
  title?: string | null;
}

export interface LearningProgramVersionSummary {
  id: number;
  title: string;
  trainingType: "internal" | "external" | "certification" | "workshop";
  deliveryMode?: string | null;
  provider?: string | null;
  cost: number;
  trainer?: LearningPersonSummary | null;
  program?: LearningProgramSummary | null;
}

export interface LearningQuizOptionRecord {
  id: number;
  label: string;
  isCorrect?: boolean;
  displayOrder: number;
}

export interface LearningQuizQuestionRecord {
  id: number;
  questionType: "single_choice" | "multiple_choice" | "true_false" | "short_text";
  prompt: string;
  displayOrder: number;
  required: boolean;
  explanation?: string | null;
  options: LearningQuizOptionRecord[];
}

export interface LearningQuizRecord {
  id: number;
  title: string;
  instructions?: string | null;
  passMark: number;
  pointsOnPass: number;
  attemptLimit?: number | null;
  isMandatory: boolean;
  isActive: boolean;
  moduleId?: number | null;
  questions: LearningQuizQuestionRecord[];
}

export interface LearningModuleRecord {
  id: number;
  title: string;
  description?: string | null;
  contentType: "video" | "document" | "link" | "knowledge_resource" | "live_session";
  knowledgeHubResourceId?: number | null;
  documentId?: number | null;
  contentUrl?: string | null;
  sequenceNo: number;
  required: boolean;
  estimatedMinutes?: number | null;
  knowledgeHubResource?: {
    id: number;
    title: string;
    assetKind: "document" | "image" | "video" | "link";
    linkUrl?: string | null;
    assetFileName?: string | null;
    assetMimeType?: string | null;
    content?: string | null;
    completionMode: "video_end" | "watch_percent" | "document_scroll" | "manual";
    completionThresholdPercent?: number | null;
    minReadSeconds?: number | null;
    estimatedDurationMinutes?: number | null;
  } | null;
}

export interface LearningSessionRecord {
  id: number;
  title: string;
  startsAt: string;
  endsAt: string;
  moduleId?: number | null;
  location?: string | null;
  trainerProfileId?: number | null;
  externalTrainerName?: string | null;
  attendancePoints: number;
  attendanceRequired: boolean;
}

export interface CertificateTemplateRecord {
  id: number;
  name: string;
  issuedByLabel?: string | null;
  isDefault: boolean;
  backgroundDocumentId?: number | null;
  signatureDocumentId?: number | null;
  templateDefinition?: Record<string, unknown>;
}

export interface LearningProgramVersionRecord extends LearningProgramVersionSummary {
  status: "draft" | "published" | "retired";
  publishedAt?: string | null;
  createdByProfileId: number;
  externalTrainerName?: string | null;
  isMandatory: boolean;
  feedbackPoints: number;
  impactAssessmentDelayDays?: number | null;
  modules: LearningModuleRecord[];
  sessions: LearningSessionRecord[];
  quizzes: LearningQuizRecord[];
  certificateTemplates: CertificateTemplateRecord[];
  _count?: {
    assignments: number;
  };
}

export interface LearningProgramRecord {
  id: number;
  title: string;
  description?: string | null;
  status: "draft" | "published" | "archived";
  department?: {
    id: number;
    name: string;
  } | null;
  createdBy?: LearningPersonSummary | null;
  versions: LearningProgramVersionRecord[];
}

export interface LearningModuleProgressSummary {
  id: number;
  moduleId: number;
  status: "not_started" | "in_progress" | "completed" | "skipped";
  completionPercent: number;
  watchPercent: number;
  scrollPercent: number;
  completedAt: string | null;
}

export interface LearningQuizAttemptSummary {
  id: number;
  quizId: number;
  score: number;
  status: "in_progress" | "submitted" | "passed" | "failed";
  submittedAt: string | null;
  passedAt: string | null;
}

export interface LearningAttendanceRecordSummary {
  id: number;
  sessionId: number;
  assignmentId: number;
  attendanceStatus: "invited" | "attended" | "missed" | "excused";
  attendedAt: string | null;
  notes?: string | null;
}

export interface LearningCertificateSummary {
  id: number;
  certificateNumber: string;
  verificationCode: string;
  verificationUrl?: string | null;
  issuedAt: string;
  document?: LearningDocumentSummary | null;
}

export interface GlobalCertificateTemplateRecord {
  id?: number;
  key?: string;
  name: string;
  issuedByLabel?: string | null;
  isActive: boolean;
  backgroundDocumentId?: number | null;
  signatureDocumentId?: number | null;
  templateDefinition?: Record<string, unknown>;
}

export interface CertificateVerificationRecord {
  valid: boolean;
  status?: "issued" | "revoked";
  certificateNumber?: string;
  verificationCode?: string;
  issuedAt?: string | null;
  revokedAt?: string | null;
  learner?: {
    id?: number;
    name?: string | null;
    employeeId?: string | null;
  } | null;
  training?: {
    name?: string | null;
    programVersionTitle?: string | null;
  } | null;
  issuedBy?: string | null;
  downloadUrl?: string | null;
}

export interface LearningFeedbackSummary {
  id: number;
  overallRating: number;
  contentRating: number;
  deliveryRating: number;
  relevanceRating: number;
  comment?: string | null;
  submittedAt: string;
  pointsAwarded: number;
}

export interface LearningImpactAssessmentResponseSummary {
  id: number;
  submittedAt: string;
  comment?: string | null;
}

export interface LearningImpactTaskSummary {
  id: number;
  dueAt: string;
  status: "pending" | "submitted" | "overdue" | "cancelled";
  response?: LearningImpactAssessmentResponseSummary | null;
}

export interface LearningAssignment {
  id: number;
  employeeProfileId: number;
  assignedByProfileId: number;
  managerProfileId?: number | null;
  dueAt: string | null;
  status: "assigned" | "in_progress" | "completed" | "overdue" | "cancelled";
  progressPercent: number;
  startedAt: string | null;
  completedAt: string | null;
  employee?: LearningPersonSummary | null;
  assignedBy?: LearningPersonSummary | null;
  manager?: LearningPersonSummary | null;
  programVersion: LearningProgramVersionSummary | null;
  moduleProgressEntries?: LearningModuleProgressSummary[];
  attendanceRecords?: LearningAttendanceRecordSummary[];
  quizAttempts?: LearningQuizAttemptSummary[];
  certificate?: LearningCertificateSummary | null;
  trainingFeedback?: LearningFeedbackSummary | null;
  impactAssessmentTask?: LearningImpactTaskSummary | null;
}

export interface LearningPointEntry {
  id: number;
  eventType: string;
  sourceType: string;
  sourceId: number;
  points: number;
  awardedAt: string;
  metadata?: Record<string, unknown> | null;
}

export interface LearningPointsSummary {
  profileId: number;
  totalPoints: number;
  entries: LearningPointEntry[];
}

const learningDevelopmentAPI = {
  listPrograms: () => api.get<LearningProgramRecord[]>("/team-management/learning-programs"),
  getProgram: (programId: number) => api.get<LearningProgramRecord>(`/team-management/learning-programs/${programId}`),
  createProgram: (payload: {
    title: string;
    description?: string | null;
    departmentId?: number | null;
    status?: "draft" | "published" | "archived";
    version: LearningProgramVersionPayload;
  }) => api.post("/team-management/learning-programs", payload),
  createProgramVersion: (programId: number, payload: LearningProgramVersionPayload) =>
    api.post(`/team-management/learning-programs/${programId}/versions`, payload),
  updateProgramVersion: (versionId: number, payload: Partial<LearningProgramVersionPayload>) =>
    api.patch(`/team-management/learning-program-versions/${versionId}`, payload),
  createAssignments: (payload: {
    programVersionId: number;
    employeeIds: number[];
    dueAt?: string | null;
  }) => api.post("/team-management/learning-assignments", payload),
  listAssignments: (params?: { employeeId?: number; mine?: boolean }) => {
    const search = new URLSearchParams();
    if (params?.employeeId) search.set("employeeId", String(params.employeeId));
    if (typeof params?.mine === "boolean") search.set("mine", String(params.mine));
    const query = search.toString();
    return api.get<LearningAssignment[]>(
      `/team-management/learning-assignments${query ? `?${query}` : ""}`
    );
  },
  getAssignment: (assignmentId: number) =>
    api.get<LearningAssignment>(`/team-management/learning-assignments/${assignmentId}`),
  updateModuleProgress: (
    assignmentId: number,
    moduleId: number,
    payload: {
      completionPercent?: number | null;
      watchPercent?: number | null;
      scrollPercent?: number | null;
      timeSpentSeconds?: number | null;
      completed?: boolean;
    }
  ) => api.post(`/team-management/learning-assignments/${assignmentId}/modules/${moduleId}/progress`, payload),
  markAttendance: (
    sessionId: number,
    payload: {
      records: Array<{
        assignmentId: number;
        attendanceStatus: "invited" | "attended" | "missed" | "excused";
        notes?: string | null;
      }>;
    }
  ) => api.post(`/team-management/learning-sessions/${sessionId}/attendance`, payload),
  submitQuizAttempt: (
    quizId: number,
    payload: {
      assignmentId: number;
      answers: Array<{
        questionId: number;
        optionIds?: number[];
        freeTextAnswer?: string | null;
      }>;
    }
  ) => api.post(`/team-management/learning-quizzes/${quizId}/attempts`, payload),
  submitFeedback: (
    assignmentId: number,
    payload: {
      overallRating: number;
      contentRating: number;
      deliveryRating: number;
      relevanceRating: number;
      comment?: string | null;
    }
  ) => api.post(`/team-management/learning-assignments/${assignmentId}/feedback`, payload),
  listImpactTasks: () => api.get(`/team-management/learning-impact-tasks`),
  submitImpactResponse: (
    taskId: number,
    payload: {
      behaviorChangeScore?: number | null;
      productivityImpactScore?: number | null;
      qualityImpactScore?: number | null;
      businessImpactScore?: number | null;
      comment?: string | null;
    }
  ) => api.post(`/team-management/learning-impact-tasks/${taskId}/response`, payload),
  issueCertificate: (assignmentId: number) =>
    api.post(`/team-management/learning-assignments/${assignmentId}/certificate/issue`),
  getGlobalCertificateTemplate: () =>
    api.get<GlobalCertificateTemplateRecord>("/team-management/global-certificate-template"),
  updateGlobalCertificateTemplate: (payload: GlobalCertificateTemplateRecord) =>
    api.put<GlobalCertificateTemplateRecord>("/team-management/global-certificate-template", payload),
  getPoints: (employeeId?: number) =>
    api.get<LearningPointsSummary>(
      `/team-management/learning-points${employeeId ? `?employeeId=${employeeId}` : ""}`
    ),
  verifyCertificate: (verificationCode: string) =>
    apiFetch<CertificateVerificationRecord>(
      "GET",
      `/certificates/verify/${encodeURIComponent(verificationCode)}`,
      undefined,
      { skipAuth: true }
    ),
};

export default learningDevelopmentAPI;
