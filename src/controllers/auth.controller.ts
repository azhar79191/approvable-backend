import { Request, Response } from "express";
import { catchAsync } from "../utils/catchAsync";
import { authService } from "../services/auth.service";
import { env } from "../config/env";

const REFRESH_COOKIE = "refreshToken";

function setRefreshCookie(res: Response, token: string) {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: env.isProd,
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: "/", // sent to all endpoints
  });
}

export const authController = {
  register: catchAsync(async (req: Request, res: Response) => {
    const result = await authService.register(req.body);
    setRefreshCookie(res, result.refreshToken);
    res.status(201).json({ success: true, data: { user: result.user, accessToken: result.accessToken } });
  }),

  login: catchAsync(async (req: Request, res: Response) => {
    const { email, password } = req.body;
    const result = await authService.login(email, password);
    setRefreshCookie(res, result.refreshToken);
    res.status(200).json({ success: true, data: { user: result.user, accessToken: result.accessToken } });
  }),

  googleLogin: catchAsync(async (req: Request, res: Response) => {
    const { idToken } = req.body;
    const result = await authService.loginWithGoogle(idToken);
    setRefreshCookie(res, result.refreshToken);
    res.status(200).json({ success: true, data: { user: result.user, accessToken: result.accessToken } });
  }),

  refresh: catchAsync(async (req: Request, res: Response) => {
    console.log("[Auth Controller] Refresh called!");
    console.log("[Auth Controller] Cookies:", req.cookies);
    console.log("[Auth Controller] Body:", req.body);

    const token = req.body.refreshToken ?? req.cookies?.[REFRESH_COOKIE];
    console.log("[Auth Controller] Extracted token:", token ? "present" : "missing");

    if (!token) {
      console.log("[Auth Controller] No token found, returning 401");
      res.status(401).json({ success: false, message: "No refresh token provided" });
      return;
    }

    try {
      const result = await authService.refresh(token);
      console.log("[Auth Controller] Refresh successful!");
      setRefreshCookie(res, result.refreshToken);
      res.status(200).json({ success: true, data: { user: result.user, accessToken: result.accessToken } });
    } catch (err) {
      console.error("[Auth Controller] Refresh failed:", err);
      res.status(401).json({ success: false, message: "Invalid refresh token" });
    }
  }),

  logout: catchAsync(async (req: Request, res: Response) => {
    const token = req.body.refreshToken ?? req.cookies?.[REFRESH_COOKIE];
    if (token) await authService.logout(token);
    res.clearCookie(REFRESH_COOKIE, { path: "/" });
    res.status(200).json({ success: true, message: "Logged out" });
  }),

  forgotPassword: catchAsync(async (req: Request, res: Response) => {
    await authService.forgotPassword(req.body.email);
    // Same response whether or not the email exists.
    res.status(200).json({ success: true, message: "If that email exists, a reset link has been sent" });
  }),

  resetPassword: catchAsync(async (req: Request, res: Response) => {
    await authService.resetPassword(req.body.token, req.body.password);
    res.status(200).json({ success: true, message: "Password has been reset" });
  }),

  verifyEmail: catchAsync(async (req: Request, res: Response) => {
    await authService.verifyEmail(req.body.token);
    res.status(200).json({ success: true, message: "Email verified" });
  }),
};
