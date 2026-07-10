import { z } from "zod";

export const createCommentSchema = z.object({
  params: z.object({ postId: z.string().uuid() }),
  body: z.object({
    body: z.string().min(1),
    mentions: z.array(z.string().uuid()).optional(),
    attachments: z.array(z.string().url()).optional(),
  }),
});

export const createReplySchema = z.object({
  params: z.object({ commentId: z.string().uuid() }),
  body: z.object({
    body: z.string().min(1),
    mentions: z.array(z.string().uuid()).optional(),
  }),
});

export const commentIdParamSchema = z.object({
  params: z.object({ commentId: z.string().uuid() }),
});

export const postIdParamSchema = z.object({
  params: z.object({ postId: z.string().uuid() }),
});
