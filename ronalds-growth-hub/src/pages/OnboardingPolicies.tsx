import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import PageLoader from "@/components/ui/page-loader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import onboardingPoliciesAPI, {
  OnboardingPolicy,
  UpsertOnboardingPolicyInput,
} from "@/lib/api/onboardingPolicies";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { ArrowLeft, BookOpen, Pencil, Plus } from "lucide-react";

type PolicyFormState = {
  title: string;
  slug: string;
  summary: string;
  content: string;
  sectionKey: string;
  sectionLabel: string;
  orderIndex: string;
  requiresAcknowledgement: boolean;
  isActive: boolean;
  isPublished: boolean;
};

const DEFAULT_FORM_STATE: PolicyFormState = {
  title: "",
  slug: "",
  summary: "",
  content: "",
  sectionKey: "general",
  sectionLabel: "General",
  orderIndex: "0",
  requiresAcknowledgement: true,
  isActive: true,
  isPublished: true,
};

const slugify = (value: string) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

const toFormState = (policy?: OnboardingPolicy | null): PolicyFormState =>
  policy
    ? {
        title: policy.title,
        slug: policy.slug,
        summary: policy.summary || "",
        content: policy.content || "",
        sectionKey: policy.sectionKey,
        sectionLabel: policy.sectionLabel,
        orderIndex: String(policy.orderIndex ?? 0),
        requiresAcknowledgement: policy.requiresAcknowledgement,
        isActive: policy.isActive,
        isPublished: policy.isPublished,
      }
    : DEFAULT_FORM_STATE;

const buildPayload = (form: PolicyFormState): UpsertOnboardingPolicyInput => ({
  title: form.title.trim(),
  slug: slugify(form.slug || form.title),
  summary: form.summary.trim() || null,
  content: form.content.trim() || null,
  sectionKey: form.sectionKey.trim() || "general",
  sectionLabel: form.sectionLabel.trim() || "General",
  orderIndex: Number(form.orderIndex || 0),
  requiresAcknowledgement: form.requiresAcknowledgement,
  isActive: form.isActive,
  isPublished: form.isPublished,
});

