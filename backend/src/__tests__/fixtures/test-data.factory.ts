import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Test Data Factory - Creates consistent test data for various test scenarios
 * Follows AAA Pattern: Arrange, Act, Assert
 */
export class TestDataFactory {
  /**
   * Create a super admin user
   */
  static async createSuperAdmin(email?: string) {
    const user = await prisma.user.create({
      data: {
        email: email || `admin-${Date.now()}@test.com`,
        name: 'Super Admin User',
      },
    });

    await prisma.userRole.create({
      data: {
        userId: user.id,
        role: 'super_admin',
      },
    });

    const profile = await prisma.profile.create({
      data: {
        userId: user.id,
        first_name: 'Super',
        last_name: 'Admin',
        email: `admin-profile-${Date.now()}@test.com`,
        status: 'active',
        position: 'System Administrator',
        hourly_rate: 150,
        cost_rate: 75,
      },
    });

    return { user, profile, role: 'super_admin' };
  }

  /**
   * Create an HR manager user
   */
  static async createHRManager(email?: string) {
    const user = await prisma.user.create({
      data: {
        email: email || `hr-${Date.now()}@test.com`,
        name: 'HR Manager',
      },
    });

    await prisma.userRole.create({
      data: {
        userId: user.id,
        role: 'hr_manager',
      },
    });

    const profile = await prisma.profile.create({
      data: {
        userId: user.id,
        first_name: 'HR',
        last_name: 'Manager',
        email: `hr-profile-${Date.now()}@test.com`,
        status: 'active',
        position: 'HR Manager',
        hourly_rate: 120,
        cost_rate: 60,
      },
    });

    return { user, profile, role: 'hr_manager' };
  }

  /**
   * Create a partner user
   */
  static async createPartner(
    email?: string,
    companyName?: string
  ) {
    const user = await prisma.user.create({
      data: {
        email: email || `partner-${Date.now()}@test.com`,
        name: 'Partner User',
      },
    });

    await prisma.userRole.create({
      data: {
        userId: user.id,
        role: 'partner',
      },
    });

    const profile = await prisma.profile.create({
      data: {
        userId: user.id,
        first_name: 'John',
        last_name: 'Partner',
        email: `partner-profile-${Date.now()}@test.com`,
        status: 'active',
        position: 'Audit Partner',
        is_partner: true,
        hourly_rate: 200,
        cost_rate: 100,
      },
    });

    const company = await prisma.partnerCompany.create({
      data: {
        company_name: companyName || `Partner Co ${Date.now()}`,
        registration_number: `REG-${Date.now()}`,
        tax_id: `TAX-${Date.now()}`,
      },
    });

    const partner = await prisma.partner.create({
      data: {
        profile_id: profile.id,
        company_id: company.id,
        commission_rate: 15,
        performance_threshold: 80,
        group_name: 'Audit Group',
      },
    });

    return { user, profile, company, partner, role: 'partner' };
  }

  /**
   * Create an employee user
   */
  static async createEmployee(
    email?: string,
    departmentId?: number
  ) {
    const user = await prisma.user.create({
      data: {
        email: email || `emp-${Date.now()}@test.com`,
        name: 'Employee User',
      },
    });

    await prisma.userRole.create({
      data: {
        userId: user.id,
        role: 'employee',
      },
    });

    const profile = await prisma.profile.create({
      data: {
        userId: user.id,
        first_name: 'Jane',
        last_name: 'Employee',
        email: `emp-profile-${Date.now()}@test.com`,
        status: 'active',
        position: 'Audit Senior',
        departmentId: departmentId,
        hire_date: new Date('2023-01-01'),
        hourly_rate: 75,
        cost_rate: 40,
      },
    });

    return { user, profile, role: 'employee' };
  }

  /**
   * Create a manager user
   */
  static async createManager(email?: string) {
    const user = await prisma.user.create({
      data: {
        email: email || `mgr-${Date.now()}@test.com`,
        name: 'Manager User',
      },
    });

    await prisma.userRole.create({
      data: {
        userId: user.id,
        role: 'manager',
      },
    });

    const profile = await prisma.profile.create({
      data: {
        userId: user.id,
        first_name: 'Mike',
        last_name: 'Manager',
        email: `mgr-profile-${Date.now()}@test.com`,
        status: 'active',
        position: 'Senior Manager',
        hourly_rate: 110,
        cost_rate: 55,
      },
    });

    return { user, profile, role: 'manager' };
  }

  /**
   * Create a client
   */
  static async createClient(clientName?: string) {
    return await prisma.client.create({
      data: {
        client_name: clientName || `Client ${Date.now()}`,
        client_code: `CL-${Date.now()}`,
        industry: 'Financial Services',
        contact_person: 'John Doe',
        contact_email: 'john@client.com',
        contact_phone: '555-1234',
        address: '123 Business St',
        status: 'active',
      },
    });
  }

