import { OAuth2Client } from "google-auth-library";
import { prisma } from "../config/database";
import { env } from "../config/env";
import { AppError } from "../utils/AppError";
import { hashPassword, comparePassword } from "../utils/password";
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from "../utils/jwt";
import { generateSecureToken } from "../utils/token";
import { emailService } from "./email.service";
import { RoleName } from "@prisma/client";
import { v4 as uuid } from "uuid";

const googleClient = new OAuth2Client(env.google.clientId);

interface AuthResult {
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    avatarUrl: string | null;
    isEmailVerified: boolean;
    role: string;
    agencyId: string | null;
    clientId: string | null;
  };
  accessToken: string;
  refreshToken: string;
}

async function issueTokenPair(userId: string, role: string, agencyId: string | null, clientId: string | null) {
  const accessToken = signAccessToken({ sub: userId, role, agencyId, clientId });

  // Create the DB row first so the refresh token JWT can embed its id,
  // allowing individual-session revocation (logout, "sign out everywhere").
  const tokenId = uuid();
  const refreshToken = signRefreshToken({ sub: userId, tokenId });

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7); // matches JWT_REFRESH_EXPIRES_IN default

  await prisma.refreshToken.create({
    data: { id: tokenId, token: refreshToken, userId, expiresAt },
  });

  return { accessToken, refreshToken };
}

