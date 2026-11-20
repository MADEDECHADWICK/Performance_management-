import { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import PageLoader from '@/components/ui/page-loader';
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { User, Briefcase, Award, Calendar, Phone, Mail, ClipboardCheck, CheckCircle2, Upload, FileText } from "lucide-react";
import documentsAPI from "@/lib/api/documents";
import onboardingPoliciesAPI from "@/lib/api/onboardingPolicies";
import { useAuth } from "@/contexts/AuthContext";

interface DepartmentOption {
  id: number;
  name: string;
}

interface ManagerOption {
  id: number;
  firstName?: string;
  lastName?: string;
  positionTitle?: string;
}

interface ChecklistItem {
  id: number;
  itemName: string;
  description?: string | null;
  sectionKey?: string | null;
  sectionLabel?: string | null;
  ownerRole?: string | null;
  itemType?: string | null;
  resourceUrl?: string | null;
  comments?: string | null;
  employeeNote?: string | null;
  requiresDocument?: boolean;
  documentId?: number | null;
  isCompleted?: boolean;
  document?: {
    id?: number;
    fileName?: string | null;
    filePath?: string | null;
    verificationStatus?: "pending" | "verified" | "rejected" | null;
    rejectionReason?: string | null;
  } | null;
}

interface ChecklistDetail {
  id: number;
  checklistName?: string;
  status?: string;
  completionPercent?: number;
  employeeAcknowledgedAt?: string | null;
  hrSignedOffAt?: string | null;
  hrSignoffNotes?: string | null;
  items?: ChecklistItem[];
}

interface OnboardingCaseRecord {
  id: number;
  status?: string | null;
  reviewStatus?: string | null;
  reviewNote?: string | null;
  submittedAt?: string | null;
  documentsSubmittedAt?: string | null;
  reviewedAt?: string | null;
  inductionChecklist?: { id: number } | null;
}

interface EmployeeProfileRecord {
  id: number;
  firstName: string;
  lastName: string;
  email?: string;
  phoneNumber?: string;
  positionTitle?: string;
  hireDate?: string | null;
  departmentId?: number | null;
  managerId?: number | null;
  status?: string;
  department?: {
    name?: string;
  } | null;
  role?: {
    id?: number;
    name?: string;
    billingRate?: number;
  } | null;
}

interface ProfileUpdatePayload {
  firstName: string;
  lastName: string;
  phoneNumber: string;
  positionTitle?: string;
  hireDate?: string | null;
  departmentId?: number | null;
  managerId?: number | null;
}

const isDocumentChecklistItem = (item: ChecklistItem) =>
  item.itemType === "document_upload" ||
  Boolean(item.requiresDocument) ||
  item.sectionKey === "employee_checklist" ||
  item.sectionKey === "employee_file";

const EMPTY_PROFILE: EmployeeProfileRecord = {
  id: 0,
  firstName: "",
  lastName: "",
  email: "",
  phoneNumber: "",
  positionTitle: "",
  hireDate: null,
  departmentId: null,
  managerId: null,
  status: "active",
  department: null,
};

const getErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message) return error.message;
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string"
  ) {
    return String((error as { message?: string }).message);
  }
  return fallback;
};

