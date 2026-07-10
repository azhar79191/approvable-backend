import { prisma } from "../config/database";

interface AuditInput {
  userId?: string | null;
  action: string;
  entity: string;
  entityId?: string;
  ipAddress?: string;
  metadata?: Record<string, unknown>;
}

export const auditService = {
  async log(input: AuditInput): Promise<void> {
    await prisma.auditLog.create({
      data: {
        userId: input.userId ?? undefined,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId,
        ipAddress: input.ipAddress,
        metadata: input.metadata as never,
      },
    });
  },
};
