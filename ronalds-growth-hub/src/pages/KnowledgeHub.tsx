import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ExternalLink,
  Filter,
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

const DEFAULT_META: KnowledgeHubMeta = {
  domains: ["accounting", "tax", "audit"],
  resourceTypes: ["guide", "template", "checklist", "policy", "article"],
  modules: [],
};

type ResourceFormState = {
  title: string;
  summary: string;
  domain: string;
  resourceType: string;
  submodules: string[];
  tagsInput: string;
  linkUrl: string;
  content: string;
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

const toFormState = (meta: KnowledgeHubMeta, resource?: KnowledgeHubResource | null): ResourceFormState => ({
  title: resource?.title || "",
  summary: resource?.summary || "",
  domain: resource?.domain || meta.domains[0] || "accounting",
  resourceType: resource?.resourceType || meta.resourceTypes[0] || "guide",
  submodules: resource?.submodules || [],
  tagsInput: resource?.tags?.join(", ") || "",
  linkUrl: resource?.linkUrl || "",
  content: resource?.content || "",
  isFeatured: resource?.isFeatured || false,
  isPublished: resource?.isPublished ?? true,
});

const formatRelativeTime = (value: string | null) => {
  if (!value) return "not published";
  try {
    return formatDistanceToNow(new Date(value), { addSuffix: true });
  } catch {
    return "recently";
  }
};

export default function KnowledgeHub() {
  const { hasModuleAccess } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const canWrite = hasModuleAccess("knowledge_hub", "write");
  const canAdmin = hasModuleAccess("knowledge_hub", "admin");

  const [search, setSearch] = useState("");
  const [domainFilter, setDomainFilter] = useState("all");
  const [moduleFilter, setModuleFilter] = useState("all");
  const [resourceTypeFilter, setResourceTypeFilter] = useState("all");
  const [featuredOnly, setFeaturedOnly] = useState(false);
  const [includeDrafts, setIncludeDrafts] = useState(false);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingResource, setEditingResource] = useState<KnowledgeHubResource | null>(null);
  const [formState, setFormState] = useState<ResourceFormState>(toFormState(DEFAULT_META, null));

  const { data: metaData } = useQuery({
    queryKey: ["knowledge-hub-meta"],
    queryFn: () => knowledgeHubAPI.meta(),
  });

  const meta = metaData || DEFAULT_META;
  const moduleLabelByKey = useMemo(
    () => Object.fromEntries((meta.modules || []).map((module) => [module.key, module.label] as const)),
    [meta.modules]
  );

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: [
      "knowledge-hub-resources",
      search,
      domainFilter,
      moduleFilter,
      resourceTypeFilter,
      featuredOnly,
      includeDrafts,
      canWrite,
    ],
    queryFn: () =>
      knowledgeHubAPI.list({
        search: search || undefined,
        domain: domainFilter !== "all" ? domainFilter : undefined,
        moduleKey: moduleFilter !== "all" ? moduleFilter : undefined,
        resourceType: resourceTypeFilter !== "all" ? resourceTypeFilter : undefined,
        featured: featuredOnly ? true : undefined,
        includeDrafts: canWrite && includeDrafts ? true : undefined,
        page: 1,
        pageSize: 100,
      }),
  });

  const createMutation = useMutation({
    mutationFn: (payload: UpsertKnowledgeHubResourceInput) => knowledgeHubAPI.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["knowledge-hub-resources"] });
      toast({ title: "Resource created", description: "Knowledge resource was added." });
      setEditorOpen(false);
      setEditingResource(null);
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
      payload: Partial<UpsertKnowledgeHubResourceInput>;
    }) => knowledgeHubAPI.update(resourceId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["knowledge-hub-resources"] });
      toast({ title: "Resource updated", description: "Knowledge resource was updated." });
      setEditorOpen(false);
      setEditingResource(null);
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

  const clearFilters = () => {
    setSearch("");
    setDomainFilter("all");
    setModuleFilter("all");
    setResourceTypeFilter("all");
    setFeaturedOnly(false);
    setIncludeDrafts(false);
  };

  const openCreateDialog = () => {
    setEditingResource(null);
    setFormState(toFormState(meta, null));
    setEditorOpen(true);
  };

  const openEditDialog = (resource: KnowledgeHubResource) => {
    setEditingResource(resource);
    setFormState(toFormState(meta, resource));
    setEditorOpen(true);
  };

  const toggleFormModule = (moduleKey: string, checked: boolean) => {
    setFormState((previous) => {
      const nextModules = new Set(previous.submodules);
      if (checked) nextModules.add(moduleKey);
      else nextModules.delete(moduleKey);
      return { ...previous, submodules: Array.from(nextModules) };
    });
  };

  const handleSubmit = () => {
    const title = formState.title.trim();
    if (!title) {
      toast({ title: "Title required", description: "Please enter a title.", variant: "destructive" });
      return;
    }

    const payload: UpsertKnowledgeHubResourceInput = {
      title,
      summary: formState.summary.trim() || null,
      domain: formState.domain,
      resourceType: formState.resourceType,
      submodules: formState.submodules,
      tags: parseTags(formState.tagsInput),
      linkUrl: formState.linkUrl.trim() || null,
      content: formState.content.trim() || null,
      isFeatured: formState.isFeatured,
      isPublished: formState.isPublished,
    };

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

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Knowledge Hub</h1>
            <p className="text-muted-foreground">
              Shared accounting, tax, and audit resources for every module.
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
              Filter by domain, submodule scope, resource type, and publication state.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
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

              <Select value={moduleFilter} onValueChange={setModuleFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Module scope" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All modules</SelectItem>
                  {meta.modules.map((module) => (
                    <SelectItem key={module.key} value={module.key}>
                      {module.label}
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

                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Submodules
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {resource.submodules.length > 0 ? (
                        resource.submodules.map((moduleKey) => (
                          <Badge key={`${resource.id}-${moduleKey}`} variant="outline">
                            {moduleLabelByKey[moduleKey] || moduleKey}
                          </Badge>
                        ))
                      ) : (
                        <Badge variant="outline">All modules</Badge>
                      )}
                    </div>
                  </div>

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
                      {resource.linkUrl && (
                        <Button variant="outline" size="sm" asChild>
                          <a href={resource.linkUrl} target="_blank" rel="noreferrer">
                            <ExternalLink className="mr-2 h-4 w-4" />
                            Open
                          </a>
                        </Button>
                      )}
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

        <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
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
                  <Label htmlFor="resource-link">Resource URL</Label>
                  <Input
                    id="resource-link"
                    value={formState.linkUrl}
                    onChange={(event) =>
                      setFormState((prev) => ({ ...prev, linkUrl: event.target.value }))
                    }
                    placeholder="https://..."
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="resource-summary">Summary</Label>
                <Textarea
                  id="resource-summary"
                  value={formState.summary}
                  onChange={(event) =>
                    setFormState((prev) => ({ ...prev, summary: event.target.value }))
                  }
                  rows={3}
                  placeholder="Short summary"
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
                <Label>Module Scope</Label>
                <div className="grid gap-2 rounded-md border p-3 sm:grid-cols-2">
                  {meta.modules.map((module) => (
                    <label key={module.key} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={formState.submodules.includes(module.key)}
                        onCheckedChange={(checked) => toggleFormModule(module.key, checked === true)}
                      />
                      <span>{module.label}</span>
                    </label>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  If no module is selected, the resource is treated as organization-wide.
                </p>
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
