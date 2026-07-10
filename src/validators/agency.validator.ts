import { z } from "zod";

export const updateAgencySchema = z.object({
  body: z.object({
    name: z.string().min(1).optional(),
    themeColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Must be a valid hex color").optional(),
  }),
});

export const inviteMemberSchema = z.object({
  body: z.object({
    email: z.string().email(),
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    role: z.enum(["TEAM_MEMBER", "AGENCY_ADMIN"]).optional(),
  }),
});

export const memberUserIdParamSchema = z.object({
  params: z.object({ userId: z.string().uuid() }),
});
