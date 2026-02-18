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
  isPartner?: boolean;
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
  departmentId?: number;
  managerId?: number | null;
  first_name?: string;
  last_name?: string;
  phone_number?: string;
  avatar_url?: string;
  department_id?: number;
  manager_id?: number | null;
}

export class ProfileService {
  private static resolveRoleSet(auth: AuthContext) {
    const roles = [
      ...(auth.roles || []),
      auth.roleName || "",
      auth.isPartner ? "partner" : "",
    ]
      .filter(Boolean)
      .map((role) => String(role).toLowerCase());
    return new Set(roles);
  }

  private static isPrivileged(auth: AuthContext) {
    const roles = this.resolveRoleSet(auth);
    return (
      roles.has("admin") ||
      roles.has("super_admin") ||
      roles.has("hr") ||
      roles.has("hr_manager") ||
      roles.has("gmp") ||
      roles.has("group_managing_partner")
    );
  }

  private static isManagerRole(auth: AuthContext) {
    const roles = this.resolveRoleSet(auth);
    return Array.from(roles).some(
      (role) => role.includes("manager") || role.includes("team lead") || role === "partner"
    );
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
    if (!['admin', 'manager'].includes(auth.roleName || '')) {
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
          role: { select: { id: true, name: true } },
          department: { select: { id: true, name: true } },
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
        role: { select: { id: true, name: true } },
        department: { select: { id: true, name: true } },
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
      auth.roleName === 'admin' ||
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
    const allowedFields = [
      'firstName',
      'lastName',
      'phoneNumber',
      'profilePicture',
      'first_name',
      'last_name',
      'phone_number',
      'avatar_url',
    ];

    // Privileged roles can update organization fields.
    if (
      canManageOrg &&
      ('departmentId' in input ||
        'department_id' in input ||
        'managerId' in input ||
        'manager_id' in input)
    ) {
      allowedFields.push('departmentId', 'department_id', 'managerId', 'manager_id');
    }

    const updateData: Record<string, any> = {};

    for (const field of allowedFields) {
      const value = input[field as keyof UpdateProfileInput];
      if (value !== undefined) {
        if (field === 'first_name') updateData.firstName = value;
        else if (field === 'last_name') updateData.lastName = value;
        else if (field === 'phone_number') updateData.phoneNumber = value;
        else if (field === 'avatar_url') updateData.profilePicture = value;
        else if (field === 'department_id') updateData.departmentId = value;
        else if (field === 'manager_id') updateData.managerId = value;
        else updateData[field] = value;
      }
    }

    if (typeof updateData.managerId === 'number' && updateData.managerId === profileId) {
      throw {
        statusCode: 400,
        message: 'manager_id cannot be the same as profile id',
      };
    }

    const updated = await prisma.profile.update({
      where: { id: profileId },
      data: {
        ...updateData,
        updatedAt: new Date(),
      },
      include: {
        role: { select: { id: true, name: true } },
        department: { select: { id: true, name: true } },
        user: { select: { email: true } },
      },
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
            role: { select: { id: true, name: true } },
            department: { select: { id: true, name: true } },
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
      auth.roleName === 'admin' ||
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
    if (profileId !== auth.profileId && auth.roleName !== 'admin') {
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
                role: { select: { id: true, name: true } },
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
