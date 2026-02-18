import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
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

export default function EmployeeProfile() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const { user, isLoading: authLoading, isHR, isAdmin } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [departments, setDepartments] = useState<any[]>([]);
  const [managers, setManagers] = useState<any[]>([]);
  const [isHRAdmin, setIsHRAdmin] = useState(false);
  const [isViewingOther, setIsViewingOther] = useState(false);
  const [checklist, setChecklist] = useState<any>(null);
  const [checklistLoading, setChecklistLoading] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate("/auth");
      return;
    }
    loadProfile();
  }, [authLoading, user, navigate]);

  const loadProfile = async () => {
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
      const currentProfileId = (user as any).profile_id ?? (user as any).profileId ?? user.profile?.id;
      setIsViewingOther(
        !!viewingProfileId && Number(viewingProfileId) !== Number(currentProfileId)
      );

      const data = viewingProfileId
        ? await apiFetch('GET', `/profiles/${viewingProfileId}`)
        : await apiFetch('GET', `/profiles/email/${encodeURIComponent(user.email)}`);
      setProfile(data);
      if (data?.id) {
        await loadChecklist(data.id);
      }

      // Load departments and managers if HR/Admin viewing another employee
      if (hasHRAdminRole && viewingUserId) {
        const depts = await apiFetch('GET', '/departments');
        setDepartments(depts || []);

        // Load all employees for manager selection (exclude current employee)
        const allEmployees = await apiFetch('GET', `/profiles`);
        setManagers((allEmployees || []).filter((item: any) => item.id !== data.id));
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error loading profile",
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  const loadChecklist = async (profileId: number) => {
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
  };

  const handleCompleteChecklistItem = async (checklistId: number, itemId: number) => {
    try {
      await apiFetch("PATCH", `/induction-checklist/${checklistId}/items/${itemId}/complete`);
      await loadChecklist(profile.id);
      toast({
        title: "Checklist updated",
        description: "Item marked as complete.",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Unable to complete item",
        description: error.message || "Please try again.",
      });
    }
  };

  const handleAttachChecklistDocument = async (
    checklistId: number,
    itemId: number,
    file: File
  ) => {
    try {
      const upload = await documentsAPI.uploadFile(file, {
        documentType: "onboarding_checklist",
        entityType: "InductionChecklist",
        entityId: checklistId,
        accessLevel: "employee",
        isRequired: true,
        description: `Checklist item document`,
      });

      const documentId = (upload as any)?.data?.id ?? (upload as any)?.id;
      if (!documentId) {
        throw new Error("Upload succeeded but document id was missing.");
      }

      await apiFetch(
        "PATCH",
        `/induction-checklist/${checklistId}/items/${itemId}/document`,
        { documentId }
      );

      await loadChecklist(profile.id);
      toast({
        title: "Document attached",
        description: "Checklist document uploaded successfully.",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Document upload failed",
        description: error.message || "Please try again.",
      });
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      
      // Personal fields that anyone can edit (only valid Prisma fields)
      const updateData: any = {
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
    } catch (error: any) {
      console.error('Save error:', error);
      toast({
        variant: "destructive",
        title: "Error saving profile",
        description: error.message || 'Failed to save profile. Please try again.',
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </DashboardLayout>
    );
  }

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

        <Tabs defaultValue="personal" className="w-full">
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
                          <SelectItem key={mgr.id} value={mgr.id}>
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
                    </div>

                    <div className="space-y-3">
                      {(checklist.items || []).map((item: any) => (
                        <div
                          key={item.id}
                          className="flex items-center justify-between rounded-lg border border-border p-3"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{item.itemName}</span>
                              {item.requiresDocument && (
                                <Badge variant="outline" className="text-xs">
                                  Document required
                                </Badge>
                              )}
                            </div>
                            {item.description && (
                              <p className="text-xs text-muted-foreground">{item.description}</p>
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
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {!item.isCompleted && item.requiresDocument && !item.documentId && (
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
                                <Button size="sm" variant="outline" asChild>
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
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleCompleteChecklistItem(checklist.id, item.id)}
                                disabled={item.requiresDocument && !item.documentId}
                              >
                                Mark complete
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
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

