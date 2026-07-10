import { Request, Response } from "express";
import { prisma } from "../config/database";
import { AppError } from "../utils/AppError";
import { env } from "../config/env";
import { catchAsync } from "../utils/catchAsync";
import { getRedisConnection } from "../config/redis";
import crypto from "crypto";
import axios from "axios";

// ─── Encryption (reused from social.controller) ───────────────────────────────

const ALGO = "aes-256-gcm";
const KEY = Buffer.from(
  process.env.SOCIAL_CREDS_KEY ?? crypto.randomBytes(32).toString("hex").slice(0, 64),
  "hex"
).slice(0, 32);

function encryptCredentials(data: Record<string, string>): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, KEY, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(data), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return JSON.stringify({ iv: iv.toString("hex"), tag: tag.toString("hex"), data: encrypted.toString("hex") });
}

// ─── State store (Redis-backed, 10-min TTL) ──────────────────────────────────

const STATE_TTL = 600; // seconds

async function generateState(payload: { agencyId: string; userId: string; platform: string; clientId?: string }): Promise<string> {
  const state = crypto.randomBytes(16).toString("hex");
  const redis = getRedisConnection();
  if (redis) {
    await redis.set(`oauth:state:${state}`, JSON.stringify(payload), "EX", STATE_TTL);
  }
  return state;
}

async function consumeState(state: string): Promise<{ agencyId: string; userId: string; platform: string; clientId?: string } | null> {
  const redis = getRedisConnection();
  if (!redis) return null;
  const raw = await redis.getdel(`oauth:state:${state}`);
  if (!raw) return null;
  return JSON.parse(raw);
}

// ─── Platform OAuth configs ───────────────────────────────────────────────────

const CALLBACK_BASE = `${env.apiUrl}/oauth`;

interface OAuthConfig {
  authUrl: string;
  tokenUrl: string;
  scopes: string[];
  clientId: string;
  clientSecret: string;
  extraAuthParams?: Record<string, string>;
}

function getConfig(platform: string): OAuthConfig {
  const base = CALLBACK_BASE;
  switch (platform) {
    case "FACEBOOK":
      return {
        authUrl: "https://www.facebook.com/v19.0/dialog/oauth",
        tokenUrl: "https://graph.facebook.com/v19.0/oauth/access_token",
        scopes: ["public_profile"],
        clientId: env.oauth.facebook.clientId,
        clientSecret: env.oauth.facebook.clientSecret,
        extraAuthParams: { redirect_uri: `${base}/facebook/callback` },
      };
    case "INSTAGRAM":
      return {
        authUrl: "https://www.facebook.com/v19.0/dialog/oauth",
        tokenUrl: "https://graph.facebook.com/v19.0/oauth/access_token",
        scopes: ["public_profile"],
        clientId: env.oauth.facebook.clientId,
        clientSecret: env.oauth.facebook.clientSecret,
        extraAuthParams: { redirect_uri: `${base}/instagram/callback` },
      };
    case "TWITTER":
      return {
        authUrl: "https://twitter.com/i/oauth2/authorize",
        tokenUrl: "https://api.twitter.com/2/oauth2/token",
        scopes: ["tweet.read", "tweet.write", "users.read", "offline.access"],
        clientId: env.oauth.twitter.clientId,
        clientSecret: env.oauth.twitter.clientSecret,
        extraAuthParams: {
          redirect_uri: `${base}/twitter/callback`,
          code_challenge: "challenge",
          code_challenge_method: "plain",
        },
      };
    case "LINKEDIN":
      return {
        authUrl: "https://www.linkedin.com/oauth/v2/authorization",
        tokenUrl: "https://www.linkedin.com/oauth/v2/accessToken",
        scopes: ["openid", "profile", "w_member_social", "r_basicprofile"],
        clientId: env.oauth.linkedin.clientId,
        clientSecret: env.oauth.linkedin.clientSecret,
        extraAuthParams: { redirect_uri: `${base}/linkedin/callback` },
      };
    case "TIKTOK":
      return {
        authUrl: "https://www.tiktok.com/v2/auth/authorize",
        tokenUrl: "https://open.tiktokapis.com/v2/oauth/token/",
        scopes: ["user.info.basic", "video.publish", "video.upload"],
        clientId: env.oauth.tiktok.clientId,
        clientSecret: env.oauth.tiktok.clientSecret,
        extraAuthParams: { redirect_uri: `${base}/tiktok/callback` },
      };
    case "YOUTUBE":
      return {
        authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
        tokenUrl: "https://oauth2.googleapis.com/token",
        scopes: ["https://www.googleapis.com/auth/youtube.upload", "https://www.googleapis.com/auth/youtube"],
        clientId: env.oauth.youtube.clientId,
        clientSecret: env.oauth.youtube.clientSecret,
        extraAuthParams: {
          redirect_uri: `${base}/youtube/callback`,
          access_type: "offline",
          prompt: "consent",
        },
      };
    case "PINTEREST":
      return {
        authUrl: "https://www.pinterest.com/oauth/",
        tokenUrl: "https://api.pinterest.com/v5/oauth/token",
        scopes: ["boards:read", "pins:read", "pins:write"],
        clientId: env.oauth.pinterest.clientId,
        clientSecret: env.oauth.pinterest.clientSecret,
        extraAuthParams: { redirect_uri: `${base}/pinterest/callback` },
      };
    default:
      throw AppError.badRequest(`Unsupported platform: ${platform}`);
  }
}

