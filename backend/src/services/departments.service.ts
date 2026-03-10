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

import { Prisma } from '@prisma/client';
import { prisma } from '../prisma';

export interface DepartmentCreateInput {
  name: string;
  description?: string;
  departmentCode?: string;
  departmentHeadId?: number;
  partnerProfileId?: number;
}

export interface DepartmentUpdateInput {
  name?: string;
  description?: string;
  departmentCode?: string;
  departmentHeadId?: number | null;
  partnerProfileId?: number | null;
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

export interface TeamKpiOptions {
  status?: "active" | "inactive" | "all";
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

export class DepartmentService {
  private normalizeRoles(auth: AuthContext): Set<string> {
    return new Set((auth.roles || []).map((role) => String(role).toLowerCase()));
  }

  private isPrivileged(auth: AuthContext): boolean {
    const roles = this.normalizeRoles(auth);
    return (
      roles.has("super_admin") ||
      roles.has("hr")
    );
  }

  private canListAllDepartments(auth: AuthContext): boolean {
    const roles = this.normalizeRoles(auth);
    return this.isPrivileged(auth) || roles.has("marketing") || roles.has("gmp");
  }

  private isManagerScoped(auth: AuthContext): boolean {
    if (this.isPrivileged(auth)) return false;
    const roles = this.normalizeRoles(auth);
    return Array.from(roles).some(
      (role) => role.includes("manager") && role !== "hr"
    );
  }

  private requireAdminOrHr(auth: AuthContext) {
    if (!this.isPrivileged(auth)) {
      const err = new Error("Forbidden");
      (err as any).statusCode = 403;
      throw err;
    }
  }

  private async getScopedDepartmentIds(auth: AuthContext): Promise<Set<number>> {
    const profile = await prisma.profile.findUnique({
      where: { id: auth.profileId },
      select: {
        departmentId: true,
        departmentsHeaded: { select: { id: true } },
        departmentsAsPartner: { select: { id: true } },
      },
    });

    if (!profile) {
      const err = new Error("Profile not found");
      (err as any).statusCode = 404;
      throw err;
    }

    if (this.isManagerScoped(auth)) {
      const managerPrimaryDeptId =
        profile.departmentId ?? profile.departmentsHeaded[0]?.id ?? null;
      return managerPrimaryDeptId ? new Set([managerPrimaryDeptId]) : new Set<number>();
    }

    const scopedIds = new Set<number>();
    if (profile.departmentId) scopedIds.add(profile.departmentId);
    profile.departmentsHeaded.forEach((department) => scopedIds.add(department.id));
    profile.departmentsAsPartner.forEach((department) => scopedIds.add(department.id));
    return scopedIds;
  }

  private async assertDepartmentAccess(departmentId: number, auth?: AuthContext) {
    if (!auth) return;
    if (this.isPrivileged(auth)) return;

    const scopedIds = await this.getScopedDepartmentIds(auth);
    if (scopedIds.has(departmentId)) return;

    const err = new Error("Forbidden");
    (err as any).statusCode = 403;
    throw err;
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

    // Validate head profile if provided (must be a manager, not partner)
    if (input.departmentHeadId) {
      const head = await prisma.profile.findUnique({
        where: { id: input.departmentHeadId },
        select: {
          id: true,
          isPartner: true,
          positionTitle: true,
          role: { select: { name: true } },
        },
      });
      const roleLabel = `${head?.role?.name ?? head?.positionTitle ?? ""}`.toLowerCase();
      const isManager = roleLabel.includes("manager");
      if (!head || head.isPartner || !isManager) {
        const err = new Error("departmentHeadId must reference a manager profile");
        (err as any).statusCode = 400;
        throw err;
      }
    }

    if (input.partnerProfileId) {
      const partner = await prisma.profile.findUnique({
        where: { id: input.partnerProfileId },
        select: { id: true, isPartner: true, positionTitle: true },
      });
      const isPartner =
        partner?.isPartner ||
        partner?.positionTitle?.toLowerCase().includes("partner");
      if (!partner || !isPartner) {
        const err = new Error("partnerProfileId must reference a partner profile");
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
        partnerProfileId: input.partnerProfileId,
      },
      include: {
        departmentHead: {
          select: { id: true, firstName: true, lastName: true },
        },
        _count: {
          select: { profiles: true, jobs: true, kpis: true },
        },
      },
    }).then(async (created) => {
      if (created.departmentHeadId) {
        await prisma.profile.update({
          where: { id: created.departmentHeadId },
          data: { departmentId: created.id },
        });
      }

      if (!created.partnerProfileId) return created;
      const partner = await prisma.profile.findUnique({
        where: { id: created.partnerProfileId },
        select: { id: true, firstName: true, lastName: true },
      });
      return {
        ...created,
        partner,
        partner_name: partner
          ? `${partner.firstName ?? ""} ${partner.lastName ?? ""}`.trim()
          : undefined,
      };
    });
  }

