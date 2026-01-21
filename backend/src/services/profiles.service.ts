/**
 * Profile Service (Modernized - Phase 4)
 * Handles all profile-related operations
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
  first_name?: string;
  last_name?: string;
  phone_number?: string;
  avatar_url?: string;
  department_id?: number;
}

export class ProfileService {
  /**
   * List profiles with access control
   */
  static async listProfiles(options: ListOptions, auth: AuthContext) {
    const { page, pageSize, roleId, status, search } = options;
    const skip = (page - 1) * pageSize;

    const where: any = {};

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
    if (profileId !== auth.profileId && auth.roleName !== 'admin') {
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

    // Only admins can update department
    if (auth.roleName === 'admin' && ('departmentId' in input || 'department_id' in input)) {
      allowedFields.push('departmentId', 'department_id');
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
        else updateData[field] = value;
      }
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
   * Get profile by email
   */
  static async getProfileByEmail(email: string) {
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
      prisma.evaluation.count({
        where: { evaluator_profile_id: profileId },
      }),
      prisma.evaluation.count({
        where: { evaluatee_profile_id: profileId },
      }),
      prisma.timeEntry.count({
        where: { employee_profile_id: profileId },
      }),
      prisma.jobStaffing.count({
        where: { employee_profile_id: profileId },
      }),
    ]);

    return {
      profileId,
      evaluationsGiven,
      evaluationsReceived,
      timeEntriesSubmitted,
      jobsAssigned,
      memberSince: profile.created_at,
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
            members: {
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

    return manager.department.members.map(m => ({
      ...m,
      password: undefined,
    }));
  }

  /**
   * Search profiles
   */
  static async searchProfiles(query: string, limit: number = 10) {
    const profiles = await prisma.profile.findMany({
      where: {
        OR: [
          { firstName: { contains: query, mode: 'insensitive' } },
          { lastName: { contains: query, mode: 'insensitive' } },
          { user: { email: { contains: query, mode: 'insensitive' } } },
        ],
        status: 'active',
      },
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
