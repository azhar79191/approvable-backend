import { prisma } from "../config/database";

interface ActivityInput {
  clientId?: string;
  postId?: string;
  userId?: string;
  action: string;
  metadata?: Record<string, unknown>;
}

export const activityService = {
  async record(input: ActivityInput): Promise<void> {
    await prisma.activity.create({
      data: {
        clientId: input.clientId,
        postId: input.postId,
        userId: input.userId,
        action: input.action,
        metadata: input.metadata as never,
      },
    });
  },

  async listForClient(clientId: string, limit = 30) {
    return prisma.activity.findMany({
      where: { clientId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  },

  async listRecent(agencyClientIds: string[], limit = 20) {
    return prisma.activity.findMany({
      where: { clientId: { in: agencyClientIds } },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  },
};
