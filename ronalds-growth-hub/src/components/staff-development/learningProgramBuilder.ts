import type { LearningQuizQuestionRecord } from "@/lib/api/learningDevelopment";

export type LearningQuizOptionFormState = {
  id: string;
  label: string;
  isCorrect: boolean;
};

export type LearningQuizQuestionFormState = {
  id: string;
  questionType: LearningQuizQuestionRecord["questionType"];
  prompt: string;
  required: boolean;
  explanation: string;
  options: LearningQuizOptionFormState[];
};

export type LearningProgramModuleFormState = {
  id: string;
  title: string;
  description: string;
  contentType: "video" | "document" | "link" | "knowledge_resource" | "live_session";
  knowledgeHubResourceId: string;
  contentUrl: string;
  required: boolean;
  estimatedMinutes: string;
};

export type LearningProgramSessionFormState = {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  location: string;
  attendancePoints: string;
  attendanceRequired: boolean;
  moduleFormId: string;
};

export type LearningProgramQuizFormState = {
  id: string;
  title: string;
  instructions: string;
  passMark: string;
  pointsOnPass: string;
  attemptLimit: string;
  isMandatory: boolean;
  isActive: boolean;
  moduleFormId: string;
  questions: LearningQuizQuestionFormState[];
};

export type LearningProgramBuilderState = {
  title: string;
  description: string;
  status: "draft" | "published" | "archived";
  versionTitle: string;
  trainingType: "internal" | "external" | "certification" | "workshop";
  deliveryMode: string;
  provider: string;
  trainerProfileId: string;
  externalTrainerName: string;
  isMandatory: boolean;
  feedbackPoints: string;
  impactAssessmentDelayDays: string;
  versionStatus: "draft" | "published" | "retired";
  modules: LearningProgramModuleFormState[];
  sessions: LearningProgramSessionFormState[];
  quizzes: LearningProgramQuizFormState[];
  certificateEnabled: boolean;
  certificateName: string;
  certificateTitle: string;
  certificateBody: string;
  certificateIssuedBy: string;
  certificateBackgroundDocumentId: string;
  certificateSignatureDocumentId: string;
};

export const createFormId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const createTrainingQuizOption = (
  label = "",
  isCorrect = false
): LearningQuizOptionFormState => ({
  id: createFormId(),
  label,
  isCorrect,
});

export const getTrainingQuizOptions = (
  questionType: LearningQuizQuestionRecord["questionType"]
): LearningQuizOptionFormState[] => {
  if (questionType === "true_false") {
    return [createTrainingQuizOption("True", true), createTrainingQuizOption("False", false)];
  }
  if (questionType === "short_text") {
    return [];
  }
  return [createTrainingQuizOption(), createTrainingQuizOption()];
};

export const createTrainingQuizQuestion = (
  questionType: LearningQuizQuestionRecord["questionType"] = "single_choice"
): LearningQuizQuestionFormState => ({
  id: createFormId(),
  questionType,
  prompt: "",
  required: true,
  explanation: "",
  options: getTrainingQuizOptions(questionType),
});

export const createLearningModuleState = (): LearningProgramModuleFormState => ({
  id: createFormId(),
  title: "",
  description: "",
  contentType: "knowledge_resource",
  knowledgeHubResourceId: "",
  contentUrl: "",
  required: true,
  estimatedMinutes: "",
});

export const createLearningSessionState = (): LearningProgramSessionFormState => ({
  id: createFormId(),
  title: "",
  startsAt: "",
  endsAt: "",
  location: "",
  attendancePoints: "0",
  attendanceRequired: true,
  moduleFormId: "",
});

export const createLearningQuizState = (
  moduleFormId = "",
  title = moduleFormId ? "Module Quiz" : "Final Training Quiz"
): LearningProgramQuizFormState => ({
  id: createFormId(),
  title,
  instructions: "",
  passMark: "70",
  pointsOnPass: "0",
  attemptLimit: "",
  isMandatory: true,
  isActive: true,
  moduleFormId,
  questions: [createTrainingQuizQuestion()],
});

export const createLearningProgramBuilderState = (): LearningProgramBuilderState => ({
  title: "",
  description: "",
  status: "draft",
  versionTitle: "",
  trainingType: "internal",
  deliveryMode: "online",
  provider: "",
  trainerProfileId: "",
  externalTrainerName: "",
  isMandatory: true,
  feedbackPoints: "0",
  impactAssessmentDelayDays: "30",
  versionStatus: "published",
  modules: [createLearningModuleState()],
  sessions: [],
  quizzes: [],
  certificateEnabled: false,
  certificateName: "Completion Certificate",
  certificateTitle: "Certificate of Completion",
  certificateBody: "",
  certificateIssuedBy: "",
  certificateBackgroundDocumentId: "",
  certificateSignatureDocumentId: "",
});
