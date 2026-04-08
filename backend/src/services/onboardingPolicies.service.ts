import prisma from "../prisma";
import { createAudit } from "../utils/audit";
import { DEFAULT_ONBOARDING_POLICY_DEFINITIONS } from "./onboardingPolicyCatalog";

export interface OnboardingPolicyAuthContext {
  userId: number;
  profileId: number;
  roles?: string[];
}

export interface UpsertOnboardingPolicyInput {
  title: string;
  slug?: string;
  summary?: string | null;
  content?: string | null;
  sectionKey?: string;
  sectionLabel?: string;
  orderIndex?: number;
  requiresAcknowledgement?: boolean;
  isActive?: boolean;
  isPublished?: boolean;
}

const normalizeSlug = (value: string) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

class OnboardingPoliciesServiceImpl {
  private isPrivileged(auth: OnboardingPolicyAuthContext) {
    const roles = (auth.roles ?? []).map((role) =>
      String(role || "")
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, "_")
    );
    return roles.includes("super_admin") || roles.includes("hr");
  }

  private async ensureDefaultPolicies() {
    const existing = await prisma.onboardingPolicy.findMany({
      select: { slug: true },
    });
    const existingSlugs = new Set(existing.map((row) => row.slug));
    const missing = DEFAULT_ONBOARDING_POLICY_DEFINITIONS.filter(
      (definition) => !existingSlugs.has(definition.slug)
    );
    if (missing.length === 0) {
      return;
    }

    await prisma.onboardingPolicy.createMany({
      data: missing.map((definition) => ({
        slug: definition.slug,
        title: definition.title,
        summary: definition.summary,
        content: definition.content,
        sectionKey: definition.sectionKey,
        sectionLabel: definition.sectionLabel,
        orderIndex: definition.orderIndex,
        requiresAcknowledgement: true,
        isActive: true,
        isPublished: true,
        publishedAt: new Date(),
      })),
      skipDuplicates: true,
    });
  }

  private selectPolicy() {
    return {
      id: true,
      slug: true,
      title: true,
      summary: true,
      content: true,
      sectionKey: true,
      sectionLabel: true,
      orderIndex: true,
      requiresAcknowledgement: true,
      isActive: true,
      isPublished: true,
      publishedAt: true,
      createdAt: true,
      updatedAt: true,
      createdByProfileId: true,
      updatedByProfileId: true,
      createdBy: {
        select: {
          firstName: true,
          lastName: true,
        },
      },
      updatedBy: {
        select: {
          firstName: true,
          lastName: true,
        },
      },
    } as const;
  }

  private async getPolicyOrThrow(
    where: { id?: number; slug?: string },
    auth?: OnboardingPolicyAuthContext
  ) {
    await this.ensureDefaultPolicies();
    const policy = await prisma.onboardingPolicy.findFirst({
      where: {
        ...(where.id ? { id: where.id } : {}),
        ...(where.slug ? { slug: where.slug } : {}),
        ...(auth && !this.isPrivileged(auth) ? { isActive: true, isPublished: true } : {}),
      },
      select: this.selectPolicy(),
    });

    if (!policy) {
      const err = new Error("Onboarding policy not found");
      (err as any).statusCode = 404;
      throw err;
    }

    return {
      ...policy,
      createdByName: policy.createdBy
        ? `${policy.createdBy.firstName} ${policy.createdBy.lastName}`.trim()
        : null,
      updatedByName: policy.updatedBy
        ? `${policy.updatedBy.firstName} ${policy.updatedBy.lastName}`.trim()
        : null,
    };
  }

  async list(auth: OnboardingPolicyAuthContext) {
    await this.ensureDefaultPolicies();
    const policies = await prisma.onboardingPolicy.findMany({
      where: this.isPrivileged(auth) ? undefined : { isActive: true, isPublished: true },
      orderBy: [{ orderIndex: "asc" }, { title: "asc" }],
      select: this.selectPolicy(),
    });

    return policies.map((policy) => ({
      ...policy,
      createdByName: policy.createdBy
        ? `${policy.createdBy.firstName} ${policy.createdBy.lastName}`.trim()
        : null,
      updatedByName: policy.updatedBy
        ? `${policy.updatedBy.firstName} ${policy.updatedBy.lastName}`.trim()
        : null,
    }));
  }

  async getById(policyId: number, auth: OnboardingPolicyAuthContext) {
    return this.getPolicyOrThrow({ id: policyId }, auth);
  }

  async getBySlug(slug: string, auth: OnboardingPolicyAuthContext) {
    return this.getPolicyOrThrow({ slug: normalizeSlug(slug) }, auth);
  }

  async create(input: UpsertOnboardingPolicyInput, auth: OnboardingPolicyAuthContext) {
    if (!this.isPrivileged(auth)) {
      const err = new Error("Forbidden");
      (err as any).statusCode = 403;
      throw err;
    }

    const title = String(input.title || "").trim();
    if (!title) {
      const err = new Error("Title is required");
      (err as any).statusCode = 400;
      throw err;
    }

    const slug = normalizeSlug(input.slug || title);
    if (!slug) {
      const err = new Error("A valid slug is required");
      (err as any).statusCode = 400;
      throw err;
    }

    const duplicate = await prisma.onboardingPolicy.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (duplicate) {
      const err = new Error("A policy with this slug already exists");
      (err as any).statusCode = 409;
      throw err;
    }

    const created = await prisma.onboardingPolicy.create({
      data: {
        slug,
        title,
        summary: String(input.summary || "").trim() || null,
        content: String(input.content || "").trim() || null,
        sectionKey: String(input.sectionKey || "general").trim() || "general",
        sectionLabel: String(input.sectionLabel || "General").trim() || "General",
        orderIndex:
          typeof input.orderIndex === "number" && Number.isFinite(input.orderIndex)
            ? input.orderIndex
            : 0,
        requiresAcknowledgement: input.requiresAcknowledgement ?? true,
        isActive: input.isActive ?? true,
        isPublished: input.isPublished ?? true,
        publishedAt: input.isPublished === false ? null : new Date(),
        createdByProfileId: auth.profileId,
        updatedByProfileId: auth.profileId,
      },
      select: this.selectPolicy(),
    });

    await createAudit({
      action: "create_onboarding_policy",
      entity_type: "OnboardingPolicy",
      entity_id: created.id,
      user_id: auth.userId,
      metadata: { slug: created.slug },
    }).catch(() => null);

    return {
      ...created,
      createdByName: created.createdBy
        ? `${created.createdBy.firstName} ${created.createdBy.lastName}`.trim()
        : null,
      updatedByName: created.updatedBy
        ? `${created.updatedBy.firstName} ${created.updatedBy.lastName}`.trim()
        : null,
    };
  }

  async update(
    policyId: number,
    input: Partial<UpsertOnboardingPolicyInput>,
    auth: OnboardingPolicyAuthContext
  ) {
    if (!this.isPrivileged(auth)) {
      const err = new Error("Forbidden");
      (err as any).statusCode = 403;
      throw err;
    }

    const existing = await prisma.onboardingPolicy.findUnique({
      where: { id: policyId },
      select: { id: true, slug: true, isPublished: true },
    });
    if (!existing) {
      const err = new Error("Onboarding policy not found");
      (err as any).statusCode = 404;
      throw err;
    }

    const nextSlug = input.slug ? normalizeSlug(input.slug) : existing.slug;
    if (nextSlug !== existing.slug) {
      const duplicate = await prisma.onboardingPolicy.findUnique({
        where: { slug: nextSlug },
        select: { id: true },
      });
      if (duplicate && duplicate.id !== policyId) {
        const err = new Error("A policy with this slug already exists");
        (err as any).statusCode = 409;
        throw err;
      }
    }

    const nextPublished = input.isPublished ?? existing.isPublished;
    const updated = await prisma.onboardingPolicy.update({
      where: { id: policyId },
      data: {
        slug: input.slug ? nextSlug : undefined,
        title: input.title === undefined ? undefined : String(input.title || "").trim(),
        summary:
          input.summary === undefined ? undefined : String(input.summary || "").trim() || null,
        content:
          input.content === undefined ? undefined : String(input.content || "").trim() || null,
        sectionKey:
          input.sectionKey === undefined
            ? undefined
            : String(input.sectionKey || "general").trim() || "general",
        sectionLabel:
          input.sectionLabel === undefined
            ? undefined
            : String(input.sectionLabel || "General").trim() || "General",
        orderIndex:
          input.orderIndex === undefined
            ? undefined
            : Number.isFinite(Number(input.orderIndex))
            ? Number(input.orderIndex)
            : undefined,
        requiresAcknowledgement:
          input.requiresAcknowledgement === undefined
            ? undefined
            : Boolean(input.requiresAcknowledgement),
        isActive: input.isActive === undefined ? undefined : Boolean(input.isActive),
        isPublished: input.isPublished === undefined ? undefined : Boolean(input.isPublished),
        publishedAt:
          input.isPublished === undefined
            ? undefined
            : nextPublished
            ? new Date()
            : null,
        updatedByProfileId: auth.profileId,
      },
      select: this.selectPolicy(),
    });

    await createAudit({
      action: "update_onboarding_policy",
      entity_type: "OnboardingPolicy",
      entity_id: updated.id,
      user_id: auth.userId,
      metadata: { slug: updated.slug },
    }).catch(() => null);

    return {
      ...updated,
      createdByName: updated.createdBy
        ? `${updated.createdBy.firstName} ${updated.createdBy.lastName}`.trim()
        : null,
      updatedByName: updated.updatedBy
        ? `${updated.updatedBy.firstName} ${updated.updatedBy.lastName}`.trim()
        : null,
    };
  }
}

export const OnboardingPoliciesService = new OnboardingPoliciesServiceImpl();
