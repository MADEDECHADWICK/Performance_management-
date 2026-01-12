import { Router } from 'express';
import prisma from '../prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

// GET /manager/team-performance
// Get team performance metrics and individual employee data
router.get('/team-performance', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user?.sub ? Number(req.user.sub) : undefined;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { period = 'last_3_months', role = 'all' } = req.query;

    // Get manager's profile
    const userProfile = await prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true }
    });

    if (!userProfile?.profile) {
      return res.status(404).json({ error: 'User profile not found' });
    }

    // Get team members with performance data - simplified version
    const teamMembers = await prisma.profile.findMany({
      where: {
        manager_id: userProfile.profile.id
      },
      include: {
        role: true,
        department: true,
        performance_reviews: {
          take: 5,
          orderBy: { created_at: 'desc' }
        },
        time_entries: {
          where: {
            created_at: {
              gte: new Date(new Date().setMonth(new Date().getMonth() - 3))
            }
          }
        }
      }
    });

    // Transform to expected format
    const formattedMembers = teamMembers.map(member => ({
      id: member.id,
      name: `${member.first_name} ${member.last_name}`,
      role: member.role?.name || 'Unknown',
      position_level: member.position_level || 'associate',
      avatar: member.avatar,
      email: member.email,
      department: member.department?.name || 'Unknown',
      performance_score: member.performance_reviews.length > 0 
        ? member.performance_reviews.reduce((sum, r) => sum + (r.overall_score || 0), 0) / member.performance_reviews.length 
        : 75,
      utilization_rate: member.time_entries.length > 0 
        ? Math.min(100, (member.time_entries.reduce((sum, t) => sum + (t.hours_worked || 0), 0) / 40) * 100)
        : 75,
      billable_hours: member.time_entries.reduce((sum, t) => sum + (t.hours_worked || 0), 0),
      completed_projects: 0,
      kpi_completion: 0,
      recent_reviews: member.performance_reviews.length,
      goals_achieved: 0,
      total_goals: 0,
      certifications: 0,
      training_hours: 0,
      client_satisfaction: 4.2,
      peer_rating: 0,
      last_evaluation: member.performance_reviews.length > 0 
        ? member.performance_reviews[0].created_at.toISOString()
        : new Date().toISOString()
    }));

    // Calculate simple metrics
    const metrics = {
      team_size: formattedMembers.length,
      team_avg_performance: formattedMembers.length > 0 
        ? formattedMembers.reduce((sum, m) => sum + m.performance_score, 0) / formattedMembers.length 
        : 0,
      team_avg_utilization: formattedMembers.length > 0 
        ? formattedMembers.reduce((sum, m) => sum + m.utilization_rate, 0) / formattedMembers.length 
        : 0,
      total_billable_hours: formattedMembers.reduce((sum, m) => sum + m.billable_hours, 0),
      active_projects: 5,
      completed_evaluations: formattedMembers.reduce((sum, m) => sum + m.recent_reviews, 0),
      pending_evaluations: 3,
      improvement_needed: formattedMembers.filter(m => m.performance_score < 70).length,
      high_performers: formattedMembers.filter(m => m.performance_score >= 90).length
    };

    res.json({
      team_members: formattedMembers,
      metrics: metrics
    });

  } catch (error) {
    console.error('Error fetching team performance:', error);
    res.status(500).json({ error: 'Failed to fetch team performance' });
  }
});

// GET /manager/training-records
// Get training records for team members
router.get('/training-records', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user?.sub ? Number(req.user.sub) : undefined;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { employee = 'all' } = req.query;

    // Get manager's profile
    const userProfile = await prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true }
    });

    if (!userProfile?.profile) {
      return res.status(404).json({ error: 'User profile not found' });
    }

    // Mock training records - in a real implementation, you'd have a TrainingRecord table
    const trainingRecords = [
      {
        id: 1,
        employee_id: 1,
        employee_name: "John Smith",
        course_name: "Advanced Excel for Auditors",
        training_type: "external",
        status: "completed",
        start_date: "2026-01-01",
        end_date: "2026-01-15",
        provider: "Excel Masters Inc",
        cost: 15000,
        completion_percentage: 100,
        certificate_url: "#",
        notes: "Excellent performance"
      },
      {
        id: 2,
        employee_id: 2,
        employee_name: "Sarah Johnson",
        course_name: "Tax Law Updates 2026",
        training_type: "certification",
        status: "in_progress",
        start_date: "2026-01-05",
        end_date: "2026-02-05",
        provider: "ICPAK",
        cost: 25000,
        completion_percentage: 65,
        notes: "Making good progress"
      }
    ];

    res.json(trainingRecords);

  } catch (error) {
    console.error('Error fetching training records:', error);
    res.status(500).json({ error: 'Failed to fetch training records' });
  }
});

