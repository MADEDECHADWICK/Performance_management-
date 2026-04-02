import { useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import PageLoader from '@/components/ui/page-loader';
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";
import {
  AnalyticsChartShell,
  AnalyticsLegendContent,
  AnalyticsTooltipContent,
  analyticsAxisProps,
  analyticsColorAt,
  analyticsDonutProps,
  analyticsGridProps,
} from "@/components/ui/analytics-chart";
import {
  LineChart,
  Line,
  ResponsiveContainer,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { useAuth } from "@/contexts/AuthContext";


type Collection = {
  id: number;
  clientId: number;
  clientName: string;
  jobId: number | null;
  jobCode: string | null;
  jobName: string | null;
  paymentAmount: number;
  currency: string;
  paymentDate: string;
  paymentMethod?: string | null;
  referenceNumber?: string | null;
  invoiceNumber?: string | null;
  notes?: string | null;
};

type ClientOption = { id: number; clientName: string };
type JobOption = { id: number; jobCode: string | null; jobName: string | null; clientId?: number | null };
type OutstandingInvoiceOption = {
  id: number;
  clientId: number;
  clientName: string;
  jobId: number;
  jobCode: string | null;
  jobName: string | null;
  invoiceNumber: string;
  title: string;
  status: string;
  currency: string;
  totalAmount: number;
  amountPaid: number;
  amountOutstanding: number;
  dueDate?: string | null;
  issuedAt?: string | null;
  milestoneTaskId?: number | null;
  milestoneTitle?: string | null;
};

export default function FinanceCollections() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { hasModuleAccess } = useAuth();
  const canWriteCollections =
    hasModuleAccess("finance", "write") || hasModuleAccess("finance_collections", "write");
  const [loading, setLoading] = useState(true);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [jobs, setJobs] = useState<JobOption[]>([]);
  const [outstandingInvoices, setOutstandingInvoices] = useState<OutstandingInvoiceOption[]>([]);
  const [loadingOutstandingInvoices, setLoadingOutstandingInvoices] = useState(false);

  const [paymentForm, setPaymentForm] = useState({
    clientId: "",
    jobId: "",
    invoiceId: "",
    paymentAmount: "",
    currency: "KES",
    paymentDate: "",
    paymentMethod: "",
    referenceNumber: "",
    notes: "",
  });

  const formatCurrency = (amount: number, currency = "KES") =>
    new Intl.NumberFormat("en-KE", {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(Number.isFinite(amount) ? amount : 0);

  const loadCollections = async () => {
    try {
      setLoading(true);
      const results = await Promise.allSettled([
        apiFetch<Collection[]>("GET", "/finance-dashboard/collections?limit=100"),
        apiFetch<{ data: ClientOption[] } | ClientOption[]>("GET", "/clients?page=1&pageSize=100"),
        apiFetch<{ data: JobOption[] } | { jobs: JobOption[] } | JobOption[]>("GET", "/jobs?page=1&pageSize=100"),
      ]);

      const [collectionsResult, clientsResult, jobsResult] = results;

      if (collectionsResult.status === "fulfilled") setCollections(collectionsResult.value);

      if (clientsResult.status === "fulfilled") {
        const resolvedClients = Array.isArray(clientsResult.value)
          ? clientsResult.value
          : (clientsResult.value as any).data || [];
        setClients(resolvedClients);
      }

      if (jobsResult.status === "fulfilled") {
        const resolvedJobsRaw = Array.isArray(jobsResult.value)
          ? jobsResult.value
          : (jobsResult.value as any).data || (jobsResult.value as any).jobs || [];
        const resolvedJobs = resolvedJobsRaw.map((job: any) => ({
          id: job.id,
          jobCode: job.jobCode ?? null,
          jobName: job.jobName ?? null,
          clientId: job.clientId ?? job.client?.id ?? null,
        }));
        setJobs(resolvedJobs);
      }
    } catch (error: any) {
      console.error("Collections error:", error);
      if (error?.status === 401) {
        navigate("/auth");
        return;
      }
      if (error?.status === 403) {
        toast({
          title: "Access restricted",
          description: "You don't have permission to view collections.",
          variant: "destructive",
        });
      }
      if (error?.status === 404) {
        setCollections([]);
        setClients([]);
        setJobs([]);
        return;
      }
    } finally {
      setLoading(false);
    }
  };

  const loadOutstandingInvoices = async (clientId?: string, jobId?: string) => {
    try {
      setLoadingOutstandingInvoices(true);
      const params = new URLSearchParams({ limit: "150" });
      if (clientId) params.set("clientId", clientId);
      if (jobId) params.set("jobId", jobId);

      const invoices = await apiFetch<OutstandingInvoiceOption[]>(
        "GET",
        `/finance-dashboard/collections/outstanding-invoices?${params.toString()}`
      );
      setOutstandingInvoices(invoices);
    } catch (error: any) {
      console.error("Outstanding invoices error:", error);
      if (error?.status === 401) {
        navigate("/auth");
        return;
      }
      setOutstandingInvoices([]);
      if (error?.status !== 403 && error?.status !== 404) {
        toast({
          title: "Invoice load failed",
          description: error.message || "Unable to load outstanding invoices.",
          variant: "destructive",
        });
      }
    } finally {
      setLoadingOutstandingInvoices(false);
    }
  };

  useEffect(() => {
    loadCollections();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadOutstandingInvoices(paymentForm.clientId, paymentForm.jobId);
  }, [paymentForm.clientId, paymentForm.jobId]); // eslint-disable-line react-hooks/exhaustive-deps

  const filteredJobs = useMemo(() => {
    if (!paymentForm.clientId) return jobs;
    const clientId = Number(paymentForm.clientId);
    return jobs.filter((job) => !job.clientId || job.clientId === clientId);
  }, [jobs, paymentForm.clientId]);

  const selectedInvoice = useMemo(
    () => outstandingInvoices.find((invoice) => String(invoice.id) === paymentForm.invoiceId) || null,
    [outstandingInvoices, paymentForm.invoiceId]
  );

  const totalCollected = useMemo(
    () => collections.reduce((sum, payment) => sum + (payment.paymentAmount || 0), 0),
    [collections]
  );

  const recentCollections = useMemo(() => {
    const byDate = new Map<string, number>();
    collections.forEach((payment) => {
      const date = new Date(payment.paymentDate);
      if (Number.isNaN(date.getTime())) return;
      const key = date.toISOString().slice(0, 10);
      byDate.set(key, (byDate.get(key) || 0) + (payment.paymentAmount || 0));
    });
    return Array.from(byDate.entries())
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .slice(-7)
      .map(([date, amount]) => ({
        date,
        amount,
        label: new Date(date).toLocaleDateString("en-KE", { month: "short", day: "numeric" }),
      }));
  }, [collections]);

  const paymentMethodMix = useMemo(() => {
    const totals = new Map<string, number>();
    collections.forEach((payment) => {
      const method = (payment.paymentMethod || "Unspecified").trim() || "Unspecified";
      totals.set(method, (totals.get(method) || 0) + Number(payment.paymentAmount || 0));
    });

    return Array.from(totals.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [collections]);

  const linkageMix = useMemo(() => {
    const jobLinked = collections.reduce(
      (count, payment) => count + (payment.jobId ? 1 : 0),
      0
    );
    const clientOnly = Math.max(0, collections.length - jobLinked);
    return [
      { name: "Job-linked", value: jobLinked },
      { name: "Client-only", value: clientOnly },
    ];
  }, [collections]);

  const chartPalette = ["#0ea5e9", "#22c55e", "#f97316", "#ef4444", "#6366f1", "#14b8a6"];
  const hasPaymentMethodMix = paymentMethodMix.some((item) => item.value > 0);

  const handleClientChange = (value: string) => {
    setPaymentForm((prev) => ({
      ...prev,
      clientId: value,
      jobId: "",
      invoiceId: "",
    }));
  };

  const handleJobChange = (value: string) => {
    setPaymentForm((prev) => ({
      ...prev,
      jobId: value,
      invoiceId: "",
    }));
  };

  const handleInvoiceChange = (value: string) => {
    if (!value) {
      setPaymentForm((prev) => ({
        ...prev,
        invoiceId: "",
      }));
      return;
    }

    const invoice = outstandingInvoices.find((item) => String(item.id) === value);
    if (!invoice) {
      setPaymentForm((prev) => ({
        ...prev,
        invoiceId: "",
      }));
      return;
    }

    setPaymentForm((prev) => ({
      ...prev,
      clientId: String(invoice.clientId),
      jobId: String(invoice.jobId),
      invoiceId: String(invoice.id),
      currency: invoice.currency || prev.currency,
      paymentAmount:
        invoice.amountOutstanding > 0 ? invoice.amountOutstanding.toFixed(2) : prev.paymentAmount,
    }));
  };

  const handlePaymentSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canWriteCollections) {
      toast({
        title: "Permission required",
        description: "You need finance write access to record payments.",
        variant: "destructive",
      });
      return;
    }

    try {
      await apiFetch("POST", "/finance-dashboard/collections", {
        clientId: paymentForm.clientId,
        jobId: paymentForm.jobId || null,
        invoiceId: paymentForm.invoiceId || null,
        paymentAmount: Number(paymentForm.paymentAmount),
        currency: paymentForm.currency || "KES",
        paymentDate: paymentForm.paymentDate,
        paymentMethod: paymentForm.paymentMethod || null,
        referenceNumber: paymentForm.referenceNumber || null,
        invoiceNumber: selectedInvoice?.invoiceNumber || null,
        notes: paymentForm.notes || null,
      });

      toast({ title: "Payment recorded", description: "Collection saved successfully." });
      setPaymentForm({
        clientId: "",
        jobId: "",
        invoiceId: "",
        paymentAmount: "",
        currency: "KES",
        paymentDate: "",
        paymentMethod: "",
        referenceNumber: "",
        notes: "",
      });
      await loadCollections();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to record payment",
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <PageLoader message="Loading..." />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold">Collections</h1>
          <p className="text-muted-foreground">Record client payments and review collection history.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Total Collected</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="metric-value">KES {totalCollected.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">Across recorded payments</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Payments Recorded</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="metric-value">{collections.length}</div>
              <p className="text-xs text-muted-foreground">Total payment entries</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Last Payment</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="metric-value">
                {collections[0]?.paymentDate
                  ? new Date(collections[0].paymentDate).toLocaleDateString()
                  : "--"}
              </div>
              <p className="text-xs text-muted-foreground">Most recent entry</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Payment Method Mix</CardTitle>
              <CardDescription>How collections are received.</CardDescription>
            </CardHeader>
            <CardContent className="h-56">
              {hasPaymentMethodMix ? (
                <AnalyticsChartShell>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={paymentMethodMix}
                        dataKey="value"
                        nameKey="name"
                        {...analyticsDonutProps}
                      >
                        {paymentMethodMix.map((item, index) => (
                          <Cell key={`method-${item.name}`} fill={analyticsColorAt(index)} />
                        ))}
                      </Pie>
                      <Legend content={<AnalyticsLegendContent />} />
                      <Tooltip
                        content={
                          <AnalyticsTooltipContent
                            valueFormatter={(value) => `KES ${Number(value || 0).toLocaleString()}`}
                          />
                        }
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </AnalyticsChartShell>
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  No method distribution data yet.
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Collection Linkage</CardTitle>
              <CardDescription>Payments tied to jobs vs direct client receipts.</CardDescription>
            </CardHeader>
            <CardContent className="h-56">
              {collections.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  No linkage data yet.
                </div>
              ) : (
                <AnalyticsChartShell>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={linkageMix}
                        dataKey="value"
                        nameKey="name"
                        {...analyticsDonutProps}
                      >
                        <Cell fill="#22c55e" />
                        <Cell fill="#94a3b8" />
                      </Pie>
                      <Legend content={<AnalyticsLegendContent />} />
                      <Tooltip
                        content={
                          <AnalyticsTooltipContent
                            valueFormatter={(value) => Number(value || 0).toFixed(0)}
                          />
                        }
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </AnalyticsChartShell>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Recent Collections</CardTitle>
              <CardDescription>Last 7 payment days</CardDescription>
            </CardHeader>
            <CardContent className="h-56">
              {recentCollections.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  No recent collections yet.
                </div>
              ) : (
                <AnalyticsChartShell>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={recentCollections} margin={{ top: 12, right: 12, left: 0, bottom: 4 }}>
                      <CartesianGrid {...analyticsGridProps} />
                      <XAxis dataKey="label" {...analyticsAxisProps} />
                      <YAxis hide />
                      <Tooltip
                        content={
                          <AnalyticsTooltipContent
                            valueFormatter={(value, name) => [`KES ${Number(value || 0).toLocaleString()}`, name]}
                            labelFormatter={(label) => `Date: ${label}`}
                          />
                        }
                      />
                      <Line
                        type="monotone"
                        dataKey="amount"
                        name="Collected"
                        stroke={analyticsColorAt(0)}
                        strokeWidth={3}
                        dot={{ r: 0 }}
                        activeDot={{ r: 5, strokeWidth: 0, fill: analyticsColorAt(0) }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </AnalyticsChartShell>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Record Collection</CardTitle>
              <CardDescription>
                {canWriteCollections
                  ? "Log incoming payments by client and job."
                  : "Read-only: you need finance write access to record payments."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-4" onSubmit={handlePaymentSubmit}>
                <fieldset className="space-y-4" disabled={!canWriteCollections}>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="clientId">Client</Label>
                    <select
                      id="clientId"
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={paymentForm.clientId}
                      onChange={(event) => handleClientChange(event.target.value)}
                      required
                    >
                      <option value="">Select client</option>
                      {clients.map((client) => (
                        <option key={client.id} value={client.id}>
                          {client.clientName}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="jobId">Job (optional)</Label>
                    <select
                      id="jobId"
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={paymentForm.jobId}
                      onChange={(event) => handleJobChange(event.target.value)}
                    >
                      <option value="">Select job</option>
                      {filteredJobs.map((job) => (
                        <option key={job.id} value={job.id}>
                          {job.jobCode ? `${job.jobCode} - ${job.jobName}` : job.jobName}
                        </option>
                      ))}
                    </select>
                    {paymentForm.clientId && filteredJobs.length === 0 && (
                      <p className="text-xs text-muted-foreground">
                        No jobs found for the selected client.
                      </p>
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="invoiceId">Outstanding Invoice (optional)</Label>
                  <select
                    id="invoiceId"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={paymentForm.invoiceId}
                    onChange={(event) => handleInvoiceChange(event.target.value)}
                  >
                    <option value="">Apply as client-level payment / no specific invoice</option>
                    {outstandingInvoices.map((invoice) => (
                      <option key={invoice.id} value={invoice.id}>
                        {invoice.invoiceNumber} • {invoice.jobCode || invoice.jobName || "Job"} •{" "}
                        {formatCurrency(invoice.amountOutstanding, invoice.currency)} outstanding
                      </option>
                    ))}
                  </select>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>
                      {loadingOutstandingInvoices
                        ? "Loading outstanding invoices..."
                        : `${outstandingInvoices.length} collectible invoice${outstandingInvoices.length === 1 ? "" : "s"} available${
                            paymentForm.clientId || paymentForm.jobId ? " for the current filter" : ""
                          }.`}
                    </span>
                    {selectedInvoice ? (
                      <span>
                        Selected {selectedInvoice.invoiceNumber} •{" "}
                        {selectedInvoice.status.replace(/_/g, " ")}
                      </span>
                    ) : null}
                  </div>
                  {selectedInvoice ? (
                    <div className="rounded-lg border border-border/70 bg-muted/30 p-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="space-y-1">
                          <p className="text-sm font-semibold">{selectedInvoice.invoiceNumber}</p>
                          <p className="text-sm text-muted-foreground">
                            {selectedInvoice.clientName}
                            {selectedInvoice.jobCode || selectedInvoice.jobName
                              ? ` • ${selectedInvoice.jobCode || selectedInvoice.jobName}`
                              : ""}
                          </p>
                          {selectedInvoice.milestoneTitle ? (
                            <p className="text-xs text-muted-foreground">
                              Milestone: {selectedInvoice.milestoneTitle}
                            </p>
                          ) : null}
                        </div>
                        <div className="text-right">
                          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                            Outstanding
                          </p>
                          <p className="text-lg font-semibold">
                            {formatCurrency(
                              selectedInvoice.amountOutstanding,
                              selectedInvoice.currency
                            )}
                          </p>
                        </div>
                      </div>
                      <div className="mt-3 grid gap-3 text-sm md:grid-cols-3">
                        <div>
                          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                            Total invoice
                          </p>
                          <p className="font-medium">
                            {formatCurrency(selectedInvoice.totalAmount, selectedInvoice.currency)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                            Paid so far
                          </p>
                          <p className="font-medium">
                            {formatCurrency(selectedInvoice.amountPaid, selectedInvoice.currency)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                            Due date
                          </p>
                          <p className="font-medium">
                            {selectedInvoice.dueDate
                              ? new Date(selectedInvoice.dueDate).toLocaleDateString()
                              : "Not set"}
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="paymentAmount">Amount</Label>
                    <Input
                      id="paymentAmount"
                      type="number"
                      min="0"
                      step="0.01"
                      value={paymentForm.paymentAmount}
                      onChange={(event) =>
                        setPaymentForm((prev) => ({ ...prev, paymentAmount: event.target.value }))
                      }
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="currency">Currency</Label>
                    <Input
                      id="currency"
                      value={paymentForm.currency}
                      onChange={(event) =>
                        setPaymentForm((prev) => ({ ...prev, currency: event.target.value }))
                      }
                    />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="paymentDate">Payment Date</Label>
                    <Input
                      id="paymentDate"
                      type="date"
                      value={paymentForm.paymentDate}
                      onChange={(event) =>
                        setPaymentForm((prev) => ({ ...prev, paymentDate: event.target.value }))
                      }
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="paymentMethod">Payment Method</Label>
                    <Input
                      id="paymentMethod"
                      value={paymentForm.paymentMethod}
                      onChange={(event) =>
                        setPaymentForm((prev) => ({ ...prev, paymentMethod: event.target.value }))
                      }
                      placeholder="Bank, M-Pesa, EFT"
                    />
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="referenceNumber">Reference</Label>
                    <Input
                      id="referenceNumber"
                      value={paymentForm.referenceNumber}
                      onChange={(event) =>
                        setPaymentForm((prev) => ({ ...prev, referenceNumber: event.target.value }))
                      }
                      placeholder="Receipt / Ref No"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea
                    id="notes"
                    rows={3}
                    value={paymentForm.notes}
                    onChange={(event) =>
                      setPaymentForm((prev) => ({ ...prev, notes: event.target.value }))
                    }
                  />
                </div>
                <Button type="submit" disabled={!canWriteCollections}>Save Payment</Button>
                </fieldset>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Collection Register</CardTitle>
              <CardDescription>All recorded collections.</CardDescription>
            </CardHeader>
            <CardContent className="max-h-[520px] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Job</TableHead>
                    <TableHead>Invoice</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Reference</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {collections.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground">
                        No collections yet.
                      </TableCell>
                    </TableRow>
                  )}
                  {collections.map((payment) => (
                    <TableRow key={payment.id}>
                      <TableCell>{new Date(payment.paymentDate).toLocaleDateString()}</TableCell>
                      <TableCell>{payment.clientName}</TableCell>
                      <TableCell>{payment.jobCode || payment.jobName || "N/A"}</TableCell>
                      <TableCell>{payment.invoiceNumber || "-"}</TableCell>
                      <TableCell className="text-right">
                        {(payment.currency || "KES")} {payment.paymentAmount.toLocaleString()}
                      </TableCell>
                      <TableCell>{payment.referenceNumber || "-"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
