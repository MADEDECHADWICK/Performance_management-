import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import nodemailer from 'nodemailer';

const router = express.Router();
const prisma = new PrismaClient();

// Email configuration for notifications
const emailTransporter = nodemailer.createTransporter({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

// Job workflow stages
const WORKFLOW_STAGES = {
  DRAFT: 'draft',
  PARTNER_REVIEW: 'partner_review',
  MANAGER_ASSIGNMENT: 'manager_assignment',
  TEAM_ASSIGNMENT: 'team_assignment',
  IN_PROGRESS: 'in_progress',
  PARTNER_REVIEW_FINAL: 'partner_review_final',
  CLIENT_DELIVERY: 'client_delivery',
  COMPLETED: 'completed',
  ON_HOLD: 'on_hold',
  CANCELLED: 'cancelled'
};

// Service type configurations for professional services
const SERVICE_CONFIGURATIONS = {
  audit: {
    name: 'Audit & Assurance',
    requiredDeliverables: [
      'Management Letter',
      'Audited Financial Statements',
      'Audit Completion Report',
      'Internal Control Letter'
    ],
    standardWorkflowSteps: [
      'Planning and Risk Assessment',
      'Interim Audit Procedures',
      'Year-End Audit Testing',
      'Final Review and Clearance',
      'Reporting and Communication'
    ],
    regulatoryCompliance: ['ISA Standards', 'ICPAK Guidelines', 'Companies Act 2015']
  },
  tax: {
    name: 'Tax Services',
    requiredDeliverables: [
      'Tax Computation',
      'Tax Returns Filed',
      'Tax Clearance Certificate',
      'Advisory Report'
    ],
    standardWorkflowSteps: [
      'Data Collection and Review',
      'Tax Position Analysis',
      'Return Preparation',
      'Review and Approval',
      'Filing and Documentation'
    ],
    regulatoryCompliance: ['Income Tax Act', 'VAT Act', 'KRA Guidelines']
  },
  advisory: {
    name: 'Advisory Services',
    requiredDeliverables: [
      'Analysis Report',
      'Recommendations Document',
      'Implementation Roadmap',
      'Executive Summary'
    ],
    standardWorkflowSteps: [
      'Situation Analysis',
      'Data Gathering',
      'Analysis and Evaluation',
      'Solution Development',
      'Presentation and Handover'
    ],
    regulatoryCompliance: ['Professional Standards', 'Industry Guidelines']
  },
  consulting: {
    name: 'Management Consulting',
    requiredDeliverables: [
      'Current State Assessment',
      'Future State Design',
      'Implementation Plan',
      'Change Management Strategy'
    ],
    standardWorkflowSteps: [
      'Project Initiation',
      'Discovery and Analysis',
      'Solution Design',
      'Implementation Support',
      'Knowledge Transfer'
    ],
    regulatoryCompliance: ['Professional Standards', 'Change Management Best Practices']
  }
};

// POST /admin/jobs/create-with-workflow
// Comprehensive job creation with automated workflow initiation
router.post('/create-with-workflow', authMiddleware, async (req: AuthRequest, res) => {
  const transaction = await prisma.$transaction(async (prisma) => {
    try {
      const userId = req.user?.sub ? Number(req.user.sub) : undefined;
      if (!userId) throw new Error('Unauthorized');

      console.log('🚀 Creating comprehensive job with workflow for user:', userId);

      const {
        title,
        description,
        serviceType,
        serviceSubtype,
        priority,
        clientId,
        departmentId,
        partnerId,
        managerId,
        startDate,
        dueDate,
        estimatedHours,
        budgetAmount,
        billingType,
        currencyCode = 'KES',
        taxRate = 16,
        discountPercentage = 0,
        complexity,
        riskLevel,
        regulatoryRequirements = [],
        deliverables = [],
        staffAssignments = [],
        requiresPartnerReview = true,
        requiresManagerApproval = true,
        autoAssignWorkflow = true,
        notifyStakeholders = true,
        job_code,
        status
      } = req.body;

      // 1. Create the main job record
      const job = await prisma.job.create({
        data: {
          title,
          description,
          job_code,
          status: status || 'active',
          priority,
          service_type: serviceType,
          service_subtype: serviceSubtype,
          complexity,
          risk_level: riskLevel,
          client_id: clientId,
          department_id: departmentId,
          partner_id: partnerId,
          manager_id: managerId,
          start_date: new Date(startDate),
          due_date: new Date(dueDate),
          estimated_hours: estimatedHours,
          budget_amount: budgetAmount,
          billing_type: billingType,
          currency_code: currencyCode,
          tax_rate: taxRate,
          discount_percentage: discountPercentage,
          requires_partner_review: requiresPartnerReview,
          requires_manager_approval: requiresManagerApproval,
          workflow_stage: status === 'draft' ? WORKFLOW_STAGES.DRAFT : WORKFLOW_STAGES.PARTNER_REVIEW,
          created_by: userId
        }
      });

      console.log('✅ Job created with ID:', job.id);

      // 2. Create financial tracking record
      const totalAfterDiscount = budgetAmount * (1 - discountPercentage / 100);
      const taxAmount = totalAfterDiscount * (taxRate / 100);
      const totalWithTax = totalAfterDiscount + taxAmount;

      await prisma.jobFinancialTracking.create({
        data: {
          job_id: job.id,
          budget_amount: budgetAmount,
          actual_amount: 0,
          discount_amount: budgetAmount * (discountPercentage / 100),
          tax_amount: taxAmount,
          total_amount: totalWithTax,
          profit_margin: 0, // Will be calculated as work progresses
          cost_of_delivery: 0,
          billing_status: 'pending',
          invoice_amount: 0,
          payment_received: 0,
          outstanding_amount: totalWithTax,
          currency_code: currencyCode
        }
      });

      // 3. Create staff assignments with proper role mapping
      for (const assignment of staffAssignments) {
        await prisma.jobStaffAssignment.create({
          data: {
            job_id: job.id,
            employee_id: assignment.employeeId,
            role_on_job: assignment.role,
            budget_hours: assignment.budgetHours,
            billing_rate: assignment.billingRate,
            assignment_date: new Date(),
            status: 'assigned'
          }
        });

        // Create time tracking record for each assignment
        await prisma.timeEntry.create({
          data: {
            employee_id: assignment.employeeId,
            job_id: job.id,
            date: new Date(),
            hours_worked: 0,
            description: `Initial assignment to ${title}`,
            billable: true,
            approved: false,
            billing_rate: assignment.billingRate,
            status: 'draft'
          }
        });
      }

      // 4. Create deliverables tracking
      const serviceConfig = SERVICE_CONFIGURATIONS[serviceType as keyof typeof SERVICE_CONFIGURATIONS];
      const allDeliverables = [...deliverables, ...(serviceConfig?.requiredDeliverables || [])];
      
      for (const deliverable of allDeliverables) {
        await prisma.jobDeliverable.create({
          data: {
            job_id: job.id,
            deliverable_name: deliverable,
            description: `${deliverable} for ${title}`,
            status: 'pending',
            due_date: new Date(dueDate),
            assigned_to: partnerId, // Initially assigned to partner
            is_mandatory: serviceConfig?.requiredDeliverables.includes(deliverable) || false
          }
        });
      }

      // 5. Create regulatory compliance tracking
      const allRequirements = [...regulatoryRequirements, ...(serviceConfig?.regulatoryCompliance || [])];
      
      for (const requirement of allRequirements) {
        await prisma.jobComplianceTracking.create({
          data: {
            job_id: job.id,
            requirement_name: requirement,
            requirement_type: 'regulatory',
            status: 'pending',
            due_date: new Date(dueDate),
            responsible_party: partnerId,
            verification_required: true
          }
        });
      }

      // 6. Create workflow steps based on service type
      if (autoAssignWorkflow && serviceConfig) {
        let stepOrder = 1;
        const workflowSteps = serviceConfig.standardWorkflowSteps;
        
        for (const stepName of workflowSteps) {
          await prisma.jobWorkflowStep.create({
            data: {
              job_id: job.id,
              step_name: stepName,
              step_order: stepOrder++,
              status: stepOrder === 2 ? 'in_progress' : 'pending', // First step starts as in_progress
              assigned_to: stepOrder === 2 ? partnerId : null,
              estimated_hours: Math.round(estimatedHours / workflowSteps.length),
              due_date: new Date(Date.now() + (stepOrder * 7 * 24 * 60 * 60 * 1000)), // Spread steps weekly
              dependencies: stepOrder > 2 ? [stepOrder - 1] : []
            }
          });
        }
      }

      // 7. Create audit trail
      await prisma.jobAuditLog.create({
        data: {
          job_id: job.id,
          user_id: userId,
          action: 'job_created',
          description: `Job "${title}" created with ${staffAssignments.length} team members assigned`,
          details: {
            serviceType,
            serviceSubtype,
            budgetAmount,
            estimatedHours,
            teamSize: staffAssignments.length,
            workflowStage: job.workflow_stage
          },
          timestamp: new Date()
        }
      });

      // 8. Send notifications if enabled
      if (notifyStakeholders && status !== 'draft') {
        await sendJobCreationNotifications(job.id, {
          partnerId,
          managerId,
          staffAssignments,
          clientId,
          title,
          dueDate
        });
      }

      // 9. Create partner dashboard entry
      await updatePartnerDashboard(partnerId, job.id, budgetAmount);

      // 10. Initialize performance tracking
      await prisma.jobPerformanceMetrics.create({
        data: {
          job_id: job.id,
          planned_start_date: new Date(startDate),
          planned_end_date: new Date(dueDate),
          actual_start_date: status !== 'draft' ? new Date() : null,
          planned_budget: budgetAmount,
          planned_hours: estimatedHours,
          actual_hours: 0,
          actual_cost: 0,
          efficiency_rating: 0,
          quality_score: 0,
          client_satisfaction: 0,
          on_time_delivery: null,
          budget_variance: 0,
          scope_changes: 0
        }
      });

      console.log('🎉 Job creation workflow completed successfully');

      return {
        success: true,
        job: job,
        message: `Job "${title}" created successfully with comprehensive workflow initiated`,
        workflowStage: job.workflow_stage,
        teamMembersAssigned: staffAssignments.length,
        notificationsSent: notifyStakeholders && status !== 'draft'
      };

    } catch (error) {
      console.error('❌ Error in job creation workflow:', error);
      throw error;
    }
  });

  return res.json(transaction);
});

// Helper function to send comprehensive notifications
async function sendJobCreationNotifications(jobId: number, notificationData: any) {
  try {
    const {
      partnerId,
      managerId,
      staffAssignments,
      clientId,
      title,
      dueDate
    } = notificationData;

    // Get job details with all related data
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      include: {
        client: true,
        partner: true,
        manager: true,
        department: true,
        jobStaffAssignments: {
          include: {
            profile: true
          }
        }
      }
    });

    if (!job) return;

    // 1. Notify Partner in Charge
    if (partnerId) {
      const partner = await prisma.profile.findUnique({ where: { id: partnerId } });
      if (partner?.email) {
        await sendEmail({
          to: partner.email,
          subject: `New Job Assignment: ${title}`,
          template: 'partner_job_assignment',
          data: {
            partnerName: `${partner.first_name} ${partner.last_name}`,
            jobTitle: title,
            clientName: job.client?.client_name,
            dueDate: new Date(dueDate).toLocaleDateString(),
            budgetAmount: job.budget_amount,
            teamSize: staffAssignments.length,
            jobCode: job.job_code,
            actionRequired: 'Review and approve job initiation'
          }
        });

        // Create in-app notification
        await prisma.notification.create({
          data: {
            user_id: partner.userId || 0,
            title: 'New Job Assignment',
            message: `You have been assigned as Partner in Charge for "${title}"`,
            type: 'job_assignment',
            priority: job.priority as any,
            data: { jobId, action: 'partner_review' },
            read: false
          }
        });
      }
    }

    // 2. Notify Manager in Charge
    if (managerId) {
      const manager = await prisma.profile.findUnique({ where: { id: managerId } });
      if (manager?.email) {
        await sendEmail({
          to: manager.email,
          subject: `Team Management Required: ${title}`,
          template: 'manager_job_assignment',
          data: {
            managerName: `${manager.first_name} ${manager.last_name}`,
            jobTitle: title,
            partnerName: job.partner ? `${job.partner.first_name} ${job.partner.last_name}` : '',
            teamMembers: staffAssignments.map((a: any) => a.employeeName),
            timeline: `${new Date().toLocaleDateString()} - ${new Date(dueDate).toLocaleDateString()}`,
            actionRequired: 'Coordinate team and manage workflow'
          }
        });

        await prisma.notification.create({
          data: {
            user_id: manager.userId || 0,
            title: 'Team Management Assignment',
            message: `You are assigned to manage the team for "${title}"`,
            type: 'team_management',
            priority: job.priority as any,
            data: { jobId, action: 'team_coordination' },
            read: false
          }
        });
      }
    }

    // 3. Notify Team Members
    for (const assignment of staffAssignments) {
      const employee = await prisma.profile.findUnique({ 
        where: { id: assignment.employeeId },
        include: { user: true }
      });
      
      if (employee?.email) {
        await sendEmail({
          to: employee.email,
          subject: `New Project Assignment: ${title}`,
          template: 'employee_job_assignment',
          data: {
            employeeName: `${employee.first_name} ${employee.last_name}`,
            jobTitle: title,
            role: assignment.role,
            budgetHours: assignment.budgetHours,
            clientName: job.client?.client_name,
            startDate: new Date().toLocaleDateString(),
            manager: job.manager ? `${job.manager.first_name} ${job.manager.last_name}` : '',
            actionRequired: 'Begin assigned tasks and time tracking'
          }
        });

        if (employee.user) {
          await prisma.notification.create({
            data: {
              user_id: employee.user.id,
              title: 'New Project Assignment',
              message: `You have been assigned to work on "${title}" as ${assignment.role}`,
              type: 'project_assignment',
              priority: job.priority as any,
              data: { jobId, budgetHours: assignment.budgetHours },
              read: false
            }
          });
        }
      }
    }

    // 4. Notify Client (engagement letter)
    if (clientId) {
      const client = await prisma.client.findUnique({ where: { id: clientId } });
      if (client?.contact_email) {
        await sendEmail({
          to: client.contact_email,
          subject: `Service Engagement Confirmation: ${title}`,
          template: 'client_engagement',
          data: {
            clientName: client.client_name,
            contactPerson: client.contact_person,
            serviceType: job.service_type,
            serviceSubtype: job.service_subtype,
            partnerName: job.partner ? `${job.partner.first_name} ${job.partner.last_name}` : '',
            expectedCompletion: new Date(dueDate).toLocaleDateString(),
            nextSteps: 'Our team will be in touch shortly to begin the engagement'
          }
        });
      }
    }

    console.log('📧 All job creation notifications sent successfully');

  } catch (error) {
    console.error('❌ Error sending notifications:', error);
    // Don't throw - notifications failing shouldn't break job creation
  }
}

