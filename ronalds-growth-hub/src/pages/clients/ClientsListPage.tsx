/**
 * Client Management - List Page
 * Displays all clients with filtering, search, and actions
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import DashboardLayout from '@/components/DashboardLayout';
import { clientsAPI, jobsAPI, clientOnboardingsAPI, surveysAPI } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  Building2, 
  Plus, 
  Search, 
  MapPin, 
  Mail, 
  Phone,
  Eye,
  Edit,
} from 'lucide-react';

const INDUSTRIES = [
  'Financial Services',
  'Healthcare',
  'Technology',
  'Manufacturing',
  'Retail',
  'Education',
  'Non-Profit',
  'Real Estate',
  'Agriculture',
  'Professional Services',
  'Other',
];

export function ClientsListPage() {
  const { canAccess, hasAnyRole } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [industryFilter, setIndustryFilter] = useState<string>('');
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const { data: clientsData, isLoading, error } = useQuery({
    queryKey: ['clients', searchQuery, industryFilter, page, pageSize],
    queryFn: () => clientsAPI.list({
      search: searchQuery || undefined,
      industry: industryFilter || undefined,
      page,
      pageSize,
    }),
  });

  const { data: jobsData } = useQuery({
    queryKey: ['clients-active-jobs'],
    queryFn: () => jobsAPI.list({ status: 'in_progress', page: 1, pageSize: 1 }),
  });

  const { data: pendingOnboardings } = useQuery({
    queryKey: ['clients-pending-onboardings'],
    queryFn: () => clientOnboardingsAPI.list({ status: 'pending_hr_review', page: 1, pageSize: 1 }),
  });

  const { data: upcomingOnboardings } = useQuery({
    queryKey: ['clients-upcoming-onboardings'],
    queryFn: () => clientOnboardingsAPI.getUpcomingJobs({ page: 1, pageSize: 1 }),
  });

  const { data: surveyAnalytics } = useQuery({
    queryKey: ['survey-analytics'],
    queryFn: () => surveysAPI.getAnalytics(),
  });

  const { data: surveyByClient } = useQuery({
    queryKey: ['surveys-by-client'],
    queryFn: () => surveysAPI.getByClient(),
  });

  const clients = clientsData?.data || [];
  const total = clientsData?.total || 0;
  const totalPages = clientsData?.totalPages || Math.ceil(total / pageSize);
  const activeJobsTotal = jobsData?.total || 0;
  const pendingEngagementTotal = pendingOnboardings?.total || 0;
  const upcomingJobsTotal = upcomingOnboardings?.total || 0;
  const avgSatisfaction = surveyAnalytics?.averageRatings?.overall ?? 0;
  const surveysByClient = surveyByClient || [];

  const canCreateClient =
    canAccess('clients', 'write') && hasAnyRole(['marketing', 'super_admin']);

  if (error) {
    return (
      <DashboardLayout>
        <div className="space-y-6">
          <Card className="border-red-200 bg-red-50">
            <CardContent className="p-6">
              <p className="text-red-600">Failed to load clients. Please try again.</p>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Building2 className="h-8 w-8 text-primary" />
              Client Management
            </h1>
            <p className="text-muted-foreground mt-1">
              Marketing submits client intake packages, and HR reviews them before job creation
            </p>
          </div>
          {canCreateClient && (
            <Link to="/clients/new">
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add New Client
              </Button>
            </Link>
          )}
        </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Clients
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Active Jobs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{activeJobsTotal}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Pending Engagement Letters
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{pendingEngagementTotal}</div>
            <p className="text-xs text-muted-foreground">Awaiting HR review</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Upcoming Jobs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{upcomingJobsTotal}</div>
            <p className="text-xs text-muted-foreground">Approved onboarding</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Industries Served
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {new Set(clients.map(c => c.industry)).size}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Avg Satisfaction
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">
              {avgSatisfaction ? avgSatisfaction.toFixed(1) : '0.0'}
            </div>
            <p className="text-xs text-muted-foreground">Across all surveys</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search clients by name, contact, or email..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
                className="pl-10"
              />
            </div>
            <Select
              value={industryFilter}
              onValueChange={(value) => {
                setIndustryFilter(value === 'all' ? '' : value);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="All Industries" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Industries</SelectItem>
                {INDUSTRIES.map((industry) => (
                  <SelectItem key={industry} value={industry}>
                    {industry}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Clients Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">
              Loading clients...
            </div>
          ) : clients.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <Building2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No clients found</p>
              {canCreateClient && (
                <Link to="/clients/new">
                  <Button variant="link" className="mt-2">
                    Create your first client
                  </Button>
                </Link>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client Name</TableHead>
                  <TableHead>Industry</TableHead>
                  <TableHead>Contact Person</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Satisfaction</TableHead>
                  <TableHead>Partner</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clients.map((client) => {
                  const surveySummary =
                    surveysByClient.find((item: any) => item.clientId === client.id) || null;
                  return (
                  <TableRow key={client.id}>
                    <TableCell>
                      <div className="font-medium">{client.clientName}</div>
                      {client.contactEmail && (
                        <div className="text-sm text-muted-foreground flex items-center gap-1">
                          <Mail className="h-3 w-3" />
                          {client.contactEmail}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{client.industry || 'N/A'}</Badge>
                    </TableCell>
                    <TableCell>
                      <div>{client.contactPerson || '-'}</div>
                      {client.contactPhone && (
                        <div className="text-sm text-muted-foreground flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          {client.contactPhone}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {client.location ? (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {client.location}
                        </span>
                      ) : (
                        '-'
                      )}
                    </TableCell>
                    <TableCell>
                      {surveySummary ? `${surveySummary.avgSatisfaction.toFixed(1)}/5` : '-'}
                    </TableCell>
                    <TableCell>
                      {client.partner
                        ? `${client.partner.firstName} ${client.partner.lastName}`
                        : '-'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={client.status === 'active' ? 'default' : 'secondary'}>
                        {client.status === 'active' ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Link to={`/clients/${client.id}`}>
                          <Button variant="ghost" size="icon" title="View Details">
                            <Eye className="h-4 w-4" />
                          </Button>
                        </Link>
                        {canCreateClient && (
                          <Link to={`/clients/${client.id}/edit`}>
                            <Button variant="ghost" size="icon" title="Edit Client">
                              <Edit className="h-4 w-4" />
                            </Button>
                          </Link>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            Previous
          </Button>
          <span className="flex items-center px-4 text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
          >
            Next
          </Button>
        </div>
      )}
      </div>
    </DashboardLayout>
  );
}

export default ClientsListPage;
