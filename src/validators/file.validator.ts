import { z } from "zod";

export const uploadFileQuerySchema = z.object({
  query: z.object({
    clientId: z.string().uuid().optional(),
    folder: z.string().optional(),
  }),
});

export const listFilesQuerySchema = z.object({
  query: z.object({
    clientId: z.string().uuid().optional(),
    folder: z.string().optional(),
    search: z.string().optional(),
    kind: z.enum(["IMAGE", "VIDEO", "PDF", "OTHER"]).optional(),
    page: z.coerce.number().optional(),
    limit: z.coerce.number().optional(),
  }),
});

export const fileIdParamSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
});
