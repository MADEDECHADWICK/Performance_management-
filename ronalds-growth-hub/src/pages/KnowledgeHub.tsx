import { Suspense, lazy, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  Download,
  Eye,
  Filter,
  Lock,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Star,
  Trash2,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import knowledgeHubAPI, {
  KnowledgeHubMeta,
  KnowledgeHubResource,
  KnowledgeHubQuiz,
  KnowledgeHubQuizQuestion,
  UpsertKnowledgeHubResourceInput,
  UpsertKnowledgeHubQuizInput,
} from "@/lib/api/knowledgeHub";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import PageLoader from "@/components/ui/page-loader";
import type { TrackedContentProgress } from "@/components/learning/TrackedContentViewer";

const TrackedContentViewer = lazy(() => import("@/components/learning/TrackedContentViewer"));

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

const DEFAULT_META: KnowledgeHubMeta = {
  domains: ["accounting", "tax", "audit", "compliance", "advisory", "operations"],
  resourceTypes: ["guide", "template", "checklist", "policy", "article", "video", "tool"],
  assetKinds: ["document", "image", "video", "link"],
  modules: [],
};

type ResourceFormState = {
  title: string;
  summary: string;
  domain: string;
  resourceType: string;
  assetKind: string;
  tagsInput: string;
  linkUrl: string;
  content: string;
  allowDownload: boolean;
  isFeatured: boolean;
  isPublished: boolean;
  estimatedDurationMinutes: string;
  completionMode: KnowledgeHubResource["completionMode"];
  completionThresholdPercent: string;
  minReadSeconds: string;
  pointsOnCompletion: string;
};

type QuizOptionFormState = {
  id: string;
  label: string;
  isCorrect: boolean;
};

type QuizQuestionFormState = {
  id: string;
  questionType: KnowledgeHubQuizQuestion["questionType"];
  prompt: string;
  required: boolean;
  explanation: string;
  options: QuizOptionFormState[];
};

type QuizFormState = {
  enabled: boolean;
  title: string;
  passMark: string;
  pointsOnPass: string;
  attemptLimit: string;
  isActive: boolean;
  questions: QuizQuestionFormState[];
};

const parseTags = (value: string) =>
  Array.from(
    new Set(
      value
        .split(",")
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean)
    )
  );

const isLocalUploadUrl = (value: string | null | undefined) =>
  typeof value === "string" && value.startsWith("/uploads/knowledge-hub/");

const createFormId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const createQuizOption = (label = "", isCorrect = false): QuizOptionFormState => ({
  id: createFormId(),
  label,
  isCorrect,
});

const getDefaultOptionsForQuestionType = (
  questionType: KnowledgeHubQuizQuestion["questionType"]
): QuizOptionFormState[] => {
  if (questionType === "true_false") {
    return [createQuizOption("True", true), createQuizOption("False", false)];
  }

  if (questionType === "short_text") {
    return [];
  }

  return [createQuizOption(), createQuizOption()];
};

const createQuizQuestion = (
  questionType: KnowledgeHubQuizQuestion["questionType"] = "single_choice"
): QuizQuestionFormState => ({
  id: createFormId(),
  questionType,
  prompt: "",
  required: true,
  explanation: "",
  options: getDefaultOptionsForQuestionType(questionType),
});

const createQuizFormState = (): QuizFormState => ({
  enabled: false,
  title: "Knowledge Check",
  passMark: "70",
  pointsOnPass: "0",
  attemptLimit: "",
  isActive: true,
  questions: [createQuizQuestion()],
});

const toQuizFormState = (quiz: KnowledgeHubQuiz | null | undefined): QuizFormState => {
  if (!quiz) {
    return createQuizFormState();
  }

  return {
    enabled: true,
    title: quiz.title || "Knowledge Check",
    passMark: String(quiz.passMark ?? 70),
    pointsOnPass: String(quiz.pointsOnPass ?? 0),
    attemptLimit: quiz.attemptLimit ? String(quiz.attemptLimit) : "",
    isActive: quiz.isActive,
    questions:
      quiz.questions.length > 0
        ? quiz.questions.map((question) => ({
            id: String(question.id),
            questionType: question.questionType,
            prompt: question.prompt,
            required: question.required,
            explanation: question.explanation || "",
            options:
              question.options.length > 0
                ? question.options.map((option) => ({
                    id: String(option.id),
                    label: option.label,
                    isCorrect: Boolean(option.isCorrect),
                  }))
                : getDefaultOptionsForQuestionType(question.questionType),
          }))
        : [createQuizQuestion()],
  };
};

const formatEnumLabel = (value: string) => value.replace(/_/g, " ");

const formatCompletionModeLabel = (value: KnowledgeHubResource["completionMode"]) =>
  formatEnumLabel(value);

const resolveAssetUrl = (value: string | null | undefined) => {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith("/")) return `${API_BASE_URL}${value}`;
  return value;
};

const getUrlExtension = (value: string | null | undefined) => {
  if (!value) return "";
  const normalized = value.split("?")[0];
  const fileName = normalized.slice(normalized.lastIndexOf("/") + 1);
  const extensionIndex = fileName.lastIndexOf(".");
  return extensionIndex >= 0 ? fileName.slice(extensionIndex) : "";
};

const resolveVideoEmbedUrl = (value: string | null | undefined) => {
  const resolved = resolveAssetUrl(value);
  if (!resolved) return null;

  try {
    const url = new URL(resolved);

    if (url.hostname === "youtu.be") {
      const videoId = url.pathname.replace(/^\/+/, "");
      return videoId ? `https://www.youtube.com/embed/${videoId}` : null;
    }

    if (url.hostname.includes("youtube.com")) {
      const videoId = url.searchParams.get("v");
      if (videoId) {
        return `https://www.youtube.com/embed/${videoId}`;
      }

      const pathSegments = url.pathname.split("/").filter(Boolean);
      if (pathSegments[0] === "shorts" && pathSegments[1]) {
        return `https://www.youtube.com/embed/${pathSegments[1]}`;
      }
    }

    if (url.hostname.includes("vimeo.com")) {
      const videoId = url.pathname.split("/").filter(Boolean)[0];
      return videoId ? `https://player.vimeo.com/video/${videoId}` : null;
    }
  } catch {
    return null;
  }

  return null;
};

const toFormState = (meta: KnowledgeHubMeta, resource?: KnowledgeHubResource | null): ResourceFormState => ({
  title: resource?.title || "",
  summary: resource?.summary || "",
  domain: resource?.domain || meta.domains[0] || "accounting",
  resourceType: resource?.resourceType || meta.resourceTypes[0] || "guide",
  assetKind: resource?.assetKind || meta.assetKinds[0] || "document",
  tagsInput: resource?.tags?.join(", ") || "",
  linkUrl: resource?.linkUrl && !isLocalUploadUrl(resource.linkUrl) ? resource.linkUrl : "",
  content: resource?.content || "",
  allowDownload: resource?.allowDownload ?? true,
  isFeatured: resource?.isFeatured || false,
  isPublished: resource?.isPublished ?? true,
  estimatedDurationMinutes:
    resource?.estimatedDurationMinutes !== null && resource?.estimatedDurationMinutes !== undefined
      ? String(resource.estimatedDurationMinutes)
      : "",
  completionMode: resource?.completionMode || "manual",
  completionThresholdPercent:
    resource?.completionThresholdPercent !== null && resource?.completionThresholdPercent !== undefined
      ? String(resource.completionThresholdPercent)
      : "",
  minReadSeconds:
    resource?.minReadSeconds !== null && resource?.minReadSeconds !== undefined
      ? String(resource.minReadSeconds)
      : "",
  pointsOnCompletion: String(resource?.pointsOnCompletion ?? 0),
});

