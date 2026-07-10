import { z } from "zod";

export const approvalActionSchema = z.object({
  params: z.object({ postId: z.string().uuid() }),
  body: z.object({
    action: z.enum(["APPROVE", "REJECT", "REQUEST_CHANGES"]),
    comment: z.string().optional(),
  }),
});

export const postIdParamSchema = z.object({
  params: z.object({ postId: z.string().uuid() }),
});