// GET /manager/certifications
// Get certification records for team members
router.get('/certifications', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user?.sub ? Number(req.user.sub) : undefined;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    // Mock certification data
    const certifications = [
      {
        id: 1,
        employee_id: 1,
        employee_name: "John Smith",
        certification_name: "Certified Public Accountant (CPA)",
        issuing_organization: "ICPAK",
        issue_date: "2025-06-01",
        expiry_date: "2028-06-01",
        status: "active",
        certificate_number: "CPA-2025-001234",
        verification_url: "https://icpak.com/verify/CPA-2025-001234"
      },
      {
        id: 2,
        employee_id: 2,
        employee_name: "Sarah Johnson",
        certification_name: "Certified Internal Auditor (CIA)",
        issuing_organization: "IIA",
        issue_date: "2024-12-15",
        expiry_date: "2026-12-15",
        status: "expiring_soon",
        certificate_number: "CIA-2024-567890",
        verification_url: "https://iia.org/verify/CIA-2024-567890"
      }
    ];

    res.json(certifications);

  } catch (error) {
    console.error('Error fetching certifications:', error);
    res.status(500).json({ error: 'Failed to fetch certifications' });
  }
});

// GET /manager/skill-assessments
// Get skill assessment records for team members
router.get('/skill-assessments', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user?.sub ? Number(req.user.sub) : undefined;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    // Mock skill assessment data
    const skillAssessments = [
      {
        id: 1,
        employee_id: 1,
        employee_name: "John Smith",
        skill_category: "Technical Skills",
        skill_name: "Excel Proficiency",
        current_level: 4,
        target_level: 5,
        assessment_date: "2026-01-01",
        assessor_name: "Manager Name",
        notes: "Strong analytical skills, needs advanced pivot table training"
      },
      {
        id: 2,
        employee_id: 2,
        employee_name: "Sarah Johnson",
        skill_category: "Communication",
        skill_name: "Client Presentations",
        current_level: 3,
        target_level: 4,
        assessment_date: "2025-12-15",
        assessor_name: "Senior Partner",
        notes: "Good foundation, needs confidence building in large group settings"
      }
    ];

    res.json(skillAssessments);

  } catch (error) {
    console.error('Error fetching skill assessments:', error);
    res.status(500).json({ error: 'Failed to fetch skill assessments' });
  }
});

// GET /manager/development-goals
// Get development goals for team members
router.get('/development-goals', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user?.sub ? Number(req.user.sub) : undefined;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    // Mock development goals data
    const developmentGoals = [
      {
        id: 1,
        employee_id: 1,
        employee_name: "John Smith",
        goal_title: "Obtain CPA Certification",
        goal_description: "Complete CPA examination and certification process",
        target_completion: "2026-12-31",
        current_progress: 75,
        status: "active",
        assigned_mentor: "Senior Manager",
        created_date: "2025-06-01"
      },
      {
        id: 2,
        employee_id: 2,
        employee_name: "Sarah Johnson",
        goal_title: "Lead Client Presentation Skills",
        goal_description: "Develop confidence and skills for leading client presentations",
        target_completion: "2026-06-30",
        current_progress: 45,
        status: "active",
        assigned_mentor: "Partner",
        created_date: "2025-12-01"
      }
    ];

    res.json(developmentGoals);

  } catch (error) {
    console.error('Error fetching development goals:', error);
    res.status(500).json({ error: 'Failed to fetch development goals' });
  }
});

