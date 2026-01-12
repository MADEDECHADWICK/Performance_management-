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
  Target, 
  TrendingUp, 
  DollarSign, 
  Users, 
  Calendar,
  AlertCircle,
  CheckCircle2,
  Search,
  Download,
  Filter,
  Plus,
  Eye,
  Phone,
  Mail,
  FileText,
  Zap
} from "lucide-react";
import * as XLSX from "xlsx";

interface Opportunity {
  id: string;
  client_name: string;
  opportunity_name: string;
  stage: string;
  value: number;
  probability: number;
  expected_close: string;
  source: string;
  contact_person: string;
  email: string;
  phone: string;
  industry: string;
  service_type: string;
  notes: string;
  created_date: string;
  last_activity: string;
  next_action: string;
  next_action_date: string;
  assigned_to: string;
}

interface Activity {
  id: string;
  opportunity_id: string;
  type: string;
  description: string;
  date: string;
  outcome: string;
  next_steps: string;
  created_by: string;
}

interface BDMetrics {
  totalOpportunities: number;
  pipelineValue: number;
  avgDealSize: number;
  conversionRate: number;
  avgSalesCycle: number;
  wonThisMonth: number;
  lostThisMonth: number;
  hotLeads: number;
  targetRevenue: number;
  achievedRevenue: number;
}

