import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import PageLoader from "@/components/ui/page-loader";
import { apiFetch } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface LegacyKpiArchiveRow {
  id: number;
  name: string;
  description?: string | null;
  category?: string | null;
  kpi_type?: string | null;
  is_active?: boolean;
  created_at?: string | null;
  assignment_count?: number;
  objective_count?: number;
}

export default function Goals() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<LegacyKpiArchiveRow[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        const response = await apiFetch("GET", "/kpi/archive/kpis");
        if (cancelled) return;
        const archiveRows = Array.isArray(response) ? response : [];
        setRows(archiveRows);
      } catch (err: any) {
        if (cancelled) return;
        setError(String(err?.message || "Failed to load legacy KPI archive."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => {
      const name = String(row.name || "").toLowerCase();
      const category = String(row.category || "").toLowerCase();
      const type = String(row.kpi_type || "").toLowerCase();
      return name.includes(q) || category.includes(q) || type.includes(q);
    });
  }, [rows, query]);

  if (loading) {
    return (
      <DashboardLayout>
        <PageLoader message="Loading legacy KPI archive..." />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Legacy KPI Archive</h1>
            <p className="text-muted-foreground">
              Read-only historical KPI data retained for audit and compliance.
            </p>
          </div>
          <Button asChild>
            <Link to="/kpi-management">Open KPI Cascade V2</Link>
          </Button>
        </div>

        <Alert>
          <AlertTitle>Legacy workflow decommissioned</AlertTitle>
          <AlertDescription>
            Goal/OKR creation and updates now run exclusively in KPI Cascade V2. This screen is archive-only.
          </AlertDescription>
        </Alert>

        <Card>
          <CardHeader>
            <CardTitle>Archive Records</CardTitle>
            <CardDescription>
              Search by KPI name, category, or type.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              placeholder="Search archive..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />

            {error ? (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                {error}
              </div>
            ) : null}

            {filtered.length === 0 ? (
              <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                No archived KPI records found.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="py-2 pr-3 font-medium">KPI</th>
                      <th className="py-2 pr-3 font-medium">Type</th>
                      <th className="py-2 pr-3 font-medium">Category</th>
                      <th className="py-2 pr-3 font-medium">Scope</th>
                      <th className="py-2 pr-3 font-medium">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((row) => {
                      const created = row.created_at
                        ? new Date(row.created_at).toLocaleDateString()
                        : "-";
                      return (
                        <tr key={row.id} className="border-b align-top">
                          <td className="py-2 pr-3">
                            <div className="font-medium">{row.name}</div>
                            {row.description ? (
                              <div className="text-xs text-muted-foreground">{row.description}</div>
                            ) : null}
                          </td>
                          <td className="py-2 pr-3">{row.kpi_type || "-"}</td>
                          <td className="py-2 pr-3">{row.category || "-"}</td>
                          <td className="py-2 pr-3">
                            <div className="flex flex-wrap gap-2">
                              <Badge variant="outline">Assignments: {Number(row.assignment_count || 0)}</Badge>
                              <Badge variant="outline">Objectives: {Number(row.objective_count || 0)}</Badge>
                              <Badge variant={row.is_active ? "default" : "secondary"}>
                                {row.is_active ? "Active (Legacy)" : "Inactive"}
                              </Badge>
                            </div>
                          </td>
                          <td className="py-2 pr-3">{created}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
