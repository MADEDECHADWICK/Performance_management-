/**
 * Timesheets Page - Time Entry Management
 * Features:
 * - Timer feature for real-time tracking
 * - Job/Task selection with budget visibility
 * - Billable vs Non-billable tracking
 * - Budget cap enforcement (auto switches to non-billable when exceeded)
 * - Request additional time feature
 * - Approval workflow
 */
import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { timeEntriesAPI, jobsAPI } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { format, parseISO, startOfWeek, endOfWeek, addDays, differenceInMinutes } from 'date-fns';
import {
  Clock,
  Play,
  Pause,
  Square,
  Plus,
  Send,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Briefcase,
  Calendar,
  Timer,
  DollarSign,
  TrendingUp,
  AlertCircle,
  Loader2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

interface Job {
  id: number;
  jobName: string;
  jobCode: string;
  client?: { clientName: string };
  budgetHours: number;
  status: string;
  tasks?: Task[];
}

interface Task {
  id: number;
  title: string;
  estimatedHours: number;
  status: string;
}

interface TimeEntry {
  id: number;
  jobId: number;
  taskId?: number;
  date: string;
  hours: number;
  description: string;
  billable: boolean;
  status: 'pending' | 'submitted' | 'approved' | 'rejected';
  job?: Job;
  task?: Task;
  startTime?: string;
  endTime?: string;
}

interface TimerState {
  isRunning: boolean;
  jobId: number | null;
  taskId: number | null;
  startTime: Date | null;
  description: string;
  elapsedSeconds: number;
}

interface JobBudgetInfo {
  jobId: number;
  allocatedHours: number;
  usedHours: number;
  remainingHours: number;
  isBillableAvailable: boolean;
}

const STATUS_COLORS = {
  pending: 'bg-gray-100 text-gray-800',
  submitted: 'bg-blue-100 text-blue-800',
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
};

const STATUS_ICONS = {
  pending: Clock,
  submitted: Send,
  approved: CheckCircle,
  rejected: XCircle,
};

export default function TimesheetsNew() {
  const { profile, isManager, isPartner } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // State
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [activeTab, setActiveTab] = useState('my-entries');
  const [showEntryDialog, setShowEntryDialog] = useState(false);
  const [showRequestTimeDialog, setShowRequestTimeDialog] = useState(false);
  const [selectedEntries, setSelectedEntries] = useState<number[]>([]);
  
  // Timer state
  const [timer, setTimer] = useState<TimerState>({
    isRunning: false,
    jobId: null,
    taskId: null,
    startTime: null,
    description: '',
    elapsedSeconds: 0,
  });
  
  // Form state
  const [entryForm, setEntryForm] = useState({
    jobId: '',
    taskId: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    startTime: '',
    endTime: '',
    hours: 0,
    description: '',
    billable: true,
  });

  const [additionalTimeRequest, setAdditionalTimeRequest] = useState({
    jobId: '',
    additionalHours: 0,
    justification: '',
    billable: false,
  });

  // Calculate week range
  const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(selectedDate, { weekStartsOn: 1 });

  // Queries
  const { data: myJobsData, isLoading: jobsLoading } = useQuery({
    queryKey: ['my-assigned-jobs'],
    queryFn: () => jobsAPI.list({ status: ['in_progress', 'planned'] }),
  });

  const { data: timeEntriesData, isLoading: entriesLoading } = useQuery({
    queryKey: ['my-time-entries', format(weekStart, 'yyyy-MM-dd'), format(weekEnd, 'yyyy-MM-dd')],
    queryFn: () => timeEntriesAPI.list({
      dateFrom: format(weekStart, 'yyyy-MM-dd'),
      dateTo: format(weekEnd, 'yyyy-MM-dd'),
    }),
  });

  const { data: pendingApprovalsData } = useQuery({
    queryKey: ['pending-approvals'],
    queryFn: () => timeEntriesAPI.getPendingApprovals(),
    enabled: isManager || isPartner,
  });

  // Get jobs with budget info
  const myJobs = myJobsData?.data || [];
  const timeEntries = timeEntriesData?.data || [];
  const pendingApprovals = Array.isArray(pendingApprovalsData)
    ? pendingApprovalsData
    : pendingApprovalsData?.data || [];

  // Calculate budget info for each job
  const getJobBudgetInfo = useCallback((jobId: number): JobBudgetInfo => {
    const job = myJobs.find(j => j.id === jobId);
    if (!job) {
      return { jobId, allocatedHours: 0, usedHours: 0, remainingHours: 0, isBillableAvailable: false };
    }
    
    const jobEntries = timeEntries.filter(e => e.jobId === jobId);
    const usedHours = jobEntries
      .filter(e => e.status === 'approved' && e.billable)
      .reduce((sum, e) => sum + (e.hours || 0), 0);
    
    const allocatedHours = Number(job.budgetHours) || 0;
    const remainingHours = Math.max(0, allocatedHours - usedHours);
    
    return {
      jobId,
      allocatedHours,
      usedHours,
      remainingHours,
      isBillableAvailable: remainingHours > 0,
    };
  }, [myJobs, timeEntries]);

  // Mutations
  const createEntryMutation = useMutation({
    mutationFn: (data: any) => timeEntriesAPI.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-time-entries'] });
      setShowEntryDialog(false);
      resetEntryForm();
      toast({ title: 'Time entry created', description: 'Your time entry has been saved.' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const submitEntriesMutation = useMutation({
    mutationFn: (ids: number[]) => timeEntriesAPI.submitBulk(ids),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['my-time-entries'] });
      setSelectedEntries([]);
      toast({ 
        title: 'Entries submitted', 
        description: `${result.submitted} entries submitted for approval.` 
      });
    },
  });

  const approveEntriesMutation = useMutation({
    mutationFn: (ids: number[]) => timeEntriesAPI.approveBulk(ids),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['pending-approvals'] });
      queryClient.invalidateQueries({ queryKey: ['my-time-entries'] });
      toast({ 
        title: 'Entries approved', 
        description: `${result.approved} entries approved.` 
      });
    },
  });

  const requestApprovalMutation = useMutation({
    mutationFn: (payload: { jobId: number; additionalHours: number; justification: string; requestType?: string }) =>
      timeEntriesAPI.createApprovalRequest(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['approval-requests'] });
      setShowRequestTimeDialog(false);
      setAdditionalTimeRequest({
        jobId: '',
        additionalHours: 0,
        justification: '',
        billable: false,
      });
      toast({ title: 'Request sent', description: 'Additional hours request submitted for approval.' });
    },
    onError: (error: any) => {
      const message = error?.message || 'Unable to save time entry.';
      toast({ title: 'Error', description: message, variant: 'destructive' });
      if (message.toLowerCase().includes('allocation')) {
        if (entryForm.jobId) {
          setAdditionalTimeRequest((prev) => ({
            ...prev,
            jobId: entryForm.jobId,
          }));
          setShowRequestTimeDialog(true);
        }
      }
    },
  });

  // Timer functions
  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (timer.isRunning && timer.startTime) {
      interval = setInterval(() => {
        const elapsed = differenceInMinutes(new Date(), timer.startTime!) * 60;
        setTimer(prev => ({ ...prev, elapsedSeconds: elapsed }));
      }, 1000);
    }
    
    return () => clearInterval(interval);
  }, [timer.isRunning, timer.startTime]);

  const startTimer = (jobId: number, taskId?: number) => {
    setTimer({
      isRunning: true,
      jobId,
      taskId: taskId || null,
      startTime: new Date(),
      description: '',
      elapsedSeconds: 0,
    });
    toast({ title: 'Timer started', description: 'Tracking your time...' });
  };

  const stopTimer = () => {
    if (!timer.jobId || !timer.startTime) return;
    
    const hours = timer.elapsedSeconds / 3600;
    const budgetInfo = getJobBudgetInfo(timer.jobId);
    
    // Auto-set billable type based on budget
    const billable = budgetInfo.isBillableAvailable && hours <= budgetInfo.remainingHours;
    
    createEntryMutation.mutate({
      jobId: timer.jobId,
      taskId: timer.taskId || undefined,
      date: format(new Date(), 'yyyy-MM-dd'),
      hours: Math.round(hours * 100) / 100,
      description: timer.description,
      billable,
    });
    
    setTimer({
      isRunning: false,
      jobId: null,
      taskId: null,
      startTime: null,
      description: '',
      elapsedSeconds: 0,
    });
  };

  const formatTime = (seconds: number): string => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const resetEntryForm = () => {
    setEntryForm({
      jobId: '',
      taskId: '',
      date: format(new Date(), 'yyyy-MM-dd'),
      startTime: '',
      endTime: '',
      hours: 0,
      description: '',
      billable: true,
    });
  };

  const calculateHoursFromTime = (start: string, end: string): number => {
    if (!start || !end) return 0;
    const [startH, startM] = start.split(':').map(Number);
    const [endH, endM] = end.split(':').map(Number);
    let hours = endH - startH + (endM - startM) / 60;
    if (hours < 0) hours += 24;
    return Math.round(hours * 100) / 100;
  };

  const handleTimeChange = (field: 'startTime' | 'endTime', value: string) => {
    const newForm = { ...entryForm, [field]: value };
    if (newForm.startTime && newForm.endTime) {
      newForm.hours = calculateHoursFromTime(newForm.startTime, newForm.endTime);
    }
    setEntryForm(newForm);
  };

  const handleJobChange = (jobId: string) => {
    const budgetInfo = getJobBudgetInfo(Number(jobId));
    setEntryForm(prev => ({
      ...prev,
      jobId,
      taskId: '',
      // Auto-set billable based on budget availability
      billable: budgetInfo.isBillableAvailable,
    }));
  };

  const handleCreateEntry = () => {
    if (!entryForm.jobId || !entryForm.hours) {
      toast({ title: 'Error', description: 'Please select a job and enter hours.', variant: 'destructive' });
      return;
    }
    
    const budgetInfo = getJobBudgetInfo(Number(entryForm.jobId));
    const billable = entryForm.billable && budgetInfo.isBillableAvailable;
    
    createEntryMutation.mutate({
      jobId: Number(entryForm.jobId),
      taskId: entryForm.taskId ? Number(entryForm.taskId) : undefined,
      date: entryForm.date,
      hours: entryForm.hours,
      description: entryForm.description,
      billable,
    });
  };

  const handleRequestAdditionalTime = () => {
    if (!additionalTimeRequest.jobId) {
      toast({ title: 'Error', description: 'Select a job before requesting hours.', variant: 'destructive' });
      return;
    }
    if (!additionalTimeRequest.additionalHours || additionalTimeRequest.additionalHours <= 0) {
      toast({ title: 'Error', description: 'Enter the hours you need.', variant: 'destructive' });
      return;
    }
    if (!additionalTimeRequest.justification.trim()) {
      toast({ title: 'Error', description: 'Provide a justification for the request.', variant: 'destructive' });
      return;
    }

    requestApprovalMutation.mutate({
      jobId: Number(additionalTimeRequest.jobId),
      additionalHours: Number(additionalTimeRequest.additionalHours),
      justification: additionalTimeRequest.justification.trim(),
      requestType: additionalTimeRequest.billable ? 'billable' : 'non_billable',
    });
  };

  // Calculate weekly summary
  const weeklySummary = {
    totalHours: timeEntries.reduce((sum, e) => sum + (e.hours || 0), 0),
    billableHours: timeEntries
      .filter(e => e.billable)
      .reduce((sum, e) => sum + (e.hours || 0), 0),
    nonBillableHours: timeEntries
      .filter(e => !e.billable)
      .reduce((sum, e) => sum + (e.hours || 0), 0),
    pendingCount: timeEntries.filter(e => e.status === 'pending').length,
    submittedCount: timeEntries.filter(e => e.status === 'submitted').length,
    approvedCount: timeEntries.filter(e => e.status === 'approved').length,
  };

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Clock className="h-8 w-8 text-primary" />
              Timesheets
            </h1>
            <p className="text-muted-foreground mt-1">
              Track your time on assigned jobs
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowEntryDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Log Time
            </Button>
          </div>
        </div>

        {/* Timer Card */}
        <Card className={timer.isRunning ? 'border-green-500 bg-green-50' : ''}>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Timer className="h-5 w-5" />
              Quick Timer
            </CardTitle>
            <CardDescription>
              Start a timer to automatically track time on a job
            </CardDescription>
          </CardHeader>
          <CardContent>
            {timer.isRunning ? (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="text-3xl font-mono font-bold text-green-600">
                    {formatTime(timer.elapsedSeconds)}
                  </div>
                  <div>
                    <p className="font-medium">
                      {myJobs.find(j => j.id === timer.jobId)?.jobName || 'Job'}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {myJobs.find(j => j.id === timer.jobId)?.client?.clientName}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Input
                    placeholder="What are you working on?"
                    value={timer.description}
                    onChange={(e) => setTimer(prev => ({ ...prev, description: e.target.value }))}
                    className="w-64"
                  />
                  <Button variant="destructive" onClick={stopTimer}>
                    <Square className="h-4 w-4 mr-2" />
                    Stop & Save
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-4">
                <Select
                  value={entryForm.jobId}
                  onValueChange={handleJobChange}
                >
                  <SelectTrigger className="w-64">
                    <SelectValue placeholder="Select a job to track" />
                  </SelectTrigger>
                  <SelectContent>
                    {myJobs.map(job => (
                      <SelectItem key={job.id} value={String(job.id)}>
                        {job.jobCode} - {job.jobName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  onClick={() => entryForm.jobId && startTimer(Number(entryForm.jobId))}
                  disabled={!entryForm.jobId}
                >
                  <Play className="h-4 w-4 mr-2" />
                  Start Timer
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Weekly Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Hours
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{weeklySummary.totalHours.toFixed(1)}h</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Billable
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {weeklySummary.billableHours.toFixed(1)}h
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Non-Billable
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">
                {weeklySummary.nonBillableHours.toFixed(1)}h
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Pending
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-600">
                {weeklySummary.pendingCount}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Approved
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">
                {weeklySummary.approvedCount}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Week Navigation */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedDate(addDays(selectedDate, -7))}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Previous Week
              </Button>
              <div className="text-lg font-medium">
                {format(weekStart, 'MMM d')} - {format(weekEnd, 'MMM d, yyyy')}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedDate(addDays(selectedDate, 7))}
              >
                Next Week
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Main Content Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="my-entries">My Time Entries</TabsTrigger>
            <TabsTrigger value="by-job">By Job</TabsTrigger>
            {(isManager || isPartner) && (
              <TabsTrigger value="approvals">
                Pending Approvals
                {pendingApprovals.length > 0 && (
                  <Badge variant="destructive" className="ml-2">
                    {pendingApprovals.length}
                  </Badge>
                )}
              </TabsTrigger>
            )}
          </TabsList>

          {/* My Time Entries Tab */}
          <TabsContent value="my-entries" className="space-y-4">
            {/* Action Bar */}
            {selectedEntries.length > 0 && (
              <Card className="bg-blue-50 border-blue-200">
                <CardContent className="py-3 flex items-center justify-between">
                  <span>{selectedEntries.length} entries selected</span>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => submitEntriesMutation.mutate(selectedEntries)}
                      disabled={submitEntriesMutation.isPending}
                    >
                      {submitEntriesMutation.isPending ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4 mr-2" />
                      )}
                      Submit for Approval
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setSelectedEntries([])}
                    >
                      Clear Selection
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Time Entries Table */}
            <Card>
              <CardContent className="pt-6">
                {entriesLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : timeEntries.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No time entries for this week</p>
                    <Button
                      variant="outline"
                      className="mt-4"
                      onClick={() => setShowEntryDialog(true)}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Log Your First Entry
                    </Button>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">
                          <Checkbox
                            checked={selectedEntries.length === timeEntries.filter(e => e.status === 'pending').length}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setSelectedEntries(timeEntries.filter(e => e.status === 'pending').map(e => e.id));
                              } else {
                                setSelectedEntries([]);
                              }
                            }}
                          />
                        </TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Job</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead className="text-right">Hours</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {timeEntries.map((entry) => {
                        const StatusIcon = STATUS_ICONS[entry.status as keyof typeof STATUS_ICONS] || Clock;
                        return (
                          <TableRow key={entry.id}>
                            <TableCell>
                              {entry.status === 'pending' && (
                                <Checkbox
                                  checked={selectedEntries.includes(entry.id)}
                                  onCheckedChange={(checked) => {
                                    if (checked) {
                                      setSelectedEntries([...selectedEntries, entry.id]);
                                    } else {
                                      setSelectedEntries(selectedEntries.filter(id => id !== entry.id));
                                    }
                                  }}
                                />
                              )}
                            </TableCell>
                            <TableCell>
                              {format(parseISO(entry.date), 'EEE, MMM d')}
                            </TableCell>
                            <TableCell>
                              <div>
                                <p className="font-medium">{entry.job?.jobName}</p>
                                <p className="text-sm text-muted-foreground">
                                  {entry.job?.client?.clientName}
                                </p>
                              </div>
                            </TableCell>
                            <TableCell className="max-w-xs truncate">
                              {entry.description || '-'}
                            </TableCell>
                            <TableCell className="text-right font-medium">
                              {entry.hours?.toFixed(1)}h
                            </TableCell>
                            <TableCell>
                              <Badge variant={entry.billable ? 'default' : 'secondary'}>
                                {entry.billable ? 'Billable' : 'Non-Billable'}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge className={STATUS_COLORS[entry.status as keyof typeof STATUS_COLORS]}>
                                <StatusIcon className="h-3 w-3 mr-1" />
                                {entry.status}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* By Job Tab */}
          <TabsContent value="by-job" className="space-y-4">
            {myJobs.map(job => {
              const budgetInfo = getJobBudgetInfo(job.id);
              const jobEntries = timeEntries.filter(e => e.jobId === job.id);
              const jobTotalHours = jobEntries.reduce((sum, e) => sum + (e.hours || 0), 0);
              
              return (
                <Card key={job.id}>
                  <CardHeader>
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          <Briefcase className="h-5 w-5" />
                          {job.jobName}
                        </CardTitle>
                        <CardDescription>
                          {job.jobCode} • {job.client?.clientName}
                        </CardDescription>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-muted-foreground">Budget Progress</p>
                        <p className="font-medium">
                          {budgetInfo.usedHours.toFixed(1)} / {budgetInfo.allocatedHours}h
                        </p>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <Progress
                      value={(budgetInfo.usedHours / budgetInfo.allocatedHours) * 100}
                      className="mb-4"
                    />
                    <div className="grid grid-cols-4 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground">This Week</p>
                        <p className="font-medium">{jobTotalHours.toFixed(1)}h</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Remaining Billable</p>
                        <p className={`font-medium ${budgetInfo.remainingHours <= 0 ? 'text-red-600' : 'text-green-600'}`}>
                          {budgetInfo.remainingHours.toFixed(1)}h
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Status</p>
                        <Badge>{job.status}</Badge>
                      </div>
                      <div className="text-right">
                        {budgetInfo.remainingHours <= 0 ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setAdditionalTimeRequest({
                                jobId: String(job.id),
                                additionalHours: 0,
                                justification: '',
                                billable: false,
                              });
                              setShowRequestTimeDialog(true);
                            }}
                          >
                            <AlertTriangle className="h-4 w-4 mr-1" />
                            Request More Time
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            onClick={() => startTimer(job.id)}
                            disabled={timer.isRunning}
                          >
                            <Play className="h-4 w-4 mr-1" />
                            Start Timer
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </TabsContent>

          {/* Approvals Tab */}
          {(isManager || isPartner) && (
            <TabsContent value="approvals" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Pending Approvals</CardTitle>
                  <CardDescription>
                    Review and approve time entries from your team
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {pendingApprovals.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <CheckCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>No pending approvals</p>
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Employee</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>Job</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead className="text-right">Hours</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pendingApprovals.map((entry: any) => (
                          <TableRow key={entry.id}>
                            <TableCell>
                              {entry.employee?.firstName} {entry.employee?.lastName}
                            </TableCell>
                            <TableCell>
                              {format(parseISO(entry.date), 'MMM d')}
                            </TableCell>
                            <TableCell>{entry.job?.jobName}</TableCell>
                            <TableCell className="max-w-xs truncate">
                              {entry.description}
                            </TableCell>
                            <TableCell className="text-right font-medium">
                              {entry.hours?.toFixed(1)}h
                            </TableCell>
                            <TableCell>
                              <Badge variant={entry.billable ? 'default' : 'secondary'}>
                                {entry.billable ? 'Billable' : 'Non-Billable'}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-1">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => approveEntriesMutation.mutate([entry.id])}
                                >
                                  <CheckCircle className="h-4 w-4" />
                                </Button>
                                <Button size="sm" variant="outline" className="text-red-600">
                                  <XCircle className="h-4 w-4" />
                                </Button>
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
          )}
        </Tabs>

        {/* Log Time Dialog */}
        <Dialog open={showEntryDialog} onOpenChange={setShowEntryDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Log Time Entry</DialogTitle>
              <DialogDescription>
                Record time spent on a job or task
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Job *</Label>
                <Select value={entryForm.jobId} onValueChange={handleJobChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a job" />
                  </SelectTrigger>
                  <SelectContent>
                    {myJobs.map(job => {
                      const budgetInfo = getJobBudgetInfo(job.id);
                      return (
                        <SelectItem key={job.id} value={String(job.id)}>
                          <div className="flex items-center justify-between w-full">
                            <span>{job.jobCode} - {job.jobName}</span>
                            {budgetInfo.remainingHours <= 0 && (
                              <AlertCircle className="h-4 w-4 text-red-500 ml-2" />
                            )}
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                {entryForm.jobId && (
                  <div className="mt-2 text-sm">
                    {(() => {
                      const budgetInfo = getJobBudgetInfo(Number(entryForm.jobId));
                      return (
                        <div className={budgetInfo.remainingHours <= 0 ? 'text-red-600' : 'text-muted-foreground'}>
                          {budgetInfo.remainingHours <= 0 ? (
                            <span className="flex items-center gap-1">
                              <AlertTriangle className="h-4 w-4" />
                              Budget exhausted - entry will be non-billable
                            </span>
                          ) : (
                            <span>{budgetInfo.remainingHours.toFixed(1)}h billable remaining</span>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>

              <div>
                <Label>Date *</Label>
                <Input
                  type="date"
                  value={entryForm.date}
                  onChange={(e) => setEntryForm(prev => ({ ...prev, date: e.target.value }))}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Start Time</Label>
                  <Input
                    type="time"
                    value={entryForm.startTime}
                    onChange={(e) => handleTimeChange('startTime', e.target.value)}
                  />
                </div>
                <div>
                  <Label>End Time</Label>
                  <Input
                    type="time"
                    value={entryForm.endTime}
                    onChange={(e) => handleTimeChange('endTime', e.target.value)}
                  />
                </div>
              </div>

              <div>
                <Label>Hours *</Label>
                <Input
                  type="number"
                  step="0.25"
                  min="0"
                  value={entryForm.hours}
                  onChange={(e) => setEntryForm(prev => ({ ...prev, hours: Number(e.target.value) }))}
                />
              </div>

              <div>
                <Label>Description</Label>
                <Textarea
                  value={entryForm.description}
                  onChange={(e) => setEntryForm(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="What did you work on?"
                  rows={3}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label>Billable</Label>
                <Switch
                  checked={entryForm.billable}
                  onCheckedChange={(checked) => setEntryForm(prev => ({ ...prev, billable: checked }))}
                  disabled={entryForm.jobId && !getJobBudgetInfo(Number(entryForm.jobId)).isBillableAvailable}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowEntryDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateEntry} disabled={createEntryMutation.isPending}>
                {createEntryMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4 mr-2" />
                )}
                Save Entry
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Request Additional Time Dialog */}
        <Dialog open={showRequestTimeDialog} onOpenChange={setShowRequestTimeDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Request Additional Time</DialogTitle>
              <DialogDescription>
                Submit a request for additional hours on this job
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Hours Requested *</Label>
                <Input
                  type="number"
                  min="1"
                  value={additionalTimeRequest.additionalHours}
                  onChange={(e) => setAdditionalTimeRequest(prev => ({
                    ...prev,
                    additionalHours: Number(e.target.value)
                  }))}
                />
              </div>
              <div>
                <Label>Reason *</Label>
                <Textarea
                  value={additionalTimeRequest.justification}
                  onChange={(e) => setAdditionalTimeRequest(prev => ({
                    ...prev,
                    justification: e.target.value
                  }))}
                  placeholder="Why do you need additional time?"
                  rows={4}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label>Request as Billable</Label>
                <Switch
                  checked={additionalTimeRequest.billable}
                  onCheckedChange={(checked) => setAdditionalTimeRequest(prev => ({
                    ...prev,
                    billable: checked
                  }))}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowRequestTimeDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleRequestAdditionalTime} disabled={requestApprovalMutation.isPending}>
                {requestApprovalMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Send className="h-4 w-4 mr-2" />
                )}
                Submit Request
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}

