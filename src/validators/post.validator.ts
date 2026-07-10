import { z } from "zod";

export const postTypeEnum = z.enum([
  "IMAGE",
  "VIDEO",
  "CAROUSEL",
  "STORY",
  "REEL",
  "LINKEDIN_PDF",
  "TEXT",
]);

export const platformEnum = z.enum([
  "FACEBOOK",
  "INSTAGRAM",
  "TWITTER",
  "LINKEDIN",
  "TIKTOK",
  "YOUTUBE",
  "PINTEREST",
]);

export const postStatusEnum = z.enum([
  "DRAFT",
  "PENDING_APPROVAL",
  "APPROVED",
  "REJECTED",
  "NEEDS_CHANGES",
  "SCHEDULED",
  "PUBLISHED",
]);

export const createPostSchema = z.object({
  body: z.object({
    clientId: z.string().uuid(),
    title: z.string().min(1),
    caption: z.string().optional(),
    type: postTypeEnum,
    platform: platformEnum,
    publishDate: z.coerce.date().optional(),
    tags: z.array(z.string()).optional(),
    fileIds: z.array(z.string().uuid()).optional(), // media already uploaded to the Media Library
    approvalSteps: z
      .array(z.object({ order: z.number().int().min(1), roleLabel: z.string(), assigneeId: z.string().uuid().optional() }))
      .optional(), // custom approval chain; defaults to Designer -> Manager -> Client -> CEO if omitted
  }),
});

export const updatePostSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    title: z.string().min(1).optional(),
    caption: z.string().optional(),
    type: postTypeEnum.optional(),
    platform: platformEnum.optional(),
    publishDate: z.coerce.date().optional(),
    tags: z.array(z.string()).optional(),
    fileIds: z.array(z.string().uuid()).optional(),
  }),
});

export const postIdParamSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
});

export const listPostsQuerySchema = z.object({
  query: z.object({
    page: z.coerce.number().optional(),
    limit: z.coerce.number().optional(),
    clientId: z.string().uuid().optional(),
    status: postStatusEnum.optional(),
    platform: platformEnum.optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    search: z.string().optional(),
  }),
});
