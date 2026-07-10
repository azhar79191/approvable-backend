import { Request, Response } from "express";
import { catchAsync } from "../utils/catchAsync";
import { prisma } from "../config/database";
import { AppError } from "../utils/AppError";
import { agencyService } from "../services/agency.service";

function requireAgency(req: Request): string {
  const agencyId = req.user?.agencyId;
  if (!agencyId) throw AppError.forbidden("This action requires an agency account");
  return agencyId;
}

export const agencyController = {
  get: catchAsync(async (req: Request, res: Response) => {
    const agencyId = requireAgency(req);
    const agency = await agencyService.getById(agencyId);
    res.status(200).json({ success: true, data: agency });
  }),

  update: catchAsync(async (req: Request, res: Response) => {
    const agencyId = requireAgency(req);
    const agency = await agencyService.update(agencyId, req.body);
    res.status(200).json({ success: true, data: agency });
  }),

  uploadLogo: catchAsync(async (req: Request, res: Response) => {
    if (!req.file) throw AppError.badRequest("No file uploaded (expected multipart field 'file')");
    const agencyId = requireAgency(req);
    const agency = await agencyService.uploadLogo(agencyId, req.user!.sub, req.file);
    res.status(200).json({ success: true, data: agency });
  }),

  listMembers: catchAsync(async (req: Request, res: Response) => {
    const agencyId = requireAgency(req);
    const members = await agencyService.listMembers(agencyId);
    res.status(200).json({ success: true, data: members });
  }),

  inviteMember: catchAsync(async (req: Request, res: Response) => {
    const agencyId = requireAgency(req);
    const result = await agencyService.inviteMember(agencyId, req.user!.sub, req.body);
    res.status(201).json({ success: true, data: result });
  }),

  removeMember: catchAsync(async (req: Request, res: Response) => {
    const agencyId = requireAgency(req);
    await agencyService.removeMember(agencyId, req.user!.sub, req.params.userId);
    res.status(204).send();
  }),

  getSubscription: catchAsync(async (req: Request, res: Response) => {
    const agencyId = requireAgency(req);
    const subscription = await agencyService.getSubscription(agencyId);
    res.status(200).json({ success: true, data: subscription });
  }),
};
