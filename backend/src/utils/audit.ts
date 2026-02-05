import prisma from '../prisma';
import { Prisma } from "@prisma/client";

type CreateAuditParams = {
  action: string;
  entity_type?: string | null;
  entity_id?: number | null;
  user_id?: number | null;
  ip_address?: string | null;
  metadata?: Prisma.InputJsonValue | null;
};

const resolveActorUserId = async (
  userId: number | null | undefined,
  metadata: Prisma.InputJsonValue | null | undefined
) => {
  if (userId) return userId;

  const meta =
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? (metadata as Record<string, unknown>)
      : null;

  const candidateProfileId =
    (meta?.actorProfileId as number | undefined) ??
    (meta?.profileId as number | undefined) ??
    (meta?.performedByProfileId as number | undefined) ??
    (meta?.approvedByProfileId as number | undefined) ??
    (meta?.assignedByProfileId as number | undefined) ??
    null;

  if (!candidateProfileId) return null;

  const actor = await prisma.user.findFirst({
    where: { profile: { id: Number(candidateProfileId) } },
    select: { id: true },
  });

  return actor?.id ?? null;
};

export async function createAudit(params: CreateAuditParams) {
  const { action, entity_type, entity_id, user_id, ip_address, metadata } = params;
  const resolvedUserId = await resolveActorUserId(user_id ?? null, metadata ?? null);
  return prisma.auditLog.create({
    data: {
      action: action || "",
      entityType: entity_type || null,
      entityId: entity_id ?? null,
      ipAddress: ip_address || null,
      userId: resolvedUserId,
      metadata: metadata ?? undefined,
    },
  });
}

export default createAudit;