  /**
   * Create a job assigned to a partner
   */
  static async createJob(
    partnerId: number,
    clientId?: number,
    jobName?: string,
    overrides?: {
      budget?: number;
      hourly_rate?: number;
      fees?: number;
      status?: string;
      [key: string]: any;
    }
  ) {
    return await prisma.job.create({
      data: {
        job_name: jobName || `Audit Job ${Date.now()}`,
        job_code: `JOB-${Date.now()}`,
        partner_id: partnerId,
        client_id: clientId,
        description: 'Test job for audit',
        start_date: new Date(),
        due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        status: overrides?.status || 'active',
        billable_hours: 200,
        estimated_hours: 200,
        actual_hours: 0,
        billing_type: 'hourly',
        hourly_rate: overrides?.hourly_rate || 150,
        amount_collected: 0,
        fees: overrides?.fees || 500,
        budget: overrides?.budget || 30000,
        ...overrides,
      },
    });
  }

  /**
   * Create a task for a job
   */
  static async createTask(
    jobId: number,
    assignedToId?: number,
    taskTitle?: string
  ) {
    return await prisma.task.create({
      data: {
        job_id: jobId,
        assigned_to: assignedToId,
        title: taskTitle || `Task ${Date.now()}`,
        description: 'Test task',
        estimated_hours: 40,
        billable: true,
        status: 'pending',
        priority: 'medium',
      },
    });
  }

  /**
   * Create a time entry for an employee
   */
  static async createTimeEntry(
    jobId: number,
    employeeId: number,
    hours: number = 8,
    billable: boolean = true,
    taskId?: number,
    status: string = 'submitted'
  ) {
    return await prisma.timeEntry.create({
      data: {
        job_id: jobId,
        employee_id: employeeId,
        task_id: taskId,
        date_worked: new Date(),
        hours: hours,
        billable: billable,
        status: status,
        description: `Time entry for ${hours} hours`,
      },
    });
  }

  /**
   * Create a KPI
   */
  static async createKPI(
    name?: string,
    departmentId?: number
  ) {
    return await prisma.kpi.create({
      data: {
        name: name || `KPI ${Date.now()}`,
        description: 'Test KPI',
        category: 'Financial',
        measurement_unit: 'Percentage',
        target_value: 90,
        weight: 25,
        bsc_category: 'Financial',
        department_id: departmentId,
      },
    });
  }

  /**
   * Create an employee KPI assignment
   */
  static async createEmployeeKPIAssignment(
    employeeId: number,
    kpiId: number,
    targetValue?: number,
    weight?: number
  ) {
    return await prisma.employeeKpiAssignment.create({
      data: {
        employee_id: employeeId,
        kpi_id: kpiId,
        target_value: targetValue || 90,
        achieved_value: 0,
        weight: weight || 25,
        period_start: new Date(),
        period_end: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        status: 'active',
      },
    });
  }

  /**
   * Create a department
   */
  static async createDepartment(deptName?: string) {
    return await prisma.department.create({
      data: {
        name: deptName || `Department ${Date.now()}`,
        description: 'Test department',
        department_code: `DEPT-${Date.now()}`,
      },
    });
  }

  /**
   * Create a job staff assignment
   */
  static async createJobStaffAssignment(
    jobId: number,
    employeeId: number,
    hoursAllocated?: number,
    hourlyRate?: number
  ) {
    return await prisma.jobStaffAssignment.create({
      data: {
        job_id: jobId,
        employee_id: employeeId,
        role: 'Senior Auditor',
        hours_allocated: hoursAllocated || 100,
        hourly_rate: hourlyRate || 75,
      },
    });
  }

  /**
   * Create a job profitability record
   */
  static async createJobProfitability(
    jobId: number,
    totalRevenue: number,
    totalCost: number
  ) {
    const profit = totalRevenue - totalCost;
    const profitMargin = totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0;

    return await prisma.jobProfitability.create({
      data: {
        job_id: jobId,
        total_revenue: totalRevenue,
        total_cost: totalCost,
        profit: profit,
        profit_margin: profitMargin,
      },
    });
  }

  /**
   * Create an evaluation cycle
   */
  static async createEvaluationCycle(cycleName?: string) {
    return await prisma.evaluationCycle.create({
      data: {
        cycle_name: cycleName || `Evaluation Cycle ${Date.now()}`,
        description: 'Test evaluation cycle',
        start_date: new Date(),
        end_date: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
        status: 'active',
      },
    });
  }

  /**
   * Clean up test data - be careful with this!
   */
  static async cleanup(...ids: { type: string; id: number }[]) {
    for (const item of ids) {
      try {
        switch (item.type) {
          case 'user':
            // Cascade will delete related records
            await prisma.user.delete({ where: { id: item.id } });
            break;
          case 'profile':
            await prisma.profile.delete({ where: { id: item.id } });
            break;
          case 'job':
            await prisma.job.delete({ where: { id: item.id } });
            break;
          case 'partner':
            await prisma.partner.delete({ where: { id: item.id } });
            break;
          case 'client':
            await prisma.client.delete({ where: { id: item.id } });
            break;
          case 'department':
            await prisma.department.delete({ where: { id: item.id } });
            break;
        }
      } catch (error) {
        // Silently continue if cleanup fails
        console.warn(`Failed to cleanup ${item.type} ${item.id}:`, error);
      }
    }
  }
}
