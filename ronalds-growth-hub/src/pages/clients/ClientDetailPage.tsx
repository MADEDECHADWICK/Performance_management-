/**
 * Client Detail Page
 * Shows comprehensive client information, jobs, and engagement letters
 */
import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { clientsAPI, surveysAPI } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import PageLoader from '@/components/ui/page-loader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import {
  Building2,
  ArrowLeft,
  Edit,
  Trash2,
  Mail,
  Phone,
  MapPin,
  User,
  Briefcase,
  FileText,
  Calendar,
  Plus,
  Download,
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
} from 'lucide-react';

const getJobStatusColor = (status: string) => {
  switch (status) {
    case 'in_progress': return 'bg-green-100 text-green-800';
    case 'completed': return 'bg-blue-100 text-blue-800';
    case 'planned': return 'bg-yellow-100 text-yellow-800';
    case 'on_hold': return 'bg-orange-100 text-orange-800';
    case 'cancelled': return 'bg-red-100 text-red-800';
    default: return 'bg-gray-100 text-gray-800';
  }
};

const getEngagementLetterStatusIcon = (status: string) => {
  switch (status) {
    case 'approved':
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    case 'rejected':
      return <XCircle className="h-4 w-4 text-red-500" />;
    default:
      return <Clock className="h-4 w-4 text-yellow-500" />;
  }
};

