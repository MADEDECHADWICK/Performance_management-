/**
 * DepartmentService (Schema v2.1 aligned)
 *
 * Department model fields in schema:
 * - name
 * - description?
 * - departmentCode? (unique)
 * - departmentHeadId?
 * - createdAt, updatedAt
 *
 * Relations:
 * - profiles (employees)
 * - jobs
 * - kpis
 */

import prisma from "../prisma";

export interface DepartmentCreateInput {
  name: string;
  description?: string;
  departmentCode?: string;
  departmentHeadId?: number;
}

export interface DepartmentUpdateInput {
  name?: string;
  description?: string;
  departmentCode?: string;
  departmentHeadId?: number | null;
}

export interface ListDepartmentsOptions {
  page: number;
  pageSize: number;
  sortBy?: "name" | "createdAt";
  sortOrder?: "asc" | "desc";
}

export interface ListDepartmentEmployeesOptions {
  page?: number;
  pageSize?: number;
  status?: "active" | "inactive" | "separated";
  sortBy?: "firstName" | "lastName" | "hireDate";
  sortOrder?: "asc" | "desc";
}

export interface ListDepartmentKpisOptions {
  page?: number;
  pageSize?: number;
  category?: string;
}

export interface RevenueOptions {
  dateFrom?: Date;
  dateTo?: Date;
  groupBy?: "day" | "month" | "quarter";
}

export interface ProfitabilityOptions {
  dateFrom?: Date;
  dateTo?: Date;
  groupBy?: "month" | "quarter";
}

export interface UtilizationOptions {
  // optionally tune expected hours per week
  expectedWeeklyHours?: number;
  // optionally tune lookback window
  weeks?: number;
}

export interface AuthContext {
  userId: number;
  profileId: number;
  roles?: string[];
  // if you ever want to allow department heads regardless of HR/admin:
  // isDepartmentHead?: boolean;
}

const parseDate = (value?: string): Date | undefined => {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
};

class DepartmentService {
  private requireAdminOrHr(auth: AuthContext) {
    const roles = auth.roles ?? [];
    const isAdmin = roles.includes("admin") || roles.includes("super_admin");
    const isHr = roles.includes("hr") || roles.includes("hr_manager");
    if (!isAdmin && !isHr) {
      const err = new Error("Forbidden");
      (err as any).statusCode = 403;
      throw err;
    }
  }

  /**
   * Create department
   * Access: Admin/HR (your routes use admin only, but service supports HR too)
   */
  async createDepartment(input: DepartmentCreateInput, auth: AuthContext) {
    this.requireAdminOrHr(auth);

    if (input.departmentCode) {
      const existing = await prisma.department.findUnique({
        where: { departmentCode: input.departmentCode },
        select: { id: true },
      });

      if (existing) {
        const err = new Error("Department code already exists");
        (err as any).statusCode = 409;
        throw err;
      }
    }

    // Validate head profile if provided
    if (input.departmentHeadId) {
      const head = await prisma.profile.findUnique({
        where: { id: input.departmentHeadId },
        select: { id: true },
      });
      if (!head) {
        const err = new Error("departmentHeadId does not reference an existing profile");
        (err as any).statusCode = 400;
        throw err;
      }
    }

    return prisma.department.create({
      data: {
        name: input.name,
        description: input.description,
        departmentCode: input.departmentCode,
        departmentHeadId: input.departmentHeadId,
      },
      include: {
        departmentHead: {
          select: { id: true, firstName: true, lastName: true },
        },
        _count: {
          select: { profiles: true, jobs: true, kpis: true },
        },
      },
    });
  }

  /**
   * Get department by id
   */
  async getDepartmentById(departmentId: number) {
    const department = await prisma.department.findUnique({
      where: { id: departmentId },
      include: {
        departmentHead: {
          select: { id: true, firstName: true, lastName: true },
        },
        _count: { select: { profiles: true, jobs: true, kpis: true } },
      },
    });

    if (!department) {
      const err = new Error("Department not found");
      (err as any).statusCode = 404;
      throw err;
    }

    return department;
  }

