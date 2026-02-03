import prisma from '../prisma';

type CreateAuditParams = {
  action: string;
  entity_type?: string | null;
  entity_id?: number | null;
  user_id?: number | null;
  ip_address?: string | null;
  metadata?: Record<string, any> | null;
};

export async function createAudit(params: CreateAuditParams) {
  const { action, entity_type, entity_id, user_id, ip_address, metadata } = params;
  return prisma.auditLog.create({
    data: {
      action: action || '',
      entityType: entity_type || null,
      entityId: entity_id ?? null,
      ipAddress: ip_address || null,
      userId: user_id ?? null,
      metadata: metadata ?? null,
    },
  });
}

export default createAudit;
