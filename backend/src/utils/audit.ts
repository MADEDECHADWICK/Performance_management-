import prisma from '../prisma';

type CreateAuditParams = {
  action: string;
  entity_type?: string | null;
  entity_id?: number | null;
  user_id?: number | null;
  ip_address?: string | null;
  metadata?: Record<string, any> | null;
};

const resolveActorUserId = async (
  userId: number | null | undefined,
  metadata: Record<string, any> | null | undefined
) => {
  if (userId) return userId;
  const candidateProfileId =
    metadata?.actorProfileId ??
    metadata?.profileId ??
    metadata?.performedByProfileId ??
    metadata?.approvedByProfileId ??
    metadata?.assignedByProfileId ??
    null;
  if (!candidateProfileId) return null;
  const actor = await prisma.user.findFirst({
    where: { profileId: Number(candidateProfileId) },
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
      metadata: metadata ?? null,
    },
  });
}

export default createAudit;
