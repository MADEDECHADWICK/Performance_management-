import { useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";
import {
  BarChart,
  Bar,
  ResponsiveContainer,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

type Projection = {
  id: number;
  monthYear: string;
  projectedAmount: number;
  currency?: string | null;
  actualCollected: number;
  variance: number;
  variancePercent: number;
  status: string;
  clientId: number | null;
  clientName: string | null;
  departmentId: number | null;
  departmentName: string | null;
};

type ClientOption = { id: number; clientName: string };

export default function FinanceProjections() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [projections, setProjections] = useState<Projection[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);

  const [projectionForm, setProjectionForm] = useState({
    clientId: "",
    departmentId: "",
    monthYear: "",
    projectedAmount: "",
    currency: "KES",
  });

  const loadProjections = async () => {
    try {
      setLoading(true);
      const results = await Promise.allSettled([
        apiFetch<Projection[]>("GET", "/finance-dashboard/projections"),
        apiFetch<{ data: ClientOption[] } | ClientOption[]>("GET", "/clients?page=1&pageSize=100"),
      ]);

      const [projectionsResult, clientsResult] = results;

      if (projectionsResult.status === "fulfilled") setProjections(projectionsResult.value);

      if (clientsResult.status === "fulfilled") {
        const resolvedClients = Array.isArray(clientsResult.value)
          ? clientsResult.value
          : (clientsResult.value as any).data || [];
        setClients(resolvedClients);
      }
    } catch (error: any) {
      console.error("Projections error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to load projections",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProjections();
  }, []);

  const monthChart = useMemo(() => {
    const map = new Map<string, { month: string; projected: number; collected: number }>();
    projections.forEach((projection) => {
      const monthLabel = new Date(projection.monthYear).toLocaleString("en-KE", {
        month: "short",
        year: "numeric",
      });
      map.set(monthLabel, {
        month: monthLabel,
        projected: projection.projectedAmount,
        collected: projection.actualCollected,
      });
    });
    return Array.from(map.values()).slice(0, 6).reverse();
  }, [projections]);

  const projectionRows = useMemo(() => {
    return projections
      .slice()
      .sort((a, b) => (a.monthYear < b.monthYear ? 1 : -1));
  }, [projections]);

  const totalProjected = useMemo(
    () => projections.reduce((sum, projection) => sum + (projection.projectedAmount || 0), 0),
    [projections]
  );

  const totalCollected = useMemo(
    () => projections.reduce((sum, projection) => sum + (projection.actualCollected || 0), 0),
    [projections]
  );

  const handleProjectionSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await apiFetch("POST", "/finance-dashboard/projections", {
        clientId: projectionForm.clientId || null,
        departmentId: projectionForm.departmentId || null,
        monthYear: projectionForm.monthYear,
        projectedAmount: Number(projectionForm.projectedAmount),
        currency: projectionForm.currency || "KES",
      });

      toast({ title: "Projection saved", description: "Revenue projection updated." });
      setProjectionForm({
        clientId: "",
        departmentId: "",
        monthYear: "",
        projectedAmount: "",
        currency: "KES",
      });
      await loadProjections();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to save projection",
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
          <h1 className="text-3xl font-bold">Projections</h1>
          <p className="text-muted-foreground">Track monthly revenue targets and actual collections.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Projected</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">KES {totalProjected.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">Total projected revenue</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Collected</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">KES {totalCollected.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">Total collected so far</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Projection Count</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{projections.length}</div>
              <p className="text-xs text-muted-foreground">Active projection entries</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Add Projection</CardTitle>
              <CardDescription>Set monthly collection targets.</CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-4" onSubmit={handleProjectionSubmit}>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="projectionClientId">Client (optional)</Label>
                    <select
                      id="projectionClientId"
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={projectionForm.clientId}
                      onChange={(event) =>
                        setProjectionForm((prev) => ({ ...prev, clientId: event.target.value }))
                      }
                    >
                      <option value="">All clients</option>
                      {clients.map((client) => (
                        <option key={client.id} value={client.id}>
                          {client.clientName}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="monthYear">Month</Label>
                    <Input
                      id="monthYear"
                      type="month"
                      value={projectionForm.monthYear}
                      onChange={(event) =>
                        setProjectionForm((prev) => ({ ...prev, monthYear: event.target.value }))
                      }
                      required
                    />
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="projectedAmount">Projected Amount</Label>
                    <Input
                      id="projectedAmount"
                      type="number"
                      value={projectionForm.projectedAmount}
                      onChange={(event) =>
                        setProjectionForm((prev) => ({ ...prev, projectedAmount: event.target.value }))
                      }
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="projectionCurrency">Currency</Label>
                    <Input
                      id="projectionCurrency"
                      value={projectionForm.currency}
                      onChange={(event) =>
                        setProjectionForm((prev) => ({ ...prev, currency: event.target.value }))
                      }
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="departmentId">Department ID (optional)</Label>
                  <Input
                    id="departmentId"
                    value={projectionForm.departmentId}
                    onChange={(event) =>
                      setProjectionForm((prev) => ({ ...prev, departmentId: event.target.value }))
                    }
                    placeholder="Leave blank for firm-wide"
                  />
                </div>
                <Button type="submit" variant="outline">
                  Save Projection
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Projection vs Collection</CardTitle>
              <CardDescription>Last six months overview.</CardDescription>
            </CardHeader>
            <CardContent className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthChart}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip formatter={(value) => `KES ${Number(value).toLocaleString()}`} />
                  <Legend />
                  <Bar dataKey="projected" fill="hsl(var(--primary))" />
                  <Bar dataKey="collected" fill="hsl(var(--secondary))" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Projection Register</CardTitle>
            <CardDescription>Monthly projections and actuals.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Month</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead className="text-right">Projected</TableHead>
                  <TableHead className="text-right">Collected</TableHead>
                  <TableHead className="text-right">Variance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {projectionRows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      No projections yet.
                    </TableCell>
                  </TableRow>
                )}
                {projectionRows.map((projection) => (
                  <TableRow key={projection.id}>
                    <TableCell>
                      {new Date(projection.monthYear).toLocaleString("en-KE", {
                        month: "short",
                        year: "numeric",
                      })}
                    </TableCell>
                    <TableCell>{projection.clientName || "All clients"}</TableCell>
                    <TableCell>{projection.departmentName || "Firm-wide"}</TableCell>
                    <TableCell className="text-right">
                      {(projection.currency || "KES")} {projection.projectedAmount.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      {(projection.currency || "KES")} {projection.actualCollected.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      {(projection.currency || "KES")} {projection.variance.toLocaleString()}
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
