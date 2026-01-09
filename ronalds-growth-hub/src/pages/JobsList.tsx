import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { apiFetch } from '@/integrations/apiClient';
import { JobCreationWizard } from '@/components/JobCreationWizard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, Search } from 'lucide-react';

interface Job {
  id: number;
  title: string;
  client: string;
  description?: string;
  start_date: string;
  end_date: string;
  status: string;
  billing_type: string;
  total_hours?: number;
  total_revenue?: number;
  staff_count?: number;
  total_hourly_rate?: number;
}

export default function JobsList() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [showWizard, setShowWizard] = useState(false);

  useEffect(() => {
    loadJobs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadJobs = async () => {
    try {
      setLoading(true);
      const data = await apiFetch('GET', '/jobs');
      setJobs(Array.isArray(data) ? data : []);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load jobs';
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const filteredJobs = jobs.filter(job => {
    const matchesSearch = 
      job.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      job.client.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = filterStatus === 'all' || job.status === filterStatus;
    
    return matchesSearch && matchesStatus;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800';
      case 'completed':
        return 'bg-blue-100 text-blue-800';
      case 'cancelled':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return (
      <div className="p-6 text-center">
        <p className="text-gray-600">Loading jobs...</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Jobs</h1>
          <p className="text-gray-600 text-sm mt-1">{filteredJobs.length} of {jobs.length} jobs</p>
        </div>
        <Button
          onClick={() => setShowWizard(true)}
          className="bg-blue-600 hover:bg-blue-700"
        >
          <Plus className="h-4 w-4 mr-2" />
          New Job
        </Button>
      </div>

      {/* Search and Filter */}
      <div className="flex gap-4 flex-col sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            type="search"
            placeholder="Search jobs by title or client..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>

        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="border border-gray-300 rounded px-3 py-2 text-sm"
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      {/* Jobs Grid */}
      {filteredJobs.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredJobs.map(job => (
            <Card
              key={job.id}
              className="cursor-pointer hover:shadow-lg transition-shadow"
              onClick={() => navigate(`/jobs/${job.id}`)}
            >
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start gap-4">
                  <div className="flex-1">
                    <CardTitle className="text-lg">{job.title}</CardTitle>
                    <CardDescription className="text-sm mt-1">{job.client}</CardDescription>
                  </div>
                  <Badge className={`${getStatusColor(job.status)} text-xs whitespace-nowrap`}>
                    {job.status}
                  </Badge>
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                {/* Job Description */}
                {job.description && (
                  <p className="text-sm text-gray-600 line-clamp-2">
                    {job.description}
                  </p>
                )}

                {/* Dates and Billing */}
                <div className="text-xs text-gray-600 space-y-1">
                  {job.start_date && (
                    <p>
                      <span className="font-medium">Start:</span>{' '}
                      {new Date(job.start_date).toLocaleDateString()}
                    </p>
                  )}
                  {job.end_date && (
                    <p>
                      <span className="font-medium">End:</span>{' '}
                      {new Date(job.end_date).toLocaleDateString()}
                    </p>
                  )}
                  {job.billing_type && (
                    <p>
                      <span className="font-medium">Type:</span> {job.billing_type}
                    </p>
                  )}
                </div>

                {/* Staff Count and Rates */}
                <div className="border-t pt-3 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">Staff Assigned</span>
                    <Badge variant="outline" className="bg-blue-50">
                      {job.staff_count || 0}
                    </Badge>
                  </div>

                  {job.total_hourly_rate && job.total_hourly_rate > 0 && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">Total Rate</span>
                      <span className="font-mono font-semibold">
                        {job.total_hourly_rate.toLocaleString()} KES/hr
                      </span>
                    </div>
                  )}
                </div>

                {/* Click Hint */}
                <div className="text-xs text-blue-600 font-medium mt-3">
                  Click to view details →
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-gray-600 mb-4">
              {searchTerm || filterStatus !== 'all'
                ? 'No jobs match your search criteria'
                : 'No jobs created yet'}
            </p>
            <Button
              onClick={() => setShowWizard(true)}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Plus className="h-4 w-4 mr-2" />
              Create Your First Job
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Job Creation Wizard */}
      <JobCreationWizard
        isOpen={showWizard}
        onClose={() => setShowWizard(false)}
        onSuccess={loadJobs}
      />
    </div>
  );
}