export default function OnboardingPolicies() {
  const { slug } = useParams<{ slug?: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isHR, isAdmin } = useAuth();
  const canManage = isHR || isAdmin;
  const backHref = canManage ? "/employee-management" : "/profile?tab=onboarding";
  const backLabel = canManage ? "Back to Employee Management" : "Back to Onboarding";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [policies, setPolicies] = useState<OnboardingPolicy[]>([]);
  const [activePolicy, setActivePolicy] = useState<OnboardingPolicy | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPolicyId, setEditingPolicyId] = useState<number | null>(null);
  const [form, setForm] = useState<PolicyFormState>(DEFAULT_FORM_STATE);

  const groupedPolicies = useMemo(() => {
    const grouped = new Map<
      string,
      { sectionLabel: string; policies: OnboardingPolicy[] }
    >();

    policies.forEach((policy) => {
      const existing = grouped.get(policy.sectionKey);
      if (existing) {
        existing.policies.push(policy);
        return;
      }
      grouped.set(policy.sectionKey, {
        sectionLabel: policy.sectionLabel,
        policies: [policy],
      });
    });

    return Array.from(grouped.entries()).map(([sectionKey, value]) => ({
      sectionKey,
      sectionLabel: value.sectionLabel,
      policies: value.policies.sort((a, b) => a.orderIndex - b.orderIndex || a.title.localeCompare(b.title)),
    }));
  }, [policies]);

  const loadList = async () => {
    setLoading(true);
    try {
      const response = await onboardingPoliciesAPI.list();
      setPolicies(response.policies || []);
    } catch (error: any) {
      toast({
        title: "Unable to load onboarding policies",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const loadDetail = async (nextSlug: string) => {
    setLoading(true);
    try {
      const policy = await onboardingPoliciesAPI.getBySlug(nextSlug);
      setActivePolicy(policy);
      setPolicies([]);
    } catch (error: any) {
      toast({
        title: "Unable to load onboarding policy",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
      navigate("/onboarding-policies", { replace: true });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (slug) {
      void loadDetail(slug);
      return;
    }
    setActivePolicy(null);
    void loadList();
  }, [slug]);

  const openCreateDialog = () => {
    setEditingPolicyId(null);
    setForm(DEFAULT_FORM_STATE);
    setDialogOpen(true);
  };

  const openEditDialog = (policy: OnboardingPolicy) => {
    setEditingPolicyId(policy.id);
    setForm(toFormState(policy));
    setDialogOpen(true);
  };

  const handleSave = async () => {
    const payload = buildPayload(form);
    if (!payload.title) {
      toast({
        title: "Title required",
        description: "Add a title before saving the policy.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      if (editingPolicyId) {
        const updated = await onboardingPoliciesAPI.update(editingPolicyId, payload);
        if (slug) {
          setActivePolicy(updated);
          if (updated.slug !== slug) {
            navigate(`/onboarding-policies/${updated.slug}`, { replace: true });
          }
        } else {
          await loadList();
        }
        toast({
          title: "Policy updated",
          description: "The onboarding policy was saved successfully.",
        });
      } else {
        const created = await onboardingPoliciesAPI.create(payload);
        await loadList();
        toast({
          title: "Policy created",
          description: "The onboarding policy was added to the library.",
        });
        if (!slug) {
          navigate(`/onboarding-policies/${created.slug}`);
        }
      }
      setDialogOpen(false);
    } catch (error: any) {
      toast({
        title: "Unable to save policy",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h2 className="text-3xl font-bold tracking-tight">
              {slug ? "Onboarding Policy" : "Onboarding Policy Library"}
            </h2>
            <p className="text-muted-foreground">
              {slug
                ? "Review the policy content assigned during onboarding."
                : "Manage HR-controlled onboarding policies separately from Knowledge Hub material."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {slug ? (
              <Button variant="outline" asChild>
                <Link to={backHref}>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  {backLabel}
                </Link>
              </Button>
            ) : null}
            {!slug && canManage ? (
              <Button onClick={openCreateDialog}>
                <Plus className="mr-2 h-4 w-4" />
                Add Policy
              </Button>
            ) : null}
          </div>
        </div>

        {loading ? (
          <PageLoader message="Loading onboarding policies..." minHeightClassName="min-h-[30vh]" />
        ) : slug ? (
          !activePolicy ? (
            <Card>
              <CardContent className="py-8 text-sm text-muted-foreground">
                Policy not found.
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{activePolicy.sectionLabel}</Badge>
                      {activePolicy.requiresAcknowledgement ? (
                        <Badge variant="secondary">Acknowledgement required</Badge>
                      ) : null}
                      {!activePolicy.isPublished ? <Badge variant="outline">Draft</Badge> : null}
                    </div>
                    <CardTitle className="text-2xl">{activePolicy.title}</CardTitle>
                    {activePolicy.summary ? (
                      <CardDescription>{activePolicy.summary}</CardDescription>
                    ) : null}
                  </div>
                  {canManage ? (
                    <Button variant="outline" onClick={() => openEditDialog(activePolicy)}>
                      <Pencil className="mr-2 h-4 w-4" />
                      Edit Policy
                    </Button>
                  ) : null}
                </div>
                <div className="text-xs text-muted-foreground">
                  Updated {new Date(activePolicy.updatedAt).toLocaleString()}
                  {activePolicy.updatedByName ? ` by ${activePolicy.updatedByName}` : ""}
                </div>
              </CardHeader>
              <CardContent>
                <div className="rounded-lg border border-border bg-background p-4 whitespace-pre-wrap text-sm leading-7">
                  {activePolicy.content || "No policy content has been published yet."}
                </div>
              </CardContent>
            </Card>
          )
        ) : (
          <div className="space-y-4">
            {groupedPolicies.map((section) => (
              <Card key={section.sectionKey}>
                <CardHeader>
                  <CardTitle>{section.sectionLabel}</CardTitle>
                  <CardDescription>
                    Policies and onboarding guidance assigned to new employees in this section.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {section.policies.map((policy) => (
                    <div
                      key={policy.id}
                      className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border p-4"
                    >
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="font-medium">{policy.title}</div>
                          {policy.requiresAcknowledgement ? (
                            <Badge variant="secondary" className="text-xs">
                              Acknowledgement required
                            </Badge>
                          ) : null}
                          {!policy.isPublished ? (
                            <Badge variant="outline" className="text-xs">
                              Draft
                            </Badge>
                          ) : null}
                          {!policy.isActive ? (
                            <Badge variant="destructive" className="text-xs">
                              Inactive
                            </Badge>
                          ) : null}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {policy.summary || "No summary added yet."}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Updated {new Date(policy.updatedAt).toLocaleDateString()}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button variant="outline" asChild>
                          <Link to={`/onboarding-policies/${policy.slug}`}>
                            <BookOpen className="mr-2 h-4 w-4" />
                            View
                          </Link>
                        </Button>
                        {canManage ? (
                          <Button variant="outline" onClick={() => openEditDialog(policy)}>
                            <Pencil className="mr-2 h-4 w-4" />
                            Edit
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="w-[95vw] sm:max-w-[760px] max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingPolicyId ? "Edit onboarding policy" : "Create onboarding policy"}</DialogTitle>
              <DialogDescription>
                HR manages onboarding policies here. Employees will consume these separately from Knowledge Hub.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-2">
              <div className="grid gap-2">
                <Label htmlFor="policy-title">Title</Label>
                <Input
                  id="policy-title"
                  value={form.title}
                  onChange={(event) =>
                    setForm((prev) => {
                      const nextTitle = event.target.value;
                      return {
                        ...prev,
                        title: nextTitle,
                        slug: prev.slug ? prev.slug : slugify(nextTitle),
                      };
                    })
                  }
                  placeholder="Data protection policy"
                />
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="policy-slug">Slug</Label>
                  <Input
                    id="policy-slug"
                    value={form.slug}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, slug: slugify(event.target.value) }))
                    }
                    placeholder="data-protection-policy"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="policy-order">Order</Label>
                  <Input
                    id="policy-order"
                    type="number"
                    min={0}
                    value={form.orderIndex}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, orderIndex: event.target.value }))
                    }
                  />
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="policy-section-key">Section key</Label>
                  <Input
                    id="policy-section-key"
                    value={form.sectionKey}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        sectionKey: event.target.value.trim().toLowerCase().replace(/[\s-]+/g, "_"),
                      }))
                    }
                    placeholder="hr_policies"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="policy-section-label">Section label</Label>
                  <Input
                    id="policy-section-label"
                    value={form.sectionLabel}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, sectionLabel: event.target.value }))
                    }
                    placeholder="HR Policies"
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="policy-summary">Summary</Label>
                <Textarea
                  id="policy-summary"
                  rows={2}
                  value={form.summary}
                  onChange={(event) => setForm((prev) => ({ ...prev, summary: event.target.value }))}
                  placeholder="Explain what the employee should review."
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="policy-content">Policy content</Label>
                <Textarea
                  id="policy-content"
                  rows={16}
                  value={form.content}
                  onChange={(event) => setForm((prev) => ({ ...prev, content: event.target.value }))}
                  placeholder="Write the onboarding policy or guidance here."
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                  <Label htmlFor="policy-ack">Requires acknowledgement</Label>
                  <Switch
                    id="policy-ack"
                    checked={form.requiresAcknowledgement}
                    onCheckedChange={(checked) =>
                      setForm((prev) => ({ ...prev, requiresAcknowledgement: checked }))
                    }
                  />
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                  <Label htmlFor="policy-active">Active</Label>
                  <Switch
                    id="policy-active"
                    checked={form.isActive}
                    onCheckedChange={(checked) =>
                      setForm((prev) => ({ ...prev, isActive: checked }))
                    }
                  />
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                  <Label htmlFor="policy-published">Published</Label>
                  <Switch
                    id="policy-published"
                    checked={form.isPublished}
                    onCheckedChange={(checked) =>
                      setForm((prev) => ({ ...prev, isPublished: checked }))
                    }
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "Saving..." : editingPolicyId ? "Save changes" : "Create policy"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
