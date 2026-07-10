/**
 * Central permission registry. Each key is seeded into the `permissions`
 * table and attached to roles via `role_permissions` (see prisma/seed.ts).
 *
 * Naming convention: "<resource>:<action>"
 */
export const PERMISSIONS = {
  CLIENTS_MANAGE: "clients:manage",
  CLIENTS_VIEW: "clients:view",

  POSTS_CREATE: "posts:create",
  POSTS_EDIT: "posts:edit",
  POSTS_DELETE: "posts:delete",
  POSTS_VIEW: "posts:view",

  APPROVALS_ACT: "approvals:act", // approve / reject / request changes
  APPROVALS_VIEW: "approvals:view",

  COMMENTS_CREATE: "comments:create",
  COMMENTS_MODERATE: "comments:moderate",

  MEDIA_UPLOAD: "media:upload",
  MEDIA_DELETE: "media:delete",

  ANALYTICS_VIEW: "analytics:view",

  USERS_MANAGE: "users:manage",
  ROLES_MANAGE: "roles:manage",
  BILLING_MANAGE: "billing:manage",

  AUDIT_VIEW: "audit:view",
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/** Default permission set granted to each built-in role at seed time. */
export const ROLE_PERMISSIONS: Record<
  "SUPER_ADMIN" | "AGENCY_ADMIN" | "TEAM_MEMBER" | "CLIENT",
  PermissionKey[]
> = {
  SUPER_ADMIN: Object.values(PERMISSIONS),
  AGENCY_ADMIN: [
    PERMISSIONS.CLIENTS_MANAGE,
    PERMISSIONS.CLIENTS_VIEW,
    PERMISSIONS.POSTS_CREATE,
    PERMISSIONS.POSTS_EDIT,
    PERMISSIONS.POSTS_DELETE,
    PERMISSIONS.POSTS_VIEW,
    PERMISSIONS.APPROVALS_ACT,
    PERMISSIONS.APPROVALS_VIEW,
    PERMISSIONS.COMMENTS_CREATE,
    PERMISSIONS.COMMENTS_MODERATE,
    PERMISSIONS.MEDIA_UPLOAD,
    PERMISSIONS.MEDIA_DELETE,
    PERMISSIONS.ANALYTICS_VIEW,
    PERMISSIONS.USERS_MANAGE,
    PERMISSIONS.BILLING_MANAGE,
    PERMISSIONS.AUDIT_VIEW,
  ],
  TEAM_MEMBER: [
    PERMISSIONS.CLIENTS_VIEW,
    PERMISSIONS.POSTS_CREATE,
    PERMISSIONS.POSTS_EDIT,
    PERMISSIONS.POSTS_VIEW,
    PERMISSIONS.APPROVALS_VIEW,
    PERMISSIONS.COMMENTS_CREATE,
    PERMISSIONS.MEDIA_UPLOAD,
    PERMISSIONS.ANALYTICS_VIEW,
  ],
  CLIENT: [
    PERMISSIONS.POSTS_VIEW,
    PERMISSIONS.APPROVALS_ACT,
    PERMISSIONS.APPROVALS_VIEW,
    PERMISSIONS.COMMENTS_CREATE,
    PERMISSIONS.ANALYTICS_VIEW,
  ],
};
