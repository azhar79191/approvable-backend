import { z } from "zod";

export const createClientSchema = z.object({
  body: z.object({
    companyName: z.string().min(1),
    contactName: z.string().min(1),
    email: z.string().email(),
    phone: z.string().optional(),
    industry: z.string().optional(),
    logoUrl: z.string().url().optional(),
    brandColors: z.array(z.string()).optional(),
    brandGuidelines: z.string().optional(),
  }),
});

export const updateClientSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: createClientSchema.shape.body.partial(),
});

export const clientIdParamSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
});

export const listClientsQuerySchema = z.object({
  query: z.object({
    page: z.coerce.number().optional(),
    limit: z.coerce.number().optional(),
  }),
});
