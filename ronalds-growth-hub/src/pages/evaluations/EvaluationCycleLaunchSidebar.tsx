import type { Dispatch, SetStateAction } from "react";
import { CalendarDays, ShieldCheck, X } from "lucide-react";
import type {
  EvaluationCycleSummary,
  EvaluationRelationship,
  TeamDirectoryPerson,
} from "@/lib/api/evaluations";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import type {
  EvaluationLaunchOptionsState,
  EvaluationQuestionSummary,
} from "./evaluation-cycle-manager.config";
import {
  formatPersonLabel,
  formatPersonName,
  removeNumber,
  type DraftAssignment,
} from "./evaluation-cycle-manager.helpers";

type EvaluationCycleLaunchSidebarProps = {
  launchOptions: EvaluationLaunchOptionsState;
  setLaunchOptions: Dispatch<SetStateAction<EvaluationLaunchOptionsState>>;
  people: TeamDirectoryPerson[];
  peopleById: Map<number, TeamDirectoryPerson>;
  specificSignatureIds: number[];
  pendingSignatureProfileId: string;
  setPendingSignatureProfileId: (value: string) => void;
  addSignatureRecipient: () => void;
  setSpecificSignatureIds: Dispatch<SetStateAction<number[]>>;
  targetEvaluateeCount: number;
  questionSummary: EvaluationQuestionSummary;
  suggestedAssignments: DraftAssignment[];
  computedDueDate: string;
  enabledRelationships: EvaluationRelationship[];
  selectedCycleId: string;
  setSelectedCycleId: (value: string) => void;
  cycles: EvaluationCycleSummary[];
  handleBuildLaunchPlan: () => void;
  handleCreateCycle: () => void;
  handlePublish: () => void;
  isCreatingCycle: boolean;
  isPublishing: boolean;
  stagedAssignments: DraftAssignment[];
  setStagedAssignments: Dispatch<SetStateAction<DraftAssignment[]>>;
  assignmentBreakdown: Record<string, number>;
};

const rolloutOptions: Array<{
  key:
    | "processAnonymously"
    | "hideFromDashboard"
    | "cancelIfPastDue"
    | "excludeFromScore";
  label: string;
}> = [
  {
    key: "processAnonymously",
    label: "Process evaluations anonymously",
  },
  {
    key: "hideFromDashboard",
    label: "Hide this evaluation from the evaluated person's dashboard",
  },
  {
    key: "cancelIfPastDue",
    label: "Cancel evaluations if not processed by the due date",
  },
  {
    key: "excludeFromScore",
    label: "Exclude this evaluation from score computation",
  },
];

const signatureOptions: Array<{
  key:
    | "requireEvaluatorSignature"
    | "requireEvaluateeSignature"
    | "sendSignatureRequestToManagers"
    | "sendSignatureRequestToDownwardEvaluators";
  label: string;
}> = [
  {
    key: "requireEvaluatorSignature",
    label: "Make evaluator signature mandatory",
  },
  {
    key: "requireEvaluateeSignature",
    label: "Request acknowledgement from the person being evaluated",
  },
  {
    key: "sendSignatureRequestToManagers",
    label: "Send a signature request to team managers",
  },
  {
    key: "sendSignatureRequestToDownwardEvaluators",
    label: "Send a signature request to downward evaluators",
  },
];

