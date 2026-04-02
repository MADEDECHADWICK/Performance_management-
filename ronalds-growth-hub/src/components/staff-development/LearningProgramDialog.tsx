import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2 } from "lucide-react";
import type { Profile } from "@/lib/api/types";
import type { LearningQuizQuestionRecord } from "@/lib/api/learningDevelopment";
import {
  createLearningModuleState,
  createLearningSessionState,
  createLearningQuizState,
  createTrainingQuizOption,
  createTrainingQuizQuestion,
  getTrainingQuizOptions,
  type LearningProgramBuilderState,
  type LearningProgramModuleFormState,
  type LearningProgramQuizFormState,
  type LearningProgramSessionFormState,
  type LearningQuizOptionFormState,
  type LearningQuizQuestionFormState,
} from "@/components/staff-development/learningProgramBuilder";

const formatEnumLabel = (value: string) => value.replace(/_/g, " ");

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: LearningProgramBuilderState;
  setForm: React.Dispatch<React.SetStateAction<LearningProgramBuilderState>>;
  employeeOptions: Profile[];
  learningResourceOptions: Array<{ id: number; title: string }>;
  certificateAssetOptions: Array<{ id: number; label: string }>;
  onSubmit: () => void;
  isSubmitting: boolean;
};

export default function LearningProgramDialog({
  open,
  onOpenChange,
  form,
  setForm,
  employeeOptions,
  learningResourceOptions,
  certificateAssetOptions,
  onSubmit,
  isSubmitting,
}: Props) {
  const updateModule = (
    moduleId: string,
    updater: (module: LearningProgramModuleFormState) => LearningProgramModuleFormState
  ) => {
    setForm((prev) => ({
      ...prev,
      modules: prev.modules.map((module) => (module.id === moduleId ? updater(module) : module)),
    }));
  };

  const updateSession = (
    sessionId: string,
    updater: (session: LearningProgramSessionFormState) => LearningProgramSessionFormState
  ) => {
    setForm((prev) => ({
      ...prev,
      sessions: prev.sessions.map((session) => (session.id === sessionId ? updater(session) : session)),
    }));
  };

  const updateQuestion = (
    quizId: string,
    questionId: string,
    updater: (question: LearningQuizQuestionFormState) => LearningQuizQuestionFormState
  ) => {
    setForm((prev) => ({
      ...prev,
      quizzes: prev.quizzes.map((quiz) =>
        quiz.id === quizId
          ? {
              ...quiz,
              questions: quiz.questions.map((question) =>
                question.id === questionId ? updater(question) : question
              ),
            }
          : quiz
      ),
    }));
  };

  const addQuiz = (moduleFormId = "") => {
    setForm((prev) => ({
      ...prev,
      quizzes: [...prev.quizzes, createLearningQuizState(moduleFormId)],
    }));
  };

  const removeQuiz = (quizId: string) => {
    setForm((prev) => ({
      ...prev,
      quizzes: prev.quizzes.filter((quiz) => quiz.id !== quizId),
    }));
  };

  const updateQuiz = (
    quizId: string,
    updater: (quiz: LearningProgramQuizFormState) => LearningProgramQuizFormState
  ) => {
    setForm((prev) => ({
      ...prev,
      quizzes: prev.quizzes.map((quiz) => (quiz.id === quizId ? updater(quiz) : quiz)),
    }));
  };

  const addQuestion = (quizId: string) => {
    updateQuiz(quizId, (quiz) => ({
      ...quiz,
      questions: [...quiz.questions, createTrainingQuizQuestion()],
    }));
  };

  const removeQuestion = (quizId: string, questionId: string) => {
    updateQuiz(quizId, (quiz) => ({
      ...quiz,
      questions:
        quiz.questions.length > 1
          ? quiz.questions.filter((question) => question.id !== questionId)
          : quiz.questions,
    }));
  };

  const changeQuestionType = (
    quizId: string,
    questionId: string,
    questionType: LearningQuizQuestionRecord["questionType"]
  ) => {
    updateQuestion(quizId, questionId, (question) => ({
      ...question,
      questionType,
      options: getTrainingQuizOptions(questionType),
    }));
  };

  const updateQuestionOption = (
    quizId: string,
    questionId: string,
    optionId: string,
    updater: (option: LearningQuizOptionFormState) => LearningQuizOptionFormState
  ) => {
    updateQuestion(quizId, questionId, (question) => ({
      ...question,
      options: question.options.map((option) => (option.id === optionId ? updater(option) : option)),
    }));
  };

  const addQuestionOption = (quizId: string, questionId: string) => {
    updateQuestion(quizId, questionId, (question) => ({
      ...question,
      options: [...question.options, createTrainingQuizOption()],
    }));
  };

  const removeQuestionOption = (quizId: string, questionId: string, optionId: string) => {
    updateQuestion(quizId, questionId, (question) => ({
      ...question,
      options:
        question.options.length > 2
          ? question.options.filter((option) => option.id !== optionId)
          : question.options,
    }));
  };

  const toggleQuestionOptionCorrect = (
    quizId: string,
    questionId: string,
    optionId: string,
    checked: boolean
  ) => {
    updateQuestion(quizId, questionId, (question) => ({
      ...question,
      options: question.options.map((option) => {
        if (question.questionType === "multiple_choice") {
          return option.id === optionId ? { ...option, isCorrect: checked } : option;
        }
        return option.id === optionId
          ? { ...option, isCorrect: checked }
          : { ...option, isCorrect: false };
      }),
    }));
  };

  const moduleTargetOptions = form.modules.map((module, index) => ({
    value: module.id,
    label: module.title.trim() || `Module ${index + 1}`,
  }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] w-[95vw] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Assigned Learning Program</DialogTitle>
          <DialogDescription>
            Define the training structure, attendance settings, and certificate configuration.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Program Title</label>
              <Input
                value={form.title}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    title: event.target.value,
                    versionTitle:
                      prev.versionTitle || !event.target.value
                        ? prev.versionTitle
                        : `${event.target.value} v1`,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Program Status</label>
              <Select
                value={form.status}
                onValueChange={(value) =>
                  setForm((prev) => ({
                    ...prev,
                    status: value as LearningProgramBuilderState["status"],
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="published">Published</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium">Description</label>
              <Textarea
                value={form.description}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    description: event.target.value,
                  }))
                }
                rows={3}
              />
            </div>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Version Setup</CardTitle>
              <CardDescription>The first version learners will receive.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">Version Title</label>
                <Input
                  value={form.versionTitle}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      versionTitle: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Version Status</label>
                <Select
                  value={form.versionStatus}
                  onValueChange={(value) =>
                    setForm((prev) => ({
                      ...prev,
                      versionStatus: value as LearningProgramBuilderState["versionStatus"],
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="published">Published</SelectItem>
                    <SelectItem value="retired">Retired</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Training Type</label>
                <Select
                  value={form.trainingType}
                  onValueChange={(value) =>
                    setForm((prev) => ({
                      ...prev,
                      trainingType: value as LearningProgramBuilderState["trainingType"],
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="internal">Internal</SelectItem>
                    <SelectItem value="external">External</SelectItem>
                    <SelectItem value="certification">Certification</SelectItem>
                    <SelectItem value="workshop">Workshop</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Delivery Mode</label>
                <Input
                  value={form.deliveryMode}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      deliveryMode: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Provider</label>
                <Input
                  value={form.provider}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      provider: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Trainer</label>
                <Select
                  value={form.trainerProfileId || "external"}
                  onValueChange={(value) =>
                    setForm((prev) => ({
                      ...prev,
                      trainerProfileId: value === "external" ? "" : value,
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="external">External / custom trainer</SelectItem>
                    {employeeOptions.map((employee) => (
                      <SelectItem key={employee.id} value={String(employee.id)}>
                        {[employee.firstName, employee.lastName].filter(Boolean).join(" ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">External Trainer Name</label>
                <Input
                  value={form.externalTrainerName}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      externalTrainerName: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Feedback Points</label>
                <Input
                  type="number"
                  min="0"
                  value={form.feedbackPoints}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      feedbackPoints: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Impact Delay (days)</label>
                <Input
                  type="number"
                  min="0"
                  value={form.impactAssessmentDelayDays}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      impactAssessmentDelayDays: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="md:col-span-2">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.isMandatory}
                    onCheckedChange={(checked) =>
                      setForm((prev) => ({
                        ...prev,
                        isMandatory: checked === true,
                      }))
                    }
                  />
                  <span>Mandatory training</span>
                </label>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base">Modules</CardTitle>
                  <CardDescription>Ordered learning content for the program.</CardDescription>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setForm((prev) => ({
                      ...prev,
                      modules: [...prev.modules, createLearningModuleState()],
                    }))
                  }
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add Module
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {form.modules.map((module, index) => (
                <div key={module.id} className="space-y-4 rounded-lg border p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium">Module {index + 1}</p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setForm((prev) => ({
                          ...prev,
                          modules:
                            prev.modules.length > 1
                              ? prev.modules.filter((item) => item.id !== module.id)
                              : prev.modules,
                        }))
                      }
                      disabled={form.modules.length <= 1}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Remove
                    </Button>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Module Title</label>
                      <Input
                        value={module.title}
                        onChange={(event) =>
                          updateModule(module.id, (current) => ({
                            ...current,
                            title: event.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Content Type</label>
                      <Select
                        value={module.contentType}
                        onValueChange={(value) =>
                          updateModule(module.id, (current) => ({
                            ...current,
                            contentType: value as LearningProgramModuleFormState["contentType"],
                          }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="knowledge_resource">Knowledge Hub Resource</SelectItem>
                          <SelectItem value="video">Video URL</SelectItem>
                          <SelectItem value="document">Document URL</SelectItem>
                          <SelectItem value="link">External Link</SelectItem>
                          <SelectItem value="live_session">Live Session</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <label className="text-sm font-medium">Description</label>
                      <Textarea
                        value={module.description}
                        onChange={(event) =>
                          updateModule(module.id, (current) => ({
                            ...current,
                            description: event.target.value,
                          }))
                        }
                        rows={2}
                      />
                    </div>
                    {module.contentType === "knowledge_resource" ? (
                      <div className="space-y-2 md:col-span-2">
                        <label className="text-sm font-medium">Knowledge Hub Resource</label>
                        <Select
                          value={module.knowledgeHubResourceId || "none"}
                          onValueChange={(value) =>
                            updateModule(module.id, (current) => ({
                              ...current,
                              knowledgeHubResourceId: value === "none" ? "" : value,
                            }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Select resource</SelectItem>
                            {learningResourceOptions.map((resource) => (
                              <SelectItem key={resource.id} value={String(resource.id)}>
                                {resource.title}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ) : (
                      <div className="space-y-2 md:col-span-2">
                        <label className="text-sm font-medium">Content URL</label>
                        <Input
                          value={module.contentUrl}
                          onChange={(event) =>
                            updateModule(module.id, (current) => ({
                              ...current,
                              contentUrl: event.target.value,
                            }))
                          }
                        />
                      </div>
                    )}
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Estimated Minutes</label>
                      <Input
                        type="number"
                        min="0"
                        value={module.estimatedMinutes}
                        onChange={(event) =>
                          updateModule(module.id, (current) => ({
                            ...current,
                            estimatedMinutes: event.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="flex items-end">
                      <label className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={module.required}
                          onCheckedChange={(checked) =>
                            updateModule(module.id, (current) => ({
                              ...current,
                              required: checked === true,
                            }))
                          }
                        />
                        <span>Required</span>
                      </label>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base">Instructor Sessions</CardTitle>
                  <CardDescription>Optional live sessions used for attendance points.</CardDescription>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setForm((prev) => ({
                      ...prev,
                      sessions: [...prev.sessions, createLearningSessionState()],
                    }))
                  }
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add Session
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {form.sessions.length === 0 ? (
                <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                  No live sessions configured yet.
                </div>
              ) : (
                form.sessions.map((session, index) => (
                  <div key={session.id} className="space-y-4 rounded-lg border p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-medium">Session {index + 1}</p>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setForm((prev) => ({
                            ...prev,
                            sessions: prev.sessions.filter((item) => item.id !== session.id),
                          }))
                        }
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Remove
                      </Button>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2 md:col-span-2">
                        <label className="text-sm font-medium">Title</label>
                        <Input
                          value={session.title}
                          onChange={(event) =>
                            updateSession(session.id, (current) => ({
                              ...current,
                              title: event.target.value,
                            }))
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Starts At</label>
                        <Input
                          type="datetime-local"
                          value={session.startsAt}
                          onChange={(event) =>
                            updateSession(session.id, (current) => ({
                              ...current,
                              startsAt: event.target.value,
                            }))
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Ends At</label>
                        <Input
                          type="datetime-local"
                          value={session.endsAt}
                          onChange={(event) =>
                            updateSession(session.id, (current) => ({
                              ...current,
                              endsAt: event.target.value,
                            }))
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Location</label>
                        <Input
                          value={session.location}
                          onChange={(event) =>
                            updateSession(session.id, (current) => ({
                              ...current,
                              location: event.target.value,
                            }))
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Linked Module</label>
                        <Select
                          value={session.moduleFormId || "__none__"}
                          onValueChange={(value) =>
                            updateSession(session.id, (current) => ({
                              ...current,
                              moduleFormId: value === "__none__" ? "" : value,
                            }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Standalone session" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">Standalone session</SelectItem>
                            {moduleTargetOptions.map((module) => (
                              <SelectItem key={module.value} value={module.value}>
                                {module.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Attendance Points</label>
                        <Input
                          type="number"
                          min="0"
                          value={session.attendancePoints}
                          onChange={(event) =>
                            updateSession(session.id, (current) => ({
                              ...current,
                              attendancePoints: event.target.value,
                            }))
                          }
                        />
                      </div>
                      <div className="md:col-span-2">
                        <label className="flex items-center gap-2 text-sm">
                          <Checkbox
                            checked={session.attendanceRequired}
                            onCheckedChange={(checked) =>
                              updateSession(session.id, (current) => ({
                                ...current,
                                attendanceRequired: checked === true,
                              }))
                            }
                          />
                          <span>Attendance required</span>
                        </label>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base">Quizzes</CardTitle>
                  <CardDescription>
                    Add module checks or a final assessment and award quiz points on pass.
                  </CardDescription>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => addQuiz("")}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Quiz
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
                Attendance points are configured per live session, quiz points are awarded on pass,
                and feedback points are configured in the version setup above.
              </div>

              {form.quizzes.length === 0 ? (
                <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                  No quizzes configured yet. Add a final assessment or attach short quizzes to
                  individual modules.
                </div>
              ) : (
                <div className="space-y-4">
                  {form.quizzes.map((quiz, quizIndex) => (
                    <div key={quiz.id} className="space-y-4 rounded-lg border p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-medium">Quiz {quizIndex + 1}</p>
                          <p className="text-sm text-muted-foreground">
                            {quiz.moduleFormId
                              ? `Linked to ${
                                  moduleTargetOptions.find((module) => module.value === quiz.moduleFormId)
                                    ?.label || "selected module"
                                }`
                              : "Final or standalone quiz"}
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeQuiz(quiz.id)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Remove
                        </Button>
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2 md:col-span-2">
                          <label className="text-sm font-medium">Quiz Title</label>
                          <Input
                            value={quiz.title}
                            onChange={(event) =>
                              updateQuiz(quiz.id, (current) => ({
                                ...current,
                                title: event.target.value,
                              }))
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Linked Module</label>
                          <Select
                            value={quiz.moduleFormId || "__final__"}
                            onValueChange={(value) =>
                              updateQuiz(quiz.id, (current) => ({
                                ...current,
                                moduleFormId: value === "__final__" ? "" : value,
                              }))
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Final or standalone quiz" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__final__">Final / standalone quiz</SelectItem>
                              {moduleTargetOptions.map((module) => (
                                <SelectItem key={module.value} value={module.value}>
                                  {module.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Attempt Limit</label>
                          <Input
                            type="number"
                            min="1"
                            placeholder="Unlimited"
                            value={quiz.attemptLimit}
                            onChange={(event) =>
                              updateQuiz(quiz.id, (current) => ({
                                ...current,
                                attemptLimit: event.target.value,
                              }))
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Pass Mark (%)</label>
                          <Input
                            type="number"
                            min="0"
                            max="100"
                            value={quiz.passMark}
                            onChange={(event) =>
                              updateQuiz(quiz.id, (current) => ({
                                ...current,
                                passMark: event.target.value,
                              }))
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Quiz Points on Pass</label>
                          <Input
                            type="number"
                            min="0"
                            value={quiz.pointsOnPass}
                            onChange={(event) =>
                              updateQuiz(quiz.id, (current) => ({
                                ...current,
                                pointsOnPass: event.target.value,
                              }))
                            }
                          />
                        </div>
                        <div className="space-y-2 md:col-span-2">
                          <label className="text-sm font-medium">Instructions</label>
                          <Textarea
                            rows={2}
                            placeholder="Optional learner instructions shown before the quiz."
                            value={quiz.instructions}
                            onChange={(event) =>
                              updateQuiz(quiz.id, (current) => ({
                                ...current,
                                instructions: event.target.value,
                              }))
                            }
                          />
                        </div>
                        <div>
                          <label className="flex items-center gap-2 text-sm">
                            <Checkbox
                              checked={quiz.isMandatory}
                              onCheckedChange={(checked) =>
                                updateQuiz(quiz.id, (current) => ({
                                  ...current,
                                  isMandatory: checked === true,
                                }))
                              }
                            />
                            <span>Mandatory quiz</span>
                          </label>
                        </div>
                        <div>
                          <label className="flex items-center gap-2 text-sm">
                            <Checkbox
                              checked={quiz.isActive}
                              onCheckedChange={(checked) =>
                                updateQuiz(quiz.id, (current) => ({
                                  ...current,
                                  isActive: checked === true,
                                }))
                              }
                            />
                            <span>Quiz active</span>
                          </label>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="font-medium">Questions</p>
                            <p className="text-sm text-muted-foreground">
                              Build the questions learners must complete for this quiz.
                            </p>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => addQuestion(quiz.id)}
                          >
                            <Plus className="mr-2 h-4 w-4" />
                            Add Question
                          </Button>
                        </div>

                        {quiz.questions.map((question, index) => (
                          <div key={question.id} className="space-y-4 rounded-lg border p-4">
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <p className="font-medium">Question {index + 1}</p>
                                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                                  {formatEnumLabel(question.questionType)}
                                </p>
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => removeQuestion(quiz.id, question.id)}
                                disabled={quiz.questions.length <= 1}
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Remove
                              </Button>
                            </div>

                            <div className="grid gap-4 md:grid-cols-2">
                              <div className="space-y-2 md:col-span-2">
                                <label className="text-sm font-medium">Prompt</label>
                                <Textarea
                                  value={question.prompt}
                                  onChange={(event) =>
                                    updateQuestion(quiz.id, question.id, (current) => ({
                                      ...current,
                                      prompt: event.target.value,
                                    }))
                                  }
                                  rows={2}
                                />
                              </div>
                              <div className="space-y-2">
                                <label className="text-sm font-medium">Question Type</label>
                                <Select
                                  value={question.questionType}
                                  onValueChange={(value) =>
                                    changeQuestionType(
                                      quiz.id,
                                      question.id,
                                      value as LearningQuizQuestionRecord["questionType"]
                                    )
                                  }
                                >
                                  <SelectTrigger>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="single_choice">Single Choice</SelectItem>
                                    <SelectItem value="multiple_choice">Multiple Choice</SelectItem>
                                    <SelectItem value="true_false">True / False</SelectItem>
                                    <SelectItem value="short_text">Short Text</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="flex items-end">
                                <label className="flex items-center gap-2 text-sm">
                                  <Checkbox
                                    checked={question.required}
                                    onCheckedChange={(checked) =>
                                      updateQuestion(quiz.id, question.id, (current) => ({
                                        ...current,
                                        required: checked === true,
                                      }))
                                    }
                                  />
                                  <span>Required question</span>
                                </label>
                              </div>
                              <div className="space-y-2 md:col-span-2">
                                <label className="text-sm font-medium">Explanation</label>
                                <Textarea
                                  value={question.explanation}
                                  onChange={(event) =>
                                    updateQuestion(quiz.id, question.id, (current) => ({
                                      ...current,
                                      explanation: event.target.value,
                                    }))
                                  }
                                  rows={2}
                                  placeholder="Optional explanation shown in review or reporting."
                                />
                              </div>
                            </div>

                            <div className="space-y-3">
                              <div className="flex items-center justify-between gap-3">
                                <div>
                                  <p className="text-sm font-medium">Answer Options</p>
                                  <p className="text-xs text-muted-foreground">
                                    {question.questionType === "multiple_choice"
                                      ? "Mark all correct options for this question."
                                      : question.questionType === "short_text"
                                        ? "Learners submit a written answer. The current scorer treats any non-empty answer as correct."
                                        : question.questionType === "true_false"
                                          ? "True / False questions use a fixed pair of options and one answer key."
                                          : "Select exactly one correct option for this question."}
                                  </p>
                                </div>
                                {question.questionType !== "short_text" &&
                                  question.questionType !== "true_false" && (
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      onClick={() => addQuestionOption(quiz.id, question.id)}
                                    >
                                      <Plus className="mr-2 h-4 w-4" />
                                      Add Option
                                    </Button>
                                  )}
                              </div>

                              {question.questionType === "short_text" ? (
                                <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                                  No answer options are needed for short-text questions.
                                </div>
                              ) : (
                                question.options.map((option, optionIndex) => (
                                  <div
                                    key={option.id}
                                    className="grid gap-3 rounded-md border p-3 md:grid-cols-[1fr_auto_auto]"
                                  >
                                    <div className="space-y-2">
                                      <label className="text-xs font-medium text-muted-foreground">
                                        Option {optionIndex + 1}
                                      </label>
                                      <Input
                                        value={option.label}
                                        disabled={question.questionType === "true_false"}
                                        onChange={(event) =>
                                          updateQuestionOption(
                                            quiz.id,
                                            question.id,
                                            option.id,
                                            (current) => ({
                                              ...current,
                                              label: event.target.value,
                                            })
                                          )
                                        }
                                      />
                                    </div>
                                    <div className="flex items-end">
                                      <label className="flex items-center gap-2 text-sm">
                                        <Checkbox
                                          checked={option.isCorrect}
                                          onCheckedChange={(checked) =>
                                            toggleQuestionOptionCorrect(
                                              quiz.id,
                                              question.id,
                                              option.id,
                                              checked === true
                                            )
                                          }
                                        />
                                        <span>
                                          {question.questionType === "multiple_choice"
                                            ? "Correct"
                                            : "Answer Key"}
                                        </span>
                                      </label>
                                    </div>
                                    <div className="flex items-end justify-end">
                                      {question.questionType !== "true_false" && (
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="sm"
                                          onClick={() =>
                                            removeQuestionOption(quiz.id, question.id, option.id)
                                          }
                                          disabled={question.options.length <= 2}
                                        >
                                          <Trash2 className="mr-2 h-4 w-4" />
                                          Remove
                                        </Button>
                                      )}
                                    </div>
                                  </div>
                                ))
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Certificate</CardTitle>
              <CardDescription>
                A standard certificate is available automatically. Use this section only if this
                training needs custom wording or branding.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={form.certificateEnabled}
                  onCheckedChange={(checked) =>
                    setForm((prev) => ({
                      ...prev,
                      certificateEnabled: checked === true,
                    }))
                  }
                />
                <span>Customize the default certificate for this training</span>
              </label>

              {form.certificateEnabled && (
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Template Name</label>
                    <Input
                      value={form.certificateName}
                      onChange={(event) =>
                        setForm((prev) => ({
                          ...prev,
                          certificateName: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Issued By Label</label>
                    <Input
                      value={form.certificateIssuedBy}
                      onChange={(event) =>
                        setForm((prev) => ({
                          ...prev,
                          certificateIssuedBy: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Certificate Title</label>
                    <Input
                      value={form.certificateTitle}
                      onChange={(event) =>
                        setForm((prev) => ({
                          ...prev,
                          certificateTitle: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Background Asset</label>
                    <Select
                      value={form.certificateBackgroundDocumentId || "__none__"}
                      onValueChange={(value) =>
                        setForm((prev) => ({
                          ...prev,
                          certificateBackgroundDocumentId: value === "__none__" ? "" : value,
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="No background asset" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">No background asset</SelectItem>
                        {certificateAssetOptions.map((asset) => (
                          <SelectItem key={asset.id} value={String(asset.id)}>
                            {asset.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Signature Asset</label>
                    <Select
                      value={form.certificateSignatureDocumentId || "__none__"}
                      onValueChange={(value) =>
                        setForm((prev) => ({
                          ...prev,
                          certificateSignatureDocumentId: value === "__none__" ? "" : value,
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="No signature asset" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">No signature asset</SelectItem>
                        {certificateAssetOptions.map((asset) => (
                          <SelectItem key={asset.id} value={String(asset.id)}>
                            {asset.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-sm font-medium">Certificate Body</label>
                    <Textarea
                      value={form.certificateBody}
                      onChange={(event) =>
                        setForm((prev) => ({
                          ...prev,
                          certificateBody: event.target.value,
                        }))
                      }
                      rows={3}
                    />
                  </div>
                  <div className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground md:col-span-2">
                    Use image documents for the best result. Background assets render full-page and
                    signature assets render near the issuer label.
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="flex justify-end gap-3 pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={isSubmitting}>
            Create Program
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