// ─── Token exchange helpers ───────────────────────────────────────────────────

async function exchangeCode(
  platform: string,
  code: string
): Promise<{ accessToken: string; refreshToken?: string; expiresIn?: number; accountId?: string; accountName?: string }> {
  const cfg = getConfig(platform);
  const redirectUri = cfg.extraAuthParams?.redirect_uri ?? "";

  if (platform === "TWITTER") {
    // Twitter uses Basic auth for token exchange
    const params = new URLSearchParams({
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
      code_verifier: "challenge",
    });
    const { data } = await axios.post(cfg.tokenUrl, params.toString(), {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString("base64")}`,
      },
    });
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
    };
  }

  if (platform === "TIKTOK") {
    const params = new URLSearchParams({
      client_key: cfg.clientId,
      client_secret: cfg.clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    });
    const { data } = await axios.post(cfg.tokenUrl, params.toString(), {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    return {
      accessToken: data.data?.access_token ?? data.access_token,
      refreshToken: data.data?.refresh_token ?? data.refresh_token,
      expiresIn: data.data?.expires_in ?? data.expires_in,
      accountId: data.data?.open_id,
    };
  }

  if (platform === "PINTEREST") {
    const { data } = await axios.post(
      cfg.tokenUrl,
      new URLSearchParams({ code, grant_type: "authorization_code", redirect_uri: redirectUri }).toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString("base64")}`,
        },
      }
    );
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
    };
  }

  // Facebook, Instagram, LinkedIn, YouTube — standard POST body
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    code,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
  });
  const { data } = await axios.post(cfg.tokenUrl, params.toString(), {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in ?? data.expires_in_seconds,
  };
}