  /**
   * Get department by id
   */
  async getDepartmentById(departmentId: number, auth?: AuthContext) {
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

    await this.assertDepartmentAccess(departmentId, auth);

    if (!department?.partnerProfileId) return department;
    const partner = await prisma.profile.findUnique({
      where: { id: department.partnerProfileId },
      select: { id: true, firstName: true, lastName: true },
    });
    return {
      ...department,
      partner,
      partner_name: partner
        ? `${partner.firstName ?? ""} ${partner.lastName ?? ""}`.trim()
        : undefined,
    };
  }

  /**
   * List departments (pagination + sorting)
   */
  async listDepartments(options: ListDepartmentsOptions, auth?: AuthContext) {
    const {
      page,
      pageSize,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = options;

    const skip = (page - 1) * pageSize;
    let where: Prisma.DepartmentWhereInput | undefined;

    if (auth && !this.canListAllDepartments(auth)) {
      const scopedIds = await this.getScopedDepartmentIds(auth);
      where = scopedIds.size > 0 ? { id: { in: Array.from(scopedIds) } } : { id: -1 };
    }

    const [departments, total] = await Promise.all([
      prisma.department.findMany({
        where,
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
      prisma.department.count({ where }),
    ]);

    const partnerIds = Array.from(
      new Set(
        departments
          .map((dept) => dept.partnerProfileId)
          .filter((id): id is number => typeof id === "number")
      )
    );
    const partners = partnerIds.length
      ? await prisma.profile.findMany({
          where: { id: { in: partnerIds } },
          select: { id: true, firstName: true, lastName: true },
        })
      : [];
    const partnerMap = new Map(
      partners.map((partner) => [
        partner.id,
        {
          ...partner,
          name: `${partner.firstName ?? ""} ${partner.lastName ?? ""}`.trim(),
        },
      ])
    );

    const enriched = departments.map((dept) => {
      const partner = dept.partnerProfileId ? partnerMap.get(dept.partnerProfileId) : undefined;
      return {
        ...dept,
        partner: partner
          ? { id: partner.id, firstName: partner.firstName, lastName: partner.lastName }
          : undefined,
        partner_name: partner?.name,
      };
    });

    return { departments: enriched, total };
  }

  /**
   * Back-compat helper: get department (with auth optional)
   */
  async getDepartment(departmentId: number, auth?: AuthContext) {
    return this.getDepartmentById(departmentId, auth);
  }

  /**
   * Back-compat helper: delete department
   */
  async deleteDepartment(departmentId: number, auth: AuthContext) {
    this.requireAdminOrHr(auth);
    await this.getDepartmentById(departmentId);
    await prisma.department.delete({ where: { id: departmentId } });
  }

  /**
   * Back-compat helper: list department employees
   */
  async getDepartmentEmployees(departmentId: number, auth: AuthContext) {
    await this.assertDepartmentAccess(departmentId, auth);
    return this.listDepartmentEmployees(departmentId, {}, auth);
  }

  /**
   * Back-compat helper: get department manager (head)
   */
  async getDepartmentManager(departmentId: number, auth: AuthContext) {
    const dept = await this.getDepartmentById(departmentId, auth);
    return dept.departmentHead ?? null;
  }

  /**
   * Get all managers in a department.
   * A manager here means profile role/title contains "manager", excluding partners.
   */
  async getDepartmentManagers(departmentId: number, auth: AuthContext) {
    await this.assertDepartmentAccess(departmentId, auth);
    await this.getDepartmentById(departmentId, auth);

    const members = await prisma.profile.findMany({
      where: {
        departmentId,
        status: "active",
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        positionTitle: true,
        isPartner: true,
        role: { select: { id: true, name: true } },
        user: {
          select: {
            roles: {
              include: {
                role: { select: { name: true } },
              },
            },
          },
        },
      },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    });

    return members
      .filter((member) => {
        if (member.isPartner) return false;
        const positionLabel = String(member.positionTitle || "").toLowerCase();
        const positionRoleLabel = String(member.role?.name || "").toLowerCase();
        const authRoleLabels = (member.user?.roles || [])
          .map((entry) => String(entry.role?.name || "").toLowerCase());
        return (
          positionLabel.includes("manager") ||
          positionRoleLabel.includes("manager") ||
          authRoleLabels.some((role) => role.includes("manager"))
        );
      })
      .map((member) => ({
        id: member.id,
        firstName: member.firstName,
        lastName: member.lastName,
        positionTitle: member.positionTitle,
        role: member.role,
      }));
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

    // Validate head profile if provided (must be a manager, not partner)
    if (typeof input.departmentHeadId === "number") {
      const head = await prisma.profile.findUnique({
        where: { id: input.departmentHeadId },
        select: {
          id: true,
          isPartner: true,
          positionTitle: true,
          role: { select: { name: true } },
        },
      });
      const roleLabel = `${head?.role?.name ?? head?.positionTitle ?? ""}`.toLowerCase();
      const isManager = roleLabel.includes("manager");
      if (!head || head.isPartner || !isManager) {
        const err = new Error("departmentHeadId must reference a manager profile");
        (err as any).statusCode = 400;
        throw err;
      }
    }

    if (typeof input.partnerProfileId === "number") {
      const partner = await prisma.profile.findUnique({
        where: { id: input.partnerProfileId },
        select: { id: true, isPartner: true, positionTitle: true },
      });
      const isPartner =
        partner?.isPartner ||
        partner?.positionTitle?.toLowerCase().includes("partner");
      if (!partner || !isPartner) {
        const err = new Error("partnerProfileId must reference a partner profile");
        (err as any).statusCode = 400;
        throw err;
      }
    }

    try {
      const updated = await prisma.department.update({
        where: { id: departmentId },
        data: {
          name: input.name,
          description: input.description,
          departmentCode: input.departmentCode,
          departmentHeadId: input.departmentHeadId,
          partnerProfileId: input.partnerProfileId,
        },
        include: {
          departmentHead: { select: { id: true, firstName: true, lastName: true } },
          _count: { select: { profiles: true, jobs: true, kpis: true } },
        },
      });

      if (updated.departmentHeadId) {
        await prisma.profile.update({
          where: { id: updated.departmentHeadId },
          data: { departmentId },
        });
      }

      if (!updated.partnerProfileId) return updated;
      const partner = await prisma.profile.findUnique({
        where: { id: updated.partnerProfileId },
        select: { id: true, firstName: true, lastName: true },
      });
      return {
        ...updated,
        partner,
        partner_name: partner
          ? `${partner.firstName ?? ""} ${partner.lastName ?? ""}`.trim()
          : null,
      };
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
  async listDepartmentEmployees(
    departmentId: number,
    options: ListDepartmentEmployeesOptions = {},
    auth?: AuthContext
  ) {
    await this.getDepartmentById(departmentId, auth);

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

  /**
   * Team KPI breakdown by evaluation team
   * Uses latest performance score per employee (if available).
   */
  async getDepartmentTeamKpis(
    departmentId: number,
    opts: TeamKpiOptions = {},
    auth?: AuthContext
  ) {
    await this.getDepartmentById(departmentId, auth);

    const statusFilter = opts.status && opts.status !== "all" ? opts.status : undefined;

    const teams = await prisma.$queryRaw<
      { id: number; teamName: string; description: string | null }[]
    >`SELECT id, team_name AS "teamName", description FROM evaluation_teams WHERE department_id = ${departmentId}`;

    if (!teams.length) return [];

    const teamIds = teams.map((team) => team.id);
    const members = await prisma.$queryRaw<
      { teamId: number; employeeId: number }[]
    >`SELECT team_id AS "teamId", employee_id AS "employeeId" FROM evaluation_team_members WHERE team_id IN (${Prisma.join(
      teamIds
    )})`;

    const membersByTeam = members.reduce((map, row) => {
      const key = row.teamId;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(row.employeeId);
      return map;
    }, new Map<number, number[]>());

    const results = [];

    for (const team of teams) {
      const memberIds = membersByTeam.get(team.id) ?? [];
      if (memberIds.length === 0) {
        results.push({
          teamId: team.id,
          teamName: team.teamName,
          description: team.description,
          memberCount: 0,
          activeCount: 0,
          inactiveCount: 0,
          financialScore: 0,
          nonFinancialScore: 0,
          overallScore: 0,
        });
        continue;
      }

      const profiles = await prisma.profile.findMany({
        where: {
          id: { in: memberIds },
          ...(statusFilter ? { status: statusFilter } : {}),
        },
        select: { id: true, status: true },
      });

      const filteredIds = profiles.map((profile) => profile.id);
      const activeCount = profiles.filter((profile) => profile.status === "active").length;
      const inactiveCount = profiles.filter((profile) => profile.status === "inactive").length;

      if (filteredIds.length === 0) {
        results.push({
          teamId: team.id,
          teamName: team.teamName,
          description: team.description,
          memberCount: profiles.length,
          activeCount,
          inactiveCount,
          financialScore: 0,
          nonFinancialScore: 0,
          overallScore: 0,
        });
        continue;
      }

      const scores = await prisma.performanceScore.findMany({
        where: { employeeProfileId: { in: filteredIds } },
        orderBy: { period: "desc" },
        select: {
          employeeProfileId: true,
          financialWeighted: true,
          nonFinancialWeighted: true,
          totalScore: true,
          period: true,
        },
      });

      const latestByEmployee = new Map<number, typeof scores[number]>();
      for (const score of scores) {
        if (!latestByEmployee.has(score.employeeProfileId)) {
          latestByEmployee.set(score.employeeProfileId, score);
        }
      }

      const latestScores = Array.from(latestByEmployee.values());
      const count = latestScores.length || 1;
      const financialScore =
        latestScores.reduce((sum, item) => sum + Number(item.financialWeighted || 0), 0) / count;
      const nonFinancialScore =
        latestScores.reduce((sum, item) => sum + Number(item.nonFinancialWeighted || 0), 0) /
        count;
      const overallScore =
        latestScores.reduce((sum, item) => sum + Number(item.totalScore || 0), 0) / count;

      const uniquePeriods = Array.from(
        new Set(scores.map((score) => score.period.toISOString()))
      )
        .map((period) => new Date(period))
        .sort((a, b) => b.getTime() - a.getTime());

      const latestPeriod = uniquePeriods[0];
      const previousPeriod = uniquePeriods[1];

      const avgForPeriod = (period?: Date) => {
        if (!period) return 0;
        const periodScores = scores.filter(
          (score) => score.period.toISOString() === period.toISOString()
        );
        if (periodScores.length === 0) return 0;
        return (
          periodScores.reduce((sum, item) => sum + Number(item.totalScore || 0), 0) /
          periodScores.length
        );
      };

      const previousOverall = avgForPeriod(previousPeriod);
      const deltaOverall = Number((overallScore - previousOverall).toFixed(1));
      const trendDirection =
        deltaOverall > 0.1 ? "up" : deltaOverall < -0.1 ? "down" : "flat";

      results.push({
        teamId: team.id,
        teamName: team.teamName,
        description: team.description,
        memberCount: profiles.length,
        activeCount,
        inactiveCount,
        financialScore: Number(financialScore.toFixed(1)),
        nonFinancialScore: Number(nonFinancialScore.toFixed(1)),
        overallScore: Number(overallScore.toFixed(1)),
        previousOverallScore: Number(previousOverall.toFixed(1)),
        deltaOverall,
        trendDirection,
      });
    }

    return results;
  }
}

export const departmentService = new DepartmentService();