export default function EmployeeProfile() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const { user, isLoading: authLoading, isHR, isAdmin, refreshUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<EmployeeProfileRecord>(EMPTY_PROFILE);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [managers, setManagers] = useState<ManagerOption[]>([]);
  const [isHRAdmin, setIsHRAdmin] = useState(false);
  const [isViewingOther, setIsViewingOther] = useState(false);
  const [checklist, setChecklist] = useState<ChecklistDetail | null>(null);
  const [onboardingCase, setOnboardingCase] = useState<OnboardingCaseRecord | null>(null);
  const [checklistLoading, setChecklistLoading] = useState(false);
  const [checklistActionBusy, setChecklistActionBusy] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("personal");
  const [activePolicyIndex, setActivePolicyIndex] = useState(0);
  const [policyConfirmed, setPolicyConfirmed] = useState(false);
  const [submittingOnboarding, setSubmittingOnboarding] = useState(false);
  const [submittingDocuments, setSubmittingDocuments] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState<"documents" | "policies">("documents");
  const [documentNoteDrafts, setDocumentNoteDrafts] = useState<Record<number, string>>({});
  const [savingNoteItemId, setSavingNoteItemId] = useState<number | null>(null);
  const [policyContentBySlug, setPolicyContentBySlug] = useState<Record<string, string>>({});

  useEffect(() => {
    const requestedTab = String(searchParams.get("tab") || "")
      .trim()
      .toLowerCase();
    const allowedTabs = new Set(["personal", "career", "performance", "onboarding"]);
    if (allowedTabs.has(requestedTab)) {
      setActiveTab(requestedTab);
      return;
    }
    setActiveTab("personal");
  }, [searchParams]);

  const loadChecklist = useCallback(async (profileId: number) => {
    try {
      setChecklistLoading(true);
      const list = await apiFetch("GET", `/onboarding?profileId=${profileId}&page=1&pageSize=1`);
      const records = list?.data || list?.records || list || [];
      const onboarding = Array.isArray(records) ? records[0] : records?.[0];
      setOnboardingCase(onboarding || null);
      setOnboardingStep(onboarding?.documentsSubmittedAt ? "policies" : "documents");
      const checklistId = onboarding?.inductionChecklist?.id;
      if (!checklistId) {
        setChecklist(null);
        return;
      }
      const fullChecklist = await apiFetch("GET", `/induction-checklist/${checklistId}`);
      setChecklist(fullChecklist?.data ?? fullChecklist);
    } catch (error) {
      console.error("Error loading checklist", error);
      setChecklist(null);
    } finally {
      setChecklistLoading(false);
    }
  }, []);

  const loadProfile = useCallback(async () => {
    try {
      setLoading(true);
      if (!user) {
        navigate("/auth");
        return;
      }

      // Check if user is HR/Admin
      const hasHRAdminRole = isHR || isAdmin;
      setIsHRAdmin(hasHRAdminRole);

      // Check if viewing another employee's profile
      const viewingProfileId = searchParams.get("id");
      const currentProfileId = user.profile_id ?? user.profileId ?? user.profile?.id;
      setIsViewingOther(
        !!viewingProfileId && Number(viewingProfileId) !== Number(currentProfileId)
      );

      const data = viewingProfileId
        ? await apiFetch<EmployeeProfileRecord>('GET', `/profiles/${viewingProfileId}`)
        : await apiFetch<EmployeeProfileRecord>('GET', `/profiles/email/${encodeURIComponent(user.email)}`);
      setProfile(data);
      if (data?.id) {
        await loadChecklist(data.id);
      }

      // Load departments and managers if HR/Admin viewing another employee
      if (hasHRAdminRole && viewingProfileId) {
        const depts = await apiFetch<DepartmentOption[]>('GET', '/departments');
        setDepartments(Array.isArray(depts) ? depts : []);

        // Load all employees for manager selection (exclude current employee)
        const allEmployees = await apiFetch<ManagerOption[]>('GET', `/profiles`);
        const managerRows = Array.isArray(allEmployees) ? allEmployees : [];
        setManagers(managerRows.filter((item) => item.id !== data.id));
      }
    } catch (error: unknown) {
      toast({
        variant: "destructive",
        title: "Error loading profile",
        description: getErrorMessage(error, "Failed to load profile."),
      });
    } finally {
      setLoading(false);
    }
  }, [isAdmin, isHR, loadChecklist, navigate, searchParams, toast, user]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate("/auth");
      return;
    }
    loadProfile();
  }, [authLoading, user, navigate, loadProfile]);

  useEffect(() => {
    if (!checklist) return;
    const items = checklist.items || [];
    const induction = items.filter(
      (item) =>
        !isDocumentChecklistItem(item) &&
        String(item.ownerRole || "employee").toLowerCase() === "employee"
    );
    const firstIncomplete = induction.findIndex((item) => !item.isCompleted);
    setActivePolicyIndex(
      firstIncomplete >= 0 ? firstIncomplete : Math.max(0, induction.length - 1)
    );
    setPolicyConfirmed(false);

    const drafts: Record<number, string> = {};
    items
      .filter(
        (item) =>
          isDocumentChecklistItem(item) &&
          String(item.ownerRole || "hr").toLowerCase() === "employee"
      )
      .forEach((item) => {
        drafts[item.id] = item.employeeNote || "";
      });
    setDocumentNoteDrafts(drafts);
  }, [checklist]);

  useEffect(() => {
    const items = (checklist?.items || []).filter(
      (item) =>
        !isDocumentChecklistItem(item) &&
        String(item.ownerRole || "employee").toLowerCase() === "employee"
    );
    const active = items[activePolicyIndex];
    const rawResourceUrl = String(active?.resourceUrl || "").trim();
    if (!rawResourceUrl) return;
    const slug = rawResourceUrl.split("?")[0].split("/").filter(Boolean).pop();
    if (!slug || policyContentBySlug[slug] !== undefined) return;

    let cancelled = false;
    onboardingPoliciesAPI
      .getBySlug(slug)
      .then((policy) => {
        if (cancelled) return;
        setPolicyContentBySlug((previous) => ({
          ...previous,
          [slug]: policy.content || policy.summary || "",
        }));
      })
      .catch(() => null);

    return () => {
      cancelled = true;
    };
  }, [activePolicyIndex, checklist, policyContentBySlug]);

  const handleCompleteChecklistItem = async (checklistId: number, itemId: number) => {
    try {
      setChecklistActionBusy(`complete:${itemId}`);
      await apiFetch("PATCH", `/induction-checklist/${checklistId}/items/${itemId}/complete`);
      await loadChecklist(profile.id);
      await refreshUser();
      toast({
        title: "Checklist updated",
        description: "Item marked as complete.",
      });
    } catch (error: unknown) {
      toast({
        variant: "destructive",
        title: "Unable to complete item",
        description: getErrorMessage(error, "Please try again."),
      });
    } finally {
      setChecklistActionBusy(null);
    }
  };

  const handleAttachChecklistDocument = async (
    checklistId: number,
    itemId: number,
    file: File
  ) => {
    try {
      setChecklistActionBusy(`upload:${itemId}`);
      const upload = await documentsAPI.uploadFile(file, {
        documentType: "onboarding_checklist",
        entityType: "InductionChecklist",
        entityId: checklistId,
        accessLevel: "employee",
        isRequired: true,
        description: `Checklist item document`,
      });

      const documentId = (upload as any)?.id ?? (upload as any)?.data?.id;
      if (!documentId) {
        throw new Error("Upload succeeded but document id was missing.");
      }

      await apiFetch(
        "PATCH",
        `/induction-checklist/${checklistId}/items/${itemId}/document`,
        { documentId }
      );
      await apiFetch(
        "PATCH",
        `/induction-checklist/${checklistId}/items/${itemId}/complete`
      );

      await loadChecklist(profile.id);
      await refreshUser();
      toast({
        title: "Document uploaded",
        description: "The checklist item is now complete.",
      });
    } catch (error: unknown) {
      toast({
        variant: "destructive",
        title: "Document upload failed",
        description: getErrorMessage(error, "Please try again."),
      });
    } finally {
      setChecklistActionBusy(null);
    }
  };

  const handleConfirmPolicy = async (itemId: number, alreadyCompleted = false) => {
    if (!checklist) return;
    if (!alreadyCompleted) {
      await handleCompleteChecklistItem(checklist.id, itemId);
    }
    setPolicyConfirmed(false);
    setActivePolicyIndex((current) => current + 1);
  };

  const handleSaveDocumentNote = async (itemId: number) => {
    if (!checklist) return;
    try {
      setSavingNoteItemId(itemId);
      await apiFetch(
        "PATCH",
        `/induction-checklist/${checklist.id}/items/${itemId}/employee-note`,
        { note: documentNoteDrafts[itemId] || "" }
      );
      await loadChecklist(profile.id);
      toast({
        title: "Note saved",
        description: "HR will see this note when reviewing your documents.",
      });
    } catch (error: unknown) {
      toast({
        variant: "destructive",
        title: "Unable to save note",
        description: getErrorMessage(error, "Please try again."),
      });
    } finally {
      setSavingNoteItemId(null);
    }
  };

  const handleSubmitDocuments = async () => {
    if (!onboardingCase?.id) return;
    try {
      setSubmittingDocuments(true);
      await apiFetch("POST", `/onboarding/${onboardingCase.id}/submit-documents`);
      await loadChecklist(profile.id);
      await refreshUser();
      setOnboardingStep("policies");
      toast({
        title: "Documents sent to HR",
        description:
          "You can still return to upload missing documents. Step 2 is now unlocked.",
      });
    } catch (error: unknown) {
      toast({
        variant: "destructive",
        title: "Unable to submit documents",
        description: getErrorMessage(error, "Please try again."),
      });
    } finally {
      setSubmittingDocuments(false);
    }
  };

  const handleSubmitOnboarding = async () => {
    if (!onboardingCase?.id) return;
    try {
      setSubmittingOnboarding(true);
      await apiFetch("POST", `/onboarding/${onboardingCase.id}/submit`);
      await loadChecklist(profile.id);
      await refreshUser();
      toast({
        title: "Assessment sent to HR",
        description: "Your documents, notes, and policy acknowledgements are awaiting HR review.",
      });
    } catch (error: unknown) {
      toast({
        variant: "destructive",
        title: "Unable to submit onboarding assessment",
        description: getErrorMessage(error, "Please try again."),
      });
    } finally {
      setSubmittingOnboarding(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      
      // Personal fields that anyone can edit (only valid Prisma fields)
      const updateData: ProfileUpdatePayload = {
        firstName: profile.firstName,
        lastName: profile.lastName,
        phoneNumber: profile.phoneNumber || '',
      };

      // Only HR/Admin can update email, hire_date, department, position, and manager
      if (isHRAdmin) {
        updateData.positionTitle = profile.positionTitle || '';
        updateData.hireDate = profile.hireDate || null;
        updateData.departmentId = profile.departmentId || null;
        updateData.managerId = profile.managerId || null;
      }

      console.log('Saving profile with data:', updateData);

      const response = await apiFetch<EmployeeProfileRecord>('PATCH', `/profiles/${profile.id}`, updateData);
      
      console.log('Profile saved successfully:', response);
      setProfile(response);

      toast({
        title: "Profile updated",
        description: "Profile has been updated successfully.",
      });
      
      // Reload to get fresh data
      await loadProfile();
    } catch (error: unknown) {
      console.error('Save error:', error);
      toast({
        variant: "destructive",
        title: "Error saving profile",
        description: getErrorMessage(error, 'Failed to save profile. Please try again.'),
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <PageLoader message="Loading..." />
      </DashboardLayout>
    );
  }

  const currentViewerProfileId =
    user?.profile_id ?? user?.profileId ?? user?.profile?.id ?? 0;
  const isChecklistSelfView = Number(currentViewerProfileId) === Number(profile.id);

  const checklistItems = checklist?.items || [];
  const documentItems = checklistItems.filter(isDocumentChecklistItem);
  const employeeDocumentItems = documentItems.filter(
    (item) => String(item.ownerRole || "hr").toLowerCase() === "employee"
  );
  const hrDocumentItems = documentItems.filter(
    (item) => String(item.ownerRole || "hr").toLowerCase() !== "employee"
  );
  const inductionItems = checklistItems.filter(
    (item) => !isDocumentChecklistItem(item)
  );
  const employeeInductionItems = inductionItems.filter(
    (item) => String(item.ownerRole || "employee").toLowerCase() === "employee"
  );
  const hrInductionItems = inductionItems.filter(
    (item) => String(item.ownerRole || "").toLowerCase() === "hr"
  );
  const inductionComplete = employeeInductionItems.every(
    (item) => item.isCompleted
  );
  const reviewStatus = String(onboardingCase?.reviewStatus || "draft").toLowerCase();
  const isSubmitted = reviewStatus === "submitted";
  const isApproved = reviewStatus === "approved";
  const isChangesRequested = reviewStatus === "changes_requested";
  const documentsSubmitted = Boolean(onboardingCase?.documentsSubmittedAt);
  const completedPolicies = employeeInductionItems.filter(
    (item) => item.isCompleted
  ).length;
  const activePolicy = employeeInductionItems[activePolicyIndex] || null;
  const documentBaseUrl = import.meta.env.VITE_API_URL || "http://localhost:4000";

  const renderDocumentItem = (item: ChecklistItem) => {
    const isBusy = checklistActionBusy === `upload:${item.id}`;
    const documentPath = item.document?.filePath
      ? `${documentBaseUrl}${item.document.filePath}`
      : "";
    const isHrOwned =
      String(item.ownerRole || "hr").toLowerCase() !== "employee";
    const canUpload =
      (isChecklistSelfView &&
        !isHrOwned &&
        !item.isCompleted &&
        !isSubmitted &&
        !isApproved) ||
      (isHRAdmin && isHrOwned && !isApproved);

    return (
      <div key={item.id} className="rounded-lg border border-border p-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{item.itemName}</span>
              <Badge variant="outline" className="text-xs">
                Document
              </Badge>
              {item.isCompleted && (
                <Badge variant="secondary" className="text-xs">
                  Uploaded
                </Badge>
              )}
              {item.document?.verificationStatus && (
                <Badge variant="outline" className="text-xs">
                  {item.document.verificationStatus}
                </Badge>
              )}
            </div>
            {item.description && (
              <p className="text-xs text-muted-foreground">{item.description}</p>
            )}
            {item.comments && (
              <p className="text-xs text-muted-foreground">HR note: {item.comments}</p>
            )}
            {item.employeeNote && !isChecklistSelfView && (
              <p className="text-xs text-amber-700">
                Employee note: {item.employeeNote}
              </p>
            )}
            {documentPath && (
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <FileText className="h-4 w-4 text-emerald-500" />
                <a className="underline" href={documentPath} target="_blank" rel="noreferrer">
                  Preview
                </a>
                <a className="underline" href={documentPath} download>
                  Download
                </a>
                {item.document?.rejectionReason && (
                  <span className="text-destructive">
                    Rejection reason: {item.document.rejectionReason}
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {canUpload && !item.isCompleted && (
              <label className="inline-flex items-center">
                <input
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file && checklist) {
                      handleAttachChecklistDocument(checklist.id, item.id, file);
                    }
                    event.currentTarget.value = "";
                  }}
                />
                <Button
                  size="sm"
                  variant="outline"
                  asChild
                  disabled={Boolean(checklistActionBusy)}
                >
                  <span>
                    <Upload className="mr-2 h-4 w-4" />
                    {isBusy ? "Uploading..." : item.documentId ? "Replace" : "Upload"}
                  </span>
                </Button>
              </label>
            )}
            {item.documentId && !item.isCompleted && canUpload && checklist && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleCompleteChecklistItem(checklist.id, item.id)}
                disabled={Boolean(checklistActionBusy)}
              >
                Confirm uploaded
              </Button>
            )}
            {item.isCompleted && (
              <span className="flex items-center gap-1 text-xs text-emerald-600">
                <CheckCircle2 className="h-4 w-4" />
                Uploaded
              </span>
            )}
            {!item.isCompleted && !isChecklistSelfView && !isHrOwned && (
              <span className="text-xs text-muted-foreground">Employee upload pending</span>
            )}
          </div>
        </div>
        {isChecklistSelfView && !isHrOwned && (
          <div className="mt-3 space-y-2 border-t pt-3">
            <Label className="text-xs">
              Can't provide this yet? Add a note for HR
            </Label>
            <Textarea
              rows={2}
              value={documentNoteDrafts[item.id] ?? item.employeeNote ?? ""}
              onChange={(event) =>
                setDocumentNoteDrafts((previous) => ({
                  ...previous,
                  [item.id]: event.target.value,
                }))
              }
              placeholder="Explain what is missing and when you expect to provide it."
              disabled={isApproved || isSubmitted}
            />
            <div className="flex justify-end">
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleSaveDocumentNote(item.id)}
                disabled={
                  savingNoteItemId === item.id || isApproved || isSubmitted
                }
              >
                {savingNoteItemId === item.id ? "Saving..." : "Save note"}
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderPolicyCard = (item: ChecklistItem) => {
    const rawResourceUrl = String(item.resourceUrl || "").trim();
    const resourceUrl = rawResourceUrl.startsWith("/uploads/")
      ? `${documentBaseUrl}${rawResourceUrl}`
      : rawResourceUrl;
    const policySlug = rawResourceUrl.split("?")[0].split("/").filter(Boolean).pop() || "";
    const policyContent = policySlug ? policyContentBySlug[policySlug] : "";
    const isDone = Boolean(item.isCompleted);

    return (
      <div key={item.id} className="space-y-3 rounded-lg border border-border p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">
            {item.sectionLabel || "Induction"}
          </span>
          <span className="font-medium">{item.itemName}</span>
          {isDone && <Badge variant="secondary">Acknowledged</Badge>}
        </div>
        {item.description && (
          <p className="text-sm text-muted-foreground">{item.description}</p>
        )}
        {resourceUrl && !isChecklistSelfView && (
          <Button variant="link" className="h-auto p-0 text-xs" asChild>
            <a href={resourceUrl} target="_blank" rel="noreferrer">
              Open policy
            </a>
          </Button>
        )}
        <div className="whitespace-pre-wrap rounded-md border bg-muted/20 p-3 text-sm leading-6">
          {policyContent ||
            item.description ||
            "Policy content is being prepared. Please confirm that you have read and fully understood this item."}
        </div>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={isDone || policyConfirmed}
            disabled={isDone || !isChecklistSelfView || isSubmitted || isApproved}
            onChange={(event) => setPolicyConfirmed(event.target.checked)}
          />
          <span>I have read and fully understood this policy.</span>
        </label>
      </div>
    );
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">
            {isViewingOther ? "Employee Profile" : "My Profile"}
          </h1>
          <p className="text-muted-foreground">
            {isViewingOther 
              ? "View and manage employee information" 
              : "Manage your personal information and career details"}
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="personal">Personal Info</TabsTrigger>
            <TabsTrigger value="career">Career Details</TabsTrigger>
            <TabsTrigger value="performance">Performance History</TabsTrigger>
            <TabsTrigger value="onboarding">Onboarding</TabsTrigger>
          </TabsList>

          <TabsContent value="personal" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Personal Information
                </CardTitle>
                <CardDescription>Update your personal details</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">First Name</Label>
                    <Input
                      id="firstName"
                      value={profile?.firstName || ""}
                      onChange={(e) => setProfile({ ...profile, firstName: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">Last Name</Label>
                    <Input
                      id="lastName"
                      value={profile?.lastName || ""}
                      onChange={(e) => setProfile({ ...profile, lastName: e.target.value })}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email" className="flex items-center gap-2">
                    <Mail className="h-4 w-4" />
                    Email
                  </Label>
                  <Input 
                    id="email" 
                    type="email" 
                    value={profile?.email || ""} 
                    onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                    disabled={!isHRAdmin}
                  />
                  {isHRAdmin && isViewingOther && (
                    <p className="text-sm text-muted-foreground">Edit employee email address</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phoneNumber" className="flex items-center gap-2">
                    <Phone className="h-4 w-4" />
                    Phone Number
                  </Label>
                  <Input 
                    id="phoneNumber" 
                    type="tel" 
                    value={profile?.phoneNumber || ""} 
                    onChange={(e) => setProfile({ ...profile, phoneNumber: e.target.value })}
                    placeholder="Enter phone number"
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="career" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Briefcase className="h-5 w-5" />
                  Career Information
                </CardTitle>
                <CardDescription>Your role and position details</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="position">Position</Label>
                  <Input
                    id="position"
                    value={profile?.positionTitle || ""}
                    onChange={(e) => setProfile({ ...profile, positionTitle: e.target.value })}
                    disabled={!isHRAdmin}
                  />
                  {!isHRAdmin && (
                    <p className="text-sm text-muted-foreground">Position is managed by HR/Admin</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Billing rate</Label>
                  <Input
                    value={
                      profile?.role?.billingRate !== undefined
                        ? `KES ${Number(profile.role.billingRate).toLocaleString()} / hour`
                        : "Not set"
                    }
                    disabled
                  />
                  <p className="text-sm text-muted-foreground">
                    Rate is used for billing and timesheets. Position is a display title.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="hireDate" className="flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    Hire Date
                  </Label>
                  <Input
                    id="hireDate"
                    type="date"
                    value={
                      profile?.hireDate 
                        ? new Date(profile.hireDate).toISOString().split('T')[0] 
                        : ""
                    }
                    onChange={(e) => setProfile({ ...profile, hireDate: e.target.value })}
                    disabled={!isHRAdmin}
                  />
                  {isHRAdmin && !profile?.hireDate && (
                    <p className="text-sm text-muted-foreground">Set the employee's hire date</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Department</Label>
                  {isHRAdmin ? (
                    <Select
                      value={profile?.departmentId ? String(profile.departmentId) : "none"}
                      onValueChange={(value) => 
                        setProfile({ 
                          ...profile, 
                          departmentId: value === "none" ? null : Number(value) 
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select department" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No Department</SelectItem>
                        {departments.map((dept) => (
                          <SelectItem key={dept.id} value={String(dept.id)}>
                            {dept.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input 
                      value={profile?.department?.name || "N/A"} 
                      disabled 
                    />
                  )}
                  {isHRAdmin && !profile?.departmentId && (
                    <p className="text-sm text-muted-foreground">Assign employee to a department</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Manager/Supervisor</Label>
                  {isHRAdmin ? (
                    <Select
                      value={profile?.managerId ? String(profile.managerId) : "none"}
                      onValueChange={(value) => 
                        setProfile({ 
                          ...profile, 
                          managerId: value === "none" ? null : Number(value) 
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select manager" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No Manager</SelectItem>
                        {managers.map((mgr) => (
                          <SelectItem key={mgr.id} value={String(mgr.id)}>
                            {mgr.firstName} {mgr.lastName} {mgr.positionTitle ? `(${mgr.positionTitle})` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input 
                      value="View only - contact HR to change" 
                      disabled 
                    />
                  )}
                  {isHRAdmin && !profile?.managerId && (
                    <p className="text-sm text-muted-foreground">Assign a manager to this employee</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="performance" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Award className="h-5 w-5" />
                  Performance History
                </CardTitle>
                <CardDescription>View your performance history and achievements</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Your performance history and scorecard records will appear here.
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="onboarding" className="space-y-4">
            {checklistLoading ? (
              <Card>
                <CardContent className="py-6 text-sm text-muted-foreground">
                  Loading onboarding...
                </CardContent>
              </Card>
            ) : !checklist ? (
              <Card>
                <CardContent className="py-6 text-sm text-muted-foreground">
                  No onboarding checklist has been assigned yet.
                </CardContent>
              </Card>
            ) : (
              <>
                <Card>
                  <CardHeader>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          <ClipboardCheck className="h-5 w-5" />
                          Onboarding
                        </CardTitle>
                        <CardDescription>
                          Complete your documents first, then read and acknowledge each policy.
                        </CardDescription>
                      </div>
                      <Badge
                        variant={
                          isApproved
                            ? "default"
                            : isSubmitted
                              ? "secondary"
                              : isChangesRequested
                                ? "destructive"
                                : "outline"
                        }
                      >
                        {isApproved
                          ? "Activated"
                          : isSubmitted
                            ? "Submitted to HR"
                            : isChangesRequested
                              ? "Changes requested"
                              : "In progress"}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Progress
                      value={
                        checklistItems.length > 0
                          ? (checklistItems.filter((item) => item.isCompleted).length /
                              checklistItems.length) *
                            100
                          : 0
                      }
                    />
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>
                        Documents:{" "}
                        {
                          employeeDocumentItems.filter(
                            (item) => item.isCompleted || item.documentId
                          ).length
                        }
                        /{employeeDocumentItems.length}
                      </span>
                      <span>
                        Policies: {completedPolicies}/{employeeInductionItems.length}
                      </span>
                      {isSubmitted && onboardingCase?.submittedAt && (
                        <span>
                          Submitted{" "}
                          {new Date(onboardingCase.submittedAt).toLocaleString()}
                        </span>
                      )}
                    </div>
                    {isChangesRequested && onboardingCase?.reviewNote && (
                      <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                        <div className="font-medium">HR requested changes</div>
                        <p>{onboardingCase.reviewNote}</p>
                      </div>
                    )}
                    {isApproved && (
                      <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                        Your onboarding is complete. The system modules are now open.
                      </div>
                    )}
                    {isSubmitted && (
                      <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
                        Waiting for HR review. HR will only revert if there is a question.
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="flex flex-wrap items-center gap-2 p-3">
                    <Button
                      type="button"
                      variant={onboardingStep === "documents" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setOnboardingStep("documents")}
                    >
                      1. Documents
                    </Button>
                    <Button
                      type="button"
                      variant={onboardingStep === "policies" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setOnboardingStep("policies")}
                      disabled={!documentsSubmitted}
                    >
                      2. Policies
                    </Button>
                    {!documentsSubmitted && (
                      <span className="text-xs text-muted-foreground">
                        Submit your documents to unlock policies.
                      </span>
                    )}
                  </CardContent>
                </Card>

                {onboardingStep === "documents" && (
                <Card>
                  <CardHeader>
                    <CardTitle>Step 1 - Documents</CardTitle>
                    <CardDescription>
                      Upload the documents you can provide. Add a note for anything you
                      cannot provide yet - missing documents do not block submission.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {employeeDocumentItems.map(renderDocumentItem)}
                    {!isChecklistSelfView && hrDocumentItems.length > 0 && (
                      <div className="space-y-2 rounded-md border bg-muted/20 p-3">
                        <div className="text-sm font-medium text-foreground">
                          HR-only documents
                        </div>
                        <p className="text-xs text-muted-foreground">
                          These documents are completed by HR and are not shown to the
                          employee.
                        </p>
                        {hrDocumentItems.map(renderDocumentItem)}
                      </div>
                    )}
                    {documentsSubmitted ? (
                      <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
                        Documents submitted. You can still upload a missing document or
                        update its note; HR will be notified.
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="text-xs text-muted-foreground">
                          You can submit with missing items and notes.
                        </p>
                        <Button
                          onClick={handleSubmitDocuments}
                          disabled={submittingDocuments || !isChecklistSelfView}
                        >
                          {submittingDocuments
                            ? "Submitting..."
                            : "Submit my documents"}
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
                )}

                {onboardingStep === "policies" && documentsSubmitted && (
                  <Card>
                    <CardHeader>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <CardTitle>Step 2 - Policies</CardTitle>
                          <CardDescription>
                            Read each policy and confirm you have read and fully understood it
                            before moving to the next.
                          </CardDescription>
                        </div>
                        <Badge variant="outline">
                          {completedPolicies}/{employeeInductionItems.length}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {inductionComplete ? (
                        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                          All induction policies have been acknowledged.
                        </div>
                      ) : activePolicy ? (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between text-sm text-muted-foreground">
                            <span>
                              Policy{" "}
                              {Math.min(
                                activePolicyIndex + 1,
                                employeeInductionItems.length
                              )}{" "}
                              of {employeeInductionItems.length}
                            </span>
                            <span>{activePolicy.sectionLabel || "Induction"}</span>
                          </div>
                          {renderPolicyCard(activePolicy)}
                          <div className="flex justify-between">
                            <Button
                              variant="outline"
                              disabled={activePolicyIndex <= 0}
                              onClick={() => {
                                setActivePolicyIndex((current) =>
                                  Math.max(0, current - 1)
                                );
                                setPolicyConfirmed(false);
                              }}
                            >
                              Previous
                            </Button>
                            <Button
                              onClick={() =>
                                handleConfirmPolicy(
                                  activePolicy.id,
                                  Boolean(activePolicy.isCompleted)
                                )
                              }
                              disabled={
                                !isChecklistSelfView ||
                                isSubmitted ||
                                isApproved ||
                                Boolean(checklistActionBusy) ||
                                (!activePolicy.isCompleted && !policyConfirmed)
                              }
                            >
                              {activePolicy.isCompleted
                                ? "Next"
                                : isChangesRequested
                                  ? "Confirm & resubmit"
                                  : "Confirm & continue"}
                            </Button>
                          </div>
                        </div>
                      ) : null}

                      {completedPolicies > 0 && (
                        <div className="space-y-1">
                          <div className="text-xs font-medium text-muted-foreground">
                            Acknowledged policies
                          </div>
                          {employeeInductionItems
                            .filter((item) => item.isCompleted)
                            .map((item) => (
                              <div
                                key={item.id}
                                className="flex items-center gap-2 text-sm text-emerald-700"
                              >
                                <CheckCircle2 className="h-4 w-4" />
                                {item.itemName}
                              </div>
                            ))}
                        </div>
                      )}

                      {hrInductionItems.length > 0 && (
                        <div className="rounded-md border bg-muted/20 p-3 text-sm text-muted-foreground">
                          <div className="font-medium text-foreground">
                            HR-led induction items
                          </div>
                          {hrInductionItems.map((item) => (
                            <div key={item.id}>
                              {item.itemName} - HR will take you through this.
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {onboardingStep === "policies" && documentsSubmitted && inductionComplete && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Step 3 - Submit assessment</CardTitle>
                      <CardDescription>
                        Submit your documents and policy acknowledgements once for HR review.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <p className="text-sm text-muted-foreground">
                        This is to certify that I, {profile.firstName} {profile.lastName},
                        have been taken through the contents of the induction checklist above
                        and agree to abide by them.
                      </p>
                      {isApproved ? (
                        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                          Onboarding activated.
                        </div>
                      ) : isSubmitted ? (
                        <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
                          Submitted to HR. No further action is required unless HR asks a
                          question.
                        </div>
                      ) : (
                        <Button
                          onClick={handleSubmitOnboarding}
                          disabled={
                            submittingOnboarding ||
                            !isChecklistSelfView ||
                            !inductionComplete
                          }
                        >
                          {submittingOnboarding
                            ? "Submitting..."
                            : isChangesRequested
                              ? "Resubmit full onboarding assessment"
                              : "Submit full onboarding assessment"}
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </TabsContent>
        </Tabs>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>
    </DashboardLayout>
  );
}

