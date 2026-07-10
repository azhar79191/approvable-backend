import { Request, Response } from "express";
import { catchAsync } from "../utils/catchAsync";
import { analyticsService } from "../services/analytics.service";
import { activityService } from "../services/activity.service";
import { AppError } from "../utils/AppError";
import { prisma } from "../config/database";

function requireAgency(req: Request): string {
  const agencyId = req.user?.agencyId;
  if (!agencyId) throw AppError.forbidden("This action requires an agency account");
  return agencyId;
}

export const analyticsController = {
  overview: catchAsync(async (req: Request, res: Response) => {
    const agencyId = requireAgency(req);

    const [cards, approvalRate, monthlyPosts, topClients, teamPerformance, platformPerformance] = await Promise.all([
      analyticsService.dashboardCards(agencyId),
      analyticsService.approvalRate(agencyId),
      analyticsService.monthlyPostVolume(agencyId),
      analyticsService.topClients(agencyId),
      analyticsService.teamPerformance(agencyId),
      analyticsService.platformPerformance(agencyId),
    ]);

    res.status(200).json({
      success: true,
      data: { cards, approvalRate, monthlyPosts, topClients, teamPerformance, platformPerformance },
    });
  }),

  recentActivity: catchAsync(async (req: Request, res: Response) => {
    const agencyId = requireAgency(req);
    const clients = await prisma.client.findMany({ where: { agencyId }, select: { id: true } });
    const activity = await activityService.listRecent(clients.map((c) => c.id));
    res.status(200).json({ success: true, data: activity });
  }),
};
