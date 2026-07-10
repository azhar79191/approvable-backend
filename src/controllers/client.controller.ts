import { Request, Response } from "express";
import { catchAsync } from "../utils/catchAsync";
import { clientService } from "../services/client.service";
import { AppError } from "../utils/AppError";
import { prisma } from "../config/database";

function requireAgency(req: Request): string {
  const agencyId = req.user?.agencyId;
  if (!agencyId) throw AppError.forbidden("This action requires an agency account");
  return agencyId;
}

export const clientController = {
  create: catchAsync(async (req: Request, res: Response) => {
    const agencyId = requireAgency(req);
    const client = await clientService.create(agencyId, req.user!.sub, req.body);
    res.status(201).json({ success: true, data: client });
  }),

  list: catchAsync(async (req: Request, res: Response) => {
    const agencyId = requireAgency(req);
    const result = await clientService.list(agencyId, req.query);
    res.status(200).json({ success: true, ...result });
  }),

  getById: catchAsync(async (req: Request, res: Response) => {
    const agencyId = requireAgency(req);
    const client = await clientService.getById(agencyId, req.params.id);
    res.status(200).json({ success: true, data: client });
  }),

  update: catchAsync(async (req: Request, res: Response) => {
    const agencyId = requireAgency(req);
    const client = await clientService.update(agencyId, req.params.id, req.user!.sub, req.body);
    res.status(200).json({ success: true, data: client });
  }),

  delete: catchAsync(async (req: Request, res: Response) => {
    const agencyId = requireAgency(req);
    await clientService.delete(agencyId, req.params.id);
    res.status(204).send();
  }),

  getWorkspace: catchAsync(async (req: Request, res: Response) => {
    const agencyId = requireAgency(req);
    await clientService.getById(agencyId, req.params.id); // ownership check
    const workspace = await prisma.workspace.findUnique({
      where: { clientId: req.params.id },
      include: {
        members: {
          include: {
            user: { select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true, role: { select: { name: true } } } },
          },
        },
      },
    });
    if (!workspace) throw AppError.notFound("Workspace not found");
    res.status(200).json({ success: true, data: workspace });
  }),

  addWorkspaceMember: catchAsync(async (req: Request, res: Response) => {
    const agencyId = requireAgency(req);
    await clientService.getById(agencyId, req.params.id);
    const workspace = await prisma.workspace.findUnique({ where: { clientId: req.params.id } });
    if (!workspace) throw AppError.notFound("Workspace not found");
    const { userId } = req.body as { userId: string };
    const member = await prisma.workspaceMember.upsert({
      where: { workspaceId_userId: { workspaceId: workspace.id, userId } },
      update: {},
      create: { workspaceId: workspace.id, userId },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true } },
      },
    });
    res.status(201).json({ success: true, data: member });
  }),

  removeWorkspaceMember: catchAsync(async (req: Request, res: Response) => {
    const agencyId = requireAgency(req);
    await clientService.getById(agencyId, req.params.id);
    const workspace = await prisma.workspace.findUnique({ where: { clientId: req.params.id } });
    if (!workspace) throw AppError.notFound("Workspace not found");
    await prisma.workspaceMember.deleteMany({
      where: { workspaceId: workspace.id, userId: req.params.userId },
    });
    res.status(204).send();
  }),
};