export function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { canAccess } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('overview');

  const canEditClient = canAccess('clients', 'write');

  // Fetch client details
  const { data: client, isLoading, error } = useQuery({
    queryKey: ['client', id],
    queryFn: () => clientsAPI.getById(Number(id)),
    enabled: !!id,
  });

  // Fetch client jobs
  const { data: jobsData } = useQuery({
    queryKey: ['client-jobs', id],
    queryFn: () => clientsAPI.getJobs(Number(id)),
    enabled: !!id,
  });

  // Fetch engagement letters
  const { data: engagementLetters } = useQuery({
    queryKey: ['engagement-letters', id],
    queryFn: () => clientsAPI.getEngagementLetters(Number(id)),
    enabled: !!id,
  });

  const { data: surveyByClient } = useQuery({
    queryKey: ['surveys-by-client'],
    queryFn: () => surveysAPI.getByClient(),
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: () => clientsAPI.delete(Number(id)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      toast({
        title: 'Client Deleted',
        description: 'The client has been deleted successfully.',
      });
      navigate('/clients');
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete client.',
        variant: 'destructive',
      });
    },
  });

  // Engagement letter actions
  const approveLetterMutation = useMutation({
    mutationFn: (letterId: number) => clientsAPI.approveEngagementLetter(letterId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['engagement-letters', id] });
      toast({
        title: 'Letter Approved',
        description: 'The engagement letter has been approved.',
      });
    },
  });

  const rejectLetterMutation = useMutation({
    mutationFn: (letterId: number) => clientsAPI.rejectEngagementLetter(letterId, 'Rejected by user'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['engagement-letters', id] });
      toast({
        title: 'Letter Rejected',
        description: 'The engagement letter has been rejected.',
      });
    },
  });

  const jobs = jobsData || [];
  const letters = engagementLetters || [];
  const surveySummary =
    surveyByClient?.find((item: any) => item.clientId === Number(id)) || null;
  const formatDate = (value?: string | Date | null) =>
    value ? new Date(value).toLocaleDateString() : '-';

  if (isLoading) {
    return (
      <div className="p-6">
        <PageLoader message="Loading..." minHeightClassName="min-h-[220px]" />
      </div>
    );
  }

  if (error || !client) {
    return (
      <div className="p-6">
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-6">
            <p className="text-red-600">Failed to load client details.</p>
            <Button variant="link" onClick={() => navigate('/clients')}>
              Back to Clients
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/clients')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <Building2 className="h-8 w-8 text-primary" />
              <h1 className="text-3xl font-bold">{client.clientName}</h1>
              <Badge variant={client.status === 'active' ? 'default' : 'secondary'}>
                {client.status === 'active' ? 'Active' : 'Inactive'}
              </Badge>
            </div>
            <p className="text-muted-foreground mt-1">
              {client.industry || 'No industry specified'}
            </p>
          </div>
        </div>

        {canEditClient && (
          <div className="flex gap-2">
            <Link to={`/clients/${id}/edit`}>
              <Button variant="outline">
                <Edit className="h-4 w-4 mr-2" />
                Edit
              </Button>
            </Link>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Client?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This action cannot be undone. This will permanently delete the client
                    "{client.clientName}" and all associated records.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => deleteMutation.mutate()}
                    className="bg-red-600 hover:bg-red-700"
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="jobs">
            Jobs ({jobs.length})
          </TabsTrigger>
          <TabsTrigger value="engagement-letters">
            Engagement Letters ({letters.length})
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Contact Information */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Contact Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {client.contactPerson && (
                  <div>
                    <p className="text-sm text-muted-foreground">Contact Person</p>
                    <p className="font-medium">{client.contactPerson}</p>
                  </div>
                )}
                {client.contactEmail && (
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <a href={`mailto:${client.contactEmail}`} className="text-primary hover:underline">
                      {client.contactEmail}
                    </a>
                  </div>
                )}
                {client.contactPhone && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <a href={`tel:${client.contactPhone}`} className="hover:underline">
                      {client.contactPhone}
                    </a>
                  </div>
                )}
                {client.location && (
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <span>{client.location}</span>
                  </div>
                )}
                {client.address && (
                  <div>
                    <p className="text-sm text-muted-foreground">Address</p>
                    <p>{client.address}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Team Assignment */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Briefcase className="h-5 w-5" />
                  Team Assignment
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm text-muted-foreground">Partner In Charge</p>
                  <p className="font-medium">
                    {client.partner 
                      ? `${client.partner.firstName} ${client.partner.lastName}`
                      : 'Not assigned'
                    }
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Manager In Charge</p>
                  <p className="font-medium">
                    {client.manager 
                      ? `${client.manager.firstName} ${client.manager.lastName}`
                      : 'Not assigned'
                    }
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Stats */}
            <Card>
              <CardHeader>
                <CardTitle>Client Statistics</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center p-4 bg-muted rounded-lg">
                    <p className="text-2xl font-bold">{jobs.length}</p>
                    <p className="text-sm text-muted-foreground">Total Jobs</p>
                  </div>
                  <div className="text-center p-4 bg-muted rounded-lg">
                    <p className="text-2xl font-bold">
                      {jobs.filter(j => j.status === 'in_progress').length}
                    </p>
                    <p className="text-sm text-muted-foreground">Active Jobs</p>
                  </div>
                  <div className="text-center p-4 bg-muted rounded-lg">
                    <p className="text-2xl font-bold">{letters.length}</p>
                    <p className="text-sm text-muted-foreground">Engagement Letters</p>
                  </div>
                  <div className="text-center p-4 bg-muted rounded-lg">
                    <p className="text-2xl font-bold">
                      {letters.filter(l => l.status === 'approved').length}
                    </p>
                    <p className="text-sm text-muted-foreground">Approved Letters</p>
                  </div>
                  <div className="text-center p-4 bg-muted rounded-lg">
                    <p className="text-2xl font-bold">
                      {surveySummary ? surveySummary.avgSatisfaction.toFixed(1) : '-'}
                    </p>
                    <p className="text-sm text-muted-foreground">Avg Satisfaction</p>
                  </div>
                  <div className="text-center p-4 bg-muted rounded-lg">
                    <p className="text-2xl font-bold">
                      {surveySummary ? surveySummary.surveyCount : 0}
                    </p>
                    <p className="text-sm text-muted-foreground">Survey Responses</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Client Satisfaction */}
            <Card>
              <CardHeader>
                <CardTitle>Client Satisfaction</CardTitle>
                <CardDescription>Survey feedback summary for this client</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Average rating</span>
                  <span className="font-medium">
                    {surveySummary ? `${surveySummary.avgSatisfaction.toFixed(1)}/5` : 'No surveys yet'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Would recommend</span>
                  <span className="font-medium">
                    {surveySummary ? `${surveySummary.wouldRecommendPercent.toFixed(0)}%` : '-'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Last survey</span>
                  <span className="font-medium">
                    {surveySummary?.lastSurveyDate ? formatDate(surveySummary.lastSurveyDate) : '-'}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Notes */}
            {client.notes && (
              <Card>
                <CardHeader>
                  <CardTitle>Notes</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="whitespace-pre-wrap">{client.notes}</p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* Jobs Tab */}
        <TabsContent value="jobs">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Jobs</CardTitle>
                <CardDescription>
                  All jobs associated with this client
                </CardDescription>
              </div>
              {canEditClient && (
                <Link to={`/jobs/create?clientId=${id}`}>
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Job
                  </Button>
                </Link>
              )}
            </CardHeader>
            <CardContent>
              {jobs.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Briefcase className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No jobs found for this client</p>
                  {canEditClient && (
                    <Link to={`/jobs/create?clientId=${id}`}>
                      <Button variant="link" className="mt-2">
                        Create the first job
                      </Button>
                    </Link>
                  )}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                    <TableHead>Job Code</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Fee</TableHead>
                    <TableHead>Start Date</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                  </TableHeader>
                  <TableBody>
                    {jobs.map((job: any) => (
                      <TableRow key={job.id}>
                        <TableCell className="font-mono">{job.jobCode || '-'}</TableCell>
                        <TableCell className="font-medium">{job.jobName}</TableCell>
                        <TableCell>
                          <Badge className={getJobStatusColor(job.status)}>
                            {job.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {job.fixedFeeAmount
                            ? `KES ${Number(job.fixedFeeAmount).toLocaleString()}`
                            : '-'}
                        </TableCell>
                        <TableCell>
                          {job.startDate 
                            ? new Date(job.startDate).toLocaleDateString()
                            : '-'
                          }
                        </TableCell>
                        <TableCell>
                          {job.dueDate 
                            ? new Date(job.dueDate).toLocaleDateString()
                            : '-'
                          }
                        </TableCell>
                        <TableCell className="text-right">
                          <Link to={`/jobs/${job.id}`}>
                            <Button variant="ghost" size="sm">View</Button>
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Engagement Letters Tab */}
        <TabsContent value="engagement-letters">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Engagement Letters</CardTitle>
                <CardDescription>
                  Upload and manage engagement letters for this client
                </CardDescription>
              </div>
              {canEditClient && (
                <Link to={`/clients/${id}/edit`}>
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Letter
                  </Button>
                </Link>
              )}
            </CardHeader>
            <CardContent>
              {letters.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No engagement letters uploaded</p>
                  {canEditClient && (
                    <Link to={`/clients/${id}/edit`}>
                      <Button variant="link" className="mt-2">
                        Add the first engagement letter
                      </Button>
                    </Link>
                  )}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Title</TableHead>
                      <TableHead>Uploaded</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Valid Until</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {letters.map((letter: any) => (
                      <TableRow key={letter.id}>
                        <TableCell className="font-medium flex items-center gap-2">
                          <FileText className="h-4 w-4" />
                          {letter.jobTitle || letter.engagementType || 'Engagement Letter'}
                        </TableCell>
                        <TableCell>
                          {new Date(letter.createdAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {getEngagementLetterStatusIcon(letter.status)}
                            <span>{letter.status || 'pending_review'}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {letter.endDate 
                            ? new Date(letter.endDate).toLocaleDateString()
                            : '-'
                          }
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            {letter.document?.filePath && (
                              <a href={letter.document.filePath} target="_blank" rel="noopener noreferrer">
                                <Button variant="ghost" size="icon" title="Download">
                                  <Download className="h-4 w-4" />
                                </Button>
                              </a>
                            )}
                            {['pending_review', 'uploaded'].includes(letter.status) && canEditClient && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  title="Approve"
                                  onClick={() => approveLetterMutation.mutate(letter.id)}
                                  disabled={approveLetterMutation.isPending}
                                >
                                  <CheckCircle className="h-4 w-4 text-green-500" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  title="Reject"
                                  onClick={() => rejectLetterMutation.mutate(letter.id)}
                                  disabled={rejectLetterMutation.isPending}
                                >
                                  <XCircle className="h-4 w-4 text-red-500" />
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Meta Information */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex justify-between text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Created: {new Date(client.createdAt).toLocaleDateString()}
            </div>
            <div>
              Last Updated: {new Date(client.updatedAt).toLocaleDateString()}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default ClientDetailPage;
