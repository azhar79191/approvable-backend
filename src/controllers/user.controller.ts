import { Request, Response } from "express";
import { catchAsync } from "../utils/catchAsync";
import { prisma } from "../config/database";
import { AppError } from "../utils/AppError";
import { comparePassword, hashPassword } from "../utils/password";
import { fileService } from "../services/file.service";

const userSelect = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  avatarUrl: true,
  isEmailVerified: true,
  agencyId: true,
  clientId: true,
  role: { select: { name: true } },
};

export const userController = {
  me: catchAsync(async (req: Request, res: Response) => {
    // Prevent browser caching
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
    res.set("Surrogate-Control", "no-store");
    
    if (!req.user) throw AppError.unauthorized();
    console.log("[me] Fetching user with ID:", req.user.sub);
    const user = await prisma.user.findUnique({ where: { id: req.user.sub }, select: userSelect });
    console.log("[me] Found user:", user);
    if (!user) throw AppError.notFound("User not found");
    res.status(200).json({ success: true, data: user });
  }),

  updateMe: catchAsync(async (req: Request, res: Response) => {
    console.log("[updateMe] Request body:", req.body);
    const { firstName, lastName, avatarUrl } = req.body as { firstName?: string; lastName?: string; avatarUrl?: string };
    const user = await prisma.user.update({
      where: { id: req.user!.sub },
      data: { firstName, lastName, avatarUrl },
      select: userSelect,
    });
    console.log("[updateMe] Updated user:", user);
    res.status(200).json({ success: true, data: user });
  }),

  changePassword: catchAsync(async (req: Request, res: Response) => {
    const { currentPassword, newPassword } = req.body as { currentPassword: string; newPassword: string };
    const user = await prisma.user.findUnique({ where: { id: req.user!.sub } });
    if (!user || !user.password) throw AppError.badRequest("No password set on this account");
    const valid = await comparePassword(currentPassword, user.password);
    if (!valid) throw AppError.unauthorized("Current password is incorrect");
    const hashed = await hashPassword(newPassword);
    await prisma.user.update({ where: { id: user.id }, data: { password: hashed } });
    await prisma.refreshToken.updateMany({ where: { userId: user.id }, data: { revoked: true } });
    res.status(200).json({ success: true, message: "Password updated" });
  }),

  uploadAvatar: catchAsync(async (req: Request, res: Response) => {
    console.log("[uploadAvatar] Starting upload");
    if (!req.file) throw AppError.badRequest("No file uploaded (expected multipart field 'file')");
    console.log("[uploadAvatar] File received:", req.file.originalname, req.file.mimetype);
    
    const file = await fileService.upload(req.user!.sub, req.file.buffer, {
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      folder: "avatars",
    });
    
    console.log("[uploadAvatar] File uploaded successfully:", file.url);
    
    const user = await prisma.user.update({
      where: { id: req.user!.sub },
      data: { avatarUrl: file.url },
      select: userSelect,
    });
    
    console.log("[uploadAvatar] User updated with new avatar:", user.avatarUrl);
    
    res.status(200).json({ success: true, data: user });
  }),
};
