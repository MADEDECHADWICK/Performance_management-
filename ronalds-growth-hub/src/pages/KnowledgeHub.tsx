import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
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
  UpsertKnowledgeHubResourceInput,
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
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import PageLoader from "@/components/ui/page-loader";

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

const getPreviewSandbox = (resource: KnowledgeHubResource) => {
  if (!resource.linkUrl || isLocalUploadUrl(resource.linkUrl)) {
    return undefined;
  }

  return "allow-same-origin allow-scripts allow-forms allow-popups";
};

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

  const { data: metaData } = useQuery({
    queryKey: ["knowledge-hub-meta"],
    queryFn: () => knowledgeHubAPI.meta(),
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

  const createMutation = useMutation({
    mutationFn: (payload: UpsertKnowledgeHubResourceInput | FormData) => knowledgeHubAPI.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["knowledge-hub-resources"] });
      toast({ title: "Resource created", description: "Knowledge resource was added." });
      setEditorOpen(false);
      setEditingResource(null);
      setSelectedFile(null);
    },
    onError: (error: any) => {
      toast({
        title: "Create failed",
        description: error?.message || "Unable to create resource.",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      resourceId,
      payload,
    }: {
      resourceId: number;
      payload: Partial<UpsertKnowledgeHubResourceInput> | FormData;
    }) => knowledgeHubAPI.update(resourceId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["knowledge-hub-resources"] });
      toast({ title: "Resource updated", description: "Knowledge resource was updated." });
      setEditorOpen(false);
      setEditingResource(null);
      setSelectedFile(null);
    },
    onError: (error: any) => {
      toast({
        title: "Update failed",
        description: error?.message || "Unable to update resource.",
        variant: "destructive",
      });
    },
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

  const resources = data?.resources || [];
  const isMutating =
    createMutation.isPending || updateMutation.isPending || deleteMutation.isPending;
  const usesFileUpload = formState.assetKind === "document" || formState.assetKind === "image";
  const previewResourceUrl = previewResource ? resolveAssetUrl(previewResource.linkUrl) : null;
  const previewVideoEmbedUrl = previewResource ? resolveVideoEmbedUrl(previewResource.linkUrl) : null;
  const previewSandbox = previewResource ? getPreviewSandbox(previewResource) : undefined;
  const existingStoredFileName =
    selectedFile?.name || editingResource?.assetFileName || null;

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
    setEditorOpen(true);
  };

  const openEditDialog = (resource: KnowledgeHubResource) => {
    setEditingResource(resource);
    setFormState(toFormState(meta, resource));
    setSelectedFile(null);
    setEditorOpen(true);
  };

  const handleSubmit = () => {
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
    };

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
      formData.append("file", selectedFile);

      if (linkUrl) {
        formData.append("linkUrl", linkUrl);
      }

      if (editingResource) {
        updateMutation.mutate({ resourceId: editingResource.id, payload: formData });
      } else {
        createMutation.mutate(formData);
      }
      return;
    }

    if (linkUrl) {
      payload.linkUrl = linkUrl;
    } else if (!preservesExistingLocalUpload) {
      payload.linkUrl = null;
    }

    if (editingResource) {
      updateMutation.mutate({ resourceId: editingResource.id, payload });
    } else {
      createMutation.mutate(payload);
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
  };

  const handlePreviewOpenChange = (open: boolean) => {
    if (!open) {
      setPreviewResource(null);
    }
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
                  ) : previewResource.assetKind === "video" && (previewVideoEmbedUrl || previewResourceUrl) ? (
                    previewVideoEmbedUrl ? (
                      <iframe
                        key={`${previewResource.id}-${previewVideoEmbedUrl}`}
                        src={previewVideoEmbedUrl}
                        title={previewResource.title}
                        className="h-full w-full border-0"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center bg-black">
                        <video
                          controls
                          className="h-full w-full"
                          src={previewResourceUrl || undefined}
                        >
                          Your browser does not support video playback.
                        </video>
                      </div>
                    )
                  ) : previewResourceUrl ? (
                    <iframe
                      key={`${previewResource.id}-${previewResourceUrl}`}
                      src={previewResourceUrl}
                      title={previewResource.title}
                      className="h-full w-full border-0"
                      sandbox={previewSandbox}
                    />
                  ) : previewResource.content ? (
                    <div className="h-full overflow-y-auto p-6">
                      <article className="whitespace-pre-wrap text-sm leading-7 text-foreground">
                        {previewResource.content}
                      </article>
                    </div>
                  ) : (
                    <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
                      No preview is available for this resource yet.
                    </div>
                  )}
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

        <Dialog
          open={editorOpen}
          onOpenChange={(open) => {
            setEditorOpen(open);
            if (!open) {
              setEditingResource(null);
              setSelectedFile(null);
            }
          }}
        >
          <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingResource ? "Edit Knowledge Resource" : "Add Knowledge Resource"}
              </DialogTitle>
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