export const authService = {
  /**
   * Registers a new user. If `agencyName` is provided, a new Agency is
   * created and the user becomes its AGENCY_ADMIN. Otherwise the user is
   * created with the base TEAM_MEMBER role (agency assignment happens via
   * invitation in a later phase).
   */
  async register(input: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    agencyName?: string;
  }): Promise<AuthResult> {
    const normalizedEmail = input.email.toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) throw AppError.conflict("An account with this email already exists");

    const roleName: RoleName = input.agencyName ? "AGENCY_ADMIN" : "TEAM_MEMBER";
    const role = await prisma.role.findUnique({ where: { name: roleName } });
    if (!role) throw AppError.internal(`Role ${roleName} is not seeded`);

    const hashedPassword = await hashPassword(input.password);
    const emailVerifyToken = generateSecureToken();
    const emailVerifyExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

    const user = await prisma.$transaction(async (tx) => {
      let agencyId: string | undefined;

      if (input.agencyName) {
        const agency = await tx.agency.create({ data: { name: input.agencyName } });
        agencyId = agency.id;
      }

      return tx.user.create({
        data: {
          firstName: input.firstName,
          lastName: input.lastName,
          email: normalizedEmail,
          password: hashedPassword,
          roleId: role.id,
          agencyId,
          emailVerifyToken,
          emailVerifyExpiry,
        },
      });
    });

    await emailService.sendVerificationEmail(user.email, emailVerifyToken);

    const { accessToken, refreshToken } = await issueTokenPair(
      user.id,
      roleName,
      user.agencyId,
      user.clientId
    );

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        avatarUrl: user.avatarUrl,
        isEmailVerified: user.isEmailVerified,
        role: roleName,
        agencyId: user.agencyId,
        clientId: user.clientId,
      },
      accessToken,
      refreshToken,
    };
  },

  async login(email: string, password: string): Promise<AuthResult> {
    const normalizedEmail = email.toLowerCase();
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: { role: true },
    });

    if (!user || !user.password) {
      throw AppError.unauthorized("Invalid email or password");
    }
    if (!user.isActive) {
      throw AppError.forbidden("This account has been deactivated");
    }

    const valid = await comparePassword(password, user.password);
    if (!valid) throw AppError.unauthorized("Invalid email or password");

    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    const { accessToken, refreshToken } = await issueTokenPair(
      user.id,
      user.role.name,
      user.agencyId,
      user.clientId
    );

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        avatarUrl: user.avatarUrl,
        isEmailVerified: user.isEmailVerified,
        role: user.role.name,
        agencyId: user.agencyId,
        clientId: user.clientId,
      },
      accessToken,
      refreshToken,
    };
  },

  /** Verifies a Google ID token from the frontend, then logs in or creates the user. */
  async loginWithGoogle(idToken: string): Promise<AuthResult> {
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: env.google.clientId,
    });
    const payload = ticket.getPayload();
    if (!payload?.email) throw AppError.unauthorized("Invalid Google token");

    const normalizedEmail = payload.email.toLowerCase();

    let user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: { role: true },
    });

    if (!user) {
      const role = await prisma.role.findUnique({ where: { name: "TEAM_MEMBER" } });
      if (!role) throw AppError.internal("Role TEAM_MEMBER is not seeded");

      user = await prisma.user.create({
        data: {
          email: normalizedEmail,
          firstName: payload.given_name ?? "New",
          lastName: payload.family_name ?? "User",
          googleId: payload.sub,
          isEmailVerified: true,
          avatarUrl: payload.picture,
          roleId: role.id,
        },
        include: { role: true },
      });
    } else if (!user.googleId) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { googleId: payload.sub, isEmailVerified: true },
        include: { role: true },
      });
    }

    if (!user.isActive) throw AppError.forbidden("This account has been deactivated");

    const { accessToken, refreshToken } = await issueTokenPair(
      user.id,
      user.role.name,
      user.agencyId,
      user.clientId
    );

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        avatarUrl: user.avatarUrl,
        isEmailVerified: user.isEmailVerified,
        role: user.role.name,
        agencyId: user.agencyId,
        clientId: user.clientId,
      },
      accessToken,
      refreshToken,
    };
  },

  /** Rotates a refresh token: verifies it, revokes the old one, issues a new pair. */
  async refresh(token: string): Promise<AuthResult> {
    console.log("[Auth Service] Starting refresh...");
    let decoded;
    try {
      decoded = verifyRefreshToken(token);
      console.log("[Auth Service] Token decoded successfully! tokenId:", decoded.tokenId);
    } catch (err) {
      console.error("[Auth Service] Token verification failed:", err);
      throw AppError.unauthorized("Invalid or expired refresh token");
    }

    const stored = await prisma.refreshToken.findUnique({ where: { id: decoded.tokenId } });
    console.log("[Auth Service] Stored token found:", {
      exists: !!stored,
      revoked: stored?.revoked,
      tokenMatch: stored ? stored.token === token : false,
      expiresAt: stored?.expiresAt,
      now: new Date(),
    });

    if (!stored) {
      console.log("[Auth Service] Stored token not found!");
      throw AppError.unauthorized("Refresh token has been revoked or expired");
    }
    
    if (stored.expiresAt < new Date()) {
      console.log("[Auth Service] Token expired!");
      throw AppError.unauthorized("Refresh token has been revoked or expired");
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.sub },
      include: { role: true },
    });
    if (!user || !user.isActive) throw AppError.unauthorized("Account not found or inactive");

    // Don't revoke the old token or issue a new one—just reuse the existing one!
    const accessToken = signAccessToken({ sub: user.id, role: user.role.name, agencyId: user.agencyId, clientId: user.clientId });

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        avatarUrl: user.avatarUrl,
        isEmailVerified: user.isEmailVerified,
        role: user.role.name,
        agencyId: user.agencyId,
        clientId: user.clientId,
      },
      accessToken,
      refreshToken: token, // reuse the same refresh token
    };
  },

  async logout(refreshToken: string): Promise<void> {
    await prisma.refreshToken.updateMany({
      where: { token: refreshToken },
      data: { revoked: true },
    });
  },

  async forgotPassword(email: string): Promise<void> {
    const normalizedEmail = email.toLowerCase();
    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    // Always resolve silently even if the user doesn't exist, to avoid
    // leaking which emails are registered.
    if (!user) return;

    const token = generateSecureToken();
    const expiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordResetToken: token, passwordResetExpiry: expiry },
    });

    await emailService.sendPasswordResetEmail(user.email, token);
  },

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const user = await prisma.user.findFirst({
      where: { passwordResetToken: token, passwordResetExpiry: { gt: new Date() } },
    });
    if (!user) throw AppError.badRequest("Invalid or expired reset token");

    const hashed = await hashPassword(newPassword);
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashed, passwordResetToken: null, passwordResetExpiry: null },
    });

    // Revoke all existing sessions so a leaked old password can't be used
    // to keep an existing access/refresh token alive.
    await prisma.refreshToken.updateMany({ where: { userId: user.id }, data: { revoked: true } });
  },

  async verifyEmail(token: string): Promise<void> {
    const user = await prisma.user.findFirst({
      where: { emailVerifyToken: token, emailVerifyExpiry: { gt: new Date() } },
    });
    if (!user) throw AppError.badRequest("Invalid or expired verification token");

    await prisma.user.update({
      where: { id: user.id },
      data: { isEmailVerified: true, emailVerifyToken: null, emailVerifyExpiry: null },
    });
  },
};
