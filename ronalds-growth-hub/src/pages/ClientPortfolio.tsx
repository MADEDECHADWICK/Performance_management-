import { useState, useEffect } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import apiFetch, { authAPI } from "@/integrations/apiClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { 
  Users, 
  Briefcase, 
  DollarSign, 
  TrendingUp, 
  Clock, 
  AlertCircle,
  CheckCircle2,
  Search,
  Download,
  Filter,
  Plus,
  Eye,
  Calendar,
  BarChart3
} from "lucide-react";
import * as XLSX from "xlsx";

interface Client {
  id: string;
  client_name: string;
  client_type: string;
  industry: string;
  status: string;
  contact_person: string;
  email: string;
  phone: string;
  address: string;
  annual_revenue: number;
  relationship_start: string;
  last_interaction: string;
  satisfaction_score: number;
  total_jobs: number;
  active_jobs: number;
  total_revenue: number;
  last_invoice: string;
  payment_status: string;
  notes: string;
}

interface Job {
  id: number;
  job_code: string;
  title: string;
  status: string;
  start_date: string;
  due_date: string;
  budget_hours: number;
  actual_hours: number;
  estimated_revenue: number;
  invoiced_amount: number;
  payment_status: string;
  completion_percentage: number;
  team_size: number;
  priority: string;
}

interface ClientMetrics {
  totalClients: number;
  activeClients: number;
  newThisMonth: number;
  totalRevenue: number;
  avgSatisfaction: number;
  pendingInvoices: number;
  retentionRate: number;
  growthRate: number;
}