// Helper function to send emails
async function sendEmail({ to, subject, template, data }: any) {
  try {
    // Create HTML email based on template
    let htmlContent = '';
    
    switch (template) {
      case 'partner_job_assignment':
        htmlContent = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #1f2937;">New Job Assignment - Partner Review Required</h2>
            <p>Dear ${data.partnerName},</p>
            <p>You have been assigned as the <strong>Partner in Charge</strong> for the following engagement:</p>
            <div style="background: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="margin-top: 0;">${data.jobTitle}</h3>
              <p><strong>Client:</strong> ${data.clientName}</p>
              <p><strong>Job Code:</strong> ${data.jobCode}</p>
              <p><strong>Budget:</strong> KES ${data.budgetAmount?.toLocaleString()}</p>
              <p><strong>Team Size:</strong> ${data.teamSize} members</p>
              <p><strong>Due Date:</strong> ${data.dueDate}</p>
            </div>
            <p><strong>Action Required:</strong> ${data.actionRequired}</p>
            <p>Please log into the system to review and approve this engagement.</p>
            <p>Best regards,<br>Ronalds LLP Management System</p>
          </div>
        `;
        break;
        
      case 'manager_job_assignment':
        htmlContent = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #1f2937;">Team Management Assignment</h2>
            <p>Dear ${data.managerName},</p>
            <p>You have been assigned to manage the team for:</p>
            <div style="background: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="margin-top: 0;">${data.jobTitle}</h3>
              <p><strong>Partner in Charge:</strong> ${data.partnerName}</p>
              <p><strong>Timeline:</strong> ${data.timeline}</p>
              <p><strong>Team Members:</strong> ${data.teamMembers?.join(', ')}</p>
            </div>
            <p><strong>Your Responsibilities:</strong></p>
            <ul>
              <li>Coordinate team activities and workflow</li>
              <li>Monitor progress and quality</li>
              <li>Ensure deadlines are met</li>
              <li>Report status to Partner in Charge</li>
            </ul>
            <p>Please access the system to begin team coordination.</p>
            <p>Best regards,<br>Ronalds LLP Management System</p>
          </div>
        `;
        break;
        
      default:
        htmlContent = `<p>${subject}</p><pre>${JSON.stringify(data, null, 2)}</pre>`;
    }

    await emailTransporter.sendMail({
      from: process.env.SMTP_FROM || 'noreply@ronaldsllp.com',
      to,
      subject,
      html: htmlContent
    });

  } catch (error) {
    console.error('Email sending error:', error);
  }
}

