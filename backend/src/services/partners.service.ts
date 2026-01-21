import { prisma } from '../prisma';

interface AuthContext {
  userId: number;
  profileId: number;
  roleName?: string;
}

interface ListOptions {
  page: number;
  pageSize: number;
  status?: string;
}

export class PartnerService {
  /**
   * List partners (profiles with isPartner flag)
   */
  static async listPartners(options: ListOptions, auth: AuthContext) {
    const { page, pageSize, status } = options;
    const skip = (page - 1) * pageSize;

    const where: any = {
      isPartner: true,
    };

    if (status) where.status = status;

    const [partners, total] = await Promise.all([
      prisma.profile.findMany({
        where,
        include: {
          role: { select: { id: true, name: true } },
          user: { select: { id: true, email: true } },
        },
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.profile.count({ where }),
    ]);

    return { partners, total };
  }

  /**
   * Create new partner
   */
  static async createPartner(input: any, auth: AuthContext) {
    // ✅ VERIFY AUTHORIZATION
    if (!['admin', 'manager'].includes(auth.roleName || '')) {
      throw {
        statusCode: 403,
        message: 'Only admins/managers can create partners',
      };
    }

    const { firstName, lastName, phoneNumber, roleId } = input;

    // ✅ VERIFY ROLE EXISTS
    const role = await prisma.positionRole.findUnique({
      where: { id: roleId },
    });

    if (!role) {
      throw {
        statusCode: 400,
        message: 'Invalid role for partner',
      };
    }

    const partner = await prisma.profile.create({
      data: {
        firstName,
        lastName,
        phoneNumber: phoneNumber || null,
        roleId,
        status: 'active',
        isPartner: true,
      },
      include: {
        role: { select: { id: true, name: true } },
      },
    });

    return partner;
  }

  /**
   * Get specific partner
   */
  static async getPartner(partnerId: number, auth: AuthContext) {
    const partner = await prisma.profile.findUnique({
      where: { id: partnerId },
      include: {
        role: { select: { id: true, name: true } },
        user: { select: { id: true, email: true } },
      },
    });

    if (!partner) {
      throw {
        statusCode: 404,
        message: 'Partner not found',
      };
    }

    // ✅ VERIFY ACCESS - can only view self or if admin/manager
    const canView =
      auth.roleName === 'admin' ||
      auth.roleName === 'manager' ||
      partnerId === auth.profileId;

    if (!canView) {
      throw {
        statusCode: 403,
        message: 'You do not have permission to view this partner',
      };
    }

    return partner;
  }

  /**
   * Update partner
   */
  static async updatePartner(partnerId: number, input: any, auth: AuthContext) {
    // ✅ VERIFY AUTHORIZATION
    if (
      partnerId !== auth.profileId &&
      !['admin', 'manager'].includes(auth.roleName || '')
    ) {
      throw {
        statusCode: 403,
        message: 'You can only update your own partner profile',
      };
    }

    const partner = await prisma.profile.findUnique({
      where: { id: partnerId },
    });

    if (!partner) {
      throw {
        statusCode: 404,
        message: 'Partner not found',
      };
    }

    // ✅ WHITELIST FIELDS (using camelCase)
    const allowedFields = [
      'firstName',
      'lastName',
      'phoneNumber',
      'positionTitle',
    ];

    const updateData: Record<string, any> = {};

    for (const field of allowedFields) {
      if (field in input) {
        updateData[field] = input[field];
      }
    }

    const updated = await prisma.profile.update({
      where: { id: partnerId },
      data: updateData,
      include: {
        role: { select: { id: true, name: true } },
        user: { select: { id: true, email: true } },
      },
    });

    return updated;
  }

  /**
   * Get partner's jobs
   */
  static async getPartnerJobs(partnerId: number, auth: AuthContext) {
    const partner = await prisma.profile.findUnique({
      where: { id: partnerId },
    });

    if (!partner) {
      throw {
        statusCode: 404,
        message: 'Partner not found',
      };
    }

    // ✅ VERIFY ACCESS
    const canView =
      auth.roleName === 'admin' ||
      auth.roleName === 'manager' ||
      partnerId === auth.profileId;

    if (!canView) {
      throw {
        statusCode: 403,
        message: 'You do not have permission to view these jobs',
      };
    }

    const jobs = await prisma.job.findMany({
      where: { partnerProfileId: partnerId },
      include: {
        client: { select: { id: true, clientName: true } },
        staffing: { select: { id: true, employeeProfileId: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return jobs;
  }

  /**
   * Get partner revenue summary
   */
  static async getPartnerRevenue(partnerId: number, auth: AuthContext) {
    const partner = await prisma.profile.findUnique({
      where: { id: partnerId },
    });

    if (!partner) {
      throw {
        statusCode: 404,
        message: 'Partner not found',
      };
    }

    // ✅ VERIFY ACCESS
    const canView =
      auth.roleName === 'admin' ||
      auth.roleName === 'manager' ||
      partnerId === auth.profileId;

    if (!canView) {
      throw {
        statusCode: 403,
        message: 'You do not have permission to view this revenue',
      };
    }

    // Get all jobs for partner
    const jobs = await prisma.job.findMany({
      where: { partnerProfileId: partnerId },
      include: {
        timeEntries: {
          where: { status: 'approved' },
        },
      },
    });

    let totalApprovedHours = 0;
    let totalBudget = 0;
    let jobsCompleted = 0;

    for (const job of jobs) {
      if (job.status === 'completed') jobsCompleted++;
      totalBudget += Number(job.budgetHours) || 0;
      totalApprovedHours += job.timeEntries.reduce((sum, te) => sum + Number(te.hours), 0);
    }

    return {
      partnerId,
      totalJobs: jobs.length,
      jobsCompleted,
      jobsInProgress: jobs.filter(j => j.status === 'in_progress').length,
      totalBudget,
      totalApprovedHours,
      averageBudgetPerJob: jobs.length > 0 ? totalBudget / jobs.length : 0,
    };
  }
}
