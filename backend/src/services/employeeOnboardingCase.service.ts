import prisma from "../prisma";
import { createAudit } from "../utils/audit";
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

export interface UpdateOnboardingStageInput {
  status?: OnboardingStatus;
  ownerProfileId?: number | null;
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
  private defaultStages = [
    {
      key: "offer_contract",
      title: "Offer & Contract",
      description: "Offer issued, accepted, and contract signed.",
      order: 1,
    },
    {
      key: "documentation",
      title: "Documentation & Compliance",
      description: "ID, tax forms, and compliance documents collected.",
      order: 2,
    },
    {
      key: "induction",
      title: "Induction & Checklist",
      description: "Complete induction checklist and policy briefing.",
      order: 3,
    },
    {
      key: "access_setup",
      title: "Tools & Access",
      description: "Systems access, devices, and email setup.",
      order: 4,
    },
    {
      key: "role_training",
      title: "Role Training",
      description: "Role-specific training and shadowing.",
      order: 5,
    },
    {
      key: "probation_review",
      title: "Probation Review",
      description: "Probation check-in and confirmation.",
      order: 6,
    },
  ];
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

    const defaultBillingRole = await prisma.positionRole.findFirst({
      where: {
        name: { in: ["Associate", "Trainee"] },
        isActive: true,
      },
      orderBy: { name: "asc" },
    });

    if (input.profileId && defaultBillingRole) {
      const profile = await prisma.profile.findUnique({
        where: { id: input.profileId },
        select: { id: true, roleId: true },
      });

      if (profile && !profile.roleId) {
        await prisma.profile.update({
          where: { id: profile.id },
          data: { roleId: defaultBillingRole.id },
        });
      }
    }

    const created = await prisma.$transaction(async (tx) => {
      const onboardingCase = await tx.employeeOnboardingCase.create({
        data: {
          candidateId: input.candidateId,
          profileId: input.profileId,
          hrOwnerProfileId: input.hrOwnerProfileId,
          startDate: input.startDate,
          dueDate: input.dueDate,
          notes: input.notes,
          status: OnboardingStatus.pending,
        },
      });

      await tx.employeeOnboardingStage.createMany({
        data: this.defaultStages.map((stage) => ({
          onboardingCaseId: onboardingCase.id,
          stageKey: stage.key,
          title: stage.title,
          description: stage.description,
          orderIndex: stage.order,
          status: OnboardingStatus.pending,
          ownerProfileId: input.hrOwnerProfileId ?? undefined,
        })),
      });

      return tx.employeeOnboardingCase.findUnique({
        where: { id: onboardingCase.id },
        include: {
          candidate: { select: { id: true, fullName: true, email: true, stage: true } },
          employee: { select: { id: true, firstName: true, lastName: true, user: { select: { email: true } } } },
          hrOwner: { select: { id: true, firstName: true, lastName: true } },
          inductionChecklist: { select: { id: true, status: true, completionPercent: true } },
          stages: {
            orderBy: { orderIndex: "asc" },
            include: { owner: { select: { id: true, firstName: true, lastName: true } } },
          },
        },
      });
    });

    await createAudit({
      action: "create_onboarding_case",
      entity_type: "EmployeeOnboardingCase",
      user_id: auth.userId,
    }).catch(() => null);

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
        stages: {
          orderBy: { orderIndex: "asc" },
          include: { owner: { select: { id: true, firstName: true, lastName: true } } },
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
          stages: {
            orderBy: { orderIndex: "asc" },
            include: { owner: { select: { id: true, firstName: true, lastName: true } } },
          },
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

    const updated = await prisma.employeeOnboardingCase.update({
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

    await createAudit({
      action: `update_onboarding_case_${updated.status || "updated"}`,
      entity_type: "EmployeeOnboardingCase",
      user_id: auth.userId,
    }).catch(() => null);

    return updated;
  }

  async updateStage(stageId: number, input: UpdateOnboardingStageInput, auth: AuthContext) {
    if (!this.isPrivileged(auth)) {
      const err = new Error("Forbidden");
      (err as any).statusCode = 403;
      throw err;
    }

    const stage = await prisma.employeeOnboardingStage.findUnique({
      where: { id: stageId },
      select: { id: true, onboardingCaseId: true },
    });

    if (!stage) {
      const err = new Error("Onboarding stage not found");
      (err as any).statusCode = 404;
      throw err;
    }

    const updated = await prisma.employeeOnboardingStage.update({
      where: { id: stageId },
      data: {
        status: input.status,
        ownerProfileId: input.ownerProfileId,
        dueDate: input.dueDate,
        notes: input.notes,
        completedAt:
          input.status === OnboardingStatus.completed ? new Date() : undefined,
      },
      include: {
        owner: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    const stages = await prisma.employeeOnboardingStage.findMany({
      where: { onboardingCaseId: stage.onboardingCaseId },
      select: { status: true },
    });

    let caseStatus: OnboardingStatus = OnboardingStatus.pending;
    if (stages.every((s) => s.status === OnboardingStatus.completed)) {
      caseStatus = OnboardingStatus.completed;
    } else if (stages.some((s) => s.status === OnboardingStatus.in_progress || s.status === OnboardingStatus.completed)) {
      caseStatus = OnboardingStatus.in_progress;
    }

    await prisma.employeeOnboardingCase.update({
      where: { id: stage.onboardingCaseId },
      data: { status: caseStatus },
    });

    return updated;
  }

  async initializeStages(caseId: number, auth: AuthContext) {
    if (!this.isPrivileged(auth)) {
      const err = new Error("Forbidden");
      (err as any).statusCode = 403;
      throw err;
    }

    const onboardingCase = await prisma.employeeOnboardingCase.findUnique({
      where: { id: caseId },
      select: { id: true, hrOwnerProfileId: true },
    });

    if (!onboardingCase) {
      const err = new Error("Onboarding case not found");
      (err as any).statusCode = 404;
      throw err;
    }

    const existingCount = await prisma.employeeOnboardingStage.count({
      where: { onboardingCaseId: onboardingCase.id },
    });

    if (existingCount > 0) {
      return { created: 0 };
    }

    await prisma.employeeOnboardingStage.createMany({
      data: this.defaultStages.map((stage) => ({
        onboardingCaseId: onboardingCase.id,
        stageKey: stage.key,
        title: stage.title,
        description: stage.description,
        orderIndex: stage.order,
        status: OnboardingStatus.pending,
        ownerProfileId: onboardingCase.hrOwnerProfileId ?? undefined,
      })),
    });

    return { created: this.defaultStages.length };
  }
}

export const EmployeeOnboardingCaseService = new EmployeeOnboardingCaseServiceImpl();
