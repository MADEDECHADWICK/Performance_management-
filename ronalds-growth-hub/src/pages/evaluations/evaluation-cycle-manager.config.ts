import type { EvaluationTemplate } from "@/lib/api/evaluations";
import type { PeerAssignmentMode } from "./evaluation-cycle-manager.helpers";

export type EvaluationCycleFormState = {
  title: string;
  description: string;
  cycleType: string;
  startDate: string;
  endDate: string;
  dueMode: "days" | "date";
  dueDate: string;
  dueInDays: string;
  departmentId: string;
};

export type EvaluationLaunchOptionsState = {
  enableSelfEvaluation: boolean;
  enablePeerEvaluation: boolean;
  enableUpwardEvaluation: boolean;
  enableDownwardEvaluation: boolean;
  enableClientEvaluation: boolean;
  peerAssignmentMode: PeerAssignmentMode;
  peersPerPerson: string;
  processAnonymously: boolean;
  hideFromDashboard: boolean;
  cancelIfPastDue: boolean;
  remindersEnabled: boolean;
  reminderCadence: string;
  excludeFromScore: boolean;
  requireEvaluatorSignature: boolean;
  requireEvaluateeSignature: boolean;
  sendSignatureRequestToManagers: boolean;
  sendSignatureRequestToDownwardEvaluators: boolean;
};

export type EvaluationQuestionSummary = {
  sectionCount: number;
  itemCount: number;
  metricCount: number;
  evaluatorTypes: string[];
};

export const today = new Date().toISOString().slice(0, 10);
export const BUILT_IN_TEMPLATE_KEY = "builtin";

export const addDaysToIso = (baseIso: string, days: number) => {
  const base = new Date(`${baseIso}T00:00:00`);
  if (Number.isNaN(base.getTime())) return baseIso;
  base.setDate(base.getDate() + Math.max(0, days));
  return base.toISOString().slice(0, 10);
};

export const defaultEndDate = addDaysToIso(today, 90);
export const defaultDueDate = addDaysToIso(today, 14);

export const BUILT_IN_TEMPLATE: EvaluationTemplate = {
  id: 0,
  name: "Built-in Streamlined 360",
  description: "Default AssessTeam-style questionnaire used when no saved template is selected.",
  isDefault: true,
  templateType: "streamlined_360",
  questions: [
    {
      id: 1,
      text: "Demonstrates strong technical competence in current responsibilities.",
      category: "competency",
      weight: 1.2,
      order: 1,
    },
    {
      id: 2,
      text: "Collaborates effectively with colleagues and stakeholders.",
      category: "behavior",
      weight: 1.1,
      order: 2,
    },
    {
      id: 3,
      text: "Consistently delivers against agreed goals and commitments.",
      category: "competency",
      weight: 1.3,
      order: 3,
    },
    {
      id: 4,
      text: "Reflects the firm's values and professional culture.",
      category: "culture",
      weight: 1,
      order: 4,
    },
    {
      id: 5,
      text: "Shows initiative and ownership when challenges arise.",
      category: "behavior",
      weight: 1,
      order: 5,
    },
  ],
};

export const defaultCycleFormState: EvaluationCycleFormState = {
  title: "",
  description: "",
  cycleType: "annual",
  startDate: today,
  endDate: defaultEndDate,
  dueMode: "days",
  dueDate: defaultDueDate,
  dueInDays: "14",
  departmentId: "",
};

export const defaultLaunchOptionsState: EvaluationLaunchOptionsState = {
  enableSelfEvaluation: false,
  enablePeerEvaluation: false,
  enableUpwardEvaluation: false,
  enableDownwardEvaluation: true,
  enableClientEvaluation: false,
  peerAssignmentMode: "department",
  peersPerPerson: "2",
  processAnonymously: false,
  hideFromDashboard: false,
  cancelIfPastDue: true,
  remindersEnabled: true,
  reminderCadence: "weekly",
  excludeFromScore: false,
  requireEvaluatorSignature: false,
  requireEvaluateeSignature: false,
  sendSignatureRequestToManagers: false,
  sendSignatureRequestToDownwardEvaluators: false,
};