  /**
   * List departments (pagination + sorting)
   */
  async listDepartments(options: ListDepartmentsOptions) {
    const {
      page,
      pageSize,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = options;

    const skip = (page - 1) * pageSize;

    const [departments, total] = await Promise.all([
      prisma.department.findMany({
        skip,
        take: pageSize,
        orderBy:
          sortBy === "name"
            ? { name: sortOrder }
            : { createdAt: sortOrder },
        include: {
          departmentHead: { select: { id: true, firstName: true, lastName: true } },
          _count: { select: { profiles: true, jobs: true, kpis: true } },
        },
      }),
      prisma.department.count(),
    ]);

    return { departments, total };
  }

  /**
   * Update department
   * Access: Admin/HR
   */
  async updateDepartment(departmentId: number, input: DepartmentUpdateInput, auth: AuthContext) {
    this.requireAdminOrHr(auth);

    // If updating code, ensure uniqueness
    if (input.departmentCode) {
      const existing = await prisma.department.findUnique({
        where: { departmentCode: input.departmentCode },
        select: { id: true },
      });

      if (existing && existing.id !== departmentId) {
        const err = new Error("Department code already exists");
        (err as any).statusCode = 409;
        throw err;
      }
    }

    // Validate head profile if provided
    if (typeof input.departmentHeadId === "number") {
      const head = await prisma.profile.findUnique({
        where: { id: input.departmentHeadId },
        select: { id: true },
      });
      if (!head) {
        const err = new Error("departmentHeadId does not reference an existing profile");
        (err as any).statusCode = 400;
        throw err;
      }
    }

    try {
      return await prisma.department.update({
        where: { id: departmentId },
        data: {
          name: input.name,
          description: input.description,
          departmentCode: input.departmentCode,
          departmentHeadId: input.departmentHeadId,
        },
        include: {
          departmentHead: { select: { id: true, firstName: true, lastName: true } },
          _count: { select: { profiles: true, jobs: true, kpis: true } },
        },
      });
    } catch (e: any) {
      // Prisma throws if record not found
      const err = new Error("Department not found");
      (err as any).statusCode = 404;
      throw err;
    }
  }

  /**
   * List department employees (Profiles)
   */
  async listDepartmentEmployees(departmentId: number, options: ListDepartmentEmployeesOptions = {}) {
    await this.getDepartmentById(departmentId);

    const {
      page = 1,
      pageSize = 10,
      status,
      sortBy = "lastName",
      sortOrder = "asc",
    } = options;

    const skip = (page - 1) * pageSize;

    const where: any = { departmentId };
    if (status) where.status = status;

    const orderBy =
      sortBy === "firstName"
        ? { firstName: sortOrder }
        : sortBy === "hireDate"
          ? { hireDate: sortOrder }
          : { lastName: sortOrder };

    const [employees, total] = await Promise.all([
      prisma.profile.findMany({
        where,
        skip,
        take: pageSize,
        orderBy,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          status: true,
          isPartner: true,
          hireDate: true,
          managerId: true,
          role: { select: { id: true, name: true } },
        },
      }),
      prisma.profile.count({ where }),
    ]);

    return { employees, total };
  }

