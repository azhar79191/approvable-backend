import { Request, Response } from "express";
import { catchAsync } from "../utils/catchAsync";
import { fileService } from "../services/file.service";
import { AppError } from "../utils/AppError";

export const fileController = {
  upload: catchAsync(async (req: Request, res: Response) => {
    if (!req.file) throw AppError.badRequest("No file uploaded (expected multipart field 'file')");

    const file = await fileService.upload(req.user!.sub, req.file.buffer, {
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      clientId: req.query.clientId as string | undefined,
      folder: req.query.folder as string | undefined,
    });

    res.status(201).json({ success: true, data: file });
  }),

  list: catchAsync(async (req: Request, res: Response) => {
    const result = await fileService.list(req.query as never);
    res.status(200).json({ success: true, ...result });
  }),

  delete: catchAsync(async (req: Request, res: Response) => {
    await fileService.delete(req.params.id);
    res.status(204).send();
  }),
};
