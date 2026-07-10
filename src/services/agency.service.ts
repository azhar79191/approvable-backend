import { prisma } from "../config/database";
import { AppError } from "../utils/AppError";
import { fileService } from "./file.service";
import { emailService } from "./email.service";
import { authService } from "./auth.service";

const agencySelect = {
  id: true,
  name: true,
  logoUrl: true,
  themeColor: true,
  createdAt: true,
  updatedAt: true,
};

const memberSelect = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  avatarUrl: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
  role: { select: { name: true } },
};

export const agencyService = {
  async getById(agencyId: string) {
    const agency = await prisma.agency.findUnique({ where: { id: agencyId }, select: agencySelect });
    if (!agency) throw AppError.notFound("Agency not found");
    return agency;
  },

  async update(agencyId: string, input: { name?: string; themeColor?: string }) {
    return prisma.agency.update({
      where: { id: agencyId },
      data: { name: input.name, themeColor: input.themeColor },
      select: agencySelect,
    });
  },

  async uploadLogo(agencyId: string, uploadedById: string, file: Express.Multer.File) {
    const uploaded = await fileService.upload(uploadedById, file.buffer, {
      originalName: file.originalname,
      mimeType: file.mimetype,
      folder: "agency-logos",
    });
    return prisma.agency.update({
      where: { id: agencyId },
      data: { logoUrl: uploaded.url },
      select: agencySelect,
    });
  },

  async listMembers(agencyId: string) {
    return prisma.user.findMany({
      where: { agencyId },
      select: memberSelect,
      orderBy: { createdAt: "asc" },
    });
  },

  async inviteMember(
    agencyId: string,
    actorId: string,
    input: { email: string; firstName: string; lastName: string; role?: "TEAM_MEMBER" | "AGENCY_ADMIN" }
  ) {
    const normalizedEmail = input.email.toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) {
      // If user exists but belongs to no agency, assign them
      if (!existing.agencyId) {
        const roleName = input.role ?? "TEAM_MEMBER";
        const role = await prisma.role.findUniqueOrThrow({ where: { name: roleName } });
        const updated = await prisma.user.update({
          where: { id: existing.id },
          data: { agencyId, roleId: role.id },
          select: memberSelect,
        });
        return updated;
      }
      throw AppError.conflict("A user with this email already belongs to an agency");
    }

    // Create the user via authService.register so tokens + email verification are handled
    const result = await authService.register({
      firstName: input.firstName,
      lastName: input.lastName,
      email: normalizedEmail,
      password: generateTempPassword(),
    });

    // Assign to this agency with the correct role
    const roleName = input.role ?? "TEAM_MEMBER";
    const role = await prisma.role.findUniqueOrThrow({ where: { name: roleName } });
    const member = await prisma.user.update({
      where: { id: result.user.id },
      data: { agencyId, roleId: role.id },
      select: memberSelect,
    });

    return member;
  },

  async removeMember(agencyId: string, actorId: string, userId: string) {
    if (actorId === userId) throw AppError.badRequest("You cannot remove yourself");
    const member = await prisma.user.findUnique({ where: { id: userId } });
    if (!member || member.agencyId !== agencyId) throw AppError.notFound("Member not found in this agency");
    await prisma.user.update({ where: { id: userId }, data: { agencyId: null } });
    // Revoke their sessions
    await prisma.refreshToken.updateMany({ where: { userId }, data: { revoked: true } });
  },

  async getSubscription(agencyId: string) {
    const subscription = await prisma.subscription.findUnique({
      where: { agencyId },
      include: { plan: true },
    });
    if (!subscription) throw AppError.notFound("No subscription found for this agency");
    return subscription;
  },
};

function generateTempPassword(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let pwd = "Tmp1!";
  for (let i = 0; i < 10; i++) pwd += chars[Math.floor(Math.random() * chars.length)];
  return pwd;
}
