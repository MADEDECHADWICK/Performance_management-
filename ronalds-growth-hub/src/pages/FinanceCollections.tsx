import { useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";


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
  notes?: string | null;
};

type ClientOption = { id: number; clientName: string };
type JobOption = { id: number; jobCode: string | null; jobName: string };

export default function FinanceCollections() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [jobs, setJobs] = useState<JobOption[]>([]);

  const [paymentForm, setPaymentForm] = useState({
    clientId: "",
    jobId: "",
    paymentAmount: "",
    currency: "KES",
    paymentDate: "",
    paymentMethod: "",
    referenceNumber: "",
    invoiceNumber: "",
    notes: "",
  });

  const loadCollections = async () => {
    try {
      setLoading(true);
      const results = await Promise.allSettled([
        apiFetch<Collection[]>("GET", "/finance-dashboard/collections?limit=100"),
        apiFetch<{ data: ClientOption[] } | ClientOption[]>("GET", "/clients?page=1&pageSize=100"),
        apiFetch<{ data: JobOption[] } | JobOption[]>("GET", "/jobs?page=1&pageSize=100"),
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
        const resolvedJobs = Array.isArray(jobsResult.value)
          ? jobsResult.value
          : (jobsResult.value as any).data || [];
        setJobs(resolvedJobs);
      }
    } catch (error: any) {
      console.error("Collections error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to load collections",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCollections();
  }, []);

  const totalCollected = useMemo(
    () => collections.reduce((sum, payment) => sum + (payment.paymentAmount || 0), 0),
    [collections]
  );

  const handlePaymentSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await apiFetch("POST", "/finance-dashboard/collections", {
        clientId: paymentForm.clientId,
        jobId: paymentForm.jobId || null,
        paymentAmount: Number(paymentForm.paymentAmount),
        currency: paymentForm.currency || "KES",
        paymentDate: paymentForm.paymentDate,
        paymentMethod: paymentForm.paymentMethod || null,
        referenceNumber: paymentForm.referenceNumber || null,
        invoiceNumber: paymentForm.invoiceNumber || null,
        notes: paymentForm.notes || null,
      });

      toast({ title: "Payment recorded", description: "Collection saved successfully." });
      setPaymentForm({
        clientId: "",
        jobId: "",
        paymentAmount: "",
        currency: "KES",
        paymentDate: "",
        paymentMethod: "",
        referenceNumber: "",
        invoiceNumber: "",
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
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
        </div>
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
              <div className="text-2xl font-bold">KES {totalCollected.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">Across recorded payments</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Payments Recorded</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{collections.length}</div>
              <p className="text-xs text-muted-foreground">Total payment entries</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Last Payment</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {collections[0]?.paymentDate
                  ? new Date(collections[0].paymentDate).toLocaleDateString()
                  : "--"}
              </div>
              <p className="text-xs text-muted-foreground">Most recent entry</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Record Collection</CardTitle>
              <CardDescription>Log incoming payments by client and job.</CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-4" onSubmit={handlePaymentSubmit}>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="clientId">Client</Label>
                    <select
                      id="clientId"
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={paymentForm.clientId}
                      onChange={(event) =>
                        setPaymentForm((prev) => ({ ...prev, clientId: event.target.value }))
                      }
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
                      onChange={(event) =>
                        setPaymentForm((prev) => ({ ...prev, jobId: event.target.value }))
                      }
                    >
                      <option value="">Select job</option>
                      {jobs.map((job) => (
                        <option key={job.id} value={job.id}>
                          {job.jobCode ? `${job.jobCode} - ${job.jobName}` : job.jobName}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="paymentAmount">Amount</Label>
                    <Input
                      id="paymentAmount"
                      type="number"
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
                  <div className="space-y-2">
                    <Label htmlFor="invoiceNumber">Invoice Number</Label>
                    <Input
                      id="invoiceNumber"
                      value={paymentForm.invoiceNumber}
                      onChange={(event) =>
                        setPaymentForm((prev) => ({ ...prev, invoiceNumber: event.target.value }))
                      }
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
                <Button type="submit">Save Payment</Button>
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
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Reference</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {collections.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">
                        No collections yet.
                      </TableCell>
                    </TableRow>
                  )}
                  {collections.map((payment) => (
                    <TableRow key={payment.id}>
                      <TableCell>{new Date(payment.paymentDate).toLocaleDateString()}</TableCell>
                      <TableCell>{payment.clientName}</TableCell>
                      <TableCell>{payment.jobCode || payment.jobName || "N/A"}</TableCell>
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
