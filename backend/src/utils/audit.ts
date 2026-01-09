import prisma from '../prisma';

type CreateAuditParams = {
  action: string;
  entity_type?: string | null;
  user_id?: number | null;
  ip_address?: string | null;
};

export async function createAudit(params: CreateAuditParams) {
  const { action, entity_type, user_id, ip_address } = params;
  return prisma.auditLog.create({
    data: {
      action: action || '',
      entityType: entity_type || null,
      ipAddress: ip_address || null,
      userId: user_id ?? null,
    },
  });
}

export default createAudit;
