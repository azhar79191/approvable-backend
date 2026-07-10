import { prisma } from "../config/database";
import { Prisma } from "@prisma/client";

export const clientRepository = {
  create(data: Prisma.ClientCreateInput) {
    return prisma.client.create({ data });
  },

  findById(id: string) {
    return prisma.client.findUnique({
      where: { id },
      include: { workspace: true, agency: true },
    });
  },

  findManyByAgency(agencyId: string, skip: number, take: number) {
    return Promise.all([
      prisma.client.findMany({
        where: { agencyId },
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
      prisma.client.count({ where: { agencyId } }),
    ]);
  },

  update(id: string, data: Prisma.ClientUpdateInput) {
    return prisma.client.update({ where: { id }, data });
  },

  delete(id: string) {
    return prisma.client.delete({ where: { id } });
  },
};
