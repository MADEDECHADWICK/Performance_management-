import type {
  AssignEvaluatorsPayload,
  EvaluationRelationship,
  EvaluationTemplateQuestionInput,
  EvaluationWorkflowType,
  TeamDirectoryPerson,
} from "@/lib/api/evaluations";

export type DraftAssignment = AssignEvaluatorsPayload["assignments"][number];
export type DraftQuestion = EvaluationTemplateQuestionInput;
export type PeerAssignmentMode = "department" | "manager" | "any";
export type ManualEvaluatorMap = Record<EvaluationRelationship, number[]>;

export const relationshipCards: Array<{
  value: EvaluationRelationship;
  workflowType: EvaluationWorkflowType;
  title: string;
  description: string;
}> = [
  {
    value: "manager",
    workflowType: "manager",
    title: "Downward evaluators",
    description: "Managers or supervisors",
  },
  {
    value: "peer",
    workflowType: "peer",
    title: "Peer evaluators",
    description: "Peers at the same level",
  },
  {
    value: "subordinate",
    workflowType: "direct_report",
    title: "Upward evaluators",
    description: "Direct reports or subordinates",
  },
  {
    value: "self",
    workflowType: "self",
    title: "Self evaluation",
    description: "The employee completes their own review",
  },
  {
    value: "client",
    workflowType: "client",
    title: "Client/customer evaluators",
    description: "Client-facing feedback from selected contacts or stakeholders",
  },
];

export const createQuestionDraft = (
  question?: Partial<DraftQuestion>,
  order = 1
): DraftQuestion => ({
  text: String(question?.text || "").trim(),
  category: question?.category || "competency",
  weight: Number(question?.weight) > 0 ? Number(question?.weight) : 1,
  order: Number(question?.order) > 0 ? Number(question?.order) : order,
});

export const cloneQuestions = (questions: Array<Partial<DraftQuestion>>) =>
  questions.map((question, index) => createQuestionDraft(question, index + 1));

export const emptyQuestion = (order: number): DraftQuestion => ({
  text: "",
  category: "competency",
  weight: 1,
  order,
});

export const formatPersonName = (person?: {
  firstName?: string | null;
  lastName?: string | null;
}) => {
  const name = [person?.firstName, person?.lastName].filter(Boolean).join(" ").trim();
  return name || "Unknown person";
};

export const formatPersonLabel = (person?: TeamDirectoryPerson | null) => {
  if (!person) return "Unknown person";
  const name = formatPersonName(person);
  return person.positionTitle ? `${name} (${person.positionTitle})` : name;
};

export const normalizeText = (value: string | null | undefined) =>
  String(value || "").trim().toLowerCase();

export const appendUniqueNumber = (items: number[], value: number) =>
  items.includes(value) ? items : [...items, value];

export const appendUniqueText = (items: string[], value: string) =>
  items.some((entry) => normalizeText(entry) === normalizeText(value)) ? items : [...items, value];

export const removeNumber = (items: number[], value: number) =>
  items.filter((entry) => entry !== value);

export const removeText = (items: string[], value: string) =>
  items.filter((entry) => normalizeText(entry) !== normalizeText(value));

export const buildLaunchAssignments = ({
  evaluatees,
  people,
  manualEvaluators,
  enabledRelationships,
  dueDate,
  peerAssignmentMode,
  peersPerPerson,
}: {
  evaluatees: TeamDirectoryPerson[];
  people: TeamDirectoryPerson[];
  manualEvaluators: ManualEvaluatorMap;
  enabledRelationships: EvaluationRelationship[];
  dueDate?: string;
  peerAssignmentMode: PeerAssignmentMode;
  peersPerPerson: number;
}): DraftAssignment[] => {
  const assignments = new Map<string, DraftAssignment>();
  const enabledSet = new Set(enabledRelationships);

  const addAssignment = (
    evaluateeId: number,
    evaluatorId: number | null | undefined,
    relationship: EvaluationRelationship
  ) => {
    if (!enabledSet.has(relationship) || !evaluatorId) return;
    if (relationship !== "self" && evaluatorId === evaluateeId) return;
    const key = `${evaluateeId}:${evaluatorId}:${relationship}`;
    assignments.set(key, {
      evaluateeId,
      evaluatorId,
      relationship,
      dueDate: dueDate || undefined,
    });
  };

  evaluatees.forEach((evaluatee) => {
    if (enabledSet.has("self")) {
      addAssignment(evaluatee.id, evaluatee.id, "self");
    }

    if (enabledSet.has("manager")) {
      const manual = manualEvaluators.manager;
      if (manual.length > 0) {
        manual.forEach((evaluatorId) => addAssignment(evaluatee.id, evaluatorId, "manager"));
      } else {
        addAssignment(evaluatee.id, evaluatee.managerId, "manager");
      }
    }

    if (enabledSet.has("peer")) {
      const manual = manualEvaluators.peer;
      if (manual.length > 0) {
        manual.forEach((evaluatorId) => addAssignment(evaluatee.id, evaluatorId, "peer"));
      } else {
        let peerCandidates = people.filter((candidate) => candidate.id !== evaluatee.id);
        if (peerAssignmentMode === "manager" && evaluatee.managerId) {
          peerCandidates = peerCandidates.filter(
            (candidate) => candidate.managerId && candidate.managerId === evaluatee.managerId
          );
        } else if (peerAssignmentMode === "department" && evaluatee.department?.id) {
          peerCandidates = peerCandidates.filter(
            (candidate) => candidate.department?.id === evaluatee.department?.id
          );
        }
        peerCandidates.slice(0, Math.max(1, peersPerPerson)).forEach((candidate) => {
          addAssignment(evaluatee.id, candidate.id, "peer");
        });
      }
    }

    if (enabledSet.has("subordinate")) {
      const manual = manualEvaluators.subordinate;
      if (manual.length > 0) {
        manual.forEach((evaluatorId) =>
          addAssignment(evaluatee.id, evaluatorId, "subordinate")
        );
      } else {
        people
          .filter((candidate) => candidate.managerId === evaluatee.id)
          .forEach((candidate) => addAssignment(evaluatee.id, candidate.id, "subordinate"));
      }
    }

    if (enabledSet.has("client")) {
      manualEvaluators.client.forEach((evaluatorId) =>
        addAssignment(evaluatee.id, evaluatorId, "client")
      );
    }
  });

  return Array.from(assignments.values()).sort((left, right) => {
    if (left.evaluateeId !== right.evaluateeId) {
      return left.evaluateeId - right.evaluateeId;
    }
    return left.relationship.localeCompare(right.relationship);
  });
};
