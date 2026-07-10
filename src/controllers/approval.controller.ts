import { Request, Response } from "express";
import { catchAsync } from "../utils/catchAsync";
import { approvalService } from "../services/approval.service";

export const approvalController = {
  getForPost: catchAsync(async (req: Request, res: Response) => {
    const approval = await approvalService.getByPostId(req.params.postId);
    res.status(200).json({ success: true, data: approval });
  }),

  decide: catchAsync(async (req: Request, res: Response) => {
    const { action, comment } = req.body;
    const result = await approvalService.decide(req.params.postId, req.user!.sub, action, comment);
    res.status(200).json({ success: true, data: result });
  }),
};