  /**
   * List department KPIs (Kpi model)
   */
  async listDepartmentKPIs(departmentId: number, options: ListDepartmentKpisOptions = {}) {
    await this.getDepartmentById(departmentId);

    const { page = 1, pageSize = 10, category } = options;
    const skip = (page - 1) * pageSize;

    const where: any = { departmentId };
    if (category) where.category = category;

    const [kpis, total] = await Promise.all([
      prisma.kpi.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: "desc" },
      }),
      prisma.kpi.count({ where }),
    ]);

    return { kpis, total };
  }

  /**
   * Create a KPI for department
   * Access: Admin/HR (kept consistent with department creation)
   */
  async createDepartmentKPI(
    departmentId: number,
    input: {
      name: string;
      description?: string;
      category: string;
      kpiType: string;
      targetValue?: number;
      weight?: number;
      targetFrequency?: string;
    },
    auth: AuthContext
  ) {
    this.requireAdminOrHr(auth);
    await this.getDepartmentById(departmentId);

    return prisma.kpi.create({
      data: {
        name: input.name,
        description: input.description,
        category: input.category,
        kpiType: input.kpiType,
        targetValue: input.targetValue,
        weight: input.weight,
        targetFrequency: input.targetFrequency,
        departmentId,
      },
    });
  }

  /**
   * Revenue report from TimeEntry (approved)
   * NOTE: TimeEntry.status enum in schema: pending/submitted/approved/rejected/cancelled
   */
  async getDepartmentRevenue(departmentId: number, opts: RevenueOptions = {}) {
    await this.getDepartmentById(departmentId);

    const dateFrom = opts.dateFrom ?? new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const dateTo = opts.dateTo ?? new Date();
    const groupBy = opts.groupBy ?? "month";

    const entries = await prisma.timeEntry.findMany({
      where: {
        job: { departmentId },
        dateWorked: { gte: dateFrom, lte: dateTo },
        status: "approved",
      },
      select: {
        dateWorked: true,
        billable: true,
        billableAmount: true,
        costAmount: true,
        hours: true,
      },
    });

    const grouped: Record<string, { revenue: number; cost: number; hours: number; billableHours: number }> = {};

    for (const e of entries) {
      const d = new Date(e.dateWorked);
      let key: string;

      if (groupBy === "day") key = d.toISOString().slice(0, 10);
      else if (groupBy === "quarter") {
        const q = Math.ceil((d.getMonth() + 1) / 3);
        key = `${d.getFullYear()}-Q${q}`;
      } else key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

      if (!grouped[key]) grouped[key] = { revenue: 0, cost: 0, hours: 0, billableHours: 0 };

      grouped[key].revenue += e.billable ? Number(e.billableAmount ?? 0) : 0;
      grouped[key].cost += Number(e.costAmount ?? 0);
      grouped[key].hours += Number(e.hours ?? 0);
      grouped[key].billableHours += e.billable ? Number(e.hours ?? 0) : 0;
    }

    return Object.entries(grouped).map(([period, v]) => {
      const margin = v.revenue - v.cost;
      const marginPercent = v.revenue > 0 ? (margin / v.revenue) * 100 : 0;
      const utilizationBillable = v.hours > 0 ? (v.billableHours / v.hours) * 100 : 0;

      return {
        period,
        revenue: Number(v.revenue.toFixed(2)),
        cost: Number(v.cost.toFixed(2)),
        margin: Number(margin.toFixed(2)),
        marginPercent: Number(marginPercent.toFixed(2)),
        totalHours: Number(v.hours.toFixed(2)),
        billableHours: Number(v.billableHours.toFixed(2)),
        billableMixPercent: Number(utilizationBillable.toFixed(2)),
      };
    });
  }

  /**
   * List jobs assigned to department
   */
  async listDepartmentJobs(departmentId: number, options: { page?: number; pageSize?: number; status?: string } = {}) {
    await this.getDepartmentById(departmentId);

    const { page = 1, pageSize = 10, status } = options;
    const skip = (page - 1) * pageSize;

    const where: any = { departmentId };
    if (status) where.status = status;

    const [jobs, total] = await Promise.all([
      prisma.job.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: "desc" },
        include: {
          client: { select: { id: true, clientName: true } },
          manager: { select: { id: true, firstName: true, lastName: true } },
          partner: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      prisma.job.count({ where }),
    ]);

    return { jobs, total };
  }

  /**
   * Dashboard summary (lightweight and safe)
   */
  async getDepartmentDashboard(departmentId: number) {
    const dept = await this.getDepartmentById(departmentId);

    const employeeCount = await prisma.profile.count({ where: { departmentId } });

    const activeJobs = await prisma.job.count({
      where: { departmentId, status: "in_progress" },
    });

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const revenueAgg = await prisma.timeEntry.aggregate({
      where: {
        job: { departmentId },
        dateWorked: { gte: monthStart },
        billable: true,
        status: "approved",
      },
      _sum: { billableAmount: true, costAmount: true, hours: true },
    });

    const monthlyRevenue = Number(revenueAgg._sum.billableAmount ?? 0);
    const monthlyCost = Number(revenueAgg._sum.costAmount ?? 0);
    const monthlyHours = Number(revenueAgg._sum.hours ?? 0);

    const monthlyMargin = monthlyRevenue - monthlyCost;

    return {
      departmentId: dept.id,
      departmentName: dept.name,
      departmentCode: dept.departmentCode,
      head: dept.departmentHead
        ? { id: dept.departmentHead.id, name: `${dept.departmentHead.firstName} ${dept.departmentHead.lastName}` }
        : null,

      employeeCount,
      activeJobs,

      monthlyRevenue: Number(monthlyRevenue.toFixed(2)),
      monthlyCost: Number(monthlyCost.toFixed(2)),
      monthlyMargin: Number(monthlyMargin.toFixed(2)),
      monthlyHours: Number(monthlyHours.toFixed(2)),
    };
  }

  /**
   * Utilization (simple, schema-safe)
   * Uses TimeEntry.hours (submitted/approved)
   */
  async getDepartmentUtilization(departmentId: number, opts: UtilizationOptions = {}) {
    await this.getDepartmentById(departmentId);

    const expectedWeeklyHours = opts.expectedWeeklyHours ?? 40;
    const weeks = opts.weeks ?? 4;
    const dateFrom = new Date();
    dateFrom.setDate(dateFrom.getDate() - weeks * 7);

    const employees = await prisma.profile.findMany({
      where: { departmentId },
      select: { id: true, firstName: true, lastName: true },
    });

    const results = [];

    for (const emp of employees) {
      const agg = await prisma.timeEntry.aggregate({
        where: {
          employeeProfileId: emp.id,
          job: { departmentId },
          status: { in: ["submitted", "approved"] },
          dateWorked: { gte: dateFrom },
        },
        _sum: { hours: true },
      });

      const logged = Number(agg._sum.hours ?? 0);
      const expected = expectedWeeklyHours * weeks;
      const utilizationPercent = expected > 0 ? (logged / expected) * 100 : 0;

      results.push({
        employeeId: emp.id,
        employeeName: `${emp.firstName} ${emp.lastName}`,
        hoursLogged: Number(logged.toFixed(2)),
        expectedHours: Number(expected.toFixed(2)),
        utilizationPercent: Number(utilizationPercent.toFixed(2)),
      });
    }

    const avg =
      results.length > 0
        ? results.reduce((s, r) => s + r.utilizationPercent, 0) / results.length
        : 0;

    return {
      departmentId,
      weeks,
      expectedWeeklyHours,
      averageUtilizationPercent: Number(avg.toFixed(2)),
      employees: results,
    };
  }

  /**
   * Profitability (schema-safe)
   * Uses TimeEntry.billableAmount + costAmount (approved only)
   */
  async getDepartmentProfitability(departmentId: number, opts: ProfitabilityOptions = {}) {
    await this.getDepartmentById(departmentId);

    const dateFrom = opts.dateFrom ?? new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);
    const dateTo = opts.dateTo ?? new Date();
    const groupBy = opts.groupBy ?? "month";

    const entries = await prisma.timeEntry.findMany({
      where: {
        job: { departmentId },
        status: "approved",
        dateWorked: { gte: dateFrom, lte: dateTo },
      },
      select: { dateWorked: true, billableAmount: true, costAmount: true },
    });

    const grouped: Record<string, { revenue: number; cost: number }> = {};

    for (const e of entries) {
      const d = new Date(e.dateWorked);
      let key: string;

      if (groupBy === "quarter") {
        const q = Math.ceil((d.getMonth() + 1) / 3);
        key = `${d.getFullYear()}-Q${q}`;
      } else {
        key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      }

      if (!grouped[key]) grouped[key] = { revenue: 0, cost: 0 };

      grouped[key].revenue += Number(e.billableAmount ?? 0);
      grouped[key].cost += Number(e.costAmount ?? 0);
    }

    const trend = Object.entries(grouped)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([period, v]) => {
        const profit = v.revenue - v.cost;
        const marginPercent = v.revenue > 0 ? (profit / v.revenue) * 100 : 0;
        return {
          period,
          revenue: Number(v.revenue.toFixed(2)),
          cost: Number(v.cost.toFixed(2)),
          profit: Number(profit.toFixed(2)),
          marginPercent: Number(marginPercent.toFixed(2)),
        };
      });

    const totalRevenue = trend.reduce((s, t) => s + t.revenue, 0);
    const totalCost = trend.reduce((s, t) => s + t.cost, 0);
    const totalProfit = totalRevenue - totalCost;
    const overallMarginPercent = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

    return {
      departmentId,
      from: dateFrom.toISOString(),
      to: dateTo.toISOString(),
      groupBy,
      totalRevenue: Number(totalRevenue.toFixed(2)),
      totalCost: Number(totalCost.toFixed(2)),
      totalProfit: Number(totalProfit.toFixed(2)),
      overallMarginPercent: Number(overallMarginPercent.toFixed(2)),
      trend,
    };
  }

  /**
   * Helpers for controller query parsing (optional)
   */
  parseRevenueQuery(q: any): RevenueOptions {
    return {
      dateFrom: parseDate(q.dateFrom ?? q.fromDate ?? q.startDate),
      dateTo: parseDate(q.dateTo ?? q.toDate ?? q.endDate),
      groupBy: q.groupBy,
    };
  }

  parseProfitabilityQuery(q: any): ProfitabilityOptions {
    return {
      dateFrom: parseDate(q.dateFrom ?? q.fromDate ?? q.startDate),
      dateTo: parseDate(q.dateTo ?? q.toDate ?? q.endDate),
      groupBy: q.groupBy,
    };
  }
}

export default new DepartmentService();
