import { NextFunction, Request, Response } from "express";
import { AppError } from "../utils/AppError";
import { verifyAccessToken } from "../utils/jwt";

/**
 * Verifies the Bearer access token on the Authorization header and
 * attaches the decoded payload to `req.user`. Use on any protected route.
 */
export function authenticate(req: Request, _res: Response, next: NextFunction) {
  // Accept token from Authorization header OR ?_token query param (OAuth popup redirect)
  const header = req.headers.authorization;
  const queryToken = req.query._token as string | undefined;
  const raw = header?.startsWith("Bearer ") ? header.slice(7) : queryToken;

  if (!raw) {
    return next(AppError.unauthorized("Missing or malformed Authorization header"));
  }

  try {
    const payload = verifyAccessToken(raw);
    req.user = payload;
    return next();
  } catch {
    return next(AppError.unauthorized("Invalid or expired access token"));
  }
}
