import { Request, Response } from "express";
import { catchAsync } from "../utils/catchAsync";
import { commentService } from "../services/comment.service";

export const commentController = {
  create: catchAsync(async (req: Request, res: Response) => {
    const comment = await commentService.create(req.params.postId, req.user!.sub, req.body);
    res.status(201).json({ success: true, data: comment });
  }),

  listForPost: catchAsync(async (req: Request, res: Response) => {
    const comments = await commentService.listForPost(req.params.postId);
    res.status(200).json({ success: true, data: comments });
  }),

  reply: catchAsync(async (req: Request, res: Response) => {
    const reply = await commentService.reply(req.params.commentId, req.user!.sub, req.body);
    res.status(201).json({ success: true, data: reply });
  }),

  resolve: catchAsync(async (req: Request, res: Response) => {
    const comment = await commentService.resolve(req.params.commentId);
    res.status(200).json({ success: true, data: comment });
  }),

  delete: catchAsync(async (req: Request, res: Response) => {
    await commentService.delete(req.params.commentId);
    res.status(204).send();
  }),
};
