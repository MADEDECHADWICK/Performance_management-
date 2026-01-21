/**
 * KPIs Service (Modernized - Phase 4)
 */

import { prisma } from '../prisma';

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
  target_value: number;
  unit?: string;
  frequency?: string;
  department_id?: number;
}

export class KPIService {
  /**
   * List KPIs with pagination
   */
  static async listKPIs(options: ListOptions, auth: AuthContext) {
    const { page, pageSize, departmentId, status } = options;
    const skip = (page - 1) * pageSize;

    const where: any = {};

    if (departmentId) where.department_id = departmentId;
    if (status) where.status = status;

    const [kpis, total] = await Promise.all([
      prisma.kpi.findMany({
        where,
        include: {
          department: { select: { id: true, name: true } },
        },
        skip,
        take: pageSize,
        orderBy: { created_at: 'desc' },
      }),
      prisma.kpi.count({ where }),
    ]);

    return { kpis, total };
  }

  /**
   * Create KPI (admin/manager only)
   */
  static async createKPI(input: CreateKPIInput, auth: AuthContext) {
    // ✅ VERIFY AUTHORIZATION
    if (!['admin', 'manager'].includes(auth.roleName || '')) {
      throw {
        statusCode: 403,
        message: 'Only admins/managers can create KPIs',
      };
    }

    const { name, description, target_value, unit, frequency, department_id } = input;

    const kpi = await prisma.kpi.create({
      data: {
        name,
        description: description || null,
        target_value,
        unit: unit || 'units',
        frequency: frequency || 'monthly',
        department_id: department_id || null,
        status: 'active',
        created_at: new Date(),
      },
      include: {
        department: { select: { id: true, name: true } },
      },
    });

    return kpi;
  }

  /**
   * Get KPI
   */
  static async getKPI(kpiId: number, auth: AuthContext) {
    const kpi = await prisma.kpi.findUnique({
      where: { id: kpiId },
      include: {
        department: { select: { id: true, name: true } },
      },
    });

    if (!kpi) {
      throw {
        statusCode: 404,
        message: 'KPI not found',
      };
    }

    return kpi;
  }

  /**
   * Update KPI
   */
  static async updateKPI(kpiId: number, input: any, auth: AuthContext) {
    // ✅ VERIFY AUTHORIZATION
    if (!['admin', 'manager'].includes(auth.roleName || '')) {
      throw {
        statusCode: 403,
        message: 'Only admins/managers can update KPIs',
      };
    }

    const kpi = await prisma.kpi.findUnique({
      where: { id: kpiId },
    });

    if (!kpi) {
      throw {
        statusCode: 404,
        message: 'KPI not found',
      };
    }

    // ✅ WHITELIST FIELDS
    const allowedFields = ['name', 'description', 'target_value', 'unit', 'frequency'];

    const updateData: Record<string, any> = {};

    for (const field of allowedFields) {
      if (field in input) {
        updateData[field] = input[field];
      }
    }

    const updated = await prisma.kpi.update({
      where: { id: kpiId },
      data: {
        ...updateData,
        updated_at: new Date(),
      },
      include: {
        department: { select: { id: true, name: true } },
      },
    });

    return updated;
  }

  /**
   * Delete KPI
   */
  static async deleteKPI(kpiId: number, auth: AuthContext) {
    // ✅ VERIFY AUTHORIZATION
    if (auth.roleName !== 'admin') {
      throw {
        statusCode: 403,
        message: 'Only admins can delete KPIs',
      };
    }

    const kpi = await prisma.kpi.findUnique({
      where: { id: kpiId },
    });

    if (!kpi) {
      throw {
        statusCode: 404,
        message: 'KPI not found',
      };
    }

    await prisma.kpi.delete({
      where: { id: kpiId },
    });

    return true;
  }

  /**
   * Get KPI performance
   */
  static async getKPIPerformance(kpiId: number, auth: AuthContext) {
    const kpi = await prisma.kpi.findUnique({
      where: { id: kpiId },
    });

    if (!kpi) {
      throw {
        statusCode: 404,
        message: 'KPI not found',
      };
    }

    // Get performance records for this KPI
    const performances = await prisma.kpiPerformance.findMany({
      where: { kpi_id: kpiId },
      orderBy: { period_start: 'desc' },
      take: 12, // Last 12 periods
    });

    return {
      kpiId,
      name: kpi.name,
      targetValue: kpi.target_value,
      unit: kpi.unit,
      frequency: kpi.frequency,
      performances: performances.map(p => ({
        period: p.period_start,
        actualValue: p.actual_value,
        variance: ((p.actual_value - kpi.target_value) / kpi.target_value) * 100,
        status: p.actual_value >= kpi.target_value ? 'met' : 'below',
      })),
    };
  }
}