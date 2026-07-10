import { NextFunction, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { AppError } from "../utils/AppError";
import { env } from "../config/env";

/**
 * Central error handler. Must be registered LAST, after all routes.
 * Normalizes AppError, Prisma errors, and unexpected errors into a
 * consistent JSON shape.
 */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
      details: err.details,
    });
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      return res.status(409).json({
        success: false,
        message: `A record with this ${(err.meta?.target as string[])?.join(", ")} already exists`,
      });
    }
    if (err.code === "P2025") {
      return res.status(404).json({ success: false, message: "Record not found" });
    }
  }

  // eslint-disable-next-line no-console
  console.error(`[error] ${req.method} ${req.path}:`, err);

  return res.status(500).json({
    success: false,
    message: "Internal server error",
    stack: env.isProd ? undefined : (err as Error)?.stack,
  });
}