const BusinessDevelopment = () => {
  const { toast } = useToast();
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [metrics, setMetrics] = useState<BDMetrics | null>(null);
  const [selectedOpportunity, setSelectedOpportunity] = useState<Opportunity | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStage, setFilterStage] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [activityDialogOpen, setActivityDialogOpen] = useState(false);

  useEffect(() => {
    loadBusinessDevelopment();
  }, []);

  const loadBusinessDevelopment = async () => {
    try {
      setLoading(true);
      
      // Mock comprehensive business development data
      const mockMetrics: BDMetrics = {
        totalOpportunities: 52,
        pipelineValue: 8500000,
        avgDealSize: 163000,
        conversionRate: 34.6,
        avgSalesCycle: 45,
        wonThisMonth: 6,
        lostThisMonth: 2,
        hotLeads: 8,
        targetRevenue: 12000000,
        achievedRevenue: 8500000
      };

      const stages = ["Prospecting", "Qualified", "Proposal", "Negotiation", "Won", "Lost"];
      const sources = ["Referral", "Website", "Cold Call", "LinkedIn", "Event", "Partner"];
      const services = ["Annual Audit", "Tax Advisory", "Financial Consulting", "Due Diligence", "Risk Assessment"];
      const industries = ["Manufacturing", "Technology", "Healthcare", "Retail", "Finance", "Real Estate"];

      const mockOpportunities: Opportunity[] = Array.from({ length: 52 }, (_, i) => {
        const stage = stages[i % stages.length];
        const probability = stage === "Prospecting" ? 10 + Math.random() * 20 :
                          stage === "Qualified" ? 30 + Math.random() * 20 :
                          stage === "Proposal" ? 50 + Math.random() * 20 :
                          stage === "Negotiation" ? 70 + Math.random() * 20 :
                          stage === "Won" ? 100 : 0;
        
        return {
          id: `opp_${i + 1}`,
          client_name: `${["Alpha", "Beta", "Gamma", "Delta", "Epsilon", "Zeta", "Eta", "Theta", "Iota", "Kappa"][i % 10]} ${["Corp", "Ltd", "Inc", "Group", "Holdings"][i % 5]}`,
          opportunity_name: `${services[i % services.length]} - ${new Date().getFullYear()}`,
          stage,
          value: Math.floor(Math.random() * 500000) + 50000,
          probability: Number(probability.toFixed(1)),
          expected_close: new Date(2024, 11 + (i % 3), (i % 28) + 1).toISOString().split('T')[0],
          source: sources[i % sources.length],
          contact_person: `${["Grace", "Samuel", "Faith", "Peter", "Mary", "David", "Agnes", "John", "Catherine", "Joseph", "Esther", "Michael", "Lucy", "Daniel", "Rose"][i % 15]} ${["Mutindi", "Wekesa", "Cheruiyot", "Maina", "Wafula", "Kibet", "Nyong'o", "Chege", "Koech", "Wairimu"][i % 10]}`,
          email: `contact${i + 1}@client${i + 1}.com`,
          phone: `+254 ${700 + (i % 100)} ${String(100000 + i).slice(0, 6)}`,
          industry: industries[i % industries.length],
          service_type: services[i % services.length],
          notes: i % 4 === 0 ? `High priority opportunity with existing relationship` : `Follow up ${["weekly", "bi-weekly", "monthly"][i % 3]}`,
          created_date: new Date(2024, (i % 12), (i % 28) + 1).toISOString().split('T')[0],
          last_activity: new Date(2024, 11, Math.max(1, 30 - (i % 30))).toISOString().split('T')[0],
          next_action: ["Call", "Email", "Proposal", "Meeting", "Follow-up"][i % 5],
          next_action_date: new Date(2024, 11, Math.min(31, (i % 15) + 16)).toISOString().split('T')[0],
          assigned_to: `Partner ${(i % 3) + 1}`
        };
      });

      const mockActivities: Activity[] = Array.from({ length: 200 }, (_, i) => ({
        id: `activity_${i + 1}`,
        opportunity_id: `opp_${(i % 52) + 1}`,
        type: ["Call", "Email", "Meeting", "Proposal", "Demo", "Site Visit"][i % 6],
        description: `${["Initial", "Follow-up", "Detailed", "Final"][i % 4]} ${["discussion", "presentation", "review", "negotiation"][i % 4]} with client`,
        date: new Date(2024, 11, Math.max(1, 30 - (i % 30))).toISOString().split('T')[0],
        outcome: ["Positive", "Neutral", "Negative", "Pending"][i % 4],
        next_steps: `Schedule ${["call", "meeting", "proposal review", "contract discussion"][i % 4]} for next week`,
        created_by: `Partner ${(i % 3) + 1}`
      }));

      setMetrics(mockMetrics);
      setOpportunities(mockOpportunities);
      setActivities(mockActivities);
    } catch (error: any) {
      console.error("Error loading business development data:", error);
      toast({
        title: "Error",
        description: "Failed to load business development data.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const filteredOpportunities = opportunities.filter(opp => {
    const matchesSearch = opp.client_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         opp.opportunity_name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterStage === "all" || opp.stage.toLowerCase() === filterStage.toLowerCase();
    return matchesSearch && matchesFilter;
  });

  const getStageBadgeVariant = (stage: string) => {
    switch (stage.toLowerCase()) {
      case "prospecting": return "secondary";
      case "qualified": return "outline";
      case "proposal": return "default";
      case "negotiation": return "warning";
      case "won": return "success";
      case "lost": return "destructive";
      default: return "outline";
    }
  };

  const getProbabilityColor = (probability: number) => {
    if (probability >= 70) return "text-success";
    if (probability >= 40) return "text-warning";
    return "text-destructive";
  };

  const exportToExcel = () => {
    const exportData = filteredOpportunities.map(opp => ({
      "Client Name": opp.client_name,
      "Opportunity": opp.opportunity_name,
      "Stage": opp.stage,
      "Value (KES)": opp.value,
      "Probability (%)": opp.probability,
      "Expected Close": opp.expected_close,
      "Source": opp.source,
      "Contact Person": opp.contact_person,
      "Email": opp.email,
      "Phone": opp.phone,
      "Industry": opp.industry,
      "Service Type": opp.service_type,
      "Next Action": opp.next_action,
      "Next Action Date": opp.next_action_date,
      "Assigned To": opp.assigned_to,
      "Created Date": opp.created_date
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Business Development");
    XLSX.writeFile(wb, "business-development-pipeline.xlsx");

    toast({
      title: "Export Successful",
      description: "Business development pipeline exported to Excel.",
    });
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
            <p className="mt-2">Loading business development data...</p>
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
            <h2 className="text-3xl font-bold text-foreground">Business Development</h2>
            <p className="text-muted-foreground">
              Manage sales pipeline and track business opportunities
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
                  Add Opportunity
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-3xl">
                <DialogHeader>
                  <DialogTitle>Add New Opportunity</DialogTitle>
                  <DialogDescription>
                    Create a new business development opportunity
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Client Name</Label>
                      <Input placeholder="Enter client name" />
                    </div>
                    <div className="space-y-2">
                      <Label>Opportunity Name</Label>
                      <Input placeholder="e.g., Annual Audit 2024" />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>Service Type</Label>
                      <Select>
                        <SelectTrigger>
                          <SelectValue placeholder="Select service" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="audit">Annual Audit</SelectItem>
                          <SelectItem value="tax">Tax Advisory</SelectItem>
                          <SelectItem value="consulting">Financial Consulting</SelectItem>
                          <SelectItem value="due-diligence">Due Diligence</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Estimated Value (KES)</Label>
                      <Input type="number" placeholder="100000" />
                    </div>
                    <div className="space-y-2">
                      <Label>Expected Close Date</Label>
                      <Input type="date" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Contact Person</Label>
                      <Input placeholder="Primary contact name" />
                    </div>
                    <div className="space-y-2">
                      <Label>Contact Email</Label>
                      <Input type="email" placeholder="contact@client.com" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Notes</Label>
                    <Textarea placeholder="Additional notes about the opportunity..." />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button onClick={() => {
                      toast({ title: "Opportunity added successfully" });
                      setDialogOpen(false);
                    }}>
                      Add Opportunity
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
                <CardTitle className="text-sm font-medium">Pipeline Value</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  KES {(metrics.pipelineValue / 1000000).toFixed(1)}M
                </div>
                <p className="text-xs text-muted-foreground">
                  {metrics.totalOpportunities} opportunities
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Conversion Rate</CardTitle>
                <Target className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{metrics.conversionRate}%</div>
                <p className="text-xs text-muted-foreground">
                  {metrics.avgSalesCycle} days avg cycle
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Monthly Progress</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-success">{metrics.wonThisMonth}</div>
                <p className="text-xs text-muted-foreground">
                  Won vs {metrics.lostThisMonth} lost
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Hot Leads</CardTitle>
                <Zap className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-warning">{metrics.hotLeads}</div>
                <p className="text-xs text-muted-foreground">
                  Require immediate action
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Revenue Target Progress */}
        {metrics && (
          <Card>
            <CardHeader>
              <CardTitle>Revenue Target Progress</CardTitle>
              <CardDescription>Year-to-date performance against annual target</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex justify-between text-sm">
                  <span>Target: KES {(metrics.targetRevenue / 1000000).toFixed(1)}M</span>
                  <span>Achieved: KES {(metrics.achievedRevenue / 1000000).toFixed(1)}M ({((metrics.achievedRevenue / metrics.targetRevenue) * 100).toFixed(1)}%)</span>
                </div>
                <Progress value={(metrics.achievedRevenue / metrics.targetRevenue) * 100} className="h-3" />
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Remaining</p>
                    <p className="font-medium">KES {((metrics.targetRevenue - metrics.achievedRevenue) / 1000000).toFixed(1)}M</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Avg Deal Size</p>
                    <p className="font-medium">KES {(metrics.avgDealSize / 1000).toFixed(0)}K</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Deals Needed</p>
                    <p className="font-medium">{Math.ceil((metrics.targetRevenue - metrics.achievedRevenue) / metrics.avgDealSize)}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Tabs defaultValue="pipeline" className="space-y-4">
          <TabsList>
            <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
            <TabsTrigger value="activities">Activities</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
          </TabsList>

          <TabsContent value="pipeline" className="space-y-4">
            {/* Search and Filter */}
            <div className="flex gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search opportunities..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={filterStage} onValueChange={setFilterStage}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Filter by stage" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Stages</SelectItem>
                  <SelectItem value="prospecting">Prospecting</SelectItem>
                  <SelectItem value="qualified">Qualified</SelectItem>
                  <SelectItem value="proposal">Proposal</SelectItem>
                  <SelectItem value="negotiation">Negotiation</SelectItem>
                  <SelectItem value="won">Won</SelectItem>
                  <SelectItem value="lost">Lost</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Pipeline Table */}
            <Card>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Client</TableHead>
                      <TableHead>Opportunity</TableHead>
                      <TableHead>Stage</TableHead>
                      <TableHead>Value</TableHead>
                      <TableHead>Probability</TableHead>
                      <TableHead>Expected Close</TableHead>
                      <TableHead>Next Action</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredOpportunities.slice(0, 20).map((opp) => (
                      <TableRow key={opp.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{opp.client_name}</p>
                            <p className="text-sm text-muted-foreground">{opp.contact_person}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{opp.opportunity_name}</p>
                            <p className="text-sm text-muted-foreground">{opp.industry}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={getStageBadgeVariant(opp.stage)}>
                            {opp.stage}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-medium">
                          KES {(opp.value / 1000).toFixed(0)}K
                        </TableCell>
                        <TableCell>
                          <span className={`font-medium ${getProbabilityColor(opp.probability)}`}>
                            {opp.probability}%
                          </span>
                        </TableCell>
                        <TableCell>
                          {new Date(opp.expected_close).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="text-sm font-medium">{opp.next_action}</p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(opp.next_action_date).toLocaleDateString()}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="sm" onClick={() => setSelectedOpportunity(opp)}>
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm">
                              <Phone className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm">
                              <Mail className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="activities" className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold">Recent Activities</h3>
              <Dialog open={activityDialogOpen} onOpenChange={setActivityDialogOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Log Activity
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Log New Activity</DialogTitle>
                    <DialogDescription>Record a new business development activity</DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Activity Type</Label>
                        <Select>
                          <SelectTrigger>
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="call">Phone Call</SelectItem>
                            <SelectItem value="email">Email</SelectItem>
                            <SelectItem value="meeting">Meeting</SelectItem>
                            <SelectItem value="proposal">Proposal</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Opportunity</Label>
                        <Select>
                          <SelectTrigger>
                            <SelectValue placeholder="Select opportunity" />
                          </SelectTrigger>
                          <SelectContent>
                            {opportunities.slice(0, 10).map((opp) => (
                              <SelectItem key={opp.id} value={opp.id}>
                                {opp.client_name} - {opp.opportunity_name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Description</Label>
                      <Textarea placeholder="Describe the activity..." />
                    </div>
                    <div className="space-y-2">
                      <Label>Outcome</Label>
                      <Select>
                        <SelectTrigger>
                          <SelectValue placeholder="Select outcome" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="positive">Positive</SelectItem>
                          <SelectItem value="neutral">Neutral</SelectItem>
                          <SelectItem value="negative">Negative</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Next Steps</Label>
                      <Textarea placeholder="What are the next steps?" />
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" onClick={() => setActivityDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button onClick={() => {
                        toast({ title: "Activity logged successfully" });
                        setActivityDialogOpen(false);
                      }}>
                        Log Activity
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            <Card>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Opportunity</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Outcome</TableHead>
                      <TableHead>Next Steps</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {activities.slice(0, 20).map((activity) => {
                      const opportunity = opportunities.find(o => o.id === activity.opportunity_id);
                      return (
                        <TableRow key={activity.id}>
                          <TableCell>{new Date(activity.date).toLocaleDateString()}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{activity.type}</Badge>
                          </TableCell>
                          <TableCell>
                            <div>
                              <p className="font-medium">{opportunity?.client_name}</p>
                              <p className="text-sm text-muted-foreground">{opportunity?.opportunity_name}</p>
                            </div>
                          </TableCell>
                          <TableCell>{activity.description}</TableCell>
                          <TableCell>
                            <Badge variant={
                              activity.outcome === "Positive" ? "default" :
                              activity.outcome === "Neutral" ? "secondary" : "destructive"
                            }>
                              {activity.outcome}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm">{activity.next_steps}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="analytics" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Pipeline by Stage</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {["Prospecting", "Qualified", "Proposal", "Negotiation"].map((stage, index) => {
                      const count = opportunities.filter(o => o.stage === stage).length;
                      const value = opportunities.filter(o => o.stage === stage).reduce((sum, o) => sum + o.value, 0);
                      const percentage = (count / opportunities.length) * 100;
                      
                      return (
                        <div key={stage}>
                          <div className="flex justify-between text-sm mb-1">
                            <span>{stage}</span>
                            <span>{count} opportunities (KES {(value / 1000000).toFixed(1)}M)</span>
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
                  <CardTitle>Source Performance</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {["Referral", "Website", "LinkedIn", "Events"].map((source, index) => {
                      const sourceOpps = opportunities.filter(o => o.source === source);
                      const count = sourceOpps.length;
                      const conversionRate = (sourceOpps.filter(o => o.stage === "Won").length / Math.max(count, 1)) * 100;
                      
                      return (
                        <div key={source} className="flex justify-between items-center">
                          <div>
                            <p className="font-medium">{source}</p>
                            <p className="text-sm text-muted-foreground">{count} opportunities</p>
                          </div>
                          <div className="text-right">
                            <p className="font-medium">{conversionRate.toFixed(1)}%</p>
                            <p className="text-sm text-muted-foreground">conversion</p>
                          </div>
                        </div>
                      );
                    })}
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

export default BusinessDevelopment;