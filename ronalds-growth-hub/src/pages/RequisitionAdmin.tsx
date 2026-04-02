import { useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import PageLoader from "@/components/ui/page-loader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import requisitionsAPI, {
  type CreateRequisitionTypeData,
  type RequisitionReportSummary,
  type RequisitionType,
} from "@/lib/api/requisitions";

const formatAmount = (value: number | string | null | undefined, currency = "KES") => {
  const numericValue = Number(value || 0);
  return `${currency} ${numericValue.toLocaleString("en-KE", {
    minimumFractionDigits: numericValue % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
};

const formatModule = (value?: string | null) =>
  String(value || "general")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());

type TypeFormState = {
  id: number | null;
  code: string;
  name: string;
  description: string;
  sourceModule: string;
  isActive: boolean;
  requiresJob: boolean;
  requiresClient: boolean;
  requiresVendor: boolean;
  requiresDueDate: boolean;
  requiresAttachment: boolean;
  fieldSchemaJson: string;
};

const initialTypeForm: TypeFormState = {
  id: null,
  code: "",
  name: "",
  description: "",
  sourceModule: "jobs",
  isActive: true,
  requiresJob: false,
  requiresClient: false,
  requiresVendor: false,
  requiresDueDate: false,
  requiresAttachment: false,
  fieldSchemaJson: "[]",
};

export default function RequisitionAdmin() {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [report, setReport] = useState<RequisitionReportSummary | null>(null);
  const [types, setTypes] = useState<RequisitionType[]>([]);
  const [typeForm, setTypeForm] = useState<TypeFormState>(initialTypeForm);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [reportRows, typeRows] = await Promise.all([
        requisitionsAPI.getReportSummary(),
        requisitionsAPI.listTypes(),
      ]);
      setReport(reportRows);
      setTypes(typeRows);
    } catch (error: any) {
      toast({
        title: "Requisition admin unavailable",
        description: error?.message || "Failed to load requisition admin data.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const resetForm = () => {
    setTypeForm(initialTypeForm);
  };

  const populateForm = (type: RequisitionType) => {
    setTypeForm({
      id: type.id,
      code: type.code,
      name: type.name,
      description: type.description || "",
      sourceModule: type.sourceModule,
      isActive: type.isActive,
      requiresJob: type.requiresJob,
      requiresClient: type.requiresClient,
      requiresVendor: type.requiresVendor,
      requiresDueDate: type.requiresDueDate,
      requiresAttachment: type.requiresAttachment,
      fieldSchemaJson: JSON.stringify(type.fieldSchema || [], null, 2),
    });
  };

  const handleSave = async () => {
    let parsedFieldSchema: CreateRequisitionTypeData["fieldSchema"] = [];
    try {
      parsedFieldSchema = JSON.parse(typeForm.fieldSchemaJson || "[]");
      if (!Array.isArray(parsedFieldSchema)) {
        throw new Error("Field schema must be a JSON array.");
      }
    } catch (error: any) {
      toast({
        title: "Invalid field schema",
        description: error?.message || "The field schema JSON could not be parsed.",
        variant: "destructive",
      });
      return;
    }

    const payload: CreateRequisitionTypeData = {
      code: typeForm.code,
      name: typeForm.name,
      description: typeForm.description || undefined,
      sourceModule: typeForm.sourceModule,
      isActive: typeForm.isActive,
      requiresJob: typeForm.requiresJob,
      requiresClient: typeForm.requiresClient,
      requiresVendor: typeForm.requiresVendor,
      requiresDueDate: typeForm.requiresDueDate,
      requiresAttachment: typeForm.requiresAttachment,
      fieldSchema: parsedFieldSchema,
    };

    try {
      setIsSaving(true);
      if (typeForm.id) {
        await requisitionsAPI.updateType(typeForm.id, payload);
        toast({ title: "Requisition type updated", description: "The type definition was saved." });
      } else {
        await requisitionsAPI.createType(payload);
        toast({ title: "Requisition type created", description: "A new requisition type is available." });
      }
      resetForm();
      await loadData();
    } catch (error: any) {
      toast({
        title: "Save failed",
        description: error?.message || "Unable to save the requisition type.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const toggleTypeState = async (type: RequisitionType) => {
    try {
      setIsSaving(true);
      if (type.isActive) {
        await requisitionsAPI.deleteType(type.id);
      } else {
        await requisitionsAPI.updateType(type.id, { isActive: true });
      }
      toast({
        title: type.isActive ? "Type deactivated" : "Type reactivated",
        description: `${type.name} was ${type.isActive ? "deactivated" : "reactivated"}.`,
      });
      await loadData();
    } catch (error: any) {
      toast({
        title: "Update failed",
        description: error?.message || "Unable to change the type status.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <PageLoader message="Loading requisition administration..." />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Requisition Admin</h1>
            <p className="text-muted-foreground">
              Maintain type definitions, source-module requirements, and reporting visibility.
            </p>
          </div>
          <Button variant="outline" asChild>
            <a href="/requisitions">Back to requisitions</a>
          </Button>
        </div>

        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="grid h-auto w-full grid-cols-1 gap-1 sm:grid-cols-2">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="types">Type Management</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Total requests</CardTitle></CardHeader><CardContent><div className="text-3xl font-semibold">{report?.totalRequests || 0}</div></CardContent></Card>
              <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Pending</CardTitle></CardHeader><CardContent><div className="text-3xl font-semibold">{report?.pendingCount || 0}</div></CardContent></Card>
              <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Approved</CardTitle></CardHeader><CardContent><div className="text-3xl font-semibold">{report?.approvedCount || 0}</div></CardContent></Card>
              <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Declined / Cancelled</CardTitle></CardHeader><CardContent><div className="text-3xl font-semibold">{(report?.declinedCount || 0) + (report?.cancelledCount || 0)}</div></CardContent></Card>
            </div>

            <div className="grid gap-6 xl:grid-cols-3">
              <Card className="xl:col-span-1">
                <CardHeader><CardTitle>By module</CardTitle><CardDescription>Where requisitions are originating.</CardDescription></CardHeader>
                <CardContent className="space-y-3">
                  {report?.byModule.length ? report.byModule.map((row) => (
                    <div key={row.module} className="flex items-center justify-between rounded-lg border p-3">
                      <span className="font-medium">{formatModule(row.module)}</span>
                      <Badge variant="outline">{row.count}</Badge>
                    </div>
                  )) : <p className="text-sm text-muted-foreground">No requisition data yet.</p>}
                </CardContent>
              </Card>

              <Card className="xl:col-span-1">
                <CardHeader><CardTitle>By type</CardTitle><CardDescription>Current usage split across type definitions.</CardDescription></CardHeader>
                <CardContent className="space-y-3">
                  {report?.byType.length ? report.byType.map((row) => (
                    <div key={row.typeName} className="flex items-center justify-between rounded-lg border p-3">
                      <span className="font-medium">{row.typeName}</span>
                      <Badge variant="outline">{row.count}</Badge>
                    </div>
                  )) : <p className="text-sm text-muted-foreground">No type usage yet.</p>}
                </CardContent>
              </Card>

              <Card className="xl:col-span-1">
                <CardHeader><CardTitle>Recent requests</CardTitle><CardDescription>Latest submissions across the firm.</CardDescription></CardHeader>
                <CardContent className="space-y-3">
                  {report?.recentRequests.length ? report.recentRequests.slice(0, 6).map((request) => (
                    <div key={request.id} className="rounded-lg border p-3">
                      <div className="font-medium">{request.title}</div>
                      <div className="text-sm text-muted-foreground">
                        {request.requesterName} | {formatAmount(request.amount, request.currency)}
                      </div>
                    </div>
                  )) : <p className="text-sm text-muted-foreground">No recent requisitions.</p>}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="types" className="space-y-6">
            <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
              <Card>
                <CardHeader>
                  <CardTitle>{typeForm.id ? "Edit requisition type" : "Create requisition type"}</CardTitle>
                  <CardDescription>
                    Define only the fields the source module actually needs.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <Input placeholder="Code" value={typeForm.code} onChange={(e) => setTypeForm((current) => ({ ...current, code: e.target.value.toUpperCase() }))} />
                    <Input placeholder="Name" value={typeForm.name} onChange={(e) => setTypeForm((current) => ({ ...current, name: e.target.value }))} />
                  </div>
                  <Input placeholder="Source module" value={typeForm.sourceModule} onChange={(e) => setTypeForm((current) => ({ ...current, sourceModule: e.target.value.toLowerCase() }))} />
                  <Textarea placeholder="Description" value={typeForm.description} onChange={(e) => setTypeForm((current) => ({ ...current, description: e.target.value }))} />

                  <div className="grid gap-3 md:grid-cols-2">
                    {[
                      ["requiresJob", "Requires job"],
                      ["requiresClient", "Requires client"],
                      ["requiresVendor", "Requires vendor"],
                      ["requiresDueDate", "Requires due date"],
                      ["requiresAttachment", "Requires attachment"],
                      ["isActive", "Active"],
                    ].map(([key, label]) => (
                      <label key={key} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                        <input
                          type="checkbox"
                          checked={Boolean(typeForm[key as keyof TypeFormState])}
                          onChange={(event) =>
                            setTypeForm((current) => ({
                              ...current,
                              [key]: event.target.checked,
                            }))
                          }
                        />
                        <span>{label}</span>
                      </label>
                    ))}
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Field schema JSON</label>
                    <Textarea
                      className="min-h-[240px] font-mono text-xs"
                      value={typeForm.fieldSchemaJson}
                      onChange={(event) => setTypeForm((current) => ({ ...current, fieldSchemaJson: event.target.value }))}
                    />
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <Button onClick={() => void handleSave()} disabled={isSaving}>
                      {isSaving ? "Saving..." : typeForm.id ? "Update type" : "Create type"}
                    </Button>
                    <Button variant="outline" onClick={resetForm} disabled={isSaving}>
                      Clear
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Configured requisition types</CardTitle>
                  <CardDescription>Seeded and custom types currently in the system.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {types.map((type) => (
                    <div key={type.id} className="rounded-lg border p-4">
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="font-medium">{type.name}</div>
                            <Badge variant={type.isActive ? "default" : "secondary"}>
                              {type.isActive ? "Active" : "Inactive"}
                            </Badge>
                            <Badge variant="outline">{formatModule(type.sourceModule)}</Badge>
                          </div>
                          <div className="text-sm text-muted-foreground">{type.description}</div>
                          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                            {type.requiresJob ? <span className="rounded border px-2 py-1">Job</span> : null}
                            {type.requiresClient ? <span className="rounded border px-2 py-1">Client</span> : null}
                            {type.requiresVendor ? <span className="rounded border px-2 py-1">Vendor</span> : null}
                            {type.requiresDueDate ? <span className="rounded border px-2 py-1">Due date</span> : null}
                            {type.requiresAttachment ? <span className="rounded border px-2 py-1">Attachment</span> : null}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => populateForm(type)}>Edit</Button>
                          <Button size="sm" variant="outline" onClick={() => void toggleTypeState(type)} disabled={isSaving}>
                            {type.isActive ? "Deactivate" : "Reactivate"}
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