const ClientPortfolio = () => {
  const { toast } = useToast();
  const [clients, setClients] = useState<Client[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [metrics, setMetrics] = useState<ClientMetrics | null>(null);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [activeTab, setActiveTab] = useState("overview");
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    loadClientPortfolio();
  }, []);

  const loadClientPortfolio = async () => {
    try {
      setLoading(true);
      
      // Use mock data for comprehensive client portfolio
      const mockMetrics: ClientMetrics = {
        totalClients: 45,
        activeClients: 38,
        newThisMonth: 4,
        totalRevenue: 2400000,
        avgSatisfaction: 4.6,
        pendingInvoices: 8,
        retentionRate: 94.2,
        growthRate: 18.5
      };

      const mockClients: Client[] = Array.from({ length: 45 }, (_, i) => {
        const clientTypes = ["Corporate", "SME", "Individual", "Non-Profit"];
        const industries = ["Manufacturing", "Retail", "Technology", "Healthcare", "Finance", "Real Estate"];
        const statuses = ["Active", "Inactive", "Prospect", "Under Review"];
        const paymentStatuses = ["Current", "Overdue", "Paid", "Pending"];
        
        return {
          id: `client_${i + 1}`,
          client_name: `${["Alpha", "Beta", "Gamma", "Delta", "Epsilon", "Zeta", "Eta", "Theta"][i % 8]} ${["Corp", "Ltd", "Inc", "LLC", "Group"][i % 5]}`,
          client_type: clientTypes[i % clientTypes.length],
          industry: industries[i % industries.length],
          status: statuses[i % statuses.length],
          contact_person: `${["Wanjiku", "Kamau", "Achieng", "Mwangi", "Njeri", "Otieno", "Wanjiru", "Kiprotich", "Muthoni", "Ochieng", "Nyokabi", "Kimani", "Akinyi", "Kiptoo", "Wambui"][i % 15]} ${["Kariuki", "Mutua", "Odhiambo", "Kiplagat", "Wanjiku", "Macharia", "Onyango", "Rotich", "Njoroge", "Auma"][i % 10]}`,
          email: `contact${i + 1}@example.com`,
          phone: `+254 ${700 + i} ${String(100000 + i).slice(0, 6)}`,
          address: `${i + 1} Business District, Nairobi`,
          annual_revenue: Math.floor(Math.random() * 10000000) + 500000,
          relationship_start: new Date(2020 + (i % 4), i % 12, (i % 28) + 1).toISOString().split('T')[0],
          last_interaction: new Date(2024, 11, (i % 30) + 1).toISOString().split('T')[0],
          satisfaction_score: Number((3.5 + Math.random() * 1.5).toFixed(1)),
          total_jobs: Math.floor(Math.random() * 20) + 5,
          active_jobs: Math.floor(Math.random() * 5) + 1,
          total_revenue: Math.floor(Math.random() * 500000) + 50000,
          last_invoice: new Date(2024, 11, (i % 15) + 1).toISOString().split('T')[0],
          payment_status: paymentStatuses[i % paymentStatuses.length],
          notes: i % 3 === 0 ? `Important client with ${Math.floor(Math.random() * 10) + 5} year relationship` : ""
        };
      });

      const mockJobs: Job[] = Array.from({ length: 120 }, (_, i) => {
        const jobTypes = ["Annual Audit", "Tax Compliance", "Financial Review", "Due Diligence", "Consulting"];
        const statuses = ["Active", "Completed", "On Hold", "Planning", "Invoiced"];
        const priorities = ["High", "Medium", "Low"];
        const paymentStatuses = ["Paid", "Pending", "Overdue"];
        
        return {
          id: i + 1,
          job_code: `JOB${String(2024)}${String(i + 1).padStart(3, '0')}`,
          title: `${jobTypes[i % jobTypes.length]} - Client ${Math.floor(i / 3) + 1}`,
          status: statuses[i % statuses.length],
          start_date: new Date(2024, (i % 12), (i % 28) + 1).toISOString().split('T')[0],
          due_date: new Date(2024, (i % 12) + 1, (i % 28) + 1).toISOString().split('T')[0],
          budget_hours: Math.floor(Math.random() * 200) + 50,
          actual_hours: Math.floor(Math.random() * 150) + 30,
          estimated_revenue: Math.floor(Math.random() * 100000) + 10000,
          invoiced_amount: Math.floor(Math.random() * 80000) + 8000,
          payment_status: paymentStatuses[i % paymentStatuses.length],
          completion_percentage: Math.floor(Math.random() * 100),
          team_size: Math.floor(Math.random() * 6) + 2,
          priority: priorities[i % priorities.length]
        };
      });

      setMetrics(mockMetrics);
      setClients(mockClients);
      setJobs(mockJobs);
    } catch (error: any) {
      console.error("Error loading client portfolio:", error);
      toast({
        title: "Error",
        description: "Failed to load client portfolio data.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const filteredClients = clients.filter(client => {
    const matchesSearch = client.client_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         client.industry.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterStatus === "all" || client.status.toLowerCase() === filterStatus.toLowerCase();
    return matchesSearch && matchesFilter;
  });

  const getStatusBadgeVariant = (status: string) => {
    switch (status.toLowerCase()) {
      case "active": return "default";
      case "inactive": return "secondary";
      case "prospect": return "outline";
      case "under review": return "destructive";
      default: return "outline";
    }
  };

  const exportToExcel = () => {
    const exportData = filteredClients.map(client => ({
      "Client Name": client.client_name,
      "Industry": client.industry,
      "Status": client.status,
      "Contact Person": client.contact_person,
      "Email": client.email,
      "Phone": client.phone,
      "Annual Revenue": `KES ${client.annual_revenue.toLocaleString()}`,
      "Total Jobs": client.total_jobs,
      "Active Jobs": client.active_jobs,
      "Total Revenue": `KES ${client.total_revenue.toLocaleString()}`,
      "Satisfaction Score": client.satisfaction_score,
      "Payment Status": client.payment_status,
      "Relationship Start": client.relationship_start,
      "Last Interaction": client.last_interaction
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Client Portfolio");
    XLSX.writeFile(wb, "client-portfolio.xlsx");

    toast({
      title: "Export Successful",
      description: "Client portfolio exported to Excel.",
    });
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
            <p className="mt-2">Loading client portfolio...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h2 className="text-3xl font-bold text-foreground">Client Portfolio</h2>
            <p className="text-muted-foreground">
              Manage client relationships and track business performance
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="icon" onClick={exportToExcel} title="Export to Excel">
              <Download className="h-4 w-4" />
            </Button>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Client
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Add New Client</DialogTitle>
                  <DialogDescription>
                    Enter the details for the new client relationship
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Client Name</Label>
                      <Input placeholder="Enter client name" />
                    </div>
                    <div className="space-y-2">
                      <Label>Industry</Label>
                      <Select>
                        <SelectTrigger>
                          <SelectValue placeholder="Select industry" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="manufacturing">Manufacturing</SelectItem>
                          <SelectItem value="retail">Retail</SelectItem>
                          <SelectItem value="technology">Technology</SelectItem>
                          <SelectItem value="healthcare">Healthcare</SelectItem>
                          <SelectItem value="finance">Finance</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Contact Person</Label>
                      <Input placeholder="Primary contact name" />
                    </div>
                    <div className="space-y-2">
                      <Label>Email</Label>
                      <Input type="email" placeholder="contact@client.com" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Notes</Label>
                    <Textarea placeholder="Additional notes about the client..." />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button onClick={() => {
                      toast({ title: "Client added successfully" });
                      setDialogOpen(false);
                    }}>
                      Add Client
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Key Metrics */}
        {metrics && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Clients</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{metrics.totalClients}</div>
                <p className="text-xs text-muted-foreground">
                  {metrics.newThisMonth} new this month
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Active Revenue</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  KES {(metrics.totalRevenue / 1000000).toFixed(1)}M
                </div>
                <p className="text-xs text-success">
                  +{metrics.growthRate}% from last year
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Client Satisfaction</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{metrics.avgSatisfaction}/5.0</div>
                <p className="text-xs text-muted-foreground">
                  {metrics.retentionRate}% retention rate
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Pending Actions</CardTitle>
                <AlertCircle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{metrics.pendingInvoices}</div>
                <p className="text-xs text-warning">
                  Pending invoices
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        <Tabs defaultValue="clients" className="space-y-4">
          <TabsList>
            <TabsTrigger value="clients">Clients</TabsTrigger>
            <TabsTrigger value="jobs">Active Jobs</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
          </TabsList>

          <TabsContent value="clients" className="space-y-4">
            {/* Search and Filter */}
            <div className="flex gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search clients..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="prospect">Prospect</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Client Table */}
            <Card>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Client</TableHead>
                      <TableHead>Industry</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Jobs</TableHead>
                      <TableHead>Revenue</TableHead>
                      <TableHead>Satisfaction</TableHead>
                      <TableHead>Payment</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredClients.slice(0, 20).map((client) => (
                      <TableRow key={client.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{client.client_name}</p>
                            <p className="text-sm text-muted-foreground">{client.contact_person}</p>
                          </div>
                        </TableCell>
                        <TableCell>{client.industry}</TableCell>
                        <TableCell>
                          <Badge variant={getStatusBadgeVariant(client.status)}>
                            {client.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="text-center">
                            <p className="font-medium">{client.active_jobs}</p>
                            <p className="text-xs text-muted-foreground">of {client.total_jobs}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-right">
                            <p className="font-medium">KES {(client.total_revenue / 1000).toFixed(0)}K</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">{client.satisfaction_score}</span>
                            <div className="w-16">
                              <Progress value={client.satisfaction_score * 20} className="h-2" />
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={client.payment_status === "Current" ? "default" : "destructive"}>
                            {client.payment_status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm" onClick={() => setSelectedClient(client)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="jobs" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Active Client Jobs</CardTitle>
                <CardDescription>Current projects and their progress</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Job Code</TableHead>
                      <TableHead>Title</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Progress</TableHead>
                      <TableHead>Revenue</TableHead>
                      <TableHead>Due Date</TableHead>
                      <TableHead>Team</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {jobs.filter(job => job.status === "Active").slice(0, 15).map((job) => (
                      <TableRow key={job.id}>
                        <TableCell className="font-medium">{job.job_code}</TableCell>
                        <TableCell>{job.title}</TableCell>
                        <TableCell>
                          <Badge>{job.status}</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Progress value={job.completion_percentage} className="w-16 h-2" />
                            <span className="text-sm">{job.completion_percentage}%</span>
                          </div>
                        </TableCell>
                        <TableCell>KES {(job.estimated_revenue / 1000).toFixed(0)}K</TableCell>
                        <TableCell>{new Date(job.due_date).toLocaleDateString()}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{job.team_size} members</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="analytics" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Revenue Distribution by Industry</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {["Manufacturing", "Technology", "Finance", "Healthcare", "Retail"].map((industry, index) => {
                      const percentage = [35, 25, 20, 12, 8][index];
                      const revenue = [840000, 600000, 480000, 288000, 192000][index];
                      return (
                        <div key={industry}>
                          <div className="flex justify-between text-sm mb-1">
                            <span>{industry}</span>
                            <span>KES {(revenue / 1000).toFixed(0)}K ({percentage}%)</span>
                          </div>
                          <Progress value={percentage} className="h-2" />
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Client Acquisition Trends</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-muted-foreground">This Quarter</p>
                        <p className="text-2xl font-bold">12</p>
                        <p className="text-xs text-success">+3 from last quarter</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Conversion Rate</p>
                        <p className="text-2xl font-bold">68%</p>
                        <p className="text-xs text-success">+5% improvement</p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Prospects</span>
                        <span>24</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>Under Review</span>
                        <span>8</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>Active Clients</span>
                        <span>38</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default ClientPortfolio;