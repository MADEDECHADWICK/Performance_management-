import React, { useEffect, useMemo, useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import PageLoader from '@/components/ui/page-loader';
import { apiFetch } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { TrendingUp, TrendingDown, Users, Clock, Award, BarChart3, Download } from 'lucide-react';
import * as XLSX from 'xlsx';

type TeamMemberApi = {
  employeeId: number;
  firstName: string;
  lastName: string;
  jobPosition: string;
  departmentName: string | null;
  status: string;
};

type TeamPerformanceApi = {
  employeeId: number;
  employeeName: string;
  jobPosition: string;
  avgFinancialScore: number;
  avgNonFinancialScore: number;
  avgOverallRating: number;
  totalHoursThisMonth: number;
  billableHoursThisMonth: number;
  utilizationRate: number;
  lastReviewDate: string | null;
};

type TeamResponse = {
  teamMembers: TeamMemberApi[];
  financials: {
    activeTeamMembers: number;
    totalTeamHours: number;
    billableHours: number;
    totalRevenue: number;
    totalCost: number;
  };
  performance: TeamPerformanceApi[];
};

type OverviewResponse = {
  activeJobs: number;
  pendingReviews: number;
};

type TeamMemberView = {
  id: number;
  name: string;
  role: string;
  department: string;
  performanceScore: number;
  financialScore: number;
  nonFinancialScore: number;
  utilizationRate: number;
  billableHours: number;
  totalHours: number;
};

const TeamPerformance = () => {
  const [teamMembers, setTeamMembers] = useState<TeamMemberView[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRole, setFilterRole] = useState('all');
  const [sortBy, setSortBy] = useState('performanceScore');
  const [overview, setOverview] = useState<OverviewResponse | null>(null);

  const fetchTeamPerformance = async () => {
    try {
      setLoading(true);
      const [teamResponse, overviewResponse] = await Promise.all([
        apiFetch<TeamResponse>('GET', '/manager-dashboard/team'),
        apiFetch<OverviewResponse>('GET', '/manager-dashboard/overview'),
      ]);

      const membersById = new Map<number, TeamMemberApi>();
      (teamResponse.teamMembers || []).forEach((member) => membersById.set(member.employeeId, member));

      const mappedMembers = (teamResponse.performance || []).map((row) => {
        const member = membersById.get(row.employeeId);
        const fallbackName = member ? `${member.firstName || ''} ${member.lastName || ''}`.trim() : row.employeeName;
        return {
          id: row.employeeId,
          name: fallbackName,
          role: member?.jobPosition || row.jobPosition || 'Employee',
          department: member?.departmentName || 'Unassigned',
          performanceScore: Number(row.avgOverallRating || 0),
          financialScore: Number(row.avgFinancialScore || 0),
          nonFinancialScore: Number(row.avgNonFinancialScore || 0),
          utilizationRate: Number(row.utilizationRate || 0),
          billableHours: Number(row.billableHoursThisMonth || 0),
          totalHours: Number(row.totalHoursThisMonth || 0),
        };
      });

      setTeamMembers(mappedMembers);
      setOverview(overviewResponse);
    } catch (error) {
      console.error('Error fetching team performance:', error);
      setTeamMembers([]);
      setOverview(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTeamPerformance();
  }, []);

  const metrics = useMemo(() => {
    const count = teamMembers.length;
    const avg = (values: number[]) => (values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0);

    return {
      teamAvgPerformance: avg(teamMembers.map((member) => member.performanceScore)),
      teamAvgUtilization: avg(teamMembers.map((member) => member.utilizationRate)),
      totalBillableHours: teamMembers.reduce((sum, member) => sum + member.billableHours, 0),
      activeProjects: Number(overview?.activeJobs || 0),
      improvementNeeded: teamMembers.filter((member) => member.performanceScore < 70).length,
      highPerformers: teamMembers.filter((member) => member.performanceScore >= 85).length,
      totalMembers: count,
    };
  }, [teamMembers, overview]);

  const filteredAndSortedMembers = useMemo(() => {
    return teamMembers
      .filter((member) => {
        const matchesSearch =
          member.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          member.role.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesRole = filterRole === 'all' || member.role.toLowerCase().includes(filterRole.toLowerCase());
        return matchesSearch && matchesRole;
      })
      .sort((a, b) => {
        switch (sortBy) {
          case 'performanceScore':
            return b.performanceScore - a.performanceScore;
          case 'utilizationRate':
            return b.utilizationRate - a.utilizationRate;
          case 'billableHours':
            return b.billableHours - a.billableHours;
          case 'name':
            return a.name.localeCompare(b.name);
          default:
            return 0;
        }
      });
  }, [teamMembers, searchTerm, filterRole, sortBy]);

  const exportPerformanceReport = () => {
    const rows = filteredAndSortedMembers.map((member) => ({
      Name: member.name,
      Role: member.role,
      Department: member.department,
      'Performance Score': Number(member.performanceScore || 0).toFixed(2),
      'Financial Score': Number(member.financialScore || 0).toFixed(2),
      'Non-Financial Score': Number(member.nonFinancialScore || 0).toFixed(2),
      'Utilization (%)': Number(member.utilizationRate || 0).toFixed(2),
      'Billable Hours': member.billableHours,
      'Total Hours': member.totalHours,

    }));

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), 'Team Performance');
    XLSX.writeFile(workbook, 'team_performance.xlsx');
  };

  const getPerformanceBadge = (score: number) => {
    if (score >= 90) return <Badge className="bg-green-100 text-green-800">Excellent</Badge>;
    if (score >= 80) return <Badge className="bg-blue-100 text-blue-800">Good</Badge>;
    if (score >= 70) return <Badge className="bg-yellow-100 text-yellow-800">Average</Badge>;
    return <Badge className="bg-red-100 text-red-800">Needs Improvement</Badge>;
  };

  const getUtilizationColor = (rate: number) => {
    if (rate >= 85) return 'text-green-600';
    if (rate >= 70) return 'text-blue-600';
    if (rate >= 50) return 'text-yellow-600';
    return 'text-red-600';
  };

  if (loading) {
    return (
      <DashboardLayout>
        <PageLoader message="Loading..." />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Team Performance</h1>
            <p className="text-gray-600 mt-1">Live manager view for team performance and utilization</p>
          </div>
          <Button variant="outline" onClick={exportPerformanceReport}>
            <Download className="w-4 h-4 mr-2" />
            Export Report
          </Button>
        </div>

        <div className="flex flex-wrap gap-4 bg-white p-4 rounded-lg border">
          <div className="flex-1 min-w-[250px]">
            <Input
              placeholder="Search team members..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              className="w-full"
            />
          </div>
          <Select value={filterRole} onValueChange={setFilterRole}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Roles</SelectItem>
              <SelectItem value="manager">Manager</SelectItem>
              <SelectItem value="senior">Senior</SelectItem>
              <SelectItem value="associate">Associate</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="performanceScore">Performance</SelectItem>
              <SelectItem value="utilizationRate">Utilization</SelectItem>
              <SelectItem value="billableHours">Billable Hours</SelectItem>
              <SelectItem value="name">Name</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Avg Performance</CardTitle>
              <BarChart3 className="w-4 h-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics.teamAvgPerformance.toFixed(1)}</div>
              <div className="flex items-center mt-2">
                {metrics.teamAvgPerformance >= 80 ? (
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
              <div className="text-2xl font-bold">{metrics.teamAvgUtilization.toFixed(1)}%</div>
              <Progress value={metrics.teamAvgUtilization} className="mt-2" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">High Performers</CardTitle>
              <Award className="w-4 h-4 text-yellow-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics.highPerformers}</div>
              <p className="text-xs text-gray-600">Out of {metrics.totalMembers} team members</p>
            </CardContent>
          </Card>


        </div>

        <Card>
          <CardHeader>
            <CardTitle>Team Member Performance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {filteredAndSortedMembers.map((member) => (
                <div key={member.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center space-x-4">
                    <Avatar>
                      <AvatarFallback>{member.name.split(' ').map((namePart) => namePart[0]).join('').slice(0, 2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div>
                      <h3 className="font-medium">{member.name}</h3>
                      <p className="text-sm text-gray-600">{member.role} � {member.department}</p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-6">
                    <div className="text-center min-w-[120px]">
                      {getPerformanceBadge(member.performanceScore)}
                      <p className="text-sm font-medium mt-1">{member.performanceScore.toFixed(1)}</p>
                    </div>

                    <div className="text-center min-w-[120px]">
                      <p className={`text-lg font-bold ${getUtilizationColor(member.utilizationRate)}`}>
                        {member.utilizationRate.toFixed(1)}%
                      </p>
                      <p className="text-xs text-gray-600">Utilization</p>
                    </div>

                    <div className="text-center min-w-[120px]">
                      <p className="text-lg font-bold text-blue-600">{member.billableHours.toFixed(1)}</p>
                      <p className="text-xs text-gray-600">Billable Hours</p>
                    </div>

                    <div className="w-24">
                      <Progress value={Math.min(100, member.utilizationRate)} className="h-2" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default TeamPerformance;