// GET /manager/development-metrics
// Get staff development overview metrics
router.get('/development-metrics', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user?.sub ? Number(req.user.sub) : undefined;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    // Mock metrics - in real implementation, calculate from actual data
    const metrics = {
      total_employees: 8,
      active_training: 3,
      completed_courses: 12,
      certifications_expiring: 2,
      avg_skill_level: 3.8,
      training_budget_used: 180000,
      training_budget_total: 300000,
      development_goals_completed: 5
    };

    res.json(metrics);

  } catch (error) {
    console.error('Error fetching development metrics:', error);
    res.status(500).json({ error: 'Failed to fetch development metrics' });
  }
});

// GET /manager/workload-analysis
// Get workload analysis for team members
router.get('/workload-analysis', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user?.sub ? Number(req.user.sub) : undefined;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { period = 'current_week' } = req.query;

    // Get manager's profile
    const userProfile = await prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true }
    });

    if (!userProfile?.profile) {
      return res.status(404).json({ error: 'User profile not found' });
    }

    // Get workload data for team members using Prisma ORM
    const teamMembers = await prisma.profile.findMany({
      where: {
        manager_id: userProfile.profile.id
      },
      include: {
        role: true,
        time_entries: {
          where: {
            created_at: {
              gte: new Date(new Date().setDate(new Date().getDate() - 7)) // Last week
            }
          }
        },
        job_staff_assignments: {
          where: {
            status: 'active'
          },
          include: {
            job: true
          }
        }
      }
    });

    const workloadData = teamMembers.map(member => {
      const totalHours = member.time_entries.reduce((sum, te) => sum + (te.hours_worked || 0), 0);
      const capacity = Math.min(150, (totalHours / 40) * 100);
      const activeProjects = member.job_staff_assignments.length;
      const upcomingDeadlines = member.job_staff_assignments.filter(jsa => {
        const deadline = new Date(jsa.job.deadline);
        const weekFromNow = new Date();
        weekFromNow.setDate(weekFromNow.getDate() + 7);
        return deadline <= weekFromNow && deadline > new Date();
      }).length;
      
      const overdueTasks = member.job_staff_assignments.filter(jsa => {
        return new Date(jsa.job.deadline) < new Date();
      }).length;

      return {
        employee_id: member.id,
        employee_name: `${member.first_name} ${member.last_name}`,
        role: member.role?.name || 'Unknown',
        position_level: member.position_level || 'associate',
        avatar: member.avatar,
        current_capacity: capacity,
        allocated_hours: totalHours,
        available_hours: Math.max(0, 40 - totalHours),
        utilization_rate: Math.min(100, (totalHours / 40) * 100),
        active_projects: activeProjects,
        upcoming_deadlines: upcomingDeadlines,
        overdue_tasks: overdueTasks,
        workload_status: capacity > 100 ? 'critical' : 
                        capacity > 85 ? 'overloaded' : 
                        capacity > 60 ? 'optimal' : 'underutilized',
        weekly_hours: [40, 42, 38, 45, 41, 39, 37], // Mock weekly hours for chart
        stress_indicators: {
          missed_deadlines: overdueTasks,
          overtime_hours: Math.max(0, totalHours - 40),
          quality_scores: [85, 87, 82, 90, 88] // Mock quality scores
        }
      };
    });

    res.json(workloadData);

  } catch (error) {
    console.error('Error fetching workload analysis:', error);
    res.status(500).json({ error: 'Failed to fetch workload analysis' });
  }
});

// GET /manager/workload-metrics
// Get overall workload metrics
router.get('/workload-metrics', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user?.sub ? Number(req.user.sub) : undefined;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    // Get manager's profile
    // Get manager's profile
    const userProfile = await prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true }
    });

    if (!userProfile?.profile) {
      return res.status(404).json({ error: 'User profile not found' });
    }

    // Calculate simple metrics based on team size
    const teamCount = await prisma.profile.count({
      where: { manager_id: userProfile.profile.id }
    });

    const metrics = {
      total_team_members: teamCount,
      avg_utilization: 78.5,
      overloaded_employees: Math.ceil(teamCount * 0.15),
      underutilized_employees: Math.ceil(teamCount * 0.10),
      critical_deadlines: 4,
      capacity_variance: 15.2,
      burnout_risk: Math.ceil(teamCount * 0.05)
    };

    res.json(metrics);

  } catch (error) {
    console.error('Error fetching workload metrics:', error);
    res.status(500).json({ error: 'Failed to fetch workload metrics' });
  }
});

