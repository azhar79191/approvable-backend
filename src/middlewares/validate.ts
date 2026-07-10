import { NextFunction, Request, Response } from "express";
import { AnyZodObject, ZodError } from "zod";
import { AppError } from "../utils/AppError";

/**
 * Validates req.body / req.query / req.params against a Zod schema shaped as
 * { body?, query?, params? }. Replaces req fields with the parsed (typed,
 * defaulted) values on success.
 */
export function validate(schema: AnyZodObject) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      const parsed = schema.parse({
        body: req.body,
        query: req.query,
        params: req.params,
      });

      if (parsed.body) req.body = parsed.body;
      if (parsed.query) req.query = parsed.query;
      if (parsed.params) req.params = parsed.params;

      return next();
    } catch (err) {
      if (err instanceof ZodError) {
        return next(AppError.badRequest("Validation failed", err.flatten()));
      }
      return next(err);
    }
  };
}
