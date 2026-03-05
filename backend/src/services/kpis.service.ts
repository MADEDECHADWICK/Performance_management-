/**
 * Legacy KPI service compatibility layer aligned to current schema.
 */

import { prisma } from "../prisma";

interface AuthContext {
  userId: number;
  profileId: number;
  roleName?: string;
}

interface ListOptions {
  page: number;
  pageSize: number;
  departmentId?: number;
  status?: string;
}

interface CreateKPIInput {
  name: string;
  description?: string;
  targetValue: number;
  unit?: string;
  frequency?: string;
  departmentId?: number;
}

const toNumber = (value: unknown): number => {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (typeof value === "object" && value && "toString" in value) {
    const parsed = Number(String(value));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const isEditorRole = (role?: string) => {
  const normalized = String(role || "").toLowerCase().trim();
  return ["super_admin", "manager", "hr"].includes(normalized);
};

export class KPIService {
  static async listKPIs(options: ListOptions, _auth: AuthContext) {
    const { page, pageSize, departmentId, status } = options;
    const skip = (page - 1) * pageSize;

    const where: any = {};
    if (departmentId) where.departmentId = departmentId;
    if (status === "active") where.isActive = true;
    if (status === "inactive") where.isActive = false;

    const [kpis, total] = await Promise.all([
      prisma.kpi.findMany({
        where,
        include: {
          department: { select: { id: true, name: true } },
        },
        skip,
        take: pageSize,
        orderBy: { createdAt: "desc" },
      }),
      prisma.kpi.count({ where }),
    ]);

    return { kpis, total };
  }

  static async createKPI(input: CreateKPIInput, auth: AuthContext) {
    if (!isEditorRole(auth.roleName)) {
      throw {
        statusCode: 403,
        message: "Only admins/managers can create KPIs",
      };
    }

    if (!input.name || !String(input.name).trim()) {
      throw {
        statusCode: 400,
        message: "KPI name is required",
      };
    }

    const kpi = await prisma.kpi.create({
      data: {
        name: String(input.name).trim(),
        description: input.description || null,
        category: "general",
        kpiType: "legacy",
        measurementUnit: input.unit || "units",
        targetFrequency: input.frequency || "monthly",
        targetValue: input.targetValue,
        departmentId: input.departmentId || null,
        isActive: true,
      },
      include: {
        department: { select: { id: true, name: true } },
      },
    });

    return kpi;
  }

  static async getKPI(kpiId: number, _auth: AuthContext) {
    const kpi = await prisma.kpi.findUnique({
      where: { id: kpiId },
      include: {
        department: { select: { id: true, name: true } },
      },
    });

    if (!kpi) {
      throw {
        statusCode: 404,
        message: "KPI not found",
      };
    }

    return kpi;
  }

  static async updateKPI(kpiId: number, input: any, auth: AuthContext) {
    if (!isEditorRole(auth.roleName)) {
      throw {
        statusCode: 403,
        message: "Only admins/managers can update KPIs",
      };
    }

    const updated = await prisma.kpi.update({
      where: { id: kpiId },
      data: {
        name: input.name,
        description: input.description,
        measurementUnit: input.unit ?? input.measurementUnit,
        targetFrequency: input.frequency ?? input.targetFrequency,
        targetValue:
          input.targetValue !== undefined
            ? input.targetValue
            : undefined,
        departmentId:
          input.departmentId !== undefined
            ? input.departmentId
            : undefined,
        isActive:
          input.status === "inactive"
            ? false
            : input.status === "active"
              ? true
              : input.isActive,
      },
      include: {
        department: { select: { id: true, name: true } },
      },
    });

    return updated;
  }

  static async deleteKPI(kpiId: number, auth: AuthContext) {
    if (!isEditorRole(auth.roleName)) {
      throw {
        statusCode: 403,
        message: "Only admins/managers can delete KPIs",
      };
    }

    await prisma.kpi.update({
      where: { id: kpiId },
      data: { isActive: false },
    });

    return { success: true, id: kpiId };
  }

  static async getKPIPerformance(kpiId: number, _auth: AuthContext) {
    const kpi = await prisma.kpi.findUnique({
      where: { id: kpiId },
      select: {
        id: true,
        name: true,
        targetValue: true,
        measurementUnit: true,
        targetFrequency: true,
      },
    });

    if (!kpi) {
      throw {
        statusCode: 404,
        message: "KPI not found",
      };
    }

    const assignments = await prisma.employeeKpiAssignment.findMany({
      where: { kpiId },
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 50,
    });

    const performances = assignments.map((assignment) => {
      const target = toNumber(assignment.targetValue ?? kpi.targetValue);
      const achieved = toNumber(assignment.achievedValue);
      const variance = target > 0 ? ((achieved - target) / target) * 100 : 0;
      return {
        assignmentId: assignment.id,
        employeeId: assignment.employeeProfileId,
        employeeName: `${assignment.employee.firstName} ${assignment.employee.lastName}`.trim(),
        periodStart: assignment.periodStart,
        periodEnd: assignment.periodEnd,
        actualValue: achieved,
        targetValue: target,
        variance: Number(variance.toFixed(2)),
        status: achieved >= target ? "met" : "below",
      };
    });

    return {
      kpiId,
      name: kpi.name,
      targetValue: toNumber(kpi.targetValue),
      unit: kpi.measurementUnit,
      frequency: kpi.targetFrequency,
      performances,
    };
  }
}