async function fetchAccountInfo(
  platform: string,
  accessToken: string
): Promise<{ accountId?: string; accountName?: string }> {
  try {
    if (platform === "FACEBOOK") {
      const { data } = await axios.get("https://graph.facebook.com/v19.0/me", {
        params: { access_token: accessToken, fields: "id,name" },
      });
      return { accountId: data.id, accountName: data.name };
    }
    if (platform === "INSTAGRAM") {
      const { data } = await axios.get("https://graph.facebook.com/v19.0/me", {
        params: { access_token: accessToken, fields: "id,name" },
      });
      return { accountId: data.id, accountName: data.name };
    }
    if (platform === "TWITTER") {
      const { data } = await axios.get("https://api.twitter.com/2/users/me", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      return { accountId: data.data?.id, accountName: data.data?.username };
    }
    if (platform === "LINKEDIN") {
      const { data } = await axios.get("https://api.linkedin.com/v2/userinfo", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      return { accountId: data.sub, accountName: data.name };
    }
    if (platform === "YOUTUBE") {
      const { data } = await axios.get("https://www.googleapis.com/youtube/v3/channels", {
        params: { part: "snippet", mine: true, access_token: accessToken },
      });
      const ch = data.items?.[0];
      return { accountId: ch?.id, accountName: ch?.snippet?.title };
    }
    if (platform === "PINTEREST") {
      const { data } = await axios.get("https://api.pinterest.com/v5/user_account", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      return { accountId: data.username, accountName: data.username };
    }
    if (platform === "TIKTOK") {
      const { data } = await axios.get("https://open.tiktokapis.com/v2/user/info/", {
        params: { fields: "open_id,display_name" },
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      return { accountId: data.data?.user?.open_id, accountName: data.data?.user?.display_name };
    }
  } catch {
    // Non-fatal — account info is best-effort
  }
  return {};
}

// ─── Controller ───────────────────────────────────────────────────────────────

export const oauthController = {
  // GET /api/oauth/:platform/connect
  // Called from the frontend popup — redirects to the platform's consent screen
  connect: async (req: Request, res: Response) => {
    const platform = (req.params.platform as string).toUpperCase();

    const closeWithError = (message: string) => {
      const params = new URLSearchParams({ status: "error", platform, message });
      res.redirect(`${env.clientUrl}/oauth/callback?${params.toString()}`);
    };

    try {
      // Read token from Authorization header OR ?_token query param
      const header = req.headers.authorization;
      const queryToken = req.query._token as string | undefined;
      const raw = header?.startsWith("Bearer ") ? header.slice(7) : queryToken;

      if (!raw) return closeWithError("Session expired — please refresh and try again");

      let payload: import("../utils/jwt").AccessTokenPayload;
      try {
        payload = (await import("../utils/jwt")).verifyAccessToken(decodeURIComponent(raw));
      } catch {
        return closeWithError("Session expired — please log in again");
      }

      const agencyId = payload.agencyId;
      const userId = payload.sub;
      if (!agencyId || !userId) return closeWithError("Agency account required");

      const cfg = getConfig(platform);
      const state = await generateState({ agencyId, userId, platform, clientId: req.query.clientId as string | undefined });

      const params = new URLSearchParams({
        client_id: cfg.clientId,
        response_type: "code",
        scope: cfg.scopes.join(platform === "TIKTOK" ? "," : " "),
        state,
        ...cfg.extraAuthParams,
      });

      res.redirect(`${cfg.authUrl}?${params.toString()}`);
        } catch (err) {
      console.error("[OAuth Callback Error] Platform:", platform, "Error:", err);
      const msg = err instanceof Error ? err.message : "Failed to initiate OAuth";
      closeWithError(msg);
    }
  },

  // GET /api/oauth/:platform/callback?code=...&state=...
  // Platform redirects here after user approves — exchange code, save account
  callback: async (req: Request, res: Response) => {
    const platform = (req.params.platform as string).toUpperCase();
    const { code, state, error } = req.query as Record<string, string>;

    const closePopup = (status: "success" | "error", message?: string) => {
      const params = new URLSearchParams({ status, platform });
      if (message) params.set("message", message);
      res.redirect(`${env.clientUrl}/oauth/callback?${params.toString()}`);
    };

    try {
      if (error) return closePopup("error", error);
      if (!code || !state) return closePopup("error", "Missing code or state");

      console.log("[OAuth] State validation:", state);
      const pending = await consumeState(state);
      console.log("[OAuth] Pending:", pending);
      if (!pending) return closePopup("error", "Invalid or expired state — please try again");

      const tokens = await exchangeCode(platform, code);
      console.log("[OAuth] Tokens received:", { hasAccessToken: !!tokens.accessToken, hasRefreshToken: !!tokens.refreshToken });
      const info = await fetchAccountInfo(platform, tokens.accessToken);
      console.log("[OAuth] Account info:", info);

      let pageData: { pageId?: string; pageName?: string; pageAccessToken?: string } = {};
      if (platform === "FACEBOOK") {
        try {
          console.log("[OAuth] Attempting to fetch Facebook pages...");
          // Fetch user's Facebook pages
          const { data: pagesResponse } = await axios.get("https://graph.facebook.com/v19.0/me/accounts", {
            params: { access_token: tokens.accessToken, fields: "id,name,access_token" },
          });
          
          const pages = pagesResponse.data || [];
          console.log("[OAuth] Facebook pages found:", pages.length);
          
          if (pages.length > 0) {
            // Use the first page (in a real app, you'd let the user select)
            const firstPage = pages[0];
            pageData = {
              pageId: firstPage.id,
              pageName: firstPage.name,
              pageAccessToken: firstPage.access_token,
            };
            console.log("[OAuth] Using Facebook page:", pageData.pageName);
          } else {
            console.log("[OAuth] No Facebook pages found for this user");
          }
        } catch (error) {
          console.error("[OAuth] Error fetching Facebook pages (this is expected if permissions aren't configured yet):", error);
          if (axios.isAxiosError(error) && error.response?.data) {
            console.error("[OAuth] Facebook error details:", error.response.data);
          }
        }
      }

      const credentials: Record<string, string> = {
        accessToken: tokens.accessToken,
        ...(tokens.refreshToken ? { refreshToken: tokens.refreshToken } : {}),
        ...pageData,
      };

      const expiresAt = tokens.expiresIn
        ? new Date(Date.now() + tokens.expiresIn * 1000)
        : null;

      await prisma.socialAccount.create({
        data: {
          agencyId: pending.agencyId,
          clientId: pending.clientId ?? null,
          platform: platform as never,
          accountName: info.accountName ?? platform,
          accountId: info.accountId ?? null,
          authMethod: "OAUTH2",
          credentials: encryptCredentials(credentials),
          isActive: true,
          expiresAt,
        },
      });

      return closePopup("success");
        } catch (err) {
      console.error("[OAuth Callback Error] Platform:", platform, "Error:", err);
      const msg = err instanceof Error ? err.message : "Token exchange failed";
      return closePopup("error", msg);
    }
  },

  // POST /api/oauth/:id/refresh — refresh an expired OAuth token
  refreshToken: catchAsync(async (req: Request, res: Response) => {
    const agencyId = req.user?.agencyId;
    if (!agencyId) throw AppError.forbidden("Agency account required");

    const account = await prisma.socialAccount.findUnique({ where: { id: req.params.id } });
    if (!account || account.agencyId !== agencyId) throw AppError.notFound("Social account not found");
    if (account.authMethod !== "OAUTH2") throw AppError.badRequest("This account uses API keys, not OAuth");

    const stored = JSON.parse(account.credentials as string);
    const { iv, tag, data: encData } = stored;
    const decipher = crypto.createDecipheriv(ALGO, KEY, Buffer.from(iv, "hex"));
    decipher.setAuthTag(Buffer.from(tag, "hex"));
    const creds = JSON.parse(
      Buffer.concat([decipher.update(Buffer.from(encData, "hex")), decipher.final()]).toString("utf8")
    ) as Record<string, string>;

    if (!creds.refreshToken) throw AppError.badRequest("No refresh token stored for this account");

    const cfg = getConfig(account.platform);
    let newTokens: { access_token: string; refresh_token?: string; expires_in?: number };

    if (account.platform === "TWITTER") {
      const params = new URLSearchParams({ grant_type: "refresh_token", refresh_token: creds.refreshToken });
      const { data } = await axios.post(cfg.tokenUrl, params.toString(), {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString("base64")}`,
        },
      });
      newTokens = data;
    } else if (account.platform === "TIKTOK") {
      const params = new URLSearchParams({
        client_key: cfg.clientId,
        client_secret: cfg.clientSecret,
        grant_type: "refresh_token",
        refresh_token: creds.refreshToken,
      });
      const { data } = await axios.post(cfg.tokenUrl, params.toString(), {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      });
      newTokens = { access_token: data.data?.access_token, refresh_token: data.data?.refresh_token, expires_in: data.data?.expires_in };
    } else {
      const params = new URLSearchParams({
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        grant_type: "refresh_token",
        refresh_token: creds.refreshToken,
      });
      const { data } = await axios.post(cfg.tokenUrl, params.toString(), {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      });
      newTokens = data;
    }

    const newCreds = {
      ...creds,
      accessToken: newTokens.access_token,
      ...(newTokens.refresh_token ? { refreshToken: newTokens.refresh_token } : {}),
    };

    const expiresAt = newTokens.expires_in ? new Date(Date.now() + newTokens.expires_in * 1000) : null;

    const updated = await prisma.socialAccount.update({
      where: { id: account.id },
      data: { credentials: encryptCredentials(newCreds), isActive: true, expiresAt },
    });

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { credentials: _c, ...safe } = updated as Record<string, unknown>;
    res.status(200).json({ success: true, data: safe });
  }),
};











