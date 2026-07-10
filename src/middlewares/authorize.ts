import { NextFunction, Request, Response } from "express";
import { prisma } from "../config/database";
import { AppError } from "../utils/AppError";
import { PermissionKey } from "../config/permissions";
import { RoleName } from "@prisma/client";
import { AccessTokenPayload } from "../utils/jwt";

type AuthRequest = Request & { user?: AccessTokenPayload };

/**
 * Restricts a route to one or more roles. Use for coarse-grained checks,
 * e.g. `authorizeRoles("SUPER_ADMIN", "AGENCY_ADMIN")`.
 */
export function authorizeRoles(...allowed: RoleName[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const authReq = req as AuthRequest;
    if (!authReq.user) return next(AppError.unauthorized());
    if (!allowed.includes(authReq.user.role as RoleName)) {
      return next(AppError.forbidden("You do not have permission to perform this action"));
    }
    return next();
  };
}

/**
 * Restricts a route to users whose role grants a specific permission key.
 * Looks up the role -> permissions mapping from the database, so it
 * reflects any admin-configured permission changes without a redeploy.
 */
export function authorizePermission(permission: PermissionKey) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const authReq = req as AuthRequest;
      if (!authReq.user) return next(AppError.unauthorized());

      const role = await prisma.role.findUnique({
        where: { name: authReq.user.role as RoleName },
        include: { permissions: { include: { permission: true } } },
      });

      const hasPermission = role?.permissions.some(
        (rp) => rp.permission.key === permission
      );

      if (!hasPermission) {
        return next(AppError.forbidden(`Missing required permission: ${permission}`));
      }

      return next();
    } catch (err) {
      return next(err);
    }
  };
}
