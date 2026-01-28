import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search } from "lucide-react";
import { apiFetch, authAPI } from "@/lib/api";

interface PartnerRanking {
  partner_id: number;
  name: string;
  department: string;
  position: string;
  portfolio_revenue: number;
  portfolio_fees: number;
  active_jobs: number;
  direct_reports: number;
  client_count: number;
  avg_team_score: number;
}

interface DashboardData {
  partnerRankings: PartnerRanking[];
}

export default function PartnerPortfolioSummary() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [partnerRankings, setPartnerRankings] = useState<PartnerRanking[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const user = await authAPI.me();
      if (!user) {
        navigate("/auth");
        return;
      }
      const data = await apiFetch("GET", "/gmp-dashboard/overview");
      const payload = data as DashboardData;
      setPartnerRankings(payload.partnerRankings || []);
    } catch (error) {
      console.error("Failed to load partner portfolio summary", error);
      setPartnerRankings([]);
    } finally {
      setLoading(false);
    }
  };

  const filteredPartners = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return partnerRankings;
    return partnerRankings.filter((partner) =>
      [partner.name, partner.department, partner.position].some((value) =>
        value?.toLowerCase().includes(query)
      )
    );
  }, [partnerRankings, search]);

  const summary = useMemo(() => {
    const totals = partnerRankings.reduce(
      (acc, partner) => {
        acc.totalRevenue += partner.portfolio_revenue;
        acc.totalProfit += partner.portfolio_revenue - partner.portfolio_fees;
        acc.activeJobs += partner.active_jobs;
        acc.count += 1;
        return acc;
      },
      { totalRevenue: 0, totalProfit: 0, activeJobs: 0, count: 0 }
    );

    return {
      totalRevenue: totals.totalRevenue,
      totalProfit: totals.totalProfit,
      activeJobs: totals.activeJobs,
      avgProfit: totals.count ? totals.totalProfit / totals.count : 0,
    };
  }, [partnerRankings]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-KE", {
      style: "currency",
      currency: "KES",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold text-foreground">View Partners Portfolio</h2>
          <p className="text-muted-foreground">
            Firm-wide partner performance overview for GMP review.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Total Revenue (MTD)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">{formatCurrency(summary.totalRevenue)}</div>
              <p className="text-xs text-muted-foreground">All partner portfolios</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Total Profit / Loss</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">{formatCurrency(summary.totalProfit)}</div>
              <p className="text-xs text-muted-foreground">Revenue minus fees</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Active Jobs</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">{summary.activeJobs}</div>
              <p className="text-xs text-muted-foreground">Across partner portfolios</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Avg Profit per Partner</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">{formatCurrency(summary.avgProfit)}</div>
              <p className="text-xs text-muted-foreground">Portfolio health benchmark</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Partners Overview</CardTitle>
            <CardDescription>Compare partners by revenue, profit, and utilization</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="relative w-full md:max-w-xs">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search partner, department..."
                  className="pl-9"
                />
              </div>
              <Button variant="outline" onClick={() => navigate("/partner-dashboard")}>
                Open partner dashboard
              </Button>
            </div>

            {filteredPartners.length === 0 ? (
              <div className="py-10 text-center text-muted-foreground">
                No partner performance data available yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Partner</TableHead>
                      <TableHead>Department</TableHead>
                      <TableHead className="text-right">Active Jobs</TableHead>
                      <TableHead className="text-right">Collected (MTD)</TableHead>
                      <TableHead className="text-right">Profit / Loss</TableHead>
                      <TableHead className="text-right">Utilization</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPartners.map((partner) => {
                      const profit = partner.portfolio_revenue - partner.portfolio_fees;
                      return (
                        <TableRow key={partner.partner_id}>
                          <TableCell className="font-medium">
                            <div className="flex flex-col">
                              <span>{partner.name}</span>
                              <span className="text-xs text-muted-foreground">{partner.position}</span>
                            </div>
                          </TableCell>
                          <TableCell>{partner.department}</TableCell>
                          <TableCell className="text-right">{partner.active_jobs}</TableCell>
                          <TableCell className="text-right">{formatCurrency(partner.portfolio_revenue)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(profit)}</TableCell>
                          <TableCell className="text-right">
                            <Badge variant="outline">—</Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
