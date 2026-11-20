/**
 * Profile Service (Modernized - Phase 4)
 * Handles all profile-related operations
 */

import { prisma } from '../prisma';
import { Prisma } from '@prisma/client';

interface AuthContext {
  userId: number;
  profileId: number;
  roleName?: string;
  roles?: string[];
}

interface ListOptions {
  page: number;
  pageSize: number;
  roleId?: number;
  status?: string;
  search?: string;
}

interface UpdateProfileInput {
  firstName?: string;
  lastName?: string;
  phoneNumber?: string;
  profilePicture?: string;
  positionTitle?: string;
  hireDate?: Date | string | null;
  departmentId?: number;
  managerId?: number | null;
  status?: 'active' | 'inactive' | 'separated';
  separationDate?: Date | string | null;
  standardDailyHours?: number;
  billableTargetPercent?: number;
  nonBillableTargetPercent?: number;
}

export class ProfileService {
  private static resolveRoleSet(auth: AuthContext) {
    const roles = [
      ...(auth.roles || []),
      auth.roleName || "",
    ]
      .filter(Boolean)
      .map((role) => String(role).toLowerCase());
    return new Set(roles);
  }

  private static isPrivileged(auth: AuthContext) {
    const roles = this.resolveRoleSet(auth);
    return (
      roles.has("super_admin") ||
      roles.has("hr") ||
      roles.has("gmp")
    );
  }

