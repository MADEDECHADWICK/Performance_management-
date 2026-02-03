/**
 * Client Satisfaction Surveys Page
 * Manage, send, and analyze client satisfaction surveys
 */
import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { surveysAPI, clientsAPI, jobsAPI } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { 
  Star,
  Send,
  Mail,
  Clock,
  CheckCircle,
  XCircle,
  BarChart3,
  TrendingUp,
  ThumbsUp,
  Search,
  Plus,
  Eye,
  Copy,
  RefreshCw,
  Building2,
  Briefcase,
  MessageSquare,
  Award
} from 'lucide-react';
import { format, differenceInDays } from 'date-fns';

// Star rating component
function StarRating({ rating, max = 5, size = 'md' }: { rating: number; max?: number; size?: 'sm' | 'md' | 'lg' }) {
  const sizeClasses = {
    sm: 'h-3 w-3',
    md: 'h-4 w-4',
    lg: 'h-5 w-5',
  };
  
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: max }).map((_, i) => (
        <Star
          key={i}
          className={`${sizeClasses[size]} ${
            i < rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'
          }`}
        />
      ))}
      <span className="ml-1 text-sm font-medium">{rating.toFixed(1)}</span>
    </div>
  );
}

export default function ClientSurveys() {
  const { isPartner, isManager, isAdmin, isGMP } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // State
  const [activeTab, setActiveTab] = useState<string>('overview');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [selectedSurvey, setSelectedSurvey] = useState<any>(null);
  
  // Create form state
  const [createForm, setCreateForm] = useState({
    clientId: '',
    jobId: '',
    expiresInDays: 30,
  });

  // Queries
  const { data: surveysData, isLoading: surveysLoading } = useQuery({
    queryKey: ['surveys', statusFilter],
    queryFn: () => surveysAPI.list({
      completed: statusFilter === 'completed' ? true : statusFilter === 'pending' ? false : undefined,
      pageSize: 100,
    }),
  });

  const { data: analyticsData, isLoading: analyticsLoading } = useQuery({
    queryKey: ['survey-analytics'],
    queryFn: () => surveysAPI.getAnalytics(),
    retry: false,
    onError: () => {
      // swallow analytics errors; page will show empty-state values
    },
  });

  const { data: byClientData } = useQuery({
    queryKey: ['surveys-by-client'],
    queryFn: () => surveysAPI.getByClient(),
    retry: false,
    onError: () => {
      // keep UI stable if analytics endpoint is empty
    },
  });

  const { data: clientsData } = useQuery({
    queryKey: ['clients-for-survey'],
    queryFn: () => clientsAPI.list({ pageSize: 200 }),
  });

  const { data: jobsData } = useQuery({
    queryKey: ['jobs-for-survey', createForm.clientId],
    queryFn: () => jobsAPI.list({ 
      clientId: createForm.clientId ? parseInt(createForm.clientId) : undefined,
      status: ['completed', 'in_progress'],
    }),
    enabled: !!createForm.clientId,
  });

  // Mutations
  const createMutation = useMutation({
    mutationFn: (data: { clientId: number; jobId?: number; expiresInDays?: number }) => 
      surveysAPI.create(data),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['surveys'] });
      setShowCreateDialog(false);
      resetCreateForm();
      
      // Copy survey link
      const surveyUrl = surveysAPI.getSurveyUrl(result.surveyToken);
      navigator.clipboard.writeText(surveyUrl);
      
      toast({ 
        title: 'Survey created', 
        description: 'Survey link has been copied to clipboard.',
      });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const reminderMutation = useMutation({
    mutationFn: (id: number) => surveysAPI.sendReminder(id),
    onSuccess: () => {
      toast({ title: 'Reminder sent', description: 'Survey reminder has been sent to the client.' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  // Data
  const surveys = surveysData?.surveys || [];
  const analytics = analyticsData || {
    totalSurveys: 0,
    responseRate: 0,
    averageRatings: {
      overall: 0,
      quality: 0,
      communication: 0,
      timeliness: 0,
      professionalism: 0,
      valueForMoney: 0,
    },
    recommendationRate: 0,
    trends: [],
  };
  const byClient = Array.isArray(byClientData) ? byClientData : [];
  const clients = clientsData?.data || [];
  const jobs = jobsData?.data || [];

  // Filtered surveys
  const filteredSurveys = useMemo(() => {
    let result = surveys;
    
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(s => 
        s.client?.clientName?.toLowerCase().includes(query) ||
        s.job?.jobCode?.toLowerCase().includes(query) ||
        s.job?.jobName?.toLowerCase().includes(query)
      );
    }
    
    return result;
  }, [surveys, searchQuery]);

  const pendingSurveys = surveys.filter(s => !s.completedAt);
  const completedSurveys = surveys.filter(s => s.completedAt);

  // Form helpers
  const resetCreateForm = () => {
    setCreateForm({ clientId: '', jobId: '', expiresInDays: 30 });
  };

  const handleCreate = () => {
    if (!createForm.clientId) {
      toast({ title: 'Error', description: 'Please select a client.', variant: 'destructive' });
      return;
    }
    createMutation.mutate({
      clientId: parseInt(createForm.clientId),
      jobId: createForm.jobId ? parseInt(createForm.jobId) : undefined,
      expiresInDays: createForm.expiresInDays,
    });
  };

  const copySurveyLink = (token: string) => {
    const url = surveysAPI.getSurveyUrl(token);
    navigator.clipboard.writeText(url);
    toast({ title: 'Copied', description: 'Survey link copied to clipboard.' });
  };

  const viewSurveyDetails = (survey: any) => {
    setSelectedSurvey(survey);
    setShowDetailsDialog(true);
  };

  const getSurveyStatus = (survey: any) => {
    if (survey.completedAt) {
      return { label: 'Completed', color: 'bg-green-100 text-green-800', icon: CheckCircle };
    }
    if (survey.expiresAt && new Date(survey.expiresAt) < new Date()) {
      return { label: 'Expired', color: 'bg-red-100 text-red-800', icon: XCircle };
    }
    return { label: 'Pending', color: 'bg-yellow-100 text-yellow-800', icon: Clock };
  };

  const calculateAverageRating = (survey: any) => {
    const ratings = [
      survey.qualityRating,
      survey.communicationRating,
      survey.timelinessRating,
      survey.professionalismRating,
      survey.valueForMoneyRating,
    ].filter(r => r !== null && r !== undefined);
    
    if (ratings.length === 0) return null;
    return ratings.reduce((a, b) => a + b, 0) / ratings.length;
  };

  if (surveysLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
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
              <Star className="h-8 w-8 text-yellow-500" />
              Client Satisfaction Surveys
            </h1>
            <p className="text-muted-foreground mt-1">
              Measure and improve client satisfaction
            </p>
          </div>
          {(isPartner || isManager || isAdmin || isGMP) && (
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Send New Survey
            </Button>
          )}
        </div>

      {/* Analytics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
              <BarChart3 className="h-4 w-4" />
              Total Surveys
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics?.totalSurveys || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
              <CheckCircle className="h-4 w-4 text-green-500" />
              Response Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {analytics?.responseRate ? `${(analytics.responseRate * 100).toFixed(0)}%` : '0%'}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
              <Star className="h-4 w-4 text-yellow-500" />
              Avg Satisfaction
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold">
                {analytics?.averageRatings?.overall?.toFixed(1) || '-'}
              </span>
              <span className="text-muted-foreground">/5</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
              <ThumbsUp className="h-4 w-4 text-blue-500" />
              Would Recommend
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {analytics?.recommendationRate ? `${(analytics.recommendationRate * 100).toFixed(0)}%` : '0%'}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
              <Clock className="h-4 w-4 text-yellow-500" />
              Pending
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{pendingSurveys.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Rating Breakdown */}
      {analytics?.averageRatings && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Award className="h-5 w-5 text-primary" />
              Rating Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
              {[
                { label: 'Quality', value: analytics.averageRatings.quality },
                { label: 'Communication', value: analytics.averageRatings.communication },
                { label: 'Timeliness', value: analytics.averageRatings.timeliness },
                { label: 'Professionalism', value: analytics.averageRatings.professionalism },
                { label: 'Value for Money', value: analytics.averageRatings.valueForMoney },
              ].map(({ label, value }) => (
                <div key={label} className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">{label}</span>
                    <span className="text-sm text-muted-foreground">{value?.toFixed(1) || '-'}/5</span>
                  </div>
                  <Progress value={((value || 0) / 5) * 100} className="h-2" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">All Surveys</TabsTrigger>
          <TabsTrigger value="pending">
            Pending
            {pendingSurveys.length > 0 && (
              <Badge variant="outline" className="ml-2">{pendingSurveys.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="completed">Completed</TabsTrigger>
          <TabsTrigger value="by-client">By Client</TabsTrigger>
        </TabsList>

        {/* Filters */}
        <div className="flex gap-4 my-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by client or job..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
        </div>

        {/* All Surveys Tab */}
        <TabsContent value="overview">
          <Card>
            <CardHeader>
              <CardTitle>All Surveys</CardTitle>
              <CardDescription>View and manage all client satisfaction surveys</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead>Job</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Rating</TableHead>
                    <TableHead>Sent</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSurveys.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        No surveys found
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredSurveys.map(survey => {
                      const status = getSurveyStatus(survey);
                      const avgRating = calculateAverageRating(survey);
                      
                      return (
                        <TableRow key={survey.id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Building2 className="h-4 w-4 text-muted-foreground" />
                              <span className="font-medium">{survey.client?.clientName || '-'}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            {survey.job ? (
                              <div className="flex items-center gap-2">
                                <Briefcase className="h-4 w-4 text-muted-foreground" />
                                <span>{survey.job.jobCode}</span>
                              </div>
                            ) : (
                              <span className="text-muted-foreground">General</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge className={status.color}>
                              <status.icon className="h-3 w-3 mr-1" />
                              {status.label}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {avgRating !== null ? (
                              <StarRating rating={avgRating} size="sm" />
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {survey.sentAt ? format(new Date(survey.sentAt), 'MMM d, yyyy') : '-'}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              {survey.completedAt ? (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => viewSurveyDetails(survey)}
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                              ) : (
                                <>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => copySurveyLink(survey.surveyToken)}
                                    title="Copy link"
                                  >
                                    <Copy className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => reminderMutation.mutate(survey.id)}
                                    title="Send reminder"
                                    disabled={reminderMutation.isPending}
                                  >
                                    <RefreshCw className="h-4 w-4" />
                                  </Button>
                                </>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Pending Tab */}
        <TabsContent value="pending">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-yellow-500" />
                Pending Surveys
              </CardTitle>
              <CardDescription>Surveys awaiting client response</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead>Job</TableHead>
                    <TableHead>Sent</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead>Days Left</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingSurveys.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        No pending surveys
                      </TableCell>
                    </TableRow>
                  ) : (
                    pendingSurveys.map(survey => {
                      const daysLeft = survey.expiresAt 
                        ? differenceInDays(new Date(survey.expiresAt), new Date())
                        : null;
                      
                      return (
                        <TableRow key={survey.id}>
                          <TableCell className="font-medium">{survey.client?.clientName || '-'}</TableCell>
                          <TableCell>{survey.job?.jobCode || 'General'}</TableCell>
                          <TableCell>
                            {survey.sentAt ? format(new Date(survey.sentAt), 'MMM d, yyyy') : '-'}
                          </TableCell>
                          <TableCell>
                            {survey.expiresAt ? format(new Date(survey.expiresAt), 'MMM d, yyyy') : '-'}
                          </TableCell>
                          <TableCell>
                            {daysLeft !== null && (
                              <Badge className={daysLeft <= 3 ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'}>
                                {daysLeft > 0 ? `${daysLeft} days` : 'Expired'}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => copySurveyLink(survey.surveyToken)}
                              >
                                <Copy className="h-4 w-4 mr-1" />
                                Copy Link
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => reminderMutation.mutate(survey.id)}
                                disabled={reminderMutation.isPending}
                              >
                                <Mail className="h-4 w-4 mr-1" />
                                Remind
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Completed Tab */}
        <TabsContent value="completed">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-500" />
                Completed Surveys
              </CardTitle>
              <CardDescription>Surveys with client responses</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead>Job</TableHead>
                    <TableHead>Overall Rating</TableHead>
                    <TableHead>Would Recommend</TableHead>
                    <TableHead>Completed</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {completedSurveys.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        No completed surveys yet
                      </TableCell>
                    </TableRow>
                  ) : (
                    completedSurveys.map(survey => (
                      <TableRow key={survey.id}>
                        <TableCell className="font-medium">{survey.client?.clientName || '-'}</TableCell>
                        <TableCell>{survey.job?.jobCode || 'General'}</TableCell>
                        <TableCell>
                          <StarRating rating={survey.overallSatisfaction || 0} size="sm" />
                        </TableCell>
                        <TableCell>
                          {survey.wouldRecommend !== null && (
                            <Badge className={survey.wouldRecommend ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}>
                              {survey.wouldRecommend ? 'Yes' : 'No'}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {survey.completedAt ? format(new Date(survey.completedAt), 'MMM d, yyyy') : '-'}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => viewSurveyDetails(survey)}
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            View Details
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* By Client Tab */}
        <TabsContent value="by-client">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-primary" />
                Satisfaction by Client
              </CardTitle>
              <CardDescription>Aggregated satisfaction scores per client</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead>Surveys</TableHead>
                    <TableHead>Avg Satisfaction</TableHead>
                    <TableHead>Would Recommend</TableHead>
                    <TableHead>Last Survey</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {byClient.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        No client data available
                      </TableCell>
                    </TableRow>
                  ) : (
                    byClient.map(client => (
                      <TableRow key={client.clientId}>
                        <TableCell className="font-medium">{client.clientName}</TableCell>
                        <TableCell>{client.surveyCount}</TableCell>
                        <TableCell>
                          <StarRating rating={client.avgSatisfaction || 0} size="sm" />
                        </TableCell>
                        <TableCell>
                          <Badge className={client.wouldRecommendPercent >= 70 ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}>
                            {client.wouldRecommendPercent?.toFixed(0) || 0}%
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {client.lastSurveyDate ? format(new Date(client.lastSurveyDate), 'MMM d, yyyy') : '-'}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Create Survey Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send New Survey</DialogTitle>
            <DialogDescription>Create and send a satisfaction survey to a client</DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label>Client *</Label>
              <Select
                value={createForm.clientId}
                onValueChange={(v) => setCreateForm(prev => ({ ...prev, clientId: v, jobId: '' }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select client" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map(client => (
                    <SelectItem key={client.id} value={client.id.toString()}>
                      {client.clientName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {createForm.clientId && (
              <div>
                <Label>Job (Optional)</Label>
                <Select
                  value={createForm.jobId}
                  onValueChange={(v) => setCreateForm(prev => ({ ...prev, jobId: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select job (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">No specific job</SelectItem>
                    {jobs.map(job => (
                      <SelectItem key={job.id} value={job.id.toString()}>
                        {job.jobCode} - {job.jobName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <Label>Survey Expires In</Label>
              <Select
                value={createForm.expiresInDays.toString()}
                onValueChange={(v) => setCreateForm(prev => ({ ...prev, expiresInDays: parseInt(v) }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">7 days</SelectItem>
                  <SelectItem value="14">14 days</SelectItem>
                  <SelectItem value="30">30 days</SelectItem>
                  <SelectItem value="60">60 days</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending}>
              <Send className="h-4 w-4 mr-2" />
              {createMutation.isPending ? 'Creating...' : 'Create & Copy Link'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Survey Details Dialog */}
      <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Survey Response Details</DialogTitle>
            <DialogDescription>
              {selectedSurvey?.client?.clientName} - {selectedSurvey?.job?.jobCode || 'General Survey'}
            </DialogDescription>
          </DialogHeader>
          
          {selectedSurvey && (
            <div className="space-y-6">
              {/* Ratings */}
              <div className="space-y-3">
                <h4 className="font-semibold">Ratings</h4>
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { label: 'Quality', value: selectedSurvey.qualityRating },
                    { label: 'Communication', value: selectedSurvey.communicationRating },
                    { label: 'Timeliness', value: selectedSurvey.timelinessRating },
                    { label: 'Professionalism', value: selectedSurvey.professionalismRating },
                    { label: 'Value for Money', value: selectedSurvey.valueForMoneyRating },
                    { label: 'Overall', value: selectedSurvey.overallSatisfaction },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex justify-between items-center">
                      <span className="text-sm">{label}</span>
                      {value ? <StarRating rating={value} size="sm" /> : '-'}
                    </div>
                  ))}
                </div>
              </div>

              {/* Recommendation */}
              <div>
                <h4 className="font-semibold mb-2">Would Recommend</h4>
                <Badge className={selectedSurvey.wouldRecommend ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}>
                  <ThumbsUp className="h-3 w-3 mr-1" />
                  {selectedSurvey.wouldRecommend ? 'Yes, would recommend' : 'No'}
                </Badge>
              </div>

              {/* Comments */}
              {selectedSurvey.improvementSuggestions && (
                <div>
                  <h4 className="font-semibold mb-2 flex items-center gap-2">
                    <MessageSquare className="h-4 w-4" />
                    Improvement Suggestions
                  </h4>
                  <p className="text-sm text-muted-foreground bg-muted p-3 rounded">
                    {selectedSurvey.improvementSuggestions}
                  </p>
                </div>
              )}

              {selectedSurvey.additionalComments && (
                <div>
                  <h4 className="font-semibold mb-2">Additional Comments</h4>
                  <p className="text-sm text-muted-foreground bg-muted p-3 rounded">
                    {selectedSurvey.additionalComments}
                  </p>
                </div>
              )}

              {/* Meta */}
              <div className="text-xs text-muted-foreground border-t pt-4">
                <p>Completed: {selectedSurvey.completedAt ? format(new Date(selectedSurvey.completedAt), 'PPpp') : '-'}</p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDetailsDialog(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </DashboardLayout>
  );
}
