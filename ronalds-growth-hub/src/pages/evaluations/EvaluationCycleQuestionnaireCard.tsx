import type { Dispatch, SetStateAction } from "react";
import { ListChecks } from "lucide-react";
import type { EvaluationTemplate } from "@/lib/api/evaluations";
import type { EvaluationQuestionSection } from "@/lib/api/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  BUILT_IN_TEMPLATE,
  BUILT_IN_TEMPLATE_KEY,
  type EvaluationQuestionSummary,
} from "./evaluation-cycle-manager.config";
import { emptyQuestion, type DraftQuestion } from "./evaluation-cycle-manager.helpers";

type EvaluationCycleQuestionnaireCardProps = {
  selectedTemplateKey: string;
  setSelectedTemplateKey: (value: string) => void;
  templates: EvaluationTemplate[];
  selectedTemplate: EvaluationTemplate;
  questionSummary: EvaluationQuestionSummary;
  totalQuestionWeight: number;
  customizeQuestions: boolean;
  setCustomizeQuestions: (value: boolean) => void;
  questionDrafts: DraftQuestion[];
  handleQuestionChange: (index: number, field: keyof DraftQuestion, value: string | number) => void;
  setQuestionDrafts: Dispatch<SetStateAction<DraftQuestion[]>>;
  generatedSections: EvaluationQuestionSection[];
};

export default function EvaluationCycleQuestionnaireCard({
  selectedTemplateKey,
  setSelectedTemplateKey,
  templates,
  selectedTemplate,
  questionSummary,
  totalQuestionWeight,
  customizeQuestions,
  setCustomizeQuestions,
  questionDrafts,
  handleQuestionChange,
  setQuestionDrafts,
  generatedSections,
}: EvaluationCycleQuestionnaireCardProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <ListChecks className="h-5 w-5 text-primary" />
          <CardTitle>4. Result Areas and Questionnaire</CardTitle>
        </div>
        <CardDescription>
          Start from a template and optionally customize the prompts before launch.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 md:grid-cols-[1fr_auto]">
          <div className="space-y-2">
            <Label>Template</Label>
            <Select value={selectedTemplateKey} onValueChange={setSelectedTemplateKey}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={BUILT_IN_TEMPLATE_KEY}>{BUILT_IN_TEMPLATE.name}</SelectItem>
                {templates.map((template) => (
                  <SelectItem key={template.id} value={String(template.id)}>
                    {template.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end justify-end gap-3">
            <Label htmlFor="customize-questions" className="text-sm">
              Customize questions
            </Label>
            <Switch
              id="customize-questions"
              checked={customizeQuestions}
              onCheckedChange={setCustomizeQuestions}
            />
          </div>
        </div>

        <div className="rounded-xl border bg-muted/40 p-4">
          <div className="font-medium">{selectedTemplate.name}</div>
          <div className="mt-1 text-sm text-muted-foreground">
            {selectedTemplate.description || "No description provided."}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge variant="outline">{selectedTemplate.questions.length} template questions</Badge>
            <Badge variant="outline">{questionSummary.itemCount} launch items</Badge>
            <Badge variant="outline">{totalQuestionWeight.toFixed(1)} total weight</Badge>
          </div>
        </div>

        {customizeQuestions ? (
          <div className="space-y-3">
            {questionDrafts.map((question, index) => (
              <div key={`${index}-${question.order}`} className="rounded-xl border p-4">
                <div className="grid gap-3 md:grid-cols-[1fr_180px_120px_auto]">
                  <div className="space-y-2">
                    <Label>Result area {index + 1}</Label>
                    <Input
                      value={question.text}
                      onChange={(event) => handleQuestionChange(index, "text", event.target.value)}
                      placeholder="Enter the result area or competency"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Category</Label>
                    <Select
                      value={question.category}
                      onValueChange={(value) => handleQuestionChange(index, "category", value)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="competency">Competency</SelectItem>
                        <SelectItem value="behavior">Behavior</SelectItem>
                        <SelectItem value="culture">Culture</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Weight</Label>
                    <Input
                      type="number"
                      min="0.1"
                      step="0.1"
                      value={question.weight}
                      onChange={(event) => handleQuestionChange(index, "weight", event.target.value)}
                    />
                  </div>
                  <div className="flex items-end">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        setQuestionDrafts((current) =>
                          current.length === 1
                            ? current
                            : current
                                .filter((_, currentIndex) => currentIndex !== index)
                                .map((item, itemIndex) => ({
                                  ...item,
                                  order: itemIndex + 1,
                                }))
                        )
                      }
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              </div>
            ))}

            <Button
              type="button"
              variant="outline"
              onClick={() =>
                setQuestionDrafts((current) => [...current, emptyQuestion(current.length + 1)])
              }
            >
              Add Result Area
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {selectedTemplate.questions.map((question) => (
              <div
                key={`${selectedTemplate.id}-${question.order}`}
                className="flex flex-col gap-2 rounded-xl border px-4 py-3 md:flex-row md:items-center md:justify-between"
              >
                <div>
                  <div className="font-medium">{question.text}</div>
                  <div className="text-sm text-muted-foreground capitalize">
                    {question.category} question
                  </div>
                </div>
                <Badge variant="outline">Weight {question.weight}</Badge>
              </div>
            ))}
          </div>
        )}

        <div className="space-y-3 rounded-xl border bg-muted/20 p-4">
          <div className="font-medium">Launch questionnaire preview</div>
          {generatedSections.map((section) => (
            <div key={section.id} className="rounded-lg border bg-background p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-medium">{section.title}</div>
                  {section.description && (
                    <div className="text-sm text-muted-foreground">{section.description}</div>
                  )}
                </div>
                <Badge variant="outline">{section.items.length} items</Badge>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
