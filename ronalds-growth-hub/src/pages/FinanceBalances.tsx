import { useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";


type ClientBalance = {
  clientId: number;
  clientName: string;
  totalFee: number;
  totalCollected: number;
  balance: number;
  jobsCount: number;
};

type JobBalance = {
  jobId: number;
  jobCode: string | null;
  jobName: string;
  clientName: string;
  fee: number;
  collected: number;
  balance: number;
  status: string;
};

export default function FinanceBalances() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [clientBalances, setClientBalances] = useState<ClientBalance[]>([]);
  const [jobBalances, setJobBalances] = useState<JobBalance[]>([]);

  const loadBalances = async () => {
    try {
      setLoading(true);
      const results = await Promise.allSettled([
        apiFetch<ClientBalance[]>("GET", "/finance-dashboard/client-balances"),
        apiFetch<JobBalance[]>("GET", "/finance-dashboard/job-balances"),
      ]);

      const [clientsResult, jobsResult] = results;
      if (clientsResult.status === "fulfilled") setClientBalances(clientsResult.value);
      if (jobsResult.status === "fulfilled") setJobBalances(jobsResult.value);
    } catch (error: any) {
      console.error("Balances error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to load balances",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBalances();
  }, []);

  const totalOutstanding = useMemo(
    () => clientBalances.reduce((sum, client) => sum + (client.balance || 0), 0),
    [clientBalances]
  );

  const totalJobBalance = useMemo(
    () => jobBalances.reduce((sum, job) => sum + (job.balance || 0), 0),
    [jobBalances]
  );

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
          <h1 className="text-3xl font-bold">Balances</h1>
          <p className="text-muted-foreground">Track outstanding client and job balances.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Total Client Balance</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">KES {totalOutstanding.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">Across all clients</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Total Job Balance</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">KES {totalJobBalance.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">Across all jobs</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Client Balances</CardTitle>
              <CardDescription>Outstanding balances by client.</CardDescription>
            </CardHeader>
            <CardContent className="max-h-[520px] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead className="text-right">Fees</TableHead>
                    <TableHead className="text-right">Collected</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                    <TableHead className="text-right">Jobs</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clientBalances.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">
                        No balances available.
                      </TableCell>
                    </TableRow>
                  )}
                  {clientBalances.map((client) => (
                    <TableRow key={client.clientId}>
                      <TableCell>{client.clientName}</TableCell>
                      <TableCell className="text-right">KES {client.totalFee.toLocaleString()}</TableCell>
                      <TableCell className="text-right">KES {client.totalCollected.toLocaleString()}</TableCell>
                      <TableCell className="text-right">KES {client.balance.toLocaleString()}</TableCell>
                      <TableCell className="text-right">{client.jobsCount}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Job Balances</CardTitle>
              <CardDescription>Fee vs collected per job.</CardDescription>
            </CardHeader>
            <CardContent className="max-h-[520px] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Job</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead className="text-right">Fee</TableHead>
                    <TableHead className="text-right">Collected</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {jobBalances.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground">
                        No job balances available.
                      </TableCell>
                    </TableRow>
                  )}
                  {jobBalances.map((job) => (
                    <TableRow key={job.jobId}>
                      <TableCell>{job.jobCode || job.jobName}</TableCell>
                      <TableCell>{job.clientName}</TableCell>
                      <TableCell className="text-right">KES {job.fee.toLocaleString()}</TableCell>
                      <TableCell className="text-right">KES {job.collected.toLocaleString()}</TableCell>
                      <TableCell className="text-right">KES {job.balance.toLocaleString()}</TableCell>
                      <TableCell className="capitalize">{job.status.replace("_", " ")}</TableCell>
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
