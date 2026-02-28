import { useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Plus, Upload, FileText } from "lucide-react";
import { apiFetch } from "@/lib/api";
import recruitmentCandidatesAPI from "@/lib/api/recruitmentCandidates";
import documentsAPI from "@/lib/api/documents";
import type { Department, RecruitmentCandidate, RecruitmentStage } from "@/lib/api/types";
import {
  PAGE_STACK,
  SECTION_TITLE,
  SECTION_SUBTITLE,
  SECTION_STACK,
} from "@/components/ui/cardStyles";

const STAGES: RecruitmentStage[] = [
  "applied",
  "shortlisted",
  "interviewed",
  "offered",
  "accepted",
  "rejected",
  "hired",
];

const RecruitmentCandidates = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [candidates, setCandidates] = useState<RecruitmentCandidate[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [filters, setFilters] = useState({ stage: "all", search: "" });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    phoneNumber: "",
    positionApplied: "",
    departmentId: "",
    stage: "applied" as RecruitmentStage,
    notes: "",
  });

  useEffect(() => {
    loadData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadData = async () => {
    try {
      setLoading(true);
      const [candidateRes, departmentRes] = await Promise.all([
        recruitmentCandidatesAPI.list({ pageSize: 100 }),
        apiFetch("GET", "/departments"),
      ]);

      const candidateItems = candidateRes?.data?.items ?? candidateRes?.data ?? candidateRes ?? [];
      setCandidates(Array.isArray(candidateItems) ? candidateItems : []);

      const deptItems = (departmentRes as any)?.data ?? departmentRes ?? [];
      setDepartments(Array.isArray(deptItems) ? deptItems : []);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Failed to load recruitment data",
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  const filteredCandidates = useMemo(() => {
    return candidates.filter((candidate) => {
      const matchesStage = filters.stage === "all" || candidate.stage === filters.stage;
      const searchValue = filters.search.toLowerCase();
      const matchesSearch =
        !filters.search ||
        candidate.fullName.toLowerCase().includes(searchValue) ||
        (candidate.email || "").toLowerCase().includes(searchValue) ||
        (candidate.phoneNumber || "").toLowerCase().includes(searchValue) ||
        candidate.positionApplied.toLowerCase().includes(searchValue);
      return matchesStage && matchesSearch;
    });
  }, [candidates, filters]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await recruitmentCandidatesAPI.create({
        fullName: form.fullName,
        email: form.email || undefined,
        phoneNumber: form.phoneNumber || undefined,
        positionApplied: form.positionApplied,
        departmentId: form.departmentId ? Number(form.departmentId) : undefined,
        stage: form.stage,
        notes: form.notes || undefined,
      });
      toast({ title: "Candidate added" });
      setDialogOpen(false);
      setForm({
        fullName: "",
        email: "",
        phoneNumber: "",
        positionApplied: "",
        departmentId: "",
        stage: "applied",
        notes: "",
      });
      await loadData();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Failed to create candidate",
        description: error.message,
      });
    } finally {
      setSaving(false);
    }
  };

  const resolveOfferLetterUrl = (candidate: RecruitmentCandidate) => {
    const filePath = candidate.offerLetterDocument?.filePath;
    if (!filePath) return null;
    const baseUrl = import.meta.env.VITE_API_URL || "http://localhost:4000";
    return `${baseUrl}${filePath}`;
  };

  const updateStage = async (candidate: RecruitmentCandidate, stage: RecruitmentStage) => {
    if ((stage === "accepted" || stage === "hired") && !candidate.offerLetterDocumentId) {
      toast({
        variant: "destructive",
        title: "Offer letter required",
        description: "Upload the offer letter before marking this candidate as accepted or hired.",
      });
      return;
    }

    try {
      await recruitmentCandidatesAPI.updateStage(candidate.id, stage);
      setCandidates((prev) =>
        prev.map((c) => (c.id === candidate.id ? { ...c, stage } : c))
      );
    } catch (error: any) {
      if (String(error?.message || "").toLowerCase().includes("offer letter")) {
        toast({
          variant: "destructive",
          title: "Offer letter required",
          description: "Upload the offer letter before marking this candidate as accepted or hired.",
        });
        return;
      }
      toast({
        variant: "destructive",
        title: "Stage update failed",
        description: error.message,
      });
    }
  };

  const createOnboardingCase = async (candidate: RecruitmentCandidate) => {
    try {
      await recruitmentCandidatesAPI.createOnboardingCase(candidate.id);
      toast({ title: "Onboarding case created" });
      await loadData();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Failed to create onboarding case",
        description: error.message,
      });
    }
  };

  const uploadOfferLetter = async (candidate: RecruitmentCandidate, file: File) => {
    try {
      const upload = await documentsAPI.uploadFile(file, {
        documentType: "offer_letter",
        entityType: "RecruitmentCandidate",
        entityId: candidate.id,
        accessLevel: "hr",
        isRequired: true,
        description: `Offer letter for ${candidate.fullName}`,
      });

      const documentId = (upload as any)?.data?.id ?? (upload as any)?.id;
      if (!documentId) {
        throw new Error("Upload succeeded but document id was missing.");
      }

      const updated = await recruitmentCandidatesAPI.attachOfferLetter(
        candidate.id,
        documentId
      );
      const updatedCandidate =
        (updated as any)?.data ?? updated ?? candidate;

      setCandidates((prev) =>
        prev.map((c) =>
          c.id === candidate.id ? { ...c, ...updatedCandidate } : c
        )
      );

      toast({ title: "Offer letter uploaded" });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Offer letter upload failed",
        description: error.message,
      });
    }
  };

  return (
    <DashboardLayout>
      <div className={PAGE_STACK}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className={SECTION_TITLE}>Recruitment Pipeline</h1>
            <p className={SECTION_SUBTITLE}>
              Track candidates from application to hiring and onboarding readiness.
            </p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Add Candidate
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-xl">
              <DialogHeader>
                <DialogTitle>New Candidate</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className={SECTION_STACK}>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Full name</Label>
                    <Input
                      value={form.fullName}
                      onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Position applied</Label>
                    <Input
                      value={form.positionApplied}
                      onChange={(e) => setForm({ ...form, positionApplied: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Phone</Label>
                    <Input
                      value={form.phoneNumber}
                      onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Department</Label>
                    <Select
                      value={form.departmentId}
                      onValueChange={(value) => setForm({ ...form, departmentId: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select department" />
                      </SelectTrigger>
                      <SelectContent>
                        {departments.map((dept) => (
                          <SelectItem key={dept.id} value={String(dept.id)}>
                            {dept.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                <div className="space-y-2">
                  <Label>Stage</Label>
                  <Select value={form.stage} onValueChange={(value) => setForm({ ...form, stage: value as RecruitmentStage })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STAGES.map((stage) => (
                        <SelectItem
                          key={stage}
                          value={stage}
                          disabled={stage === "accepted" || stage === "hired"}
                        >
                          {stage.replace("_", " ")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Accepted/Hired stages require an offer letter and must be set after upload.
                  </p>
                </div>
                </div>
                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Input
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    placeholder="Optional notes"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={saving}>
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Candidate Pipeline</CardTitle>
          </CardHeader>
          <CardContent className={SECTION_STACK}>
            <div className="flex flex-wrap gap-3">
              <Input
                placeholder="Search by name, email, role..."
                value={filters.search}
                onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
                className="max-w-xs"
              />
              <Select
                value={filters.stage}
                onValueChange={(value) => setFilters((prev) => ({ ...prev, stage: value }))}
              >
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="All stages" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All stages</SelectItem>
                  {STAGES.map((stage) => (
                    <SelectItem key={stage} value={stage}>
                      {stage.replace("_", " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Candidate</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Stage</TableHead>
                    <TableHead>Offer Letter</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCandidates.map((candidate) => (
                    <TableRow key={candidate.id}>
                      <TableCell>
                        <div className="font-medium">{candidate.fullName}</div>
                        <div className="text-xs text-muted-foreground">
                          {candidate.email || "No email"}
                        </div>
                      </TableCell>
                      <TableCell>{candidate.positionApplied}</TableCell>
                      <TableCell>{candidate.department?.name || "--"}</TableCell>
                      <TableCell>
                        <Select
                          value={candidate.stage}
                          onValueChange={(value) => updateStage(candidate, value as RecruitmentStage)}
                        >
                          <SelectTrigger className="h-8 w-40">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {STAGES.map((stage) => (
                              <SelectItem
                                key={stage}
                                value={stage}
                                disabled={
                                  (stage === "accepted" || stage === "hired") &&
                                  !candidate.offerLetterDocumentId
                                }
                              >
                                {stage.replace("_", " ")}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {(candidate.stage !== "accepted" && candidate.stage !== "hired") &&
                          !candidate.offerLetterDocumentId && (
                            <p className="mt-1 text-[11px] text-muted-foreground">
                              Upload offer letter to enable Accepted/Hired stages.
                            </p>
                          )}
                      </TableCell>
                      <TableCell>
                        {candidate.offerLetterDocumentId ? (
                          <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                            <div className="flex items-center gap-2">
                              <FileText className="h-4 w-4 text-emerald-500" />
                              Uploaded
                            </div>
                            {resolveOfferLetterUrl(candidate) && (
                              <div className="flex flex-wrap gap-2">
                                <Button variant="link" className="h-auto p-0 text-xs" asChild>
                                  <a
                                    href={resolveOfferLetterUrl(candidate) ?? undefined}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    Preview
                                  </a>
                                </Button>
                                <Button variant="link" className="h-auto p-0 text-xs" asChild>
                                  <a
                                    href={resolveOfferLetterUrl(candidate) ?? undefined}
                                    download
                                  >
                                    Download
                                  </a>
                                </Button>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="text-xs text-muted-foreground">Missing</div>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <label className="inline-flex items-center">
                            <input
                              type="file"
                              accept=".pdf,.doc,.docx"
                              className="hidden"
                              onChange={(event) => {
                                const file = event.target.files?.[0];
                                if (file) {
                                  uploadOfferLetter(candidate, file);
                                }
                                event.currentTarget.value = "";
                              }}
                            />
                            <Button variant="outline" size="sm" asChild>
                              <span>
                                <Upload className="mr-2 h-4 w-4" />
                                {candidate.offerLetterDocumentId ? "Replace" : "Upload"}
                              </span>
                            </Button>
                          </label>
                          {(candidate.stage === "accepted" || candidate.stage === "hired") && !candidate.onboardingCase && (
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => createOnboardingCase(candidate)}
                            >
                              Create Onboarding
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredCandidates.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                        No candidates found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default RecruitmentCandidates;
