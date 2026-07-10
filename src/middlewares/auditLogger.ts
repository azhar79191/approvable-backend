import { NextFunction, Request, Response } from "express";
import { auditService } from "../services/audit.service";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Fire-and-forget audit logging for mutating requests. Attached globally
 * after auth so `req.user` is available. Runs after the response is sent
 * so it never adds latency to the request itself.
 */
export function auditLogger(req: Request, res: Response, next: NextFunction) {
  res.on("finish", () => {
    if (!MUTATING_METHODS.has(req.method)) return;
    if (res.statusCode >= 400) return; // only log successful mutations

    auditService
      .log({
        userId: req.user?.sub ?? null,
        action: `${req.method} ${req.baseUrl}${req.route?.path ?? req.path}`,
        entity: req.baseUrl.replace("/api/", "") || "unknown",
        entityId: req.params?.id ?? req.params?.postId ?? req.params?.commentId,
        ipAddress: req.ip,
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.error("[audit] failed to write audit log:", err);
      });
  });
  next();
}
