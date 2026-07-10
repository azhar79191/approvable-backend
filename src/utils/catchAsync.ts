import { NextFunction, Request, Response } from "express";

type AsyncRouteHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => Promise<unknown>;

/**
 * Wraps async controller functions so thrown/rejected errors are
 * forwarded to Express's error-handling middleware instead of
 * crashing the process or requiring a try/catch in every controller.
 */
export const catchAsync =
  (fn: AsyncRouteHandler) => (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
