import { useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";


type JobProfitability = {
  jobId: number;
  jobCode: string | null;
  jobName: string;
  clientName: string;
  revenue: number;
  cost: number;
  profit: number;
  margin: number;
  collected: number;
};

export default function FinanceProfitability() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [jobProfitability, setJobProfitability] = useState<JobProfitability[]>([]);

  const loadProfitability = async () => {
    try {
      setLoading(true);
      const data = await apiFetch<JobProfitability[]>("GET", "/finance-dashboard/job-profitability");
      setJobProfitability(data);
    } catch (error: any) {
      console.error("Profitability error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to load profitability",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProfitability();
  }, []);

  const totalRevenue = useMemo(
    () => jobProfitability.reduce((sum, job) => sum + (job.revenue || 0), 0),
    [jobProfitability]
  );

  const totalCost = useMemo(
    () => jobProfitability.reduce((sum, job) => sum + (job.cost || 0), 0),
    [jobProfitability]
  );

  const totalProfit = useMemo(
    () => jobProfitability.reduce((sum, job) => sum + (job.profit || 0), 0),
    [jobProfitability]
  );

  const averageMargin = useMemo(() => {
    if (jobProfitability.length === 0) return 0;
    const total = jobProfitability.reduce((sum, job) => sum + (job.margin || 0), 0);
    return total / jobProfitability.length;
  }, [jobProfitability]);

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
          <h1 className="text-3xl font-bold">Profitability</h1>
          <p className="text-muted-foreground">Review profitability by job and overall margin performance.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Revenue</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">KES {totalRevenue.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">Total revenue tracked</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Cost</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">KES {totalCost.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">Total delivery cost</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Profit</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">KES {totalProfit.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">Estimated profit</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Avg Margin</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{averageMargin.toFixed(1)}%</div>
              <p className="text-xs text-muted-foreground">Average job margin</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Job Profitability</CardTitle>
            <CardDescription>Revenue, cost, and margin by job.</CardDescription>
          </CardHeader>
          <CardContent className="max-h-[640px] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Job</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead className="text-right">Profit</TableHead>
                  <TableHead className="text-right">Margin</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobProfitability.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      No profitability records yet.
                    </TableCell>
                  </TableRow>
                )}
                {jobProfitability.map((job) => (
                  <TableRow key={job.jobId}>
                    <TableCell>{job.jobCode || job.jobName}</TableCell>
                    <TableCell>{job.clientName}</TableCell>
                    <TableCell className="text-right">KES {job.revenue.toLocaleString()}</TableCell>
                    <TableCell className="text-right">KES {job.cost.toLocaleString()}</TableCell>
                    <TableCell className="text-right">KES {job.profit.toLocaleString()}</TableCell>
                    <TableCell className="text-right">{job.margin.toFixed(1)}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