export default function EvaluationCycleLaunchSidebar({
  launchOptions,
  setLaunchOptions,
  people,
  peopleById,
  specificSignatureIds,
  pendingSignatureProfileId,
  setPendingSignatureProfileId,
  addSignatureRecipient,
  setSpecificSignatureIds,
  targetEvaluateeCount,
  questionSummary,
  suggestedAssignments,
  computedDueDate,
  enabledRelationships,
  selectedCycleId,
  setSelectedCycleId,
  cycles,
  handleBuildLaunchPlan,
  handleCreateCycle,
  handlePublish,
  isCreatingCycle,
  isPublishing,
  stagedAssignments,
  setStagedAssignments,
  assignmentBreakdown,
}: EvaluationCycleLaunchSidebarProps) {
  return (
    <div className="space-y-4 xl:sticky xl:top-6 xl:self-start">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-primary" />
            <CardTitle>5. Rollout Rules</CardTitle>
          </div>
          <CardDescription>
            Configure privacy, reminders, due-date handling, and signatures.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            {rolloutOptions.map((option) => (
              <div key={option.key} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                <div className="text-sm">{option.label}</div>
                <Switch
                  checked={launchOptions[option.key]}
                  onCheckedChange={(value) =>
                    setLaunchOptions((current) => ({
                      ...current,
                      [option.key]: value,
                    }))
                  }
                />
              </div>
            ))}
          </div>

          <Separator />

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
            <div className="space-y-2">
              <Label>Reminder cadence</Label>
              <Select
                value={launchOptions.reminderCadence}
                onValueChange={(value) =>
                  setLaunchOptions((current) => ({
                    ...current,
                    reminderCadence: value,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <div className="text-sm font-medium">Reminder emails enabled</div>
                <div className="text-xs text-muted-foreground">
                  Applies to the evaluation workflow schedule.
                </div>
              </div>
              <Switch
                checked={launchOptions.remindersEnabled}
                onCheckedChange={(value) =>
                  setLaunchOptions((current) => ({
                    ...current,
                    remindersEnabled: value,
                  }))
                }
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-amber-200/70 bg-amber-50/30">
        <CardHeader>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-amber-600" />
            <CardTitle>6. Signature Options</CardTitle>
          </div>
          <CardDescription>
            Decide whether signatures or acknowledgements are required at completion.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            {signatureOptions.map((option) => (
              <div
                key={option.key}
                className="flex items-center justify-between gap-3 rounded-lg border bg-background p-3"
              >
                <div className="text-sm">{option.label}</div>
                <Switch
                  checked={launchOptions[option.key]}
                  onCheckedChange={(value) =>
                    setLaunchOptions((current) => ({
                      ...current,
                      [option.key]: value,
                    }))
                  }
                />
              </div>
            ))}
          </div>

          <Separator />

          <div className="space-y-2">
            <Label>Specific signature recipients</Label>
            <div className="flex gap-2">
              <Select
                value={pendingSignatureProfileId || undefined}
                onValueChange={setPendingSignatureProfileId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose person" />
                </SelectTrigger>
                <SelectContent>
                  {people.map((person) => (
                    <SelectItem key={person.id} value={String(person.id)}>
                      {formatPersonLabel(person)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button type="button" variant="outline" onClick={addSignatureRecipient}>
                Add
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {specificSignatureIds.length > 0 ? (
                specificSignatureIds.map((profileId) => (
                  <Badge key={profileId} variant="secondary" className="gap-1">
                    {formatPersonName(peopleById.get(profileId))}
                    <button
                      type="button"
                      onClick={() =>
                        setSpecificSignatureIds((current) => removeNumber(current, profileId))
                      }
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))
              ) : (
                <div className="text-sm text-muted-foreground">No specific recipients selected.</div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-primary/30">
        <CardHeader>
          <CardTitle>7. Launch Preview</CardTitle>
          <CardDescription>
            Review the rollout before you create the cycle draft and publish assignments.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-2">
            <div className="rounded-xl border p-3">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                People evaluated
              </div>
              <div className="mt-1 text-2xl font-semibold">{targetEvaluateeCount}</div>
            </div>
            <div className="rounded-xl border p-3">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Result areas
              </div>
              <div className="mt-1 text-2xl font-semibold">{questionSummary.itemCount}</div>
            </div>
            <div className="rounded-xl border p-3">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Suggested assignments
              </div>
              <div className="mt-1 text-2xl font-semibold">{suggestedAssignments.length}</div>
            </div>
            <div className="rounded-xl border p-3">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Due date</div>
              <div className="mt-1 text-base font-semibold">{computedDueDate}</div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {enabledRelationships.length > 0 ? (
              enabledRelationships.map((relationship) => (
                <Badge key={relationship} variant="outline">
                  {relationship}
                </Badge>
              ))
            ) : (
              <Badge variant="outline">No evaluator group selected</Badge>
            )}
          </div>

          <div className="space-y-2">
            <div className="space-y-2">
              <Label>Select cycle draft</Label>
              <Select value={selectedCycleId || undefined} onValueChange={setSelectedCycleId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select cycle" />
                </SelectTrigger>
                <SelectContent>
                  {cycles.map((cycle) => (
                    <SelectItem key={cycle.id} value={String(cycle.id)}>
                      {cycle.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button
              type="button"
              variant="outline"
              onClick={handleBuildLaunchPlan}
              disabled={suggestedAssignments.length === 0}
              className="w-full"
              data-testid="evaluation-build-launch-plan"
            >
              Build Launch Plan
            </Button>
            <Button
              type="button"
              onClick={handleCreateCycle}
              disabled={isCreatingCycle}
              className="w-full"
              data-testid="evaluation-save-cycle-draft"
            >
              Save Cycle Draft
            </Button>
            <Button
              type="button"
              onClick={handlePublish}
              disabled={isPublishing}
              className="w-full"
              data-testid="evaluation-publish-assignments"
            >
              Publish Assignments
            </Button>
          </div>

          <div className="rounded-xl border bg-muted/20 p-4">
            <div className="text-sm font-medium">Staged assignments</div>
            <div className="mt-3 space-y-3">
              {stagedAssignments.length > 0 ? (
                stagedAssignments.map((assignment, index) => (
                  <div
                    key={`${assignment.evaluateeId}-${assignment.evaluatorId}-${index}`}
                    className="rounded-lg border bg-background p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-medium">
                          {formatPersonName(peopleById.get(assignment.evaluateeId))} to{" "}
                          {formatPersonName(peopleById.get(assignment.evaluatorId))}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                          <Badge variant="outline">{assignment.relationship}</Badge>
                          <span>Due {assignment.dueDate || computedDueDate}</span>
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setStagedAssignments((current) =>
                            current.filter((_, currentIndex) => currentIndex !== index)
                          )
                        }
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-sm text-muted-foreground">
                  No staged assignments yet. Build the launch plan to review the rollout.
                </div>
              )}
            </div>
          </div>

          {Object.keys(assignmentBreakdown).length > 0 && (
            <div className="flex flex-wrap gap-2">
              {Object.entries(assignmentBreakdown).map(([relationship, count]) => (
                <Badge key={relationship} variant="secondary">
                  {relationship}: {count}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
