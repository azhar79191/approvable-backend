import { Request, Response } from "express";
import { catchAsync } from "../utils/catchAsync";
import { postService } from "../services/post.service";
import { AppError } from "../utils/AppError";

function requireAgency(req: Request): string {
  const agencyId = req.user?.agencyId;
  if (!agencyId) throw AppError.forbidden("This action requires an agency account");
  return agencyId;
}

export const postController = {
  create: catchAsync(async (req: Request, res: Response) => {
    const post = await postService.create(requireAgency(req), req.user!.sub, req.body);
    res.status(201).json({ success: true, data: post });
  }),

  list: catchAsync(async (req: Request, res: Response) => {
    const result = await postService.list(requireAgency(req), req.query as never);
    res.status(200).json({ success: true, ...result });
  }),

  getById: catchAsync(async (req: Request, res: Response) => {
    const post = await postService.getById(requireAgency(req), req.params.id);
    res.status(200).json({ success: true, data: post });
  }),

  update: catchAsync(async (req: Request, res: Response) => {
    const post = await postService.update(requireAgency(req), req.params.id, req.user!.sub, req.body);
    res.status(200).json({ success: true, data: post });
  }),

  delete: catchAsync(async (req: Request, res: Response) => {
    await postService.delete(requireAgency(req), req.params.id);
    res.status(204).send();
  }),

  submitForApproval: catchAsync(async (req: Request, res: Response) => {
    const post = await postService.submitForApproval(requireAgency(req), req.params.id, req.user!.sub);
    res.status(200).json({ success: true, data: post });
  }),

  listVersions: catchAsync(async (req: Request, res: Response) => {
    const versions = await postService.listVersions(requireAgency(req), req.params.id);
    res.status(200).json({ success: true, data: versions });
  }),

  restoreVersion: catchAsync(async (req: Request, res: Response) => {
    const post = await postService.restoreVersion(
      requireAgency(req),
      req.params.id,
      req.params.versionId,
      req.user!.sub
    );
    res.status(200).json({ success: true, data: post });
  }),
};
