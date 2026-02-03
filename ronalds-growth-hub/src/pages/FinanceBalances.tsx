import { useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [clientBalances, setClientBalances] = useState<ClientBalance[]>([]);
  const [jobBalances, setJobBalances] = useState<JobBalance[]>([]);
  const [clientSearch, setClientSearch] = useState("");
  const [jobSearch, setJobSearch] = useState("");

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
      if (error?.status === 401) {
        navigate("/auth");
        return;
      }
      if (error?.status === 403) {
        setClientBalances([]);
        setJobBalances([]);
        return;
      }
      if (error?.status === 404) {
        setClientBalances([]);
        setJobBalances([]);
        return;
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBalances();
  }, []);

  const filteredClientBalances = useMemo(() => {
    if (!clientSearch.trim()) return clientBalances;
    const query = clientSearch.toLowerCase();
    return clientBalances.filter((client) => client.clientName.toLowerCase().includes(query));
  }, [clientBalances, clientSearch]);

  const filteredJobBalances = useMemo(() => {
    if (!jobSearch.trim()) return jobBalances;
    const query = jobSearch.toLowerCase();
    return jobBalances.filter((job) => {
      const haystack = [job.jobCode, job.jobName, job.clientName].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(query);
    });
  }, [jobBalances, jobSearch]);

  const totalOutstanding = useMemo(
    () => filteredClientBalances.reduce((sum, client) => sum + (client.balance || 0), 0),
    [filteredClientBalances]
  );

  const totalJobBalance = useMemo(
    () => filteredJobBalances.reduce((sum, job) => sum + (job.balance || 0), 0),
    [filteredJobBalances]
  );

  const topClientBalances = useMemo(() => {
    return [...filteredClientBalances]
      .sort((a, b) => (b.balance || 0) - (a.balance || 0))
      .slice(0, 5);
  }, [filteredClientBalances]);

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
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="clientBalanceSearch">Search clients</Label>
                <Input
                  id="clientBalanceSearch"
                  placeholder="Search by client name"
                  value={clientSearch}
                  onChange={(event) => setClientSearch(event.target.value)}
                />
              </div>
              <div className="max-h-[520px] overflow-auto">
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
                  {filteredClientBalances.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">
                        No balances match the current filter.
                      </TableCell>
                    </TableRow>
                  )}
                  {filteredClientBalances.map((client) => (
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
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Job Balances</CardTitle>
              <CardDescription>Fee vs collected per job.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="jobBalanceSearch">Search jobs</Label>
                <Input
                  id="jobBalanceSearch"
                  placeholder="Job, client, or code"
                  value={jobSearch}
                  onChange={(event) => setJobSearch(event.target.value)}
                />
              </div>
              <div className="max-h-[520px] overflow-auto">
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
                  {filteredJobBalances.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground">
                        No job balances match the current filter.
                      </TableCell>
                    </TableRow>
                  )}
                  {filteredJobBalances.map((job) => (
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
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Top Outstanding Clients</CardTitle>
            <CardDescription>Largest balances that need follow-up.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {topClientBalances.length === 0 ? (
              <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                No outstanding client balances yet.
              </div>
            ) : (
              topClientBalances.map((client) => (
                <div key={client.clientId} className="flex items-center justify-between text-sm">
                  <div>
                    <p className="font-medium">{client.clientName}</p>
                    <p className="text-xs text-muted-foreground">{client.jobsCount} jobs</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">KES {client.balance.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">
                      Collected KES {client.totalCollected.toLocaleString()}
                    </p>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
