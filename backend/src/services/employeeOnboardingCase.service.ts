import prisma from "../prisma";
import { OnboardingStatus } from "@prisma/client";

export interface AuthContext {
  userId: number;
  profileId: number;
  roles?: string[];
}

export interface CreateOnboardingCaseInput {
  candidateId?: number;
  profileId?: number; // employee profile (if already created)
  hrOwnerProfileId?: number;
  startDate?: Date;
  dueDate?: Date;
  notes?: string;
}

export interface UpdateOnboardingCaseInput {
  status?: OnboardingStatus;
  hrOwnerProfileId?: number | null;
  startDate?: Date | null;
  dueDate?: Date | null;
  notes?: string | null;
}

export interface ListOnboardingCasesOptions {
  page: number;
  pageSize: number;
  filters?: {
    status?: OnboardingStatus;
    hrOwnerProfileId?: number;
    profileId?: number;
    candidateId?: number;
  };
}

class EmployeeOnboardingCaseServiceImpl {
  private isPrivileged(auth: AuthContext) {
    const roles = auth.roles ?? [];
    return (
      roles.includes("admin") ||
      roles.includes("super_admin") ||
      roles.includes("hr") ||
      roles.includes("hr_manager")
    );
  }

  private async assertCanView(caseId: number, auth: AuthContext) {
    if (this.isPrivileged(auth)) return;

    const found = await prisma.employeeOnboardingCase.findUnique({
      where: { id: caseId },
      select: { profileId: true, hrOwnerProfileId: true },
    });

    if (!found) {
      const err = new Error("Onboarding case not found");
      (err as any).statusCode = 404;
      throw err;
    }

    const isOwner = found.hrOwnerProfileId === auth.profileId;
    const isEmployee = found.profileId === auth.profileId;

    if (!isOwner && !isEmployee) {
      const err = new Error("Forbidden");
      (err as any).statusCode = 403;
      throw err;
    }
  }

  async create(input: CreateOnboardingCaseInput, auth: AuthContext) {
    if (!this.isPrivileged(auth)) {
      const err = new Error("Forbidden");
      (err as any).statusCode = 403;
      throw err;
    }

    if (!input.candidateId && !input.profileId) {
      const err = new Error("Either candidateId or profileId is required");
      (err as any).statusCode = 400;
      throw err;
    }

    // Enforce uniqueness rules in schema: candidateId unique, profileId unique
    if (input.candidateId) {
      const existing = await prisma.employeeOnboardingCase.findUnique({
        where: { candidateId: input.candidateId },
        select: { id: true },
      });
      if (existing) {
        const err = new Error("Onboarding case already exists for this candidate");
        (err as any).statusCode = 409;
        throw err;
      }
    }

    if (input.profileId) {
      const existing = await prisma.employeeOnboardingCase.findUnique({
        where: { profileId: input.profileId },
        select: { id: true },
      });
      if (existing) {
        const err = new Error("Onboarding case already exists for this employee profile");
        (err as any).statusCode = 409;
        throw err;
      }
    }

    const created = await prisma.employeeOnboardingCase.create({
      data: {
        candidateId: input.candidateId,
        profileId: input.profileId,
        hrOwnerProfileId: input.hrOwnerProfileId,
        startDate: input.startDate,
        dueDate: input.dueDate,
        notes: input.notes,
        status: OnboardingStatus.pending,
      },
      include: {
        candidate: { select: { id: true, fullName: true, email: true, stage: true } },
        employee: { select: { id: true, firstName: true, lastName: true, user: { select: { email: true } } } },
        hrOwner: { select: { id: true, firstName: true, lastName: true } },
        inductionChecklist: { select: { id: true, status: true, completionPercent: true } },
      },
    });

    return created;
  }

  async getById(caseId: number, auth: AuthContext) {
    await this.assertCanView(caseId, auth);

    const found = await prisma.employeeOnboardingCase.findUnique({
      where: { id: caseId },
      include: {
        candidate: { select: { id: true, fullName: true, email: true, stage: true } },
        employee: { select: { id: true, firstName: true, lastName: true, user: { select: { email: true } } } },
        hrOwner: { select: { id: true, firstName: true, lastName: true } },
        inductionChecklist: {
          include: { items: { orderBy: { orderIndex: "asc" } } },
        },
      },
    });

    if (!found) {
      const err = new Error("Onboarding case not found");
      (err as any).statusCode = 404;
      throw err;
    }

    return found;
  }

  async list(options: ListOnboardingCasesOptions, auth: AuthContext) {
    const { page, pageSize, filters = {} } = options;
    const skip = (page - 1) * pageSize;

    const where: any = {};

    // Non-privileged users only see cases they own/are assigned to
    if (!this.isPrivileged(auth)) {
      where.OR = [{ profileId: auth.profileId }, { hrOwnerProfileId: auth.profileId }];
    } else {
      if (filters.status) where.status = filters.status;
      if (filters.hrOwnerProfileId) where.hrOwnerProfileId = filters.hrOwnerProfileId;
      if (filters.profileId) where.profileId = filters.profileId;
      if (filters.candidateId) where.candidateId = filters.candidateId;
    }

    const [records, total] = await Promise.all([
      prisma.employeeOnboardingCase.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: "desc" },
        include: {
          candidate: { select: { id: true, fullName: true, stage: true } },
          employee: { select: { id: true, firstName: true, lastName: true } },
          hrOwner: { select: { id: true, firstName: true, lastName: true } },
          inductionChecklist: { select: { id: true, status: true, completionPercent: true } },
        },
      }),
      prisma.employeeOnboardingCase.count({ where }),
    ]);

    return { records, total };
  }

  async update(caseId: number, input: UpdateOnboardingCaseInput, auth: AuthContext) {
    if (!this.isPrivileged(auth)) {
      const err = new Error("Forbidden");
      (err as any).statusCode = 403;
      throw err;
    }

    // Ensure exists
    await prisma.employeeOnboardingCase.findUniqueOrThrow({ where: { id: caseId } });

    return prisma.employeeOnboardingCase.update({
      where: { id: caseId },
      data: {
        status: input.status,
        hrOwnerProfileId: input.hrOwnerProfileId,
        startDate: input.startDate,
        dueDate: input.dueDate,
        notes: input.notes,
      },
      include: {
        candidate: { select: { id: true, fullName: true, stage: true } },
        employee: { select: { id: true, firstName: true, lastName: true } },
        hrOwner: { select: { id: true, firstName: true, lastName: true } },
        inductionChecklist: { select: { id: true, status: true, completionPercent: true } },
      },
    });
  }
}

export const EmployeeOnboardingCaseService = new EmployeeOnboardingCaseServiceImpl();
