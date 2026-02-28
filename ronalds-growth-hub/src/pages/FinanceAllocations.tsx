import { useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import PageLoader from '@/components/ui/page-loader';
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetch } from "@/lib/api";
import {
  Bar,
  BarChart,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";


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
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [allocations, setAllocations] = useState<RevenueAllocation[]>([]);
  const [selectedMonth, setSelectedMonth] = useState("");
  const [search, setSearch] = useState("");

  const loadAllocations = async () => {
    try {
      setLoading(true);
      const data = await apiFetch<RevenueAllocation[]>("GET", "/finance-dashboard/revenue-allocations");
      setAllocations(data);
    } catch (error: any) {
      console.error("Allocations error:", error);
      if (error?.status === 401) {
        navigate("/auth");
        return;
      }
      if (error?.status === 403) {
        setAllocations([]);
        return;
      }
      if (error?.status === 404) {
        setAllocations([]);
        return;
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllocations();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const monthOptions = useMemo(() => {
    const monthMap = new Map<string, string>();
    allocations.forEach((allocation) => {
      const key = new Date(allocation.allocationMonth).toISOString().slice(0, 7);
      const label = new Date(allocation.allocationMonth).toLocaleString("en-KE", {
        month: "short",
        year: "numeric",
      });
      monthMap.set(key, label);
    });
    return Array.from(monthMap.entries())
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([value, label]) => ({ value, label }));
  }, [allocations]);

  const filteredAllocations = useMemo(() => {
    return allocations.filter((allocation) => {
      if (selectedMonth) {
        const allocationMonth = new Date(allocation.allocationMonth).toISOString().slice(0, 7);
        if (allocationMonth !== selectedMonth) return false;
      }
      if (search.trim()) {
        const query = search.toLowerCase();
        const haystack = [
          allocation.employeeName,
          allocation.clientName,
          allocation.jobCode,
          allocation.jobName,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }, [allocations, search, selectedMonth]);

  const totalAllocated = useMemo(
    () => filteredAllocations.reduce((sum, allocation) => sum + (allocation.allocatedAmount || 0), 0),
    [filteredAllocations]
  );

  const totalProfit = useMemo(
    () => filteredAllocations.reduce((sum, allocation) => sum + (allocation.employeeProfit || 0), 0),
    [filteredAllocations]
  );

  const totalLoss = useMemo(
    () => filteredAllocations.reduce((sum, allocation) => sum + (allocation.employeeLoss || 0), 0),
    [filteredAllocations]
  );

  const recentAllocations = useMemo(() => {
    return [...filteredAllocations]
      .sort((a, b) => {
        const aTime = new Date(a.allocationMonth).getTime();
        const bTime = new Date(b.allocationMonth).getTime();
        if (aTime !== bTime) return bTime - aTime;
        return b.id - a.id;
      })
      .slice(0, 5);
  }, [filteredAllocations]);

  const gainLossMix = useMemo(
    () => [
      { name: "Profit", value: Math.max(0, totalProfit) },
      { name: "Loss", value: Math.max(0, totalLoss) },
    ],
    [totalProfit, totalLoss]
  );

  const employeeAllocationMix = useMemo(() => {
    const totals = new Map<string, number>();
    filteredAllocations.forEach((allocation) => {
      const key = allocation.employeeName || "Unknown";
      totals.set(key, (totals.get(key) || 0) + Number(allocation.allocatedAmount || 0));
    });
    const sorted = Array.from(totals.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    const top = sorted.slice(0, 5);
    const otherTotal = sorted.slice(5).reduce((sum, row) => sum + row.value, 0);
    return otherTotal > 0 ? [...top, { name: "Others", value: otherTotal }] : top;
  }, [filteredAllocations]);

  const clientAllocationBreakdown = useMemo(() => {
    const totals = new Map<string, number>();
    filteredAllocations.forEach((allocation) => {
      const key = allocation.clientName || "Unknown";
      totals.set(key, (totals.get(key) || 0) + Number(allocation.allocatedAmount || 0));
    });
    return Array.from(totals.entries())
      .map(([client, allocated]) => ({ client, allocated }))
      .sort((a, b) => b.allocated - a.allocated)
      .slice(0, 6);
  }, [filteredAllocations]);

  const chartPalette = ["#0ea5e9", "#22c55e", "#f97316", "#ef4444", "#6366f1", "#14b8a6"];

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
          <h1 className="text-3xl font-bold">Revenue Allocations</h1>
          <p className="text-muted-foreground">Track how collected revenue is allocated to staff.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Filters</CardTitle>
            <CardDescription>Refine allocations by month or search.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-[200px_1fr]">
            <div className="space-y-2">
              <Label htmlFor="allocationMonth">Month</Label>
              <select
                id="allocationMonth"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={selectedMonth}
                onChange={(event) => setSelectedMonth(event.target.value)}
              >
                <option value="">All months</option>
                {monthOptions.map((month) => (
                  <option key={month.value} value={month.value}>
                    {month.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="allocationSearch">Search</Label>
              <Input
                id="allocationSearch"
                placeholder="Employee, client, or job"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Allocated Revenue</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="metric-value">KES {totalAllocated.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">Total allocations</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Profit Allocated</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="metric-value">KES {totalProfit.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">Profit share</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Loss Allocated</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="metric-value">KES {totalLoss.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">Loss share</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>Gain vs Loss Mix</CardTitle>
              <CardDescription>Allocated outcomes across current filter.</CardDescription>
            </CardHeader>
            <CardContent className="h-64">
              {(totalProfit <= 0 && totalLoss <= 0) ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  No gain/loss data yet.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={gainLossMix}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={54}
                      outerRadius={86}
                      paddingAngle={2}
                    >
                      <Cell fill="#22c55e" />
                      <Cell fill="#ef4444" />
                    </Pie>
                    <Legend verticalAlign="bottom" height={18} />
                    <Tooltip formatter={(value: number) => `KES ${Number(value || 0).toLocaleString()}`} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Employee Allocation Mix</CardTitle>
              <CardDescription>Top allocation recipients.</CardDescription>
            </CardHeader>
            <CardContent className="h-64">
              {employeeAllocationMix.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  No employee allocation data yet.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={employeeAllocationMix}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={54}
                      outerRadius={86}
                      paddingAngle={2}
                    >
                      {employeeAllocationMix.map((entry, index) => (
                        <Cell key={`employee-mix-${entry.name}`} fill={chartPalette[index % chartPalette.length]} />
                      ))}
                    </Pie>
                    <Legend verticalAlign="bottom" height={18} />
                    <Tooltip formatter={(value: number) => `KES ${Number(value || 0).toLocaleString()}`} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Top Clients by Allocation</CardTitle>
              <CardDescription>Largest allocation load by client.</CardDescription>
            </CardHeader>
            <CardContent className="h-64">
              {clientAllocationBreakdown.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  No client allocation data yet.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={clientAllocationBreakdown}>
                    <XAxis dataKey="client" tickLine={false} axisLine={false} fontSize={11} />
                    <YAxis hide />
                    <Tooltip formatter={(value: number) => `KES ${Number(value || 0).toLocaleString()}`} />
                    <Bar dataKey="allocated" radius={[6, 6, 0, 0]}>
                      {clientAllocationBreakdown.map((entry, index) => (
                        <Cell key={`client-allocation-${entry.client}`} fill={chartPalette[index % chartPalette.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Recent Allocations</CardTitle>
            <CardDescription>Latest employee revenue splits.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentAllocations.length === 0 ? (
              <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                No allocations recorded yet.
              </div>
            ) : (
              recentAllocations.map((allocation) => (
                <div key={allocation.id} className="flex items-center justify-between text-sm">
                  <div>
                    <p className="font-medium">{allocation.employeeName}</p>
                    <p className="text-xs text-muted-foreground">
                      {allocation.jobCode || allocation.jobName} Â· {allocation.clientName}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">KES {allocation.allocatedAmount.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(allocation.allocationMonth).toLocaleString("en-KE", {
                        month: "short",
                        year: "numeric",
                      })}
                    </p>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

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
                {filteredAllocations.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">
                      No allocations match the current filters.
                    </TableCell>
                  </TableRow>
                )}
                {filteredAllocations.map((allocation) => (
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