// GET /manager/project-assignments
// Get current project assignments
router.get('/project-assignments', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user?.sub ? Number(req.user.sub) : undefined;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    // Get manager's profile
    const userProfile = await prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true }
    });

    if (!userProfile?.profile) {
      return res.status(404).json({ error: 'User profile not found' });
    }

    // Get project assignments using Prisma ORM
    const assignments = await prisma.jobStaffAssignment.findMany({
      where: {
        status: 'active',
        employee: {
          manager_id: userProfile.profile.id
        }
      },
      include: {
        job: {
          include: {
            client: true
          }
        },
        employee: true
      }
    });

    const projectAssignments = assignments.map(assignment => ({
      id: assignment.id,
      project_name: assignment.job.title,
      client_name: assignment.job.client.name,
      employee_id: assignment.employee_id,
      employee_name: `${assignment.employee.first_name} ${assignment.employee.last_name}`,
      role_in_project: assignment.role || 'Team Member',
      allocated_hours: assignment.allocated_hours || 40,
      deadline: assignment.job.deadline,
      priority: assignment.job.priority || 'medium',
      completion_percentage: assignment.job.completion_percentage || 0,
      estimated_remaining_hours: Math.max(0, (assignment.allocated_hours || 40) * (1 - (assignment.job.completion_percentage || 0) / 100))
    }));

    res.json(projectAssignments);

  } catch (error) {
    console.error('Error fetching project assignments:', error);
    res.status(500).json({ error: 'Failed to fetch project assignments' });
  }
});

// GET /manager/capacity-recommendations
// Get AI-powered workload optimization recommendations
router.get('/capacity-recommendations', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user?.sub ? Number(req.user.sub) : undefined;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    // Mock AI recommendations - in real implementation, this would use ML algorithms
    const recommendations = [
      {
        type: 'redistribute',
        priority: 'high',
        description: 'John Smith is at 120% capacity. Consider redistributing 2 projects to Sarah Johnson who is at 65% capacity.',
        affected_employees: ['John Smith', 'Sarah Johnson'],
        impact_score: 85
      },
      {
        type: 'deadline_extension',
        priority: 'medium',
        description: 'Project Alpha deadline may be too aggressive given current team capacity. Consider extending by 1 week.',
        affected_employees: ['John Smith', 'Mike Wilson'],
        impact_score: 70
      },
      {
        type: 'training',
        priority: 'low',
        description: 'Team members with Excel training show 25% higher efficiency. Schedule training for junior staff.',
        affected_employees: ['Junior Staff'],
        impact_score: 60
      }
    ];

    res.json(recommendations);

  } catch (error) {
    console.error('Error fetching capacity recommendations:', error);
    res.status(500).json({ error: 'Failed to fetch capacity recommendations' });
  }
});

// POST /manager/training-records
// Create a new training record
router.post('/training-records', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user?.sub ? Number(req.user.sub) : undefined;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { employee_id, course_name, training_type, start_date, provider, cost, notes } = req.body;

    // In a real implementation, you would create a TrainingRecord entry
    // For now, return success response
    res.json({ 
      id: Math.floor(Math.random() * 1000),
      message: 'Training scheduled successfully',
      ...req.body 
    });

  } catch (error) {
    console.error('Error creating training record:', error);
    res.status(500).json({ error: 'Failed to create training record' });
  }
});

// POST /manager/redistribute-workload
// Redistribute workload between team members
router.post('/redistribute-workload', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user?.sub ? Number(req.user.sub) : undefined;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { from_employee_id, to_employee_id, project_id } = req.body;

    // In a real implementation, you would update job assignments
    // For now, return success response
    res.json({ 
      message: 'Workload redistributed successfully',
      from_employee_id,
      to_employee_id,
      project_id
    });

  } catch (error) {
    console.error('Error redistributing workload:', error);
    res.status(500).json({ error: 'Failed to redistribute workload' });
  }
});

export default router;