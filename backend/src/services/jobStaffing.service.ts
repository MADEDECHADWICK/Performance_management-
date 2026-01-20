/**
 * Job Staffing & Allocation Service (Phase 5)
 * Complex staffing calculations and optimization
 */

import { prisma } from '../lib/prisma';

interface AuthContext {
  userId: number;
  profileId: number;
  roleName?: string;
}

interface StaffAllocationInput {
  job_id: number;
  employee_profile_id: number;
  role: string;
  allocation_percentage: number; // 0-100
  start_date: Date;
  end_date?: Date;
  hourly_rate: number;
}

interface UtilizationAnalysisInput {
  start_date: Date;
  end_date: Date;
  department_id?: number;
}

export class JobStaffingService {
  /**
   * Allocate employee to job
   */
  static async allocateEmployeeToJob(
    input: StaffAllocationInput,
    auth: AuthContext
  ) {
    // ✅ VERIFY AUTHORIZATION
    if (!['admin', 'manager'].includes(auth.roleName || '')) {
      throw {
        statusCode: 403,
        message: 'Only managers/admins can allocate staff',
      };
    }

    // ✅ VERIFY JOB EXISTS
    const job = await prisma.job.findUnique({
      where: { id: input.job_id },
    });

    if (!job) {
      throw {
        statusCode: 404,
        message: 'Job not found',
      };
    }

    // ✅ VERIFY EMPLOYEE EXISTS
    const employee = await prisma.profile.findUnique({
      where: { id: input.employee_profile_id },
    });

    if (!employee) {
      throw {
        statusCode: 404,
        message: 'Employee not found',
      };
    }

    // ✅ VALIDATE ALLOCATION PERCENTAGE
    if (input.allocation_percentage <= 0 || input.allocation_percentage > 100) {
      throw {
        statusCode: 400,
        message: 'Allocation percentage must be between 1-100',
      };
    }

    // ✅ CHECK EMPLOYEE UTILIZATION
    const existingAllocations = await prisma.jobStaffing.findMany({
      where: {
        employee_profile_id: input.employee_profile_id,
        end_date: null,
      },
    });

    const totalUtilization = existingAllocations.reduce(
      (sum, alloc) => sum + alloc.allocation_percentage,
      0
    );

    if (totalUtilization + input.allocation_percentage > 100) {
      throw {
        statusCode: 400,
        message: `Employee is already allocated ${totalUtilization}%. Cannot add ${input.allocation_percentage}%`,
      };
    }

    // ✅ CREATE ALLOCATION
    const allocation = await prisma.jobStaffing.create({
      data: {
        job_id: input.job_id,
        employee_profile_id: input.employee_profile_id,
        role: input.role,
        allocation_percentage: input.allocation_percentage,
        start_date: input.start_date,
        end_date: input.end_date || null,
        hourly_rate: input.hourly_rate,
        status: 'active',
      },
      include: {
        job: { select: { id: true, name: true } },
        employee: { select: { id: true, first_name: true, last_name: true } },
      },
    });

    return allocation;
  }

  /**
   * Get employee utilization
   */
  static async getEmployeeUtilization(
    employeeId: number,
    auth: AuthContext
  ) {
    const allocations = await prisma.jobStaffing.findMany({
      where: {
        employee_profile_id: employeeId,
        end_date: null,
      },
      include: {
        job: { select: { id: true, name: true } },
      },
    });

    const totalUtilization = allocations.reduce(
      (sum, alloc) => sum + alloc.allocation_percentage,
      0
    );

    const available = 100 - totalUtilization;

    return {
      employeeId,
      totalUtilization,
      available,
      allocations: allocations.map(a => ({
        jobId: a.job_id,
        jobName: a.job.name,
        role: a.role,
        percentage: a.allocation_percentage,
        hourlyRate: a.hourly_rate,
        status: available > 0 ? 'Fully allocated' : 'Over-allocated',
      })),
      capacity: {
        available: available > 0 ? 'Yes' : 'No',
        availablePercentage: Math.max(available, 0),
      },
    };
  }

