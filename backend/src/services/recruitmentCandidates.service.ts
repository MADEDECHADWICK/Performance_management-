import { prisma } from "../prisma";
import { RecruitmentStage } from "@prisma/client";
import { AuthContext } from "../types/auth";
import { createAudit } from "../utils/audit";

type ListFilters = {
  page?: number;
  pageSize?: number;
  stage?: RecruitmentStage;
  departmentId?: number;
  search?: string;
};

type CreateCandidateInput = {
  fullName: string;
  email?: string | null;
  phoneNumber?: string | null;
  positionApplied: string;
  departmentId?: number | null;
  stage?: RecruitmentStage;
  notes?: string | null;
};

type UpdateCandidateInput = Partial<CreateCandidateInput>;

export class RecruitmentCandidateService {
  static async list(filters: ListFilters) {
    const page = Math.max(1, Number(filters.page || 1));
    const pageSize = Math.min(100, Math.max(1, Number(filters.pageSize || 20)));
    const skip = (page - 1) * pageSize;

    const where: any = {};
    if (filters.stage) where.stage = filters.stage;
    if (filters.departmentId) where.departmentId = filters.departmentId;
    if (filters.search) {
      where.OR = [
        { fullName: { contains: filters.search, mode: "insensitive" } },
        { email: { contains: filters.search, mode: "insensitive" } },
        { phoneNumber: { contains: filters.search, mode: "insensitive" } },
        { positionApplied: { contains: filters.search, mode: "insensitive" } },
      ];
    }

    const [records, total] = await Promise.all([
      prisma.recruitmentCandidate.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: "desc" },
        include: {
          department: true,
          createdBy: { select: { id: true, firstName: true, lastName: true } },
          offerLetterDocument: true,
          onboardingCase: true,
        },
      }),
      prisma.recruitmentCandidate.count({ where }),
    ]);

    return { records, total, page, pageSize };
  }

  static async getById(id: number) {
    return prisma.recruitmentCandidate.findUnique({
      where: { id },
      include: {
        department: true,
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        offerLetterDocument: true,
        onboardingCase: true,
      },
    });
  }

  static async create(input: CreateCandidateInput, auth: AuthContext) {
    if (input.stage === RecruitmentStage.accepted || input.stage === RecruitmentStage.hired) {
      const err = new Error("Offer letter is required before marking as accepted/hired");
      (err as any).statusCode = 400;
      throw err;
    }

    return prisma.recruitmentCandidate.create({
      data: {
        fullName: input.fullName,
        email: input.email ?? null,
        phoneNumber: input.phoneNumber ?? null,
        positionApplied: input.positionApplied,
        departmentId: input.departmentId ?? null,
        stage: input.stage ?? RecruitmentStage.applied,
        notes: input.notes ?? null,
        createdByProfileId: auth.profileId || null,
      },
    });
  }

  static async update(id: number, input: UpdateCandidateInput) {
    return prisma.recruitmentCandidate.update({
      where: { id },
      data: {
        fullName: input.fullName,
        email: input.email ?? undefined,
        phoneNumber: input.phoneNumber ?? undefined,
        positionApplied: input.positionApplied,
        departmentId: input.departmentId ?? undefined,
        stage: input.stage,
        notes: input.notes ?? undefined,
      },
    });
  }

  static async updateStage(id: number, stage: RecruitmentStage) {
    if (stage === RecruitmentStage.accepted || stage === RecruitmentStage.hired) {
      const existing = await prisma.recruitmentCandidate.findUnique({
        where: { id },
        select: { offerLetterDocumentId: true },
      });
      if (!existing?.offerLetterDocumentId) {
        const err = new Error("Offer letter is required before marking as accepted/hired");
        (err as any).statusCode = 400;
        throw err;
      }
    }

    const updated = await prisma.recruitmentCandidate.update({
      where: { id },
      data: { stage },
      include: {
        onboardingCase: true,
      },
    });

    await createAudit({
      action: `update_recruitment_stage_${stage}`,
      entity_type: "RecruitmentCandidate",
      user_id: null,
    }).catch(() => null);

    if ((stage === RecruitmentStage.accepted || stage === RecruitmentStage.hired) && !updated.onboardingCase) {
      await prisma.employeeOnboardingCase.create({
        data: {
          candidateId: updated.id,
          hrOwnerProfileId: updated.createdByProfileId ?? undefined,
        },
      });
    }

    return prisma.recruitmentCandidate.findUnique({
      where: { id: updated.id },
      include: {
        onboardingCase: true,
        offerLetterDocument: true,
        department: true,
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  static async attachOfferLetter(id: number, documentId: number) {
    const doc = await prisma.document.findUnique({
      where: { id: documentId },
      select: { id: true, entityType: true, entityId: true },
    });
    if (!doc) {
      const err = new Error("Offer letter document not found");
      (err as any).statusCode = 404;
      throw err;
    }
    if (doc.entityType !== "RecruitmentCandidate" || doc.entityId !== id) {
      const err = new Error("Offer letter document is not linked to this candidate");
      (err as any).statusCode = 400;
      throw err;
    }

    const updated = await prisma.recruitmentCandidate.update({
      where: { id },
      data: { offerLetterDocumentId: documentId },
    });

    await createAudit({
      action: "attach_offer_letter",
      entity_type: "RecruitmentCandidate",
      user_id: null,
    }).catch(() => null);

    return updated;
  }

  static async remove(id: number) {
    return prisma.recruitmentCandidate.delete({ where: { id } });
  }
}
