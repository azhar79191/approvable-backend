import { NotificationType } from "@prisma/client";
import { prisma } from "../config/database";
import { getIO } from "../socket";

interface NotifyInput {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string;
  postId?: string;
}

export const notificationService = {
  /** Persists a notification and pushes it over the user's private Socket.IO room. */
  async notifyUser(input: NotifyInput) {
    const notification = await prisma.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body,
        postId: input.postId,
      },
    });

    try {
      getIO().to(input.userId).emit("notification:new", notification);
    } catch {
      // Socket.IO may not be initialized (e.g. in unit tests) — notification
      // is still persisted and will be picked up on next poll/reconnect.
    }

    return notification;
  },

  /** Notifies many users at once, e.g. everyone on a client's workspace. */
  async notifyUsers(userIds: string[], input: Omit<NotifyInput, "userId">) {
    await Promise.all(userIds.map((userId) => notificationService.notifyUser({ ...input, userId })));
  },

  async listForUser(userId: string, unreadOnly = false) {
    return prisma.notification.findMany({
      where: { userId, ...(unreadOnly ? { read: false } : {}) },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  },

  async markRead(userId: string, notificationIds?: string[]) {
    await prisma.notification.updateMany({
      where: { userId, ...(notificationIds ? { id: { in: notificationIds } } : {}) },
      data: { read: true },
    });
  },

  async unreadCount(userId: string) {
    return prisma.notification.count({ where: { userId, read: false } });
  },

  async delete(userId: string, notificationId: string) {
    return prisma.notification.deleteMany({
      where: { id: notificationId, userId },
    });
  },
};
