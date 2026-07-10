import { Request, Response } from "express";
import { catchAsync } from "../utils/catchAsync";
import { notificationService } from "../services/notification.service";

export const notificationController = {
  list: catchAsync(async (req: Request, res: Response) => {
    const unreadOnly = req.query.unread === "true";
    const notifications = await notificationService.listForUser(req.user!.sub, unreadOnly);
    const unreadCount = await notificationService.unreadCount(req.user!.sub);
    res.status(200).json({ success: true, data: notifications, meta: { unreadCount } });
  }),

  markRead: catchAsync(async (req: Request, res: Response) => {
    const { notificationIds } = req.body as { notificationIds?: string[] };
    await notificationService.markRead(req.user!.sub, notificationIds);
    res.status(200).json({ success: true, message: "Notifications marked as read" });
  }),

  delete: catchAsync(async (req: Request, res: Response) => {
    const { id } = req.params;
    await notificationService.delete(req.user!.sub, id);
    res.status(200).json({ success: true, message: "Notification deleted" });
  }),
};