  /**
   * Get job staffing requirements
   */
  static async getJobStaffingRequirements(jobId: number, auth: AuthContext) {
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      include: {
        staffAllocations: {
          include: {
            employee: {
              select: { id: true, first_name: true, last_name: true },
            },
          },
        },
      },
    });

    if (!job) {
      throw {
        statusCode: 404,
        message: 'Job not found',
      };
    }

    // ✅ CALCULATE TOTAL ALLOCATED
    const totalAllocated = job.staffAllocations.reduce(
      (sum, alloc) => sum + alloc.allocation_percentage,
      0
    );

    const estimatedCost = job.staffAllocations.reduce(
      (sum, alloc) => sum + alloc.hourly_rate * (alloc.allocation_percentage / 100),
      0
    );

    // ✅ GROUP BY ROLE
    const byRole = job.staffAllocations.reduce((acc, alloc) => {
      if (!acc[alloc.role]) {
        acc[alloc.role] = { count: 0, totalPercentage: 0, staff: [] };
      }
      acc[alloc.role].count++;
      acc[alloc.role].totalPercentage += alloc.allocation_percentage;
      acc[alloc.role].staff.push({
        name: `${alloc.employee.first_name} ${alloc.employee.last_name}`,
        percentage: alloc.allocation_percentage,
      });
      return acc;
    }, {} as Record<string, any>);

    return {
      job: { id: job.id, name: job.name },
      staffing: {
        totalAllocated,
        totalStaff: job.staffAllocations.length,
        estimatedMonthlyCost: estimatedCost,
      },
      byRole,
      gaps: Object.entries(byRole).map(([role, data]) => ({
        role,
        allocated: data.totalPercentage,
        required: 100,
        gap: 100 - data.totalPercentage,
      })),
    };
  }

  /**
   * Get team utilization report
   */
  static async getTeamUtilizationReport(
    departmentId: number,
    auth: AuthContext
  ) {
    // ✅ VERIFY AUTHORIZATION
    if (!['admin', 'manager'].includes(auth.roleName || '')) {
      throw {
        statusCode: 403,
        message: 'Only managers/admins can view utilization reports',
      };
    }

    const employees = await prisma.profile.findMany({
      where: { department_id: departmentId },
      include: {
        jobAllocations: {
          where: { end_date: null },
          include: { job: { select: { id: true, name: true } } },
        },
      },
    });

    // ✅ CALCULATE UTILIZATION FOR EACH EMPLOYEE
    const teamUtilization = employees.map(employee => {
      const totalUtilization = employee.jobAllocations.reduce(
        (sum, alloc) => sum + alloc.allocation_percentage,
        0
      );

      return {
        employeeId: employee.id,
        employeeName: `${employee.first_name} ${employee.last_name}`,
        utilization: totalUtilization,
        available: 100 - totalUtilization,
        status:
          totalUtilization === 0
            ? 'Unallocated'
            : totalUtilization < 80
              ? 'Under-utilized'
              : totalUtilization === 100
                ? 'Fully allocated'
                : 'Over-allocated',
        jobs: employee.jobAllocations.length,
      };
    });

    // ✅ CALCULATE DEPARTMENT METRICS
    const departmentMetrics = {
      totalEmployees: employees.length,
      averageUtilization:
        teamUtilization.length > 0
          ? (
              teamUtilization.reduce((sum, e) => sum + e.utilization, 0) /
              teamUtilization.length
            ).toFixed(2)
          : '0',
      fullyAllocated: teamUtilization.filter(e => e.utilization === 100).length,
      underUtilized: teamUtilization.filter(
        e => e.utilization < 80 && e.utilization > 0
      ).length,
      unallocated: teamUtilization.filter(e => e.utilization === 0).length,
      overAllocated: teamUtilization.filter(e => e.utilization > 100).length,
    };

    return {
      department: { id: departmentId },
      metrics: departmentMetrics,
      teamUtilization: teamUtilization.sort(
        (a, b) => b.utilization - a.utilization
      ),
    };
  }

  /**
   * Analyze resource gap
   */
  static async analyzeResourceGaps(
    jobId: number,
    auth: AuthContext
  ) {
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      include: {
        staffAllocations: true,
      },
    });

    if (!job) {
      throw {
        statusCode: 404,
        message: 'Job not found',
      };
    }

    // ✅ IDENTIFY GAPS
    const totalAllocated = job.staffAllocations.reduce(
      (sum, alloc) => sum + alloc.allocation_percentage,
      0
    );

    const gaps = {
      staffingGap: Math.max(0, 100 - totalAllocated),
      severity:
        totalAllocated < 50
          ? 'Critical'
          : totalAllocated < 80
            ? 'High'
            : totalAllocated < 100
              ? 'Low'
              : 'None',
      recommendations:
        totalAllocated < 100
          ? [
              `Allocate ${Math.max(0, 100 - totalAllocated)}% more resources`,
              'Review hiring needs',
              'Consider contractor resources',
            ]
          : ['Fully staffed'],
    };

    return {
      job: { id: job.id, name: job.name },
      currentAllocation: totalAllocated,
      gaps,
    };
  }

  /**
   * Calculate employee productivity
   */
  static async getEmployeeProductivity(
    employeeId: number,
    startDate: Date,
    endDate: Date,
    auth: AuthContext
  ) {
    // ✅ VERIFY AUTHORIZATION
    if (employeeId !== auth.profileId && auth.roleName !== 'admin') {
      throw {
        statusCode: 403,
        message: 'You can only view your own productivity',
      };
    }

    // ✅ GET ALLOCATIONS
    const allocations = await prisma.jobStaffing.findMany({
      where: {
        employee_profile_id: employeeId,
        start_date: { lte: endDate },
        OR: [
          { end_date: null },
          { end_date: { gte: startDate } },
        ],
      },
      include: {
        job: { select: { id: true, name: true } },
      },
    });

    // ✅ CALCULATE METRICS
    const averageUtilization = allocations.length > 0
      ? allocations.reduce((sum, a) => sum + a.allocation_percentage, 0) /
        allocations.length
      : 0;

    const estimatedHours = allocations.reduce((sum, a) => {
      const days = Math.floor(
        (endDate.getTime() - Math.max(a.start_date.getTime(), startDate.getTime())) /
        (1000 * 60 * 60 * 24)
      );
      return sum + (days * 8 * (a.allocation_percentage / 100));
    }, 0);

    return {
      employee: { id: employeeId },
      period: { startDate, endDate },
      productivity: {
        averageUtilization: averageUtilization.toFixed(2) + '%',
        estimatedHours: Math.round(estimatedHours),
        jobCount: allocations.length,
      },
      allocations: allocations.map(a => ({
        jobName: a.job.name,
        role: a.role,
        allocation: a.allocation_percentage + '%',
      })),
    };
  }
}