  private static isManagerRole(auth: AuthContext) {
    const roles = this.resolveRoleSet(auth);
    return roles.has("manager") || roles.has("partner");
  }
  /**
   * List profiles with access control
   */
  static async listProfiles(options: ListOptions, auth: AuthContext) {
    const { page, pageSize, roleId, status, search } = options;
    const skip = (page - 1) * pageSize;

    let where: any = {};

    // ✅ SEARCH FILTERING
    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { user: { email: { contains: search, mode: 'insensitive' } } },
      ];
    }

    // ✅ ROLE FILTERING
    if (roleId) {
      where.roleId = roleId;
    }

    // ✅ STATUS FILTERING
    if (status) {
      where.status = status;
    }

    // ✅ ACCESS CONTROL
    if (!['super_admin', 'manager'].includes(auth.roleName || '')) {
      // Non-admins see only active profiles (not themselves)
      where.status = 'active';
    }

    const filters: any[] = [];
    if (search) {
      filters.push({
        OR: [
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
          { user: { email: { contains: search, mode: 'insensitive' } } },
        ],
      });
    }
    if (roleId) {
      filters.push({ roleId });
    }
    if (status) {
      filters.push({ status });
    }
    if (!this.isPrivileged(auth)) {
      if (this.isManagerRole(auth)) {
        filters.push({
          OR: [{ id: auth.profileId }, { managerId: auth.profileId }],
        });
      } else {
        filters.push({ id: auth.profileId });
      }
    }
    where = filters.length ? { AND: filters } : {};

    const [profiles, total] = await Promise.all([
      prisma.profile.findMany({
        where,
        include: {
          role: { select: { id: true, name: true, billingRate: true } },
          department: { select: { id: true, name: true } },
        manager: { select: { id: true, firstName: true, lastName: true } },
          user: { select: { email: true } },
        },
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.profile.count({ where }),
    ]);

    // ✅ REDACT SENSITIVE DATA
    const sanitized = profiles.map(p => ({
      ...p,
      email: p.user?.email,
      password: undefined,
    }));

    return { profiles: sanitized, total };
  }

  /**
   * Get profile by ID
   */
  static async getProfile(profileId: number, auth: AuthContext) {
    const profile = await prisma.profile.findUnique({
      where: { id: profileId },
      include: {
        role: { select: { id: true, name: true, billingRate: true } },
        department: { select: { id: true, name: true } },
        manager: { select: { id: true, firstName: true, lastName: true } },
        user: { select: { id: true, email: true } },
      },
    });

    if (!profile) {
      throw {
        statusCode: 404,
        message: 'Profile not found',
      };
    }

    // ✅ VERIFY ACCESS
    const canView =
      this.isPrivileged(auth) ||
      profileId === auth.profileId;

    if (!canView && profile.status !== 'active') {
      throw {
        statusCode: 403,
        message: 'You do not have permission to view this profile',
      };
    }

    // ✅ REDACT SENSITIVE DATA
    const isPrivileged = this.isPrivileged(auth);
    const isSelf = profileId === auth.profileId;
    const isManager = this.isManagerRole(auth);
    const isDirectReport = profile.managerId === auth.profileId;
    const canViewStrict = isPrivileged || isSelf || (isManager && isDirectReport);
    if (!canViewStrict) {
      throw {
        statusCode: 403,
        message: 'You do not have permission to view this profile',
      };
    }

    return {
      ...profile,
      email: profile.user?.email,
      password: undefined,
    };
  }

  /**
   * Update profile
   */
  static async updateProfile(
    profileId: number,
    input: UpdateProfileInput,
    auth: AuthContext
  ) {
    // ✅ VERIFY ACCESS
    const isSelf = profileId === auth.profileId;
    const canManageOrg = this.isPrivileged(auth);
    if (!isSelf && !canManageOrg) {
      throw {
        statusCode: 403,
        message: 'You can only update your own profile',
      };
    }

    const profile = await prisma.profile.findUnique({
      where: { id: profileId },
    });

    if (!profile) {
      throw {
        statusCode: 404,
        message: 'Profile not found',
      };
    }

    // ✅ WHITELIST FIELDS
    const normalizedStatus =
      typeof input.status === 'string'
        ? String(input.status).toLowerCase().trim()
        : undefined;
    const validStatuses = new Set(['active', 'inactive', 'separated']);
    if (normalizedStatus && !validStatuses.has(normalizedStatus)) {
      throw {
        statusCode: 400,
        message: 'Invalid status. Allowed values: active, inactive, separated',
      };
    }

    const allowedFields = [
      'firstName',
      'lastName',
      'phoneNumber',
      'profilePicture',
    ];

    // Privileged roles can update organization fields.
    if (
      canManageOrg &&
      ('departmentId' in input ||
        'managerId' in input ||
        'positionTitle' in input ||
        'hireDate' in input ||
        'status' in input ||
        'separationDate' in input)
    ) {
      allowedFields.push(
        'departmentId',
        'managerId',
        'positionTitle',
        'hireDate',
        'status',
        'separationDate'
      );
    }

    if (
      canManageOrg &&
      ('standardDailyHours' in input ||
        'billableTargetPercent' in input ||
        'nonBillableTargetPercent' in input)
    ) {
      allowedFields.push(
        'standardDailyHours',
        'billableTargetPercent',
        'nonBillableTargetPercent'
      );
    }

    const updateData: Record<string, any> = {};

    for (const field of allowedFields) {
      const value = input[field as keyof UpdateProfileInput];
      if (value !== undefined) {
        if (field === 'status') {
          updateData.status = normalizedStatus;
        } else if (field === 'hireDate' || field === 'separationDate') {
          updateData[field] = value ? new Date(value) : null;
        } else {
          updateData[field] = value;
        }
      }
    }

    if (updateData.standardDailyHours !== undefined) {
      updateData.standardDailyHours = Number(updateData.standardDailyHours);
    }

    if (
      updateData.billableTargetPercent !== undefined ||
      updateData.nonBillableTargetPercent !== undefined
    ) {
      const billable =
        updateData.billableTargetPercent !== undefined
          ? Number(updateData.billableTargetPercent)
          : 100 - Number(updateData.nonBillableTargetPercent);
      const nonBillable =
        updateData.nonBillableTargetPercent !== undefined
          ? Number(updateData.nonBillableTargetPercent)
          : 100 - billable;

      updateData.billableTargetPercent = billable;
      updateData.nonBillableTargetPercent = nonBillable;
      updateData.utilizationTarget = Number((billable / 100).toFixed(4));
    }

    if (typeof updateData.managerId === 'number' && updateData.managerId === profileId) {
      throw {
        statusCode: 400,
        message: 'managerId cannot be the same as profile id',
      };
    }

    const nextStatus = String(updateData.status || profile.status).toLowerCase();
    const statusChanged =
      Boolean(updateData.status) &&
      nextStatus !== String(profile.status).toLowerCase();

    if (statusChanged && isSelf) {
      throw {
        statusCode: 400,
        message: 'You cannot change your own account status',
      };
    }

    if (statusChanged) {
      if (nextStatus === 'active') {
        updateData.separationDate = null;
      } else if (nextStatus === 'separated' && !updateData.separationDate) {
        updateData.separationDate = new Date();
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      const updatedProfile = await tx.profile.update({
        where: { id: profileId },
        data: {
          ...updateData,
          updatedAt: new Date(),
        },
        include: {
          role: { select: { id: true, name: true, billingRate: true } },
          department: { select: { id: true, name: true } },
        manager: { select: { id: true, firstName: true, lastName: true } },
          user: { select: { id: true, email: true } },
        },
      });

      if (statusChanged && profile.userId) {
        await tx.user.update({
          where: { id: profile.userId },
          data: {
            isActive: nextStatus === 'active',
          },
        });

        if (nextStatus !== 'active') {
          await tx.session.updateMany({
            where: {
              userId: profile.userId,
              revokedAt: null,
            },
            data: {
              revokedAt: new Date(),
            },
          });
        }
      }

      return updatedProfile;
    });

    return {
      ...updated,
      email: updated.user?.email,
      password: undefined,
    };
  }

  /**
   * Delete profile (hard delete when possible, otherwise archive)
   */
  static async deleteProfile(profileId: number, auth: AuthContext) {
    if (!this.isPrivileged(auth)) {
      throw {
        statusCode: 403,
        message: 'You do not have permission to delete profiles',
      };
    }

    if (profileId === auth.profileId) {
      throw {
        statusCode: 400,
        message: 'You cannot delete your own profile',
      };
    }

    const profile = await prisma.profile.findUnique({
      where: { id: profileId },
      select: {
        id: true,
        userId: true,
        firstName: true,
        lastName: true,
      },
    });

    if (!profile) {
      throw {
        statusCode: 404,
        message: 'Profile not found',
      };
    }

    try {
      await prisma.$transaction(async (tx) => {
        if (profile.userId) {
          await tx.user.delete({ where: { id: profile.userId } });
        } else {
          await tx.profile.delete({ where: { id: profile.id } });
        }
      });

      return {
        mode: 'deleted',
        profileId: profile.id,
      };
    } catch (error: any) {
      const isForeignKeyConstraint =
        error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003';

      if (!isForeignKeyConstraint) {
        throw error;
      }

      // If hard delete is blocked by historical relations, archive the account instead.
      await prisma.$transaction(async (tx) => {
        await tx.profile.update({
          where: { id: profile.id },
          data: {
            status: 'separated',
            separationDate: new Date(),
          },
        });

        if (profile.userId) {
          await tx.user.update({
            where: { id: profile.userId },
            data: {
              isActive: false,
              isVerified: false,
              password: null,
              resetToken: null,
            },
          });
          await tx.session.deleteMany({
            where: { userId: profile.userId },
          });
          await tx.userAuthRole.deleteMany({
            where: { userId: profile.userId },
          });
        }
      });

      return {
        mode: 'archived',
        profileId: profile.id,
      };
    }
  }

  /**
   * Get profile by email
   */
  static async getProfileByEmail(email: string, auth?: AuthContext) {
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        profile: {
          include: {
            role: { select: { id: true, name: true, billingRate: true } },
            department: { select: { id: true, name: true } },
        manager: { select: { id: true, firstName: true, lastName: true } },
          },
        },
      },
    });

    if (!user?.profile) {
      throw {
        statusCode: 404,
        message: 'Profile not found',
      };
    }

    if (auth) {
      const profileId = user.profile.id;
      const isPrivileged = this.isPrivileged(auth);
      const isSelf = profileId === auth.profileId;
      const isManager = this.isManagerRole(auth);
      const isDirectReport = user.profile.managerId === auth.profileId;
      const canView = isPrivileged || isSelf || (isManager && isDirectReport);
      if (!canView) {
        throw {
          statusCode: 403,
          message: 'You do not have permission to view this profile',
        };
      }
    }

    return {
      ...user.profile,
      email: user.email,
      password: undefined,
    };
  }

  /**
   * Get profile summary stats
   */
  static async getProfileStats(profileId: number, auth: AuthContext) {
    const profile = await prisma.profile.findUnique({
      where: { id: profileId },
    });

    if (!profile) {
      throw {
        statusCode: 404,
        message: 'Profile not found',
      };
    }

    // ✅ VERIFY ACCESS
    const canView =
      this.isPrivileged(auth) ||
      profileId === auth.profileId;

    if (!canView) {
      throw {
        statusCode: 403,
        message: 'You do not have permission to view these stats',
      };
    }

    // Get counts for profile
    const [
      evaluationsGiven,
      evaluationsReceived,
      timeEntriesSubmitted,
      jobsAssigned,
    ] = await Promise.all([
      prisma.evaluationAssignment.count({
        where: { evaluatorProfileId: profileId },
      }),
      prisma.evaluationAssignment.count({
        where: { evaluateeProfileId: profileId },
      }),
      prisma.timeEntry.count({
        where: { employeeProfileId: profileId },
      }),
      prisma.jobStaffAssignment.count({
        where: { employeeProfileId: profileId },
      }),
    ]);

    return {
      profileId,
      evaluationsGiven,
      evaluationsReceived,
      timeEntriesSubmitted,
      jobsAssigned,
      memberSince: profile.createdAt,
    };
  }

  /**
   * List team members (for managers)
   */
  static async getTeamMembers(profileId: number, auth: AuthContext) {
    // ✅ VERIFY ACCESS
    if (profileId !== auth.profileId && !this.isPrivileged(auth)) {
      throw {
        statusCode: 403,
        message: 'You can only view your own team',
      };
    }

    const manager = await prisma.profile.findUnique({
      where: { id: profileId },
      include: {
        department: {
          include: {
            profiles: {
              include: {
                role: { select: { id: true, name: true, billingRate: true } },
              },
            },
          },
        },
      },
    });

    if (!manager || !manager.department) {
      throw {
        statusCode: 404,
        message: 'Manager or department not found',
      };
    }

    return manager.department.profiles.map((m) => ({
      ...m,
      password: undefined,
    }));
  }

  /**
   * Search profiles
   */
  static async searchProfiles(query: string, limit: number = 10, auth?: AuthContext) {
    const filters: any[] = [
      {
        OR: [
          { firstName: { contains: query, mode: 'insensitive' } },
          { lastName: { contains: query, mode: 'insensitive' } },
          { user: { email: { contains: query, mode: 'insensitive' } } },
        ],
      },
      { status: 'active' },
    ];

    if (auth && !this.isPrivileged(auth)) {
      if (this.isManagerRole(auth)) {
        filters.push({
          OR: [{ id: auth.profileId }, { managerId: auth.profileId }],
        });
      } else {
        filters.push({ id: auth.profileId });
      }
    }

    const profiles = await prisma.profile.findMany({
      where: { AND: filters },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        user: { select: { email: true } },
        role: { select: { name: true } },
      },
      take: limit,
    });

    return profiles.map(profile => ({
      ...profile,
      email: profile.user?.email,
    }));
  }
}
