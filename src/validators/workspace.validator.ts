import { z } from "zod";

export const addWorkspaceMemberSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({ userId: z.string().uuid() }),
});

export const removeWorkspaceMemberSchema = z.object({
  params: z.object({ id: z.string().uuid(), userId: z.string().uuid() }),
});
