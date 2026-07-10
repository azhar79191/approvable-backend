import crypto from "crypto";

/** Generates a URL-safe random token for email verification / password reset links. */
export function generateSecureToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("hex");
}
