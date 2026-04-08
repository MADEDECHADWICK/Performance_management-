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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { User, Briefcase, Award, Calendar, Phone, Mail, ClipboardCheck, CheckCircle2, Upload, FileText } from "lucide-react";
import documentsAPI from "@/lib/api/documents";
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

type ChecklistItemType =
  | "task"
  | "document_upload"
  | "video_watch"
  | "policy_link"
  | "external_link";

const CHECKLIST_ITEM_TYPE_LABELS: Record<ChecklistItemType, string> = {
  task: "Task",
  document_upload: "Document Upload",
  video_watch: "Video",
  policy_link: "Policy",
  external_link: "Link",
};

const normalizeChecklistItemType = (value?: string | null): ChecklistItemType => {
  const normalized = String(value || "task").toLowerCase().trim() as ChecklistItemType;
  if (normalized in CHECKLIST_ITEM_TYPE_LABELS) return normalized;
  return "task";
};

const formatOwnerRoleLabel = (value?: string | null) => {
  const normalized = String(value || "hr")
    .trim()
    .toLowerCase();
  if (normalized === "employee") return "Employee";
  return "HR";
};

const groupChecklistItemsBySection = (items: ChecklistItem[] = []) => {
  const groups = new Map<
    string,
    { sectionKey: string; sectionLabel: string; items: ChecklistItem[] }
  >();

  items.forEach((item) => {
    const sectionKey = String(item.sectionKey || "general");
    const sectionLabel = String(item.sectionLabel || "General");
    if (!groups.has(sectionKey)) {
      groups.set(sectionKey, { sectionKey, sectionLabel, items: [] });
    }
    groups.get(sectionKey)!.items.push(item);
  });

  return Array.from(groups.values());
};

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
  const [checklistLoading, setChecklistLoading] = useState(false);
  const [checklistActionBusy, setChecklistActionBusy] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("personal");

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

      await loadChecklist(profile.id);
      await refreshUser();
      toast({
        title: "Document attached",
        description: "Checklist document uploaded successfully.",
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

  const handleAcknowledgeChecklist = async (checklistId: number) => {
    try {
      setChecklistActionBusy(`acknowledge:${checklistId}`);
      await apiFetch("POST", `/induction-checklist/${checklistId}/acknowledge`);
      await loadChecklist(profile.id);
      await refreshUser();
      toast({
        title: "Induction acknowledged",
        description: "HR can now complete the final induction signoff.",
      });
    } catch (error: unknown) {
      toast({
        variant: "destructive",
        title: "Unable to acknowledge induction",
        description: getErrorMessage(error, "Please try again."),
      });
    } finally {
      setChecklistActionBusy(null);
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

      const response = await apiFetch('PATCH', `/profiles/${profile.id}`, updateData);
      
      console.log('Profile saved successfully:', response);

      toast({
        title: "Profile updated",
        description: "Profile has been updated successfully.",
      });
      
      // Reload to get fresh data
      loadProfile();
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
                <CardDescription>View your evaluation history and achievements</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Your performance history and evaluation records will appear here.
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="onboarding" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ClipboardCheck className="h-5 w-5" />
                  Onboarding Checklist
                </CardTitle>
                <CardDescription>Your current induction checklist items</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {checklistLoading ? (
                  <div className="text-sm text-muted-foreground">Loading checklist...</div>
                ) : !checklist ? (
                  <div className="text-sm text-muted-foreground">
                    No onboarding checklist has been assigned yet.
                  </div>
                ) : (
                  <>
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <div className="font-medium">{checklist.checklistName || "Induction Checklist"}</div>
                        <Badge variant="secondary">{checklist.status?.replace("_", " ") || "pending"}</Badge>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Completion: {Math.round(checklist.completionPercent || 0)}%
                      </div>
                      <div className="grid gap-2 md:grid-cols-2">
                        <div className="rounded-lg border border-border p-3 text-xs text-muted-foreground">
                          <div className="font-medium text-foreground">Employee acknowledgement</div>
                          {checklist.employeeAcknowledgedAt
                            ? `Acknowledged on ${new Date(checklist.employeeAcknowledgedAt).toLocaleString()}`
                            : "Pending until every induction item is complete."}
                        </div>
                        <div className="rounded-lg border border-border p-3 text-xs text-muted-foreground">
                          <div className="font-medium text-foreground">HR signoff</div>
                          {checklist.hrSignedOffAt
                            ? `Signed off on ${new Date(checklist.hrSignedOffAt).toLocaleString()}`
                            : "Pending final HR review."}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3">
                      {groupChecklistItemsBySection(checklist.items || []).map((section) => (
                        <div key={section.sectionKey} className="space-y-3">
                          <div className="rounded-lg bg-muted/30 px-3 py-2">
                            <div className="font-medium">{section.sectionLabel}</div>
                            <div className="text-xs text-muted-foreground">
                              {section.items.filter((item) => item.isCompleted).length}/{section.items.length} complete
                            </div>
                          </div>
                          {section.items.map((item: ChecklistItem) => {
                            const itemType = normalizeChecklistItemType(item.itemType);
                            const rawResourceUrl = String(item.resourceUrl || "").trim();
                            const resourceUrl = rawResourceUrl
                              ? rawResourceUrl.startsWith("/uploads/")
                                ? `${import.meta.env.VITE_API_URL || "http://localhost:4000"}${rawResourceUrl}`
                                : rawResourceUrl
                              : "";
                            const resourceLabel =
                              itemType === "video_watch"
                                ? "Open video"
                                : itemType === "policy_link"
                                ? "Open policy"
                                : itemType === "external_link"
                                ? "Open link"
                                : "Open resource";
                            const ownerRole = String(item.ownerRole || "hr").toLowerCase();
                            const employeeOwned = ownerRole === "employee" && isChecklistSelfView;
                            const documentVerified = item.document?.verificationStatus === "verified";
                            const canMarkComplete =
                              employeeOwned &&
                              !item.isCompleted &&
                              (!item.requiresDocument || documentVerified);

                            return (
                              <div
                                key={item.id}
                                className="rounded-lg border border-border p-3"
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="space-y-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="font-medium">{item.itemName}</span>
                                      <Badge variant="outline" className="text-xs">
                                        {CHECKLIST_ITEM_TYPE_LABELS[itemType]}
                                      </Badge>
                                      <Badge variant="secondary" className="text-xs">
                                        {formatOwnerRoleLabel(item.ownerRole)}
                                      </Badge>
                                      {item.requiresDocument && (
                                        <Badge variant="outline" className="text-xs">
                                          Document required
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
                                      <p className="text-xs text-muted-foreground">
                                        HR note: {item.comments}
                                      </p>
                                    )}
                                    {resourceUrl && (
                                      <div>
                                        <Button variant="link" className="h-auto p-0 text-xs" asChild>
                                          <a href={resourceUrl} target="_blank" rel="noreferrer">
                                            {resourceLabel}
                                          </a>
                                        </Button>
                                      </div>
                                    )}
                                    {item.documentId && item.document?.filePath && (
                                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                        <FileText className="h-4 w-4 text-emerald-500" />
                                        <Button variant="link" className="h-auto p-0 text-xs" asChild>
                                          <a
                                            href={`${import.meta.env.VITE_API_URL || "http://localhost:4000"}${item.document.filePath}`}
                                            target="_blank"
                                            rel="noreferrer"
                                          >
                                            Preview
                                          </a>
                                        </Button>
                                        <Button variant="link" className="h-auto p-0 text-xs" asChild>
                                          <a
                                            href={`${import.meta.env.VITE_API_URL || "http://localhost:4000"}${item.document.filePath}`}
                                            download
                                          >
                                            Download
                                          </a>
                                        </Button>
                                        {item.document?.rejectionReason && (
                                          <span className="text-destructive">
                                            Rejection reason: {item.document.rejectionReason}
                                          </span>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {!item.isCompleted && item.requiresDocument && !item.documentId && employeeOwned && (
                                      <label className="inline-flex items-center">
                                        <input
                                          type="file"
                                          accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
                                          className="hidden"
                                          onChange={(event) => {
                                            const file = event.target.files?.[0];
                                            if (file) {
                                              handleAttachChecklistDocument(checklist.id, item.id, file);
                                            }
                                            event.currentTarget.value = "";
                                          }}
                                        />
                                        <Button size="sm" variant="outline" asChild disabled={Boolean(checklistActionBusy)}>
                                          <span>
                                            <Upload className="mr-2 h-4 w-4" />
                                            Upload
                                          </span>
                                        </Button>
                                      </label>
                                    )}
                                    {item.isCompleted ? (
                                      <div className="flex items-center gap-2 text-success">
                                        <CheckCircle2 className="h-4 w-4" />
                                        <span className="text-xs">Completed</span>
                                      </div>
                                    ) : employeeOwned ? (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => handleCompleteChecklistItem(checklist.id, item.id)}
                                        disabled={!canMarkComplete || Boolean(checklistActionBusy)}
                                      >
                                        Mark complete
                                      </Button>
                                    ) : (
                                      <div className="text-right text-xs text-muted-foreground">
                                        {!isChecklistSelfView
                                          ? "Employee action view only"
                                          : item.requiresDocument && item.documentId && !documentVerified
                                          ? "Awaiting HR verification"
                                          : "Awaiting HR completion"}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                    <div className="rounded-lg border border-border p-3">
                      <div className="font-medium">Final employee acknowledgement</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        Confirm once every induction item above is complete. HR will then complete the final signoff.
                      </div>
                      {checklist.hrSignoffNotes && (
                        <div className="mt-3 rounded-md bg-muted/30 p-3 text-xs text-muted-foreground">
                          <div className="font-medium text-foreground">HR signoff notes</div>
                          <div>{checklist.hrSignoffNotes}</div>
                        </div>
                      )}
                      <div className="mt-3 flex justify-end">
                        <Button
                          onClick={() => handleAcknowledgeChecklist(checklist.id)}
                          disabled={
                            !isChecklistSelfView ||
                            Boolean(checklistActionBusy) ||
                            Boolean(checklist.employeeAcknowledgedAt) ||
                            (checklist.items || []).some((item) => !item.isCompleted)
                          }
                        >
                          {checklist.employeeAcknowledgedAt ? "Acknowledged" : "Acknowledge induction"}
                        </Button>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
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