const createDownloadFilename = (resource: KnowledgeHubResource) => {
  if (resource.assetFileName) return resource.assetFileName;

  const baseName = resource.title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  const fallbackExtension =
    getUrlExtension(resource.linkUrl) ||
    (resource.assetKind === "image"
      ? ".png"
      : resource.assetKind === "video"
        ? ".mp4"
        : resource.assetKind === "document"
          ? ".pdf"
          : ".txt");

  return `${baseName || "knowledge-resource"}${fallbackExtension}`;
};

const formatRelativeTime = (value: string | null) => {
  if (!value) return "not published";
  try {
    return formatDistanceToNow(new Date(value), { addSuffix: true });
  } catch {
    return "recently";
  }
};

const canPreviewResource = (resource: KnowledgeHubResource) =>
  Boolean(resource.linkUrl || resource.content);

export default function KnowledgeHub() {
  const { hasModuleAccess } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const canWrite = hasModuleAccess("knowledge_hub", "write");
  const canAdmin = hasModuleAccess("knowledge_hub", "admin");

  const [search, setSearch] = useState("");
  const [domainFilter, setDomainFilter] = useState("all");
  const [resourceTypeFilter, setResourceTypeFilter] = useState("all");
  const [featuredOnly, setFeaturedOnly] = useState(false);
  const [includeDrafts, setIncludeDrafts] = useState(false);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingResource, setEditingResource] = useState<KnowledgeHubResource | null>(null);
  const [previewResource, setPreviewResource] = useState<KnowledgeHubResource | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [formState, setFormState] = useState<ResourceFormState>(toFormState(DEFAULT_META, null));
  const [quizForm, setQuizForm] = useState<QuizFormState>(createQuizFormState());
  const [quizAnswers, setQuizAnswers] = useState<
    Record<number, { optionIds: number[]; freeTextAnswer: string }>
  >({});
  const [previewOpenedAt, setPreviewOpenedAt] = useState<number | null>(null);
  const [completionQuizOpen, setCompletionQuizOpen] = useState(false);
  const [pendingCompletionQuizResourceId, setPendingCompletionQuizResourceId] = useState<number | null>(null);
  const [previewTrackingSupported, setPreviewTrackingSupported] = useState<boolean | null>(null);

  const { data: metaData } = useQuery({
    queryKey: ["knowledge-hub-meta"],
    queryFn: () => knowledgeHubAPI.meta(),
  });

  const { data: pointsSummary } = useQuery({
    queryKey: ["knowledge-hub-points"],
    queryFn: () => knowledgeHubAPI.points(),
  });

  const meta = metaData || DEFAULT_META;
  const assetKinds = meta.assetKinds?.length ? meta.assetKinds : DEFAULT_META.assetKinds;

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: [
      "knowledge-hub-resources",
      search,
      domainFilter,
      resourceTypeFilter,
      featuredOnly,
      includeDrafts,
      canWrite,
    ],
    queryFn: () =>
      knowledgeHubAPI.list({
        search: search || undefined,
        domain: domainFilter !== "all" ? domainFilter : undefined,
        resourceType: resourceTypeFilter !== "all" ? resourceTypeFilter : undefined,
        featured: featuredOnly ? true : undefined,
        includeDrafts: canWrite && includeDrafts ? true : undefined,
        page: 1,
        pageSize: 100,
      }),
  });

  const previewResourceId = previewResource?.id ?? null;
  const editorResourceId = editorOpen ? editingResource?.id ?? null : null;

  const { data: previewProgressData, refetch: refetchPreviewProgress } = useQuery({
    queryKey: ["knowledge-hub-progress", previewResourceId],
    enabled: Boolean(previewResourceId),
    queryFn: async () => {
      if (!previewResourceId) return null;
      return knowledgeHubAPI.getProgress(previewResourceId);
    },
  });

  const { data: previewQuizData, refetch: refetchPreviewQuiz } = useQuery({
    queryKey: ["knowledge-hub-quiz", previewResourceId],
    enabled: Boolean(previewResourceId),
    retry: false,
    queryFn: async () => {
      if (!previewResourceId) return null;
      try {
        return await knowledgeHubAPI.getQuiz(previewResourceId);
      } catch (error: any) {
        if (error?.status === 404) return null;
        throw error;
      }
    },
  });

  const { data: editorQuizData } = useQuery({
    queryKey: ["knowledge-hub-editor-quiz", editorResourceId],
    enabled: canWrite && editorOpen && Boolean(editorResourceId),
    retry: false,
    queryFn: async () => {
      if (!editorResourceId) return null;
      try {
        return await knowledgeHubAPI.getQuiz(editorResourceId);
      } catch (error: any) {
        if (error?.status === 404) return null;
        throw error;
      }
    },
  });

  const createMutation = useMutation({
    mutationFn: (payload: UpsertKnowledgeHubResourceInput | FormData) => knowledgeHubAPI.create(payload),
  });

  const updateMutation = useMutation({
    mutationFn: ({
      resourceId,
      payload,
    }: {
      resourceId: number;
      payload: Partial<UpsertKnowledgeHubResourceInput> | FormData;
    }) => knowledgeHubAPI.update(resourceId, payload),
  });

  const upsertEditorQuizMutation = useMutation({
    mutationFn: ({
      resourceId,
      payload,
    }: {
      resourceId: number;
      payload: UpsertKnowledgeHubQuizInput;
    }) => knowledgeHubAPI.upsertQuiz(resourceId, payload),
  });

  const deleteEditorQuizMutation = useMutation({
    mutationFn: (resourceId: number) => knowledgeHubAPI.deleteQuiz(resourceId),
  });

  const deleteMutation = useMutation({
    mutationFn: (resourceId: number) => knowledgeHubAPI.remove(resourceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["knowledge-hub-resources"] });
      toast({ title: "Resource deleted", description: "Knowledge resource was removed." });
    },
    onError: (error: any) => {
      toast({
        title: "Delete failed",
        description: error?.message || "Unable to delete resource.",
        variant: "destructive",
      });
    },
  });

  const progressMutation = useMutation({
    mutationFn: (payload: {
      resourceId: number;
      timeSpentSeconds?: number | null;
      scrollPercent?: number | null;
      watchSeconds?: number | null;
      watchPercent?: number | null;
      completed?: boolean;
    }) =>
      knowledgeHubAPI.updateProgress(payload.resourceId, {
        timeSpentSeconds: payload.timeSpentSeconds,
        scrollPercent: payload.scrollPercent,
        watchSeconds: payload.watchSeconds,
        watchPercent: payload.watchPercent,
        completed: payload.completed,
      }),
    onSuccess: async (result: any, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["knowledge-hub-progress"] }),
        queryClient.invalidateQueries({ queryKey: ["knowledge-hub-points"] }),
      ]);
      refetchPreviewProgress();
      if (result?.completedNow) {
        setPendingCompletionQuizResourceId(variables.resourceId);
      }
    },
    onError: (error: any) => {
      toast({
        title: "Progress update failed",
        description: error?.message || "Unable to update resource progress.",
        variant: "destructive",
      });
    },
  });

  const submitQuizMutation = useMutation({
    mutationFn: (payload: { resourceId: number; answers: Array<{ questionId: number; optionIds?: number[]; freeTextAnswer?: string | null }> }) =>
      knowledgeHubAPI.submitQuizAttempt(payload.resourceId, {
        answers: payload.answers,
      }),
    onSuccess: async (result: any) => {
      toast({
        title: result?.passed ? "Quiz passed" : "Quiz submitted",
        description: result?.passed ? "You passed the knowledge check." : "Your answers were recorded.",
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["knowledge-hub-quiz"] }),
        queryClient.invalidateQueries({ queryKey: ["knowledge-hub-progress"] }),
        queryClient.invalidateQueries({ queryKey: ["knowledge-hub-points"] }),
      ]);
      refetchPreviewQuiz();
      refetchPreviewProgress();
      if (result?.passed) {
        setCompletionQuizOpen(false);
      }
    },
    onError: (error: any) => {
      toast({
        title: "Quiz submission failed",
        description: error?.message || "Unable to submit the quiz.",
        variant: "destructive",
      });
    },
  });

  const resources = data?.resources || [];
  const isMutating =
    createMutation.isPending || updateMutation.isPending || deleteMutation.isPending;
  const usesFileUpload = formState.assetKind === "document" || formState.assetKind === "image";
  const previewResourceUrl = previewResource ? resolveAssetUrl(previewResource.linkUrl) : null;
  const previewVideoEmbedUrl = previewResource ? resolveVideoEmbedUrl(previewResource.linkUrl) : null;
  const existingStoredFileName =
    selectedFile?.name || editingResource?.assetFileName || null;
  const previewProgress = previewProgressData?.progress || null;
  const previewPoints = previewProgressData?.points || [];
  const previewQuiz = previewQuizData || null;
  const previewCompletionPointsAwarded = previewPoints.some(
    (entry) => entry.eventType === "knowledge_resource_completed"
  );
  const previewQuizPointsAwarded = previewPoints.some(
    (entry) => entry.eventType === "knowledge_quiz_passed"
  );
  const previewPointsEarned = previewPoints.reduce((sum, entry) => sum + Number(entry.points || 0), 0);
  const isPreviewCompleted = Boolean(previewProgress?.completedAt);
  const showQuizPanel = Boolean(previewQuiz && isPreviewCompleted);
  const showManualPreviewCompletion =
    Boolean(previewResource) &&
    (previewResource.completionMode === "manual" || previewTrackingSupported === false);
  const getPreviewElapsedSeconds = () =>
    previewOpenedAt ? Math.max(1, Math.floor((Date.now() - previewOpenedAt) / 1000)) : undefined;

  useEffect(() => {
    if (!editorOpen) return;

    if (!editingResource) {
      setQuizForm(createQuizFormState());
      return;
    }

    if (editorQuizData !== undefined) {
      setQuizForm(toQuizFormState(editorQuizData));
    }
  }, [editorOpen, editingResource, editorQuizData]);

  useEffect(() => {
    if (
      pendingCompletionQuizResourceId &&
      pendingCompletionQuizResourceId === previewResourceId &&
      previewQuiz &&
      isPreviewCompleted &&
      !previewQuizPointsAwarded
    ) {
      setCompletionQuizOpen(true);
      setPendingCompletionQuizResourceId(null);
    }
  }, [
    pendingCompletionQuizResourceId,
    previewResourceId,
    previewQuiz,
    isPreviewCompleted,
    previewQuizPointsAwarded,
  ]);

  const clearFilters = () => {
    setSearch("");
    setDomainFilter("all");
    setResourceTypeFilter("all");
    setFeaturedOnly(false);
    setIncludeDrafts(false);
  };

  const openCreateDialog = () => {
    setEditingResource(null);
    setFormState(toFormState(meta, null));
    setSelectedFile(null);
    setQuizForm(createQuizFormState());
    setEditorOpen(true);
  };

  const openEditDialog = (resource: KnowledgeHubResource) => {
    setEditingResource(resource);
    setFormState(toFormState(meta, resource));
    setSelectedFile(null);
    setQuizForm(createQuizFormState());
    setEditorOpen(true);
  };

  const closeEditor = () => {
    setEditorOpen(false);
    setEditingResource(null);
    setSelectedFile(null);
    setQuizForm(createQuizFormState());
  };

  const validateQuizForm = () => {
    if (!quizForm.enabled) return null;

    if (!quizForm.title.trim()) {
      return "Quiz title is required when a knowledge check is enabled.";
    }

    if (quizForm.questions.length === 0) {
      return "Add at least one quiz question.";
    }

    for (const [index, question] of quizForm.questions.entries()) {
      if (!question.prompt.trim()) {
        return `Question ${index + 1} needs a prompt.`;
      }

      if (question.questionType === "short_text") {
        continue;
      }

      const validOptions = question.options.filter((option) => option.label.trim());
      if (validOptions.length < 2) {
        return `Question ${index + 1} needs at least two answer options.`;
      }

      const correctOptions = validOptions.filter((option) => option.isCorrect);
      if (question.questionType === "multiple_choice") {
        if (correctOptions.length === 0) {
          return `Question ${index + 1} needs at least one correct option.`;
        }
      } else if (correctOptions.length !== 1) {
        return `Question ${index + 1} must have exactly one correct option.`;
      }
    }

    return null;
  };

  const buildQuizPayload = (): UpsertKnowledgeHubQuizInput => ({
    title: quizForm.title.trim(),
    passMark: Number(quizForm.passMark || 0),
    pointsOnPass: Number(quizForm.pointsOnPass || 0),
    attemptLimit: quizForm.attemptLimit ? Number(quizForm.attemptLimit) : null,
    isActive: quizForm.isActive,
    questions: quizForm.questions.map((question, index) => ({
      questionType: question.questionType,
      prompt: question.prompt.trim(),
      displayOrder: index + 1,
      required: question.required,
      explanation: question.explanation.trim() || null,
      options:
        question.questionType === "short_text"
          ? []
          : question.options
              .filter((option) => option.label.trim())
              .map((option, optionIndex) => ({
                label: option.label.trim(),
                isCorrect: option.isCorrect,
                displayOrder: optionIndex + 1,
              })),
    })),
  });

  const updateQuizQuestion = (
    questionId: string,
    updater: (question: QuizQuestionFormState) => QuizQuestionFormState
  ) => {
    setQuizForm((prev) => ({
      ...prev,
      questions: prev.questions.map((question) =>
        question.id === questionId ? updater(question) : question
      ),
    }));
  };

  const addQuizQuestion = () => {
    setQuizForm((prev) => ({
      ...prev,
      questions: [...prev.questions, createQuizQuestion()],
    }));
  };

  const removeQuizQuestion = (questionId: string) => {
    setQuizForm((prev) => ({
      ...prev,
      questions:
        prev.questions.length > 1
          ? prev.questions.filter((question) => question.id !== questionId)
          : prev.questions,
    }));
  };

  const changeQuizQuestionType = (
    questionId: string,
    questionType: KnowledgeHubQuizQuestion["questionType"]
  ) => {
    updateQuizQuestion(questionId, (question) => ({
      ...question,
      questionType,
      options:
        questionType === question.questionType
          ? question.options
          : getDefaultOptionsForQuestionType(questionType),
    }));
  };

  const addQuizOption = (questionId: string) => {
    updateQuizQuestion(questionId, (question) => ({
      ...question,
      options: [...question.options, createQuizOption()],
    }));
  };

  const removeQuizOption = (questionId: string, optionId: string) => {
    updateQuizQuestion(questionId, (question) => {
      if (question.options.length <= 2 || question.questionType === "true_false") {
        return question;
      }

      return {
        ...question,
        options: question.options.filter((option) => option.id !== optionId),
      };
    });
  };

  const updateQuizOption = (
    questionId: string,
    optionId: string,
    updater: (option: QuizOptionFormState, options: QuizOptionFormState[]) => QuizOptionFormState[]
  ) => {
    updateQuizQuestion(questionId, (question) => ({
      ...question,
      options: updater(
        question.options.find((option) => option.id === optionId) || createQuizOption(),
        question.options
      ),
    }));
  };

  const handleSubmit = async () => {
    const title = formState.title.trim();
    const summary = formState.summary.trim();
    const linkUrl = formState.linkUrl.trim();
    const content = formState.content.trim();
    const tags = parseTags(formState.tagsInput);
    const requiresExternalUrl = formState.assetKind === "video" || formState.assetKind === "link";
    const preservesExistingLocalUpload =
      Boolean(editingResource && isLocalUploadUrl(editingResource.linkUrl)) &&
      !selectedFile &&
      !linkUrl;
    const hasExistingResourceData = Boolean(editingResource?.linkUrl || editingResource?.content);

    if (!title) {
      toast({ title: "Title required", description: "Please enter a title.", variant: "destructive" });
      return;
    }

    if (requiresExternalUrl && !linkUrl) {
      toast({
        title: "URL required",
        description: "Video and link resources need a valid URL.",
        variant: "destructive",
      });
      return;
    }

    if (!selectedFile && !linkUrl && !content && !hasExistingResourceData) {
      toast({
        title: "Resource content required",
        description: "Add a file, URL, or notes for this resource.",
        variant: "destructive",
      });
      return;
    }

    const quizValidationError = validateQuizForm();
    if (quizValidationError) {
      toast({
        title: "Knowledge check incomplete",
        description: quizValidationError,
        variant: "destructive",
      });
      return;
    }

    const payload: UpsertKnowledgeHubResourceInput = {
      title,
      summary: summary || null,
      domain: formState.domain,
      resourceType: formState.resourceType,
      assetKind: formState.assetKind,
      submodules: [],
      tags,
      content: content || null,
      allowDownload: formState.allowDownload,
      isFeatured: formState.isFeatured,
      isPublished: formState.isPublished,
      estimatedDurationMinutes: formState.estimatedDurationMinutes
        ? Number(formState.estimatedDurationMinutes)
        : null,
      completionMode: formState.completionMode,
      completionThresholdPercent: formState.completionThresholdPercent
        ? Number(formState.completionThresholdPercent)
        : null,
      minReadSeconds: formState.minReadSeconds ? Number(formState.minReadSeconds) : null,
      pointsOnCompletion: Number(formState.pointsOnCompletion || 0),
    };

    try {
      let savedResource: KnowledgeHubResource;

      if (selectedFile) {
        const formData = new FormData();
        formData.append("title", payload.title);
        formData.append("summary", summary);
        formData.append("domain", payload.domain);
        formData.append("resourceType", payload.resourceType);
        formData.append("assetKind", payload.assetKind || "document");
        formData.append("submodules", JSON.stringify([]));
        formData.append("tags", JSON.stringify(payload.tags || []));
        formData.append("content", content);
        formData.append("allowDownload", String(payload.allowDownload ?? true));
        formData.append("isFeatured", String(payload.isFeatured ?? false));
        formData.append("isPublished", String(payload.isPublished ?? true));
        if (
          payload.estimatedDurationMinutes !== null &&
          payload.estimatedDurationMinutes !== undefined
        ) {
          formData.append("estimatedDurationMinutes", String(payload.estimatedDurationMinutes));
        }
        formData.append("completionMode", String(payload.completionMode || "manual"));
        if (
          payload.completionThresholdPercent !== null &&
          payload.completionThresholdPercent !== undefined
        ) {
          formData.append(
            "completionThresholdPercent",
            String(payload.completionThresholdPercent)
          );
        }
        if (payload.minReadSeconds !== null && payload.minReadSeconds !== undefined) {
          formData.append("minReadSeconds", String(payload.minReadSeconds));
        }
        formData.append("pointsOnCompletion", String(payload.pointsOnCompletion || 0));
        formData.append("file", selectedFile);

        if (linkUrl) {
          formData.append("linkUrl", linkUrl);
        }

        savedResource = editingResource
          ? await updateMutation.mutateAsync({ resourceId: editingResource.id, payload: formData })
          : await createMutation.mutateAsync(formData);
      } else {
        if (linkUrl) {
          payload.linkUrl = linkUrl;
        } else if (!preservesExistingLocalUpload) {
          payload.linkUrl = null;
        }

        savedResource = editingResource
          ? await updateMutation.mutateAsync({ resourceId: editingResource.id, payload })
          : await createMutation.mutateAsync(payload);
      }

      if (quizForm.enabled) {
        await upsertEditorQuizMutation.mutateAsync({
          resourceId: savedResource.id,
          payload: buildQuizPayload(),
        });
      } else if (editingResource && editorQuizData) {
        await deleteEditorQuizMutation.mutateAsync(savedResource.id);
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["knowledge-hub-resources"] }),
        queryClient.invalidateQueries({ queryKey: ["knowledge-hub-editor-quiz"] }),
        queryClient.invalidateQueries({ queryKey: ["knowledge-hub-quiz"] }),
      ]);

      toast({
        title: editingResource ? "Resource updated" : "Resource created",
        description: quizForm.enabled
          ? "Knowledge resource and quiz were saved."
          : "Knowledge resource was saved.",
      });
      closeEditor();
    } catch (error: any) {
      toast({
        title: editingResource ? "Save failed" : "Create failed",
        description: error?.message || "Unable to save the knowledge resource.",
        variant: "destructive",
      });
    }
  };

  const handleDelete = (resource: KnowledgeHubResource) => {
    if (!canAdmin) return;
    const approved = window.confirm(`Delete "${resource.title}" from Knowledge Hub?`);
    if (!approved) return;
    deleteMutation.mutate(resource.id);
  };

  const openPreview = (resource: KnowledgeHubResource) => {
    setPreviewResource(resource);
    setQuizAnswers({});
    setPreviewOpenedAt(Date.now());
    setCompletionQuizOpen(false);
    setPendingCompletionQuizResourceId(null);
    setPreviewTrackingSupported(null);
  };

  const handlePreviewOpenChange = (open: boolean) => {
    if (!open) {
      setPreviewResource(null);
      setQuizAnswers({});
      setPreviewOpenedAt(null);
      setCompletionQuizOpen(false);
      setPendingCompletionQuizResourceId(null);
      setPreviewTrackingSupported(null);
    }
  };

  const handleMarkComplete = () => {
    if (!previewResource) return;
    progressMutation.mutate({
      resourceId: previewResource.id,
      timeSpentSeconds: getPreviewElapsedSeconds(),
      completed: true,
      scrollPercent: 100,
      watchPercent: 100,
    });
  };

  const handleTrackedPreviewProgress = (progress: TrackedContentProgress) => {
    if (!previewResource || isPreviewCompleted) return;

    progressMutation.mutate({
      resourceId: previewResource.id,
      timeSpentSeconds: getPreviewElapsedSeconds(),
      scrollPercent: progress.scrollPercent,
      watchSeconds: progress.watchSeconds,
      watchPercent: progress.watchPercent,
      completed: progress.completed,
    });
  };

  const updateSingleChoiceAnswer = (questionId: number, optionId: number) => {
    setQuizAnswers((prev) => ({
      ...prev,
      [questionId]: {
        optionIds: [optionId],
        freeTextAnswer: prev[questionId]?.freeTextAnswer || "",
      },
    }));
  };

  const updateMultipleChoiceAnswer = (questionId: number, optionId: number, checked: boolean) => {
    setQuizAnswers((prev) => {
      const current = prev[questionId]?.optionIds || [];
      const optionIds = checked
        ? Array.from(new Set([...current, optionId]))
        : current.filter((value) => value !== optionId);
      return {
        ...prev,
        [questionId]: {
          optionIds,
          freeTextAnswer: prev[questionId]?.freeTextAnswer || "",
        },
      };
    });
  };

  const updateTextAnswer = (questionId: number, value: string) => {
    setQuizAnswers((prev) => ({
      ...prev,
      [questionId]: {
        optionIds: prev[questionId]?.optionIds || [],
        freeTextAnswer: value,
      },
    }));
  };

  const handleSubmitQuiz = () => {
    if (!previewResource || !previewQuiz) return;
    submitQuizMutation.mutate({
      resourceId: previewResource.id,
      answers: previewQuiz.questions.map((question) => ({
        questionId: question.id,
        optionIds: quizAnswers[question.id]?.optionIds || [],
        freeTextAnswer: quizAnswers[question.id]?.freeTextAnswer || null,
      })),
    });
  };

  const handleDownload = (resource: KnowledgeHubResource) => {
    if (!resource.allowDownload) return;

    const resolvedLinkUrl = resolveAssetUrl(resource.linkUrl);

    if (resolvedLinkUrl) {
      const link = document.createElement("a");
      link.href = resolvedLinkUrl;
      link.target = "_blank";
      link.rel = "noreferrer";
      link.download = createDownloadFilename(resource);
      document.body.appendChild(link);
      link.click();
      link.remove();
      return;
    }

    if (!resource.content) return;

    const blob = new Blob([resource.content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = createDownloadFilename(resource);
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Knowledge Hub</h1>
            <p className="text-muted-foreground">
              Shared firm-wide documents, media, and guidance in one place.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="px-3 py-1 text-sm">
              {pointsSummary?.totalPoints ?? 0} CPD points
            </Badge>
            <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            {canWrite && (
              <Button onClick={openCreateDialog}>
                <Plus className="mr-2 h-4 w-4" />
                Add Resource
              </Button>
            )}
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Filter className="h-4 w-4" />
              Filter Resources
            </CardTitle>
            <CardDescription>
              Filter by domain, resource type, and publication state.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search title, tags, content"
                  className="pl-9"
                />
              </div>

              <Select value={domainFilter} onValueChange={setDomainFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Domain" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All domains</SelectItem>
                  {meta.domains.map((domain) => (
                    <SelectItem key={domain} value={domain}>
                      {domain}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={resourceTypeFilter} onValueChange={setResourceTypeFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Resource type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  {meta.resourceTypes.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-wrap items-center gap-6">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="featured-only"
                  checked={featuredOnly}
                  onCheckedChange={(checked) => setFeaturedOnly(checked === true)}
                />
                <Label htmlFor="featured-only">Featured only</Label>
              </div>
              {canWrite && (
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="show-drafts"
                    checked={includeDrafts}
                    onCheckedChange={(checked) => setIncludeDrafts(checked === true)}
                  />
                  <Label htmlFor="show-drafts">Include drafts</Label>
                </div>
              )}
              <Button variant="ghost" onClick={clearFilters}>
                Clear filters
              </Button>
            </div>
          </CardContent>
        </Card>

        {isLoading ? (
          <PageLoader message="Loading knowledge resources..." minHeightClassName="min-h-[260px]" />
        ) : resources.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              No knowledge resources match the current filters.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {resources.map((resource) => (
              <Card key={resource.id}>
                <CardHeader className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-2">
                      <CardTitle className="text-xl">{resource.title}</CardTitle>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">{resource.domain}</Badge>
                        <Badge variant="secondary">{resource.resourceType}</Badge>
                        <Badge variant="outline">{resource.assetKind}</Badge>
                        <Badge variant="outline">{resource.pointsOnCompletion} pts</Badge>
                        {resource.isFeatured && (
                          <Badge>
                            <Star className="mr-1 h-3 w-3" />
                            Featured
                          </Badge>
                        )}
                        {!resource.isPublished && <Badge variant="destructive">Draft</Badge>}
                      </div>
                    </div>
                  </div>
                  {resource.summary && (
                    <CardDescription className="text-sm leading-relaxed">
                      {resource.summary}
                    </CardDescription>
                  )}
                </CardHeader>

                <CardContent className="space-y-4">
                  {resource.content && (
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                      {resource.content.length > 280
                        ? `${resource.content.slice(0, 280)}...`
                        : resource.content}
                    </p>
                  )}

                  {resource.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {resource.tags.map((tag) => (
                        <Badge key={`${resource.id}-tag-${tag}`} variant="secondary">
                          #{tag}
                        </Badge>
                      ))}
                    </div>
                  )}

                  <p className="text-xs text-muted-foreground">
                    Completion: {formatCompletionModeLabel(resource.completionMode)}
                    {resource.estimatedDurationMinutes ? ` • ${resource.estimatedDurationMinutes} min` : ""}
                  </p>

                  <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
                    <p className="text-xs text-muted-foreground">
                      Updated {formatRelativeTime(resource.updatedAt)}
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openPreview(resource)}
                        disabled={!canPreviewResource(resource)}
                      >
                        <Eye className="mr-2 h-4 w-4" />
                        Preview
                      </Button>
                      {canWrite && (
                        <Button variant="outline" size="sm" onClick={() => openEditDialog(resource)}>
                          <Pencil className="mr-2 h-4 w-4" />
                          Edit
                        </Button>
                      )}
                      {canAdmin && (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleDelete(resource)}
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Dialog open={!!previewResource} onOpenChange={handlePreviewOpenChange}>
          <DialogContent className="flex h-[90vh] w-[96vw] max-w-6xl flex-col overflow-hidden">
            <DialogHeader>
              <DialogTitle className="flex flex-wrap items-center gap-2">
                <span>{previewResource?.title || "Resource Preview"}</span>
                {previewResource && !previewResource.allowDownload && (
                  <Badge variant="secondary" className="gap-1">
                    <Lock className="h-3 w-3" />
                    Read only
                  </Badge>
                )}
              </DialogTitle>
              <DialogDescription>
                Review the selected knowledge resource, preview its content, and track completion.
              </DialogDescription>
            </DialogHeader>

            {previewResource && (
              <>
                <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-3">
                  <div className="space-y-2">
                    {previewResource.summary && (
                      <p className="text-sm text-muted-foreground">{previewResource.summary}</p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline">{previewResource.domain}</Badge>
                      <Badge variant="secondary">{previewResource.resourceType}</Badge>
                      <Badge variant="outline">{previewResource.assetKind}</Badge>
                      <Badge variant="outline">
                        Updated {formatRelativeTime(previewResource.updatedAt)}
                      </Badge>
                    </div>
                  </div>
                  {previewResource.allowDownload && (
                    <Button
                      variant="outline"
                      onClick={() => handleDownload(previewResource)}
                      disabled={!canPreviewResource(previewResource)}
                    >
                      <Download className="mr-2 h-4 w-4" />
                      Download
                    </Button>
                  )}
                </div>

                <div className="min-h-0 flex-1 overflow-hidden rounded-lg border bg-background">
                  {previewResource.assetKind === "image" && previewResourceUrl ? (
                    <div className="flex h-full items-center justify-center overflow-auto bg-muted/20 p-6">
                      <img
                        src={previewResourceUrl}
                        alt={previewResource.title}
                        className="max-h-full w-auto rounded-md object-contain shadow-sm"
                      />
                    </div>
                  ) : (
                    <Suspense
                      fallback={
                        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                          Loading tracked preview...
                        </div>
                      }
                    >
                      <TrackedContentViewer
                        title={previewResource.title}
                        sourceUrl={previewResourceUrl}
                        fileName={previewResource.assetFileName}
                        mimeType={previewResource.assetMimeType}
                        textContent={previewResource.content}
                        completionMode={previewResource.completionMode}
                        completionThresholdPercent={previewResource.completionThresholdPercent}
                        onProgress={handleTrackedPreviewProgress}
                        onTrackingSupportChange={setPreviewTrackingSupported}
                      />
                    </Suspense>
                  )}
                </div>

                <div className="grid gap-4 border-t pt-4 lg:grid-cols-[minmax(0,1fr)_360px]">
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={isPreviewCompleted ? "default" : "secondary"}>
                        {isPreviewCompleted ? "Completed" : "In progress"}
                      </Badge>
                      <Badge variant="outline">{previewResource.pointsOnCompletion} completion pts</Badge>
                      {previewQuiz ? <Badge variant="outline">{previewQuiz.pointsOnPass} quiz pts</Badge> : null}
                      <Badge variant="outline">{previewPointsEarned} earned</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {previewResource.completionMode === "video_end" &&
                        (previewVideoEmbedUrl
                          ? "External video embeds cannot report the end event reliably here. Use Mark Complete after viewing."
                          : "This video will mark complete when playback ends.")}
                      {previewResource.completionMode === "document_scroll" &&
                        `Scroll to the end${
                          previewResource.minReadSeconds
                            ? ` and spend at least ${previewResource.minReadSeconds} seconds`
                            : ""
                        } to mark this reading complete.`}
                      {previewResource.completionMode === "watch_percent" &&
                        previewVideoEmbedUrl
                          ? `External video embeds cannot report watch progress here. Use Mark Complete after viewing ${previewResource.completionThresholdPercent ?? 95}% of the video.`
                          : `Watch progress target: ${previewResource.completionThresholdPercent ?? 95}%.`}
                      {previewResource.completionMode === "manual" &&
                        "Use the completion button when you finish this resource."}
                      {previewResource.completionMode !== "manual" &&
                        previewTrackingSupported === false &&
                        " Automatic tracking is not available for this asset source, so manual completion is enabled instead."}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {showManualPreviewCompletion && (
                        <Button
                          variant={isPreviewCompleted ? "outline" : "default"}
                          onClick={handleMarkComplete}
                          disabled={progressMutation.isPending || isPreviewCompleted}
                        >
                          <CheckCircle2 className="mr-2 h-4 w-4" />
                          {isPreviewCompleted ? "Completed" : "Mark Complete"}
                        </Button>
                      )}
                      {previewCompletionPointsAwarded ? (
                        <Badge variant="secondary" className="px-3 py-2">
                          Completion points awarded
                        </Badge>
                      ) : null}
                    </div>
                  </div>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Knowledge Check</CardTitle>
                      <CardDescription>
                        {previewQuiz
                          ? "Answer the attached quiz after completing the resource."
                          : "No quiz is attached to this resource yet."}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {previewQuiz && showQuizPanel ? (
                        <>
                          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                            <span>Pass mark: {previewQuiz.passMark}%</span>
                            {previewQuiz.attemptLimit ? <span>Attempt limit: {previewQuiz.attemptLimit}</span> : null}
                            {previewQuiz.attempts?.[0] ? (
                              <span>
                                Latest: {previewQuiz.attempts[0].score}% ({previewQuiz.attempts[0].status.replace(/_/g, " ")})
                              </span>
                            ) : null}
                          </div>
                          <div className="rounded-lg border bg-muted/20 p-3 text-sm text-muted-foreground">
                            The quiz opens automatically when you finish the resource. You can also
                            reopen it here.
                          </div>
                          <Button
                            onClick={() => setCompletionQuizOpen(true)}
                            disabled={previewQuizPointsAwarded}
                            className="w-full"
                          >
                            {previewQuizPointsAwarded ? "Quiz Passed" : "Open Quiz"}
                          </Button>
                        </>
                      ) : previewQuiz ? (
                        <div className="space-y-2 text-sm text-muted-foreground">
                          <p>Finish the resource first to unlock the quiz.</p>
                          {previewQuiz.attempts?.[0] ? (
                            <p>
                              Latest score: {previewQuiz.attempts[0].score}% ({previewQuiz.attempts[0].status.replace(/_/g, " ")})
                            </p>
                          ) : null}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">No quiz configured for this resource.</p>
                      )}
                    </CardContent>
                  </Card>
                </div>

                {previewResource.assetFileName && (
                  <p className="pt-3 text-xs text-muted-foreground">
                    File: {previewResource.assetFileName}
                  </p>
                )}

                {previewResourceUrl &&
                  (previewResource.assetKind === "document" || previewResource.assetKind === "link") && (
                    <p className="pt-3 text-xs text-muted-foreground">
                      Some external URLs block embedded previews. If that happens, use Download or open the
                      original file URL directly.
                    </p>
                  )}

                {!previewResource.allowDownload && (
                  <p className="pt-3 text-xs text-muted-foreground">
                    This resource is configured as read-only. Preview is available, but download is disabled.
                  </p>
                )}
              </>
            )}
          </DialogContent>
        </Dialog>

        <Dialog open={completionQuizOpen} onOpenChange={setCompletionQuizOpen}>
          <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{previewQuiz?.title || "Knowledge Check"}</DialogTitle>
              <DialogDescription>
                Answer the questions attached to this knowledge resource.
              </DialogDescription>
            </DialogHeader>

            {previewQuiz ? (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span>Pass mark: {previewQuiz.passMark}%</span>
                  {previewQuiz.attemptLimit ? <span>Attempt limit: {previewQuiz.attemptLimit}</span> : null}
                  {previewQuiz.attempts?.[0] ? (
                    <span>
                      Latest: {previewQuiz.attempts[0].score}% ({previewQuiz.attempts[0].status.replace(/_/g, " ")})
                    </span>
                  ) : null}
                </div>

                <div className="space-y-4">
                  {previewQuiz.questions.map((question) => (
                    <div key={question.id} className="space-y-3 rounded-lg border p-3">
                      <div>
                        <p className="text-sm font-medium">{question.prompt}</p>
                        <p className="text-xs text-muted-foreground">
                          {question.questionType.replace(/_/g, " ")}
                        </p>
                      </div>
                      {question.questionType === "single_choice" || question.questionType === "true_false" ? (
                        <RadioGroup
                          value={String(quizAnswers[question.id]?.optionIds?.[0] || "")}
                          onValueChange={(value) => updateSingleChoiceAnswer(question.id, Number(value))}
                        >
                          {question.options.map((option) => (
                            <label
                              key={option.id}
                              className="flex cursor-pointer items-center gap-3 rounded-md border p-2"
                            >
                              <RadioGroupItem value={String(option.id)} />
                              <span className="text-sm">{option.label}</span>
                            </label>
                          ))}
                        </RadioGroup>
                      ) : question.questionType === "multiple_choice" ? (
                        <div className="space-y-2">
                          {question.options.map((option) => {
                            const checked = quizAnswers[question.id]?.optionIds?.includes(option.id) ?? false;
                            return (
                              <label
                                key={option.id}
                                className="flex cursor-pointer items-center gap-3 rounded-md border p-2"
                              >
                                <Checkbox
                                  checked={checked}
                                  onCheckedChange={(value) =>
                                    updateMultipleChoiceAnswer(question.id, option.id, value === true)
                                  }
                                />
                                <span className="text-sm">{option.label}</span>
                              </label>
                            );
                          })}
                        </div>
                      ) : (
                        <Textarea
                          value={quizAnswers[question.id]?.freeTextAnswer || ""}
                          onChange={(event) => updateTextAnswer(question.id, event.target.value)}
                          rows={3}
                          placeholder="Type your answer"
                        />
                      )}
                    </div>
                  ))}
                </div>

                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setCompletionQuizOpen(false)}>
                    Close
                  </Button>
                  <Button
                    onClick={handleSubmitQuiz}
                    disabled={submitQuizMutation.isPending || previewQuizPointsAwarded}
                  >
                    {previewQuizPointsAwarded ? "Quiz Passed" : "Submit Quiz"}
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No quiz configured for this resource.</p>
            )}
          </DialogContent>
        </Dialog>

        <Dialog
          open={editorOpen}
          onOpenChange={(open) => {
            if (!open) {
              closeEditor();
            } else {
              setEditorOpen(true);
            }
          }}
        >
          <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingResource ? "Edit Knowledge Resource" : "Add Knowledge Resource"}
              </DialogTitle>
              <DialogDescription>
                Create or update a knowledge resource, optional file, and completion settings.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="resource-title">Title</Label>
                  <Input
                    id="resource-title"
                    value={formState.title}
                    onChange={(event) =>
                      setFormState((prev) => ({ ...prev, title: event.target.value }))
                    }
                    placeholder="Resource title"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Asset Kind</Label>
                  <Select
                    value={formState.assetKind}
                    onValueChange={(value) => {
                      setFormState((prev) => ({ ...prev, assetKind: value }));
                      if (value !== "document" && value !== "image") {
                        setSelectedFile(null);
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {assetKinds.map((assetKind) => (
                        <SelectItem key={assetKind} value={assetKind}>
                          {assetKind}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="resource-summary">Description</Label>
                <Textarea
                  id="resource-summary"
                  value={formState.summary}
                  onChange={(event) =>
                    setFormState((prev) => ({ ...prev, summary: event.target.value }))
                  }
                  rows={3}
                  placeholder="Short description shown on the Knowledge Hub card."
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Domain</Label>
                  <Select
                    value={formState.domain}
                    onValueChange={(value) => setFormState((prev) => ({ ...prev, domain: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {meta.domains.map((domain) => (
                        <SelectItem key={domain} value={domain}>
                          {domain}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Resource Type</Label>
                  <Select
                    value={formState.resourceType}
                    onValueChange={(value) =>
                      setFormState((prev) => ({ ...prev, resourceType: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {meta.resourceTypes.map((type) => (
                        <SelectItem key={type} value={type}>
                          {type}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Card className="border-dashed">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Completion Rules</CardTitle>
                  <CardDescription>
                    Control how learners finish this resource and how many CPD points it awards.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="estimated-duration">Estimated Duration (minutes)</Label>
                    <Input
                      id="estimated-duration"
                      type="number"
                      min="0"
                      value={formState.estimatedDurationMinutes}
                      onChange={(event) =>
                        setFormState((prev) => ({
                          ...prev,
                          estimatedDurationMinutes: event.target.value,
                        }))
                      }
                      placeholder="15"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="points-on-completion">Completion Points</Label>
                    <Input
                      id="points-on-completion"
                      type="number"
                      min="0"
                      value={formState.pointsOnCompletion}
                      onChange={(event) =>
                        setFormState((prev) => ({
                          ...prev,
                          pointsOnCompletion: event.target.value,
                        }))
                      }
                      placeholder="5"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Completion Mode</Label>
                    <Select
                      value={formState.completionMode}
                      onValueChange={(value) =>
                        setFormState((prev) => ({
                          ...prev,
                          completionMode: value as ResourceFormState["completionMode"],
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="manual">Manual</SelectItem>
                        <SelectItem value="document_scroll">Document Scroll</SelectItem>
                        <SelectItem value="video_end">Video End</SelectItem>
                        <SelectItem value="watch_percent">Watch Percent</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="completion-threshold">Watch Threshold (%)</Label>
                    <Input
                      id="completion-threshold"
                      type="number"
                      min="0"
                      max="100"
                      disabled={formState.completionMode !== "watch_percent"}
                      value={formState.completionThresholdPercent}
                      onChange={(event) =>
                        setFormState((prev) => ({
                          ...prev,
                          completionThresholdPercent: event.target.value,
                        }))
                      }
                      placeholder="95"
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="min-read-seconds">Minimum Read Time (seconds)</Label>
                    <Input
                      id="min-read-seconds"
                      type="number"
                      min="0"
                      disabled={formState.completionMode !== "document_scroll"}
                      value={formState.minReadSeconds}
                      onChange={(event) =>
                        setFormState((prev) => ({
                          ...prev,
                          minReadSeconds: event.target.value,
                        }))
                      }
                      placeholder="30"
                    />
                    <p className="text-xs text-muted-foreground">
                      Used with document scroll mode to avoid awarding points on instant scroll-throughs.
                    </p>
                  </div>
                </CardContent>
              </Card>

              {usesFileUpload && (
                <div className="space-y-2">
                  <Label htmlFor="resource-file">
                    {formState.assetKind === "image" ? "Image file" : "Document file"}
                  </Label>
                  <Input
                    id="resource-file"
                    type="file"
                    accept={
                      formState.assetKind === "image"
                        ? "image/*"
                        : ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,image/*"
                    }
                    onChange={(event) => setSelectedFile(event.target.files?.[0] || null)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Upload a file for in-app preview. You can also keep the existing file or point to
                    an external file URL below.
                  </p>
                  {existingStoredFileName && (
                    <p className="text-xs text-muted-foreground">
                      Current file: {existingStoredFileName}
                    </p>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="resource-link">
                  {formState.assetKind === "video"
                    ? "Video URL"
                    : usesFileUpload
                      ? "External file URL (optional)"
                      : "Resource URL"}
                </Label>
                <Input
                  id="resource-link"
                  value={formState.linkUrl}
                  onChange={(event) =>
                    setFormState((prev) => ({ ...prev, linkUrl: event.target.value }))
                  }
                  placeholder={
                    formState.assetKind === "video"
                      ? "https://www.youtube.com/watch?v=..."
                      : "https://..."
                  }
                />
                <p className="text-xs text-muted-foreground">
                  {formState.assetKind === "video"
                    ? "Videos are stored as URLs and previewed directly inside the Knowledge Hub."
                    : usesFileUpload
                      ? "Leave this blank to keep the stored upload, or use it to point to an external file."
                      : "This URL is what users will preview inside the Knowledge Hub."}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="resource-tags">Tags (comma-separated)</Label>
                <Input
                  id="resource-tags"
                  value={formState.tagsInput}
                  onChange={(event) =>
                    setFormState((prev) => ({ ...prev, tagsInput: event.target.value }))
                  }
                  placeholder="tax, filing, workflow"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="resource-content">Knowledge Notes</Label>
                <Textarea
                  id="resource-content"
                  value={formState.content}
                  onChange={(event) =>
                    setFormState((prev) => ({ ...prev, content: event.target.value }))
                  }
                  rows={6}
                  placeholder="Optional summary notes, usage guidance, or instructions."
                />
              </div>

              <Card className="border-dashed">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Knowledge Check</CardTitle>
                  <CardDescription>
                    Configure the short quiz that appears after learners complete this resource.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <Checkbox
                      checked={quizForm.enabled}
                      onCheckedChange={(checked) =>
                        setQuizForm((prev) => ({
                          ...prev,
                          enabled: checked === true,
                          questions:
                            checked === true && prev.questions.length === 0
                              ? [createQuizQuestion()]
                              : prev.questions,
                        }))
                      }
                    />
                    <span>Attach a knowledge check to this resource</span>
                  </label>

                  {quizForm.enabled && (
                    <div className="space-y-4">
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="quiz-title">Quiz Title</Label>
                          <Input
                            id="quiz-title"
                            value={quizForm.title}
                            onChange={(event) =>
                              setQuizForm((prev) => ({ ...prev, title: event.target.value }))
                            }
                            placeholder="Knowledge Check"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="quiz-pass-mark">Pass Mark (%)</Label>
                          <Input
                            id="quiz-pass-mark"
                            type="number"
                            min="0"
                            max="100"
                            value={quizForm.passMark}
                            onChange={(event) =>
                              setQuizForm((prev) => ({ ...prev, passMark: event.target.value }))
                            }
                            placeholder="70"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="quiz-points-on-pass">Quiz Points</Label>
                          <Input
                            id="quiz-points-on-pass"
                            type="number"
                            min="0"
                            value={quizForm.pointsOnPass}
                            onChange={(event) =>
                              setQuizForm((prev) => ({
                                ...prev,
                                pointsOnPass: event.target.value,
                              }))
                            }
                            placeholder="3"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="quiz-attempt-limit">Attempt Limit</Label>
                          <Input
                            id="quiz-attempt-limit"
                            type="number"
                            min="1"
                            value={quizForm.attemptLimit}
                            onChange={(event) =>
                              setQuizForm((prev) => ({
                                ...prev,
                                attemptLimit: event.target.value,
                              }))
                            }
                            placeholder="Leave blank for unlimited"
                          />
                        </div>
                      </div>

                      <label className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={quizForm.isActive}
                          onCheckedChange={(checked) =>
                            setQuizForm((prev) => ({ ...prev, isActive: checked === true }))
                          }
                        />
                        <span>Quiz is active</span>
                      </label>

                      <div className="space-y-4">
                        {quizForm.questions.map((question, index) => (
                          <div key={question.id} className="space-y-4 rounded-lg border p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="font-medium">Question {index + 1}</p>
                                <p className="text-xs text-muted-foreground">
                                  {formatEnumLabel(question.questionType)}
                                </p>
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => removeQuizQuestion(question.id)}
                                disabled={quizForm.questions.length <= 1}
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Remove
                              </Button>
                            </div>

                            <div className="grid gap-4 md:grid-cols-2">
                              <div className="space-y-2 md:col-span-2">
                                <Label>Prompt</Label>
                                <Textarea
                                  value={question.prompt}
                                  onChange={(event) =>
                                    updateQuizQuestion(question.id, (current) => ({
                                      ...current,
                                      prompt: event.target.value,
                                    }))
                                  }
                                  rows={2}
                                  placeholder="Enter the question prompt"
                                />
                              </div>
                              <div className="space-y-2">
                                <Label>Question Type</Label>
                                <Select
                                  value={question.questionType}
                                  onValueChange={(value) =>
                                    changeQuizQuestionType(
                                      question.id,
                                      value as KnowledgeHubQuizQuestion["questionType"]
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
                                      updateQuizQuestion(question.id, (current) => ({
                                        ...current,
                                        required: checked === true,
                                      }))
                                    }
                                  />
                                  <span>Required</span>
                                </label>
                              </div>
                              <div className="space-y-2 md:col-span-2">
                                <Label>Explanation (optional)</Label>
                                <Textarea
                                  value={question.explanation}
                                  onChange={(event) =>
                                    updateQuizQuestion(question.id, (current) => ({
                                      ...current,
                                      explanation: event.target.value,
                                    }))
                                  }
                                  rows={2}
                                  placeholder="Optional explanation shown in reporting or future review"
                                />
                              </div>
                            </div>

                            {question.questionType !== "short_text" && (
                              <div className="space-y-3">
                                <div className="flex items-center justify-between gap-3">
                                  <div>
                                    <p className="text-sm font-medium">Answer Options</p>
                                    <p className="text-xs text-muted-foreground">
                                      {question.questionType === "multiple_choice"
                                        ? "Mark every correct option."
                                        : "Mark exactly one correct option."}
                                    </p>
                                  </div>
                                  {question.questionType !== "true_false" && (
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      onClick={() => addQuizOption(question.id)}
                                    >
                                      <Plus className="mr-2 h-4 w-4" />
                                      Add Option
                                    </Button>
                                  )}
                                </div>

                                <div className="space-y-2">
                                  {question.options.map((option) => (
                                    <div
                                      key={option.id}
                                      className="flex flex-col gap-3 rounded-md border p-3 md:flex-row md:items-center"
                                    >
                                      <Input
                                        value={option.label}
                                        disabled={question.questionType === "true_false"}
                                        onChange={(event) =>
                                          updateQuizOption(question.id, option.id, (_current, options) =>
                                            options.map((item) =>
                                              item.id === option.id
                                                ? { ...item, label: event.target.value }
                                                : item
                                            )
                                          )
                                        }
                                        placeholder="Option label"
                                      />
                                      <label className="flex items-center gap-2 text-sm">
                                        <Checkbox
                                          checked={option.isCorrect}
                                          onCheckedChange={(checked) =>
                                            updateQuizQuestion(question.id, (current) => ({
                                              ...current,
                                              options: current.options.map((item) => ({
                                                ...item,
                                                isCorrect:
                                                  item.id === option.id
                                                    ? checked === true
                                                    : current.questionType === "multiple_choice"
                                                      ? item.isCorrect
                                                      : false,
                                              })),
                                            }))
                                          }
                                        />
                                        <span>Correct</span>
                                      </label>
                                      {question.questionType !== "true_false" && (
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => removeQuizOption(question.id, option.id)}
                                          disabled={question.options.length <= 2}
                                        >
                                          <Trash2 className="mr-2 h-4 w-4" />
                                          Remove
                                        </Button>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>

                      <Button type="button" variant="outline" onClick={addQuizQuestion}>
                        <Plus className="mr-2 h-4 w-4" />
                        Add Question
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>

              <div className="flex flex-wrap items-center gap-6">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={formState.allowDownload}
                    onCheckedChange={(checked) =>
                      setFormState((prev) => ({ ...prev, allowDownload: checked === true }))
                    }
                  />
                  <span>Allow download from preview</span>
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={formState.isFeatured}
                    onCheckedChange={(checked) =>
                      setFormState((prev) => ({ ...prev, isFeatured: checked === true }))
                    }
                  />
                  <span>Featured resource</span>
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={formState.isPublished}
                    onCheckedChange={(checked) =>
                      setFormState((prev) => ({ ...prev, isPublished: checked === true }))
                    }
                  />
                  <span>Published</span>
                </label>
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setEditorOpen(false)} disabled={isMutating}>
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={isMutating}>
                {editingResource ? "Save Changes" : "Create Resource"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
