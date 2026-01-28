import { useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";


type RevenueAllocation = {
  id: number;
  jobId: number;
  jobCode: string | null;
  jobName: string;
  clientName: string;
  employeeName: string;
  allocatedAmount: number;
  allocationPercentage: number;
  allocationMonth: string;
  employeeProfit: number;
  employeeLoss: number;
};

export default function FinanceAllocations() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [allocations, setAllocations] = useState<RevenueAllocation[]>([]);

  const loadAllocations = async () => {
    try {
      setLoading(true);
      const data = await apiFetch<RevenueAllocation[]>("GET", "/finance-dashboard/revenue-allocations");
      setAllocations(data);
    } catch (error: any) {
      console.error("Allocations error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to load allocations",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllocations();
  }, []);

  const totalAllocated = useMemo(
    () => allocations.reduce((sum, allocation) => sum + (allocation.allocatedAmount || 0), 0),
    [allocations]
  );

  const totalProfit = useMemo(
    () => allocations.reduce((sum, allocation) => sum + (allocation.employeeProfit || 0), 0),
    [allocations]
  );

  const totalLoss = useMemo(
    () => allocations.reduce((sum, allocation) => sum + (allocation.employeeLoss || 0), 0),
    [allocations]
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
          <h1 className="text-3xl font-bold">Revenue Allocations</h1>
          <p className="text-muted-foreground">Track how collected revenue is allocated to staff.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Allocated Revenue</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">KES {totalAllocated.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">Total allocations</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Profit Allocated</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">KES {totalProfit.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">Profit share</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Loss Allocated</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">KES {totalLoss.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">Loss share</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Allocation Register</CardTitle>
            <CardDescription>Latest allocations by employee.</CardDescription>
          </CardHeader>
          <CardContent className="max-h-[640px] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Job</TableHead>
                  <TableHead className="text-right">Allocated</TableHead>
                  <TableHead className="text-right">Profit</TableHead>
                  <TableHead className="text-right">Loss</TableHead>
                  <TableHead>Month</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allocations.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">
                      No allocations yet.
                    </TableCell>
                  </TableRow>
                )}
                {allocations.map((allocation) => (
                  <TableRow key={allocation.id}>
                    <TableCell>{allocation.employeeName}</TableCell>
                    <TableCell>{allocation.clientName}</TableCell>
                    <TableCell>{allocation.jobCode || allocation.jobName}</TableCell>
                    <TableCell className="text-right">KES {allocation.allocatedAmount.toLocaleString()}</TableCell>
                    <TableCell className="text-right">KES {allocation.employeeProfit.toLocaleString()}</TableCell>
                    <TableCell className="text-right">KES {allocation.employeeLoss.toLocaleString()}</TableCell>
                    <TableCell>
                      {new Date(allocation.allocationMonth).toLocaleString("en-KE", {
                        month: "short",
                        year: "numeric",
                      })}
                    </TableCell>
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
