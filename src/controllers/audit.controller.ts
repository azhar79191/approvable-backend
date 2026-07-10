import { Request, Response } from "express";
import { catchAsync } from "../utils/catchAsync";
import { prisma } from "../config/database";
import { paginationParams, paginate } from "../utils/pagination";

export const auditController = {
  list: catchAsync(async (req: Request, res: Response) => {
    // Prevent browser caching
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
    res.set("Surrogate-Control", "no-store");
    
    const { page, limit, skip } = paginationParams(req.query as never);
    const agencyId = req.user?.agencyId;

    // Scope to users in the same agency (or all for SUPER_ADMIN)
    const userWhere = agencyId ? { agencyId } : {};
    const agencyUserIds = agencyId
      ? (await prisma.user.findMany({ where: userWhere, select: { id: true } })).map((u) => u.id)
      : undefined;

    const where = agencyUserIds ? { userId: { in: agencyUserIds } } : {};

    const [items, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
      }),
      prisma.auditLog.count({ where }),
    ]);

    res.status(200).json({ success: true, ...paginate(items, total, page, limit) });
  }),
};
