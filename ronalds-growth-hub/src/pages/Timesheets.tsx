import { useState, useEffect } from "react";
import apiFetch, { authAPI } from "@/integrations/apiClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Clock, CheckCircle, XCircle } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { format } from "date-fns";

interface Project {
  id: string;
  project_name: string;
  project_code: string;
}

interface Job {
  id: string;
  title: string;
  job_number: string | null;
  client_id: string | null;
  due_date: string | null;
  billable_hours: number | null;
  clients?: { client_name: string };
}

interface WorkLog {
  id: string;
  date_worked: string;
  hours_worked: number;
  task_description: string;
  billable: boolean;
  status: string;
  project_id: string;
  activity_type: string;
  projects?: {
    project_name: string;
    project_code: string;
  };
  jobs?: {
    title: string;
    job_number: string | null;
  };
}

const Timesheets = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [workLogs, setWorkLogs] = useState<WorkLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    activity_type: "job",
    job_id: "",
    date_worked: format(new Date(), "yyyy-MM-dd"),
    start_time: "",
    end_time: "",
    hours_worked: 0,
    task_description: "",
    billable: true,
  });

  useEffect(() => {
    loadData();
  }, []);

  // Calculate hours from start and end time
  const calculateHours = (startTime: string, endTime: string) => {
    if (!startTime || !endTime) return 0;
    
    // Remove seconds if present (HH:MM:SS -> HH:MM)
    const cleanStart = startTime.substring(0, 5);
    const cleanEnd = endTime.substring(0, 5);
    
    const [startHour, startMin] = cleanStart.split(":").map(Number);
    const [endHour, endMin] = endTime.substring(0, 5).split(":").map(Number);
    
    let hours = endHour - startHour;
    let minutes = endMin - startMin;
    
    // Handle negative minutes
    if (minutes < 0) {
      hours -= 1;
      minutes += 60;
    }
    
    // Handle crossing midnight (overnight work)
    if (hours < 0) {
      hours += 24;
    }
    
    const totalHours = hours + minutes / 60;
    // Round to 2 decimal places to avoid floating point issues
    return Math.round(totalHours * 100) / 100;
  };

  // Format decimal hours to "Xh Ym" format
  const formatHoursMinutes = (decimalHours: number) => {
    if (!decimalHours || decimalHours === 0) return "0h 0m";
    
    const hours = Math.floor(decimalHours);
    const minutes = Math.round((decimalHours - hours) * 60);
    
    return `${hours}h ${minutes}m`;
  };

  // Update hours when start or end time changes
  const handleTimeChange = (field: "start_time" | "end_time", value: string) => {
    const newFormData = { ...formData, [field]: value };
    
    if (field === "start_time" && newFormData.end_time) {
      newFormData.hours_worked = calculateHours(value, newFormData.end_time);
    } else if (field === "end_time" && newFormData.start_time) {
      newFormData.hours_worked = calculateHours(newFormData.start_time, value);
    }
    
    setFormData(newFormData);
  };

  // Handle activity type change
  const handleActivityTypeChange = (value: string) => {
    const newFormData = { ...formData, activity_type: value };
    
    // Auto-set billable based on activity type
    if (value === "training" || value === "holiday" || value === "sick_leave") {
      newFormData.billable = false;
    } else if (value === "job") {
      newFormData.billable = true;
    }
    
    // Clear job field for non-job activities
    if (value !== "job") {
      newFormData.job_id = "";
    }
    
    setFormData(newFormData);
  };

  const loadData = async () => {
    try {
      const me = await authAPI.me();
      if (!me) return;

      const projectsData = await apiFetch('GET', '/projects?status=active');
      setProjects(projectsData || []);

      const jobsData = await apiFetch('GET', `/jobs?assigned_to=${me.id}`);
      setJobs(jobsData || []);

      const logsData = await apiFetch('GET', `/work_logs?employeeId=${me.id}&limit=50`);
      setWorkLogs(logsData || []);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const me = await authAPI.me();
      if (!me) return;

      await apiFetch('POST', '/work_logs', { ...formData, employee_id: me.id, job_id: formData.job_id || null, project_id: null });

      toast({ title: 'Success', description: 'Time entry added successfully' });
      setDialogOpen(false);
      setFormData({ activity_type: 'job', job_id: '', date_worked: format(new Date(), 'yyyy-MM-dd'), start_time: '', end_time: '', hours_worked: 0, task_description: '', billable: true });
      loadData();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const getTotalHours = (status?: string) => {
    return workLogs
      .filter(log => !status || log.status === status)
      .reduce((sum, log) => sum + Number(log.hours_worked), 0);
  };

  const getBillableHours = () => {
    return workLogs
      .filter(log => log.billable)
      .reduce((sum, log) => sum + Number(log.hours_worked), 0);
  };

  const getNonBillableHours = () => {
    return workLogs
      .filter(log => !log.billable)
      .reduce((sum, log) => sum + Number(log.hours_worked), 0);
  };

  const getHoursByActivityType = (activityType: string) => {
    return workLogs
      .filter(log => log.activity_type === activityType)
      .reduce((sum, log) => sum + Number(log.hours_worked), 0);
  };

  const getActivityTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      job: "Job",
      training: "Training",
      holiday: "Holiday",
      sick_leave: "Sick Leave",
      other: "Other"
    };
    return labels[type] || type;
  };

  const getActivityTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      job: "bg-primary/10 text-primary",
      training: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
      holiday: "bg-green-500/10 text-green-600 dark:text-green-400",
      sick_leave: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
      other: "bg-gray-500/10 text-gray-600 dark:text-gray-400"
    };
    return colors[type] || colors.other;
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Time Tracking</h1>
            <p className="text-muted-foreground">Log billable hours and project time</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Log Time
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Log Time Entry</DialogTitle>
                <DialogDescription>Record time spent on a project</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="activity_type">Activity Type</Label>
                  <Select
                    value={formData.activity_type}
                    onValueChange={handleActivityTypeChange}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select activity type" />
                    </SelectTrigger>
                    <SelectContent className="z-50">
                      <SelectItem value="job">Job - Client Work</SelectItem>
                      <SelectItem value="training">Training - Professional Development</SelectItem>
                      <SelectItem value="holiday">Holiday - Paid Leave</SelectItem>
                      <SelectItem value="sick_leave">Sick Leave</SelectItem>
                      <SelectItem value="other">Other Activities</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {formData.activity_type === "job" && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="job">Job (Optional)</Label>
                      <Select
                        value={formData.job_id}
                        onValueChange={(value) => setFormData({ ...formData, job_id: value === "none" ? "" : value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select a job" />
                        </SelectTrigger>
                        <SelectContent className="z-50">
                          <SelectItem value="none">None - General time</SelectItem>
                          {jobs.map((job) => (
                            <SelectItem key={job.id} value={job.id}>
                              {job.job_number ? `${job.job_number} - ` : ""}{job.title}
                              {job.clients && ` (${job.clients.client_name})`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {formData.job_id && jobs.find(j => j.id === formData.job_id) && (
                        <p className="text-xs text-muted-foreground">
                          {jobs.find(j => j.id === formData.job_id)?.due_date && 
                            `Due: ${format(new Date(jobs.find(j => j.id === formData.job_id)!.due_date!), "MMM dd, yyyy")} • `}
                          Est. Hours: {jobs.find(j => j.id === formData.job_id)?.billable_hours || "N/A"}
                        </p>
                      )}
                    </div>
                  </>
                )}

                <div className="space-y-2">
                  <Label htmlFor="date">Date</Label>
                  <Input
                    id="date"
                    type="date"
                    value={formData.date_worked}
                    onChange={(e) => setFormData({ ...formData, date_worked: e.target.value })}
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="start_time">Start Time</Label>
                    <Input
                      id="start_time"
                      type="time"
                      step="60"
                      value={formData.start_time}
                      onChange={(e) => handleTimeChange("start_time", e.target.value)}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="end_time">End Time</Label>
                    <Input
                      id="end_time"
                      type="time"
                      step="60"
                      value={formData.end_time}
                      onChange={(e) => handleTimeChange("end_time", e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="hours">Hours Worked (Auto-calculated)</Label>
                  <div className="relative">
                    <Input
                      id="hours"
                      type="text"
                      value={formatHoursMinutes(formData.hours_worked)}
                      readOnly
                      className="bg-muted/50 cursor-not-allowed text-lg font-semibold"
                    />
                    {/* Hidden input for form submission with decimal value */}
                    <input
                      type="hidden"
                      name="hours_worked"
                      value={formData.hours_worked}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Automatically calculated from start and end time
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">
                    {formData.activity_type === "job" ? "Task Description" : "Remarks/Notes"}
                  </Label>
                  <Textarea
                    id="description"
                    value={formData.task_description}
                    onChange={(e) => setFormData({ ...formData, task_description: e.target.value })}
                    rows={3}
                    placeholder={
                      formData.activity_type === "job" 
                        ? "Describe what you worked on..." 
                        : "Add any relevant notes or details..."
                    }
                  />
                </div>

                {formData.activity_type === "job" && (
                  <div className="space-y-2">
                    <Label htmlFor="billable">Billable</Label>
                    <Select
                      value={formData.billable.toString()}
                      onValueChange={(value) => setFormData({ ...formData, billable: value === "true" })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="true">Yes - Billable</SelectItem>
                        <SelectItem value="false">No - Non-billable</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {(formData.activity_type === "holiday" || formData.activity_type === "sick_leave") && (
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="text-sm text-muted-foreground">
                      ℹ️ {getActivityTypeLabel(formData.activity_type)} entries are automatically marked as non-billable.
                    </p>
                  </div>
                )}

                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit">Log Time</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Total Hours</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">{getTotalHours().toFixed(2)}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Billable Hours</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-success">{getBillableHours().toFixed(2)}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Non-Billable Hours</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-muted-foreground">{getNonBillableHours().toFixed(2)}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Pending Approval</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-warning">{getTotalHours("pending").toFixed(2)}</div>
            </CardContent>
          </Card>
        </div>

        {/* Activity Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle>Activity Breakdown</CardTitle>
            <CardDescription>Time distribution by activity type</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {["job", "training", "holiday", "sick_leave", "other"].map((type) => {
                const hours = getHoursByActivityType(type);
                if (hours === 0) return null;
                return (
                  <div key={type} className="flex flex-col items-center p-3 rounded-lg bg-muted/50">
                    <span className="text-xs text-muted-foreground mb-1">{getActivityTypeLabel(type)}</span>
                    <span className="text-xl font-bold text-foreground">{hours.toFixed(1)}h</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Time Entries */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Time Entries</CardTitle>
            <CardDescription>Your logged work hours and project time</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {workLogs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Clock className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No time entries yet</p>
                  <p className="text-sm text-muted-foreground">Click "Log Time" to record your first entry</p>
                </div>
              ) : (
                workLogs.map((log) => (
                  <div key={log.id} className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${getActivityTypeColor(log.activity_type)}`}>
                          {getActivityTypeLabel(log.activity_type)}
                        </span>
                        {log.activity_type === "job" && (
                          <>
                            {log.jobs && (
                              <h3 className="font-semibold text-foreground">
                                {log.jobs.job_number ? `${log.jobs.job_number} - ` : ""}{log.jobs.title}
                              </h3>
                            )}
                            {log.projects && (
                              <>
                                <span className="text-xs text-muted-foreground">•</span>
                                <span className="text-sm text-muted-foreground">
                                  {log.projects.project_code}
                                </span>
                              </>
                            )}
                          </>
                        )}
                        {log.billable && (
                          <span className="text-xs px-2 py-1 rounded-full bg-success/10 text-success">
                            Billable
                          </span>
                        )}
                      </div>
                      {log.task_description && (
                        <p className="text-sm text-muted-foreground mt-1">{log.task_description}</p>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">
                        {format(new Date(log.date_worked), "MMM dd, yyyy")}
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className="text-lg font-bold text-primary">{log.hours_worked}h</div>
                        <div className="flex items-center gap-1 text-xs">
                          {log.status === "approved" ? (
                            <>
                              <CheckCircle className="h-3 w-3 text-success" />
                              <span className="text-success">Approved</span>
                            </>
                          ) : log.status === "rejected" ? (
                            <>
                              <XCircle className="h-3 w-3 text-destructive" />
                              <span className="text-destructive">Rejected</span>
                            </>
                          ) : (
                            <>
                              <Clock className="h-3 w-3 text-warning" />
                              <span className="text-warning">Pending</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Timesheets;