// Helper function to update partner dashboard
async function updatePartnerDashboard(partnerId: number, jobId: number, budgetAmount: number) {
  try {
    // Update partner performance metrics
    await prisma.partnerPerformanceMetrics.upsert({
      where: {
        partner_id_period: {
          partner_id: partnerId,
          period: new Date().toISOString().slice(0, 7) // YYYY-MM format
        }
      },
      create: {
        partner_id: partnerId,
        period: new Date().toISOString().slice(0, 7),
        total_jobs: 1,
        total_revenue: budgetAmount,
        active_jobs: 1,
        completed_jobs: 0,
        client_satisfaction: 0,
        team_utilization: 0,
        profit_margin: 0
      },
      update: {
        total_jobs: { increment: 1 },
        total_revenue: { increment: budgetAmount },
        active_jobs: { increment: 1 }
      }
    });

  } catch (error) {
    console.error('Error updating partner dashboard:', error);
  }
}

// GET /admin/jobs/workflow-templates
// Get predefined workflow templates for different service types
router.get('/workflow-templates', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const templates = Object.entries(SERVICE_CONFIGURATIONS).map(([key, config]) => ({
      serviceType: key,
      name: config.name,
      defaultWorkflowSteps: config.standardWorkflowSteps,
      requiredDeliverables: config.requiredDeliverables,
      regulatoryCompliance: config.regulatoryCompliance,
      estimatedDuration: {
        audit: '8-12 weeks',
        tax: '2-4 weeks',
        advisory: '4-8 weeks',
        consulting: '6-10 weeks'
      }[key]
    }));

    res.json({
      success: true,
      templates
    });

  } catch (error) {
    console.error('Error fetching workflow templates:', error);
    res.status(500).json({ error: 'Failed to fetch workflow templates' });
  }
});

// POST /admin/jobs/:jobId/advance-workflow
// Advance job to next workflow stage
router.post('/:jobId/advance-workflow', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { jobId } = req.params;
    const { stage, notes, approvedBy } = req.body;
    const userId = req.user?.sub ? Number(req.user.sub) : undefined;

    const job = await prisma.job.findUnique({
      where: { id: parseInt(jobId) },
      include: { partner: true, manager: true }
    });

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Update workflow stage
    await prisma.job.update({
      where: { id: parseInt(jobId) },
      data: {
        workflow_stage: stage,
        updated_at: new Date()
      }
    });

    // Log the workflow advancement
    await prisma.jobAuditLog.create({
      data: {
        job_id: parseInt(jobId),
        user_id: userId || 0,
        action: 'workflow_advanced',
        description: `Workflow advanced to ${stage}`,
        details: { previousStage: job.workflow_stage, newStage: stage, notes, approvedBy },
        timestamp: new Date()
      }
    });

    res.json({
      success: true,
      message: `Job workflow advanced to ${stage}`,
      currentStage: stage
    });

  } catch (error) {
    console.error('Error advancing workflow:', error);
    res.status(500).json({ error: 'Failed to advance workflow' });
  }
});

export default router;