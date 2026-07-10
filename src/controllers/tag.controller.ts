import { Request, Response } from "express";
import { catchAsync } from "../utils/catchAsync";
import { prisma } from "../config/database";
import { AppError } from "../utils/AppError";

function requireAgency(req: Request): string {
  const agencyId = req.user?.agencyId;
  if (!agencyId) throw AppError.forbidden("This action requires an agency account");
  return agencyId;
}

export const tagController = {
  list: catchAsync(async (req: Request, res: Response) => {
    requireAgency(req);
    const tags = await prisma.tag.findMany({ orderBy: { name: "asc" } });
    res.status(200).json({ success: true, data: tags });
  }),

  create: catchAsync(async (req: Request, res: Response) => {
    requireAgency(req);
    const { name } = req.body as { name: string };
    if (!name?.trim()) throw AppError.badRequest("Tag name is required");
    const tag = await prisma.tag.upsert({
      where: { name: name.trim().toLowerCase() },
      update: {},
      create: { name: name.trim().toLowerCase() },
    });
    res.status(201).json({ success: true, data: tag });
  }),

  delete: catchAsync(async (req: Request, res: Response) => {
    requireAgency(req);
    await prisma.tag.delete({ where: { id: req.params.id } });
    res.status(204).send();
  }),
};
