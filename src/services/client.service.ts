import { prisma } from "../config/database";
import { clientRepository } from "../repositories/client.repository";
import { AppError } from "../utils/AppError";
import { activityService } from "./activity.service";
import { paginate, paginationParams } from "../utils/pagination";

interface CreateClientInput {
  companyName: string;
  contactName: string;
  email: string;
  phone?: string;
  industry?: string;
  logoUrl?: string;
  brandColors?: string[];
  brandGuidelines?: string;
}

export const clientService = {
  async create(agencyId: string, actorId: string, input: CreateClientInput) {
    const client = await prisma.$transaction(async (tx) => {
      const created = await tx.client.create({
        data: {
          agencyId,
          companyName: input.companyName,
          contactName: input.contactName,
          email: input.email,
          phone: input.phone,
          industry: input.industry,
          logoUrl: input.logoUrl,
          brandColors: input.brandColors as never,
          brandGuidelines: input.brandGuidelines,
        },
      });

      // Every client gets a dedicated workspace immediately, per spec.
      await tx.workspace.create({ data: { clientId: created.id } });

      return created;
    });

    await activityService.record({
      clientId: client.id,
      userId: actorId,
      action: "client.created",
      metadata: { companyName: client.companyName },
    });

    return client;
  },

  async getById(agencyId: string, id: string) {
    const client = await clientRepository.findById(id);
    if (!client || client.agencyId !== agencyId) {
      throw AppError.notFound("Client not found");
    }
    return client;
  },

  async list(agencyId: string, query: { page?: number; limit?: number }) {
    const { page, limit, skip } = paginationParams(query);
    const [items, total] = await clientRepository.findManyByAgency(agencyId, skip, limit);
    return paginate(items, total, page, limit);
  },

  async update(agencyId: string, id: string, actorId: string, input: Partial<CreateClientInput>) {
    await clientService.getById(agencyId, id); // ensures ownership + existence

    const updated = await clientRepository.update(id, {
      companyName: input.companyName,
      contactName: input.contactName,
      email: input.email,
      phone: input.phone,
      industry: input.industry,
      logoUrl: input.logoUrl,
      brandColors: input.brandColors as never,
      brandGuidelines: input.brandGuidelines,
    });

    await activityService.record({
      clientId: id,
      userId: actorId,
      action: "client.updated",
    });

    return updated;
  },

  async delete(agencyId: string, id: string) {
    await clientService.getById(agencyId, id);
    await clientRepository.delete(id);
  },
};
