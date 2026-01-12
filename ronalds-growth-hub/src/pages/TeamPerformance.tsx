import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { 
  TrendingUp, 
  TrendingDown, 
  Users, 
  Clock, 
  Target, 
  Award,
  AlertCircle,
  CheckCircle,
  BarChart3,
  Calendar,
  Filter,
  Download,
  Eye
} from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";

interface TeamMember {
  id: number;
  name: string;
  role: string;
  position_level: string;
  avatar?: string;
  email: string;
  department: string;
  performance_score: number;
  utilization_rate: number;
  billable_hours: number;
  completed_projects: number;
  kpi_completion: number;
  recent_reviews: number;
  goals_achieved: number;
  total_goals: number;
  certifications: number;
  training_hours: number;
  client_satisfaction: number;
  peer_rating: number;
  last_evaluation: string;
}

interface PerformanceMetrics {
  team_avg_performance: number;
  team_avg_utilization: number;
  total_billable_hours: number;
  active_projects: number;
  completed_evaluations: number;
  pending_evaluations: number;
  improvement_needed: number;
  high_performers: number;
}

const TeamPerformance = () => {
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [metrics, setMetrics] = useState<PerformanceMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState('last_3_months');
  const [filterRole, setFilterRole] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('performance_score');

  useEffect(() => {
    fetchTeamPerformance();
  }, [selectedPeriod, filterRole]);

  const fetchTeamPerformance = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      
      const response = await fetch(`http://localhost:4000/api/manager/team-performance?period=${selectedPeriod}&role=${filterRole}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setTeamMembers(data.team_members || []);
        setMetrics(data.metrics);
      }
    } catch (error) {
      console.error('Error fetching team performance:', error);
    } finally {
      setLoading(false);
    }
  };

  const getPerformanceBadge = (score: number) => {
    if (score >= 90) return <Badge className="bg-green-100 text-green-800">Excellent</Badge>;
    if (score >= 80) return <Badge className="bg-blue-100 text-blue-800">Good</Badge>;
    if (score >= 70) return <Badge className="bg-yellow-100 text-yellow-800">Average</Badge>;
    return <Badge className="bg-red-100 text-red-800">Needs Improvement</Badge>;
  };

  const getUtilizationColor = (rate: number) => {
    if (rate >= 85) return "text-green-600";
    if (rate >= 70) return "text-blue-600";
    if (rate >= 50) return "text-yellow-600";
    return "text-red-600";
  };

  const filteredAndSortedMembers = teamMembers
    .filter(member => 
      member.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      member.role.toLowerCase().includes(searchTerm.toLowerCase())
    )
    .sort((a, b) => {
      switch (sortBy) {
        case 'performance_score':
          return b.performance_score - a.performance_score;
        case 'utilization_rate':
          return b.utilization_rate - a.utilization_rate;
        case 'billable_hours':
          return b.billable_hours - a.billable_hours;
        case 'name':
          return a.name.localeCompare(b.name);
        default:
          return 0;
      }
    });

  const exportPerformanceReport = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`http://localhost:4000/api/manager/team-performance/export?period=${selectedPeriod}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `team_performance_${selectedPeriod}.xlsx`;
        a.click();
      }
    } catch (error) {
      console.error('Error exporting report:', error);
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading team performance data...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Team Performance</h1>
            <p className="text-gray-600 mt-1">Monitor and analyze your team's performance metrics</p>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={exportPerformanceReport}>
              <Download className="w-4 h-4 mr-2" />
              Export Report
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-4 bg-white p-4 rounded-lg border">
          <div className="flex-1 min-w-[250px]">
            <Input
              placeholder="Search team members..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full"
            />
          </div>
          <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select period" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="last_month">Last Month</SelectItem>
              <SelectItem value="last_3_months">Last 3 Months</SelectItem>
              <SelectItem value="last_6_months">Last 6 Months</SelectItem>
              <SelectItem value="last_year">Last Year</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterRole} onValueChange={setFilterRole}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Filter by role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Roles</SelectItem>
              <SelectItem value="senior">Senior</SelectItem>
              <SelectItem value="associate">Associate</SelectItem>
              <SelectItem value="junior">Junior</SelectItem>
              <SelectItem value="intern">Intern</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="performance_score">Performance</SelectItem>
              <SelectItem value="utilization_rate">Utilization</SelectItem>
              <SelectItem value="billable_hours">Hours</SelectItem>
              <SelectItem value="name">Name</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Key Metrics */}
        {metrics && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Avg Performance</CardTitle>
                <BarChart3 className="w-4 h-4 text-blue-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{metrics.team_avg_performance.toFixed(1)}%</div>
                <div className="flex items-center mt-2">
                  {metrics.team_avg_performance >= 80 ? (
                    <TrendingUp className="w-4 h-4 text-green-600 mr-1" />
                  ) : (
                    <TrendingDown className="w-4 h-4 text-red-600 mr-1" />
                  )}
                  <p className="text-xs text-gray-600">Team average</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Utilization Rate</CardTitle>
                <Clock className="w-4 h-4 text-orange-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{metrics.team_avg_utilization.toFixed(1)}%</div>
                <Progress value={metrics.team_avg_utilization} className="mt-2" />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">High Performers</CardTitle>
                <Award className="w-4 h-4 text-yellow-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{metrics.high_performers}</div>
                <p className="text-xs text-gray-600">Score ≥ 90%</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Pending Reviews</CardTitle>
                <AlertCircle className="w-4 h-4 text-red-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{metrics.pending_evaluations}</div>
                <p className="text-xs text-gray-600">Need attention</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Team Performance Table */}
        <Card>
          <CardHeader>
            <CardTitle>Team Members Performance</CardTitle>
            <CardDescription>Individual performance metrics and KPIs</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {filteredAndSortedMembers.map((member) => (
                <div key={member.id} className="p-4 border rounded-lg hover:bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <Avatar>
                        <AvatarImage src={member.avatar} alt={member.name} />
                        <AvatarFallback>{member.name.substring(0, 2).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div>
                        <h3 className="font-semibold text-gray-900">{member.name}</h3>
                        <p className="text-sm text-gray-600">{member.role} • {member.department}</p>
                        <p className="text-xs text-gray-500">{member.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-4">
                      {getPerformanceBadge(member.performance_score)}
                      <Button variant="outline" size="sm">
                        <Eye className="w-4 h-4 mr-1" />
                        View Details
                      </Button>
                    </div>
                  </div>
                  
                  <div className="mt-4 grid grid-cols-2 md:grid-cols-6 gap-4 text-sm">
                    <div>
                      <p className="text-gray-600">Performance</p>
                      <p className="font-semibold">{member.performance_score}%</p>
                    </div>
                    <div>
                      <p className="text-gray-600">Utilization</p>
                      <p className={`font-semibold ${getUtilizationColor(member.utilization_rate)}`}>
                        {member.utilization_rate}%
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-600">Billable Hours</p>
                      <p className="font-semibold">{member.billable_hours}h</p>
                    </div>
                    <div>
                      <p className="text-gray-600">Goals</p>
                      <p className="font-semibold">{member.goals_achieved}/{member.total_goals}</p>
                    </div>
                    <div>
                      <p className="text-gray-600">Client Rating</p>
                      <p className="font-semibold">{member.client_satisfaction}/5</p>
                    </div>
                    <div>
                      <p className="text-gray-600">Last Review</p>
                      <p className="font-semibold">{new Date(member.last_evaluation).toLocaleDateString()}</p>
                    </div>
                  </div>
                </div>
              ))}
              
              {filteredAndSortedMembers.length === 0 && (
                <div className="text-center py-8">
                  <p className="text-gray-500">No team members found matching your criteria.</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default TeamPerformance;