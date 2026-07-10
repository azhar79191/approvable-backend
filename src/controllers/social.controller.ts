import { Request, Response } from "express";
import { catchAsync } from "../utils/catchAsync";
import { prisma } from "../config/database";
import { AppError } from "../utils/AppError";
import crypto from "crypto";

// ─── Credential encryption ────────────────────────────────────────────────────
// Credentials are AES-256-GCM encrypted before being stored in the database.
// The encryption key comes from the environment — never hardcoded.

const ALGO = "aes-256-gcm";
const KEY = Buffer.from(
  process.env.SOCIAL_CREDS_KEY ?? crypto.randomBytes(32).toString("hex").slice(0, 64),
  "hex"
).slice(0, 32);

function encryptCredentials(data: Record<string, string>): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, KEY, iv);
  const json = JSON.stringify(data);
  const encrypted = Buffer.concat([cipher.update(json, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return JSON.stringify({
    iv: iv.toString("hex"),
    tag: tag.toString("hex"),
    data: encrypted.toString("hex"),
  });
}

function decryptCredentials(stored: string): Record<string, string> {
  try {
    const { iv, tag, data } = JSON.parse(stored);
    const decipher = crypto.createDecipheriv(ALGO, KEY, Buffer.from(iv, "hex"));
    decipher.setAuthTag(Buffer.from(tag, "hex"));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(data, "hex")),
      decipher.final(),
    ]);
    return JSON.parse(decrypted.toString("utf8"));
  } catch {
    return {};
  }
}

function requireAgency(req: Request): string {
  const agencyId = req.user?.agencyId;
  if (!agencyId) throw AppError.forbidden("This action requires an agency account");
  return agencyId;
}

// Strip credentials from the response — never expose raw keys to the client
function sanitize(account: Record<string, unknown>) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { credentials, ...safe } = account;
  return safe;
}

export const socialAccountController = {
  list: catchAsync(async (req: Request, res: Response) => {
    const agencyId = requireAgency(req);
    const { clientId } = req.query as { clientId?: string };
    const accounts = await prisma.socialAccount.findMany({
      where: { agencyId, ...(clientId ? { clientId } : {}) },
      orderBy: { createdAt: "desc" },
    });
    res.status(200).json({ success: true, data: accounts.map(sanitize) });
  }),

  connect: catchAsync(async (req: Request, res: Response) => {
    const agencyId = requireAgency(req);
    const { platform, accountName, clientId, credentials } = req.body as {
      platform: string;
      accountName: string;
      clientId?: string;
      credentials: Record<string, string>;
    };

    if (!platform || !accountName || !credentials) {
      throw AppError.badRequest("platform, accountName, and credentials are required");
    }

    const encrypted = encryptCredentials(credentials);

    const account = await prisma.socialAccount.create({
      data: {
        agencyId,
        clientId: clientId ?? null,
        platform: platform as never,
        accountName,
        accountId: credentials.accountId ?? credentials.pageId ?? null,
        authMethod: "API_KEY",
        credentials: encrypted,
        isActive: true,
      },
    });

    res.status(201).json({ success: true, data: sanitize(account as never) });
  }),

  disconnect: catchAsync(async (req: Request, res: Response) => {
    const agencyId = requireAgency(req);
    const account = await prisma.socialAccount.findUnique({ where: { id: req.params.id } });
    if (!account || account.agencyId !== agencyId) throw AppError.notFound("Social account not found");
    await prisma.socialAccount.delete({ where: { id: req.params.id } });
    res.status(204).send();
  }),

  refresh: catchAsync(async (req: Request, res: Response) => {
    const agencyId = requireAgency(req);
    const account = await prisma.socialAccount.findUnique({ where: { id: req.params.id } });
    if (!account || account.agencyId !== agencyId) throw AppError.notFound("Social account not found");

    // In a real implementation this would call the platform's token refresh endpoint.
    // For now we just mark it active and clear the expiry.
    const updated = await prisma.socialAccount.update({
      where: { id: req.params.id },
      data: { isActive: true, expiresAt: null },
    });

    res.status(200).json({ success: true, data: sanitize(updated as never) });
  }),

  publishPost: catchAsync(async (req: Request, res: Response) => {
    const agencyId = requireAgency(req);
    const { postId } = req.params;
    const { socialAccountId } = req.body as { socialAccountId: string };

    if (!socialAccountId) throw AppError.badRequest("socialAccountId is required");

    const account = await prisma.socialAccount.findUnique({ where: { id: socialAccountId } });
    if (!account || account.agencyId !== agencyId) throw AppError.notFound("Social account not found");
    if (!account.isActive) throw AppError.badRequest("Social account is not active");

    const post = await prisma.post.findUnique({
      where: { id: postId },
      include: {
        media: { include: { file: true }, orderBy: { order: "asc" } },
        client: true,
      },
    });
    if (!post) throw AppError.notFound("Post not found");
    if (post.status !== "APPROVED" && post.status !== "SCHEDULED") {
      throw AppError.badRequest("Only APPROVED or SCHEDULED posts can be published");
    }

    // Decrypt credentials for use in publishing
    const creds = decryptCredentials(account.credentials as string);

    // Platform-specific publishing logic
    // In production, each platform would have its own publisher class.
    // Here we validate credentials exist and simulate the publish.
    const requiredKeys: Record<string, string[]> = {
      FACEBOOK: ["accessToken"],
      INSTAGRAM: ["accessToken"],
      TWITTER: ["apiKey", "apiSecret", "accessToken", "accessTokenSecret"],
      LINKEDIN: ["accessToken"],
      TIKTOK: ["accessToken", "accountId"],
      YOUTUBE: ["accessToken"],
      PINTEREST: ["accessToken"],
    };

    const required = requiredKeys[account.platform] ?? [];
    const missing = required.filter((k) => !creds[k]);
    if (missing.length) {
      throw AppError.badRequest(`Missing credentials for ${account.platform}: ${missing.join(", ")}`);
    }

    // Mark post as published
    await prisma.post.update({
      where: { id: postId },
      data: { status: "PUBLISHED" },
    });

    // Record activity
    await prisma.activity.create({
      data: {
        postId,
        userId: req.user!.sub,
        clientId: post.clientId,
        action: "post.published",
        metadata: { platform: account.platform, accountName: account.accountName },
      },
    });

    res.status(200).json({
      success: true,
      data: {
        published: true,
        platform: account.platform,
        // In production, return the actual post URL from the platform API response
        url: null,
      },
    });
  }),
};


