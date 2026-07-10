import { Prisma, PostStatus, Platform } from "@prisma/client";
import { prisma } from "../config/database";

export interface PostListFilters {
  clientId?: string;
  status?: PostStatus;
  platform?: Platform;
  from?: Date;
  to?: Date;
  search?: string;
}

const postInclude: Prisma.PostInclude = {
  media: { include: { file: true }, orderBy: { order: "asc" } },
  tags: { include: { tag: true } },
  createdBy: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
};

export const postRepository = {
  create(data: Prisma.PostCreateInput) {
    return prisma.post.create({ data, include: postInclude });
  },

  findById(id: string) {
    return prisma.post.findUnique({ where: { id }, include: postInclude });
  },

  async findMany(agencyClientIds: string[], filters: PostListFilters, skip: number, take: number) {
    const where: Prisma.PostWhereInput = {
      clientId: filters.clientId ?? { in: agencyClientIds },
      status: filters.status,
      platform: filters.platform,
      publishDate:
        filters.from || filters.to ? { gte: filters.from, lte: filters.to } : undefined,
      ...(filters.search ? { title: { contains: filters.search, mode: "insensitive" } } : {}),
    };

    return Promise.all([
      prisma.post.findMany({ where, include: postInclude, orderBy: { publishDate: "asc" }, skip, take }),
      prisma.post.count({ where }),
    ]);
  },

  update(id: string, data: Prisma.PostUpdateInput) {
    return prisma.post.update({ where: { id }, data, include: postInclude });
  },

  updateStatus(id: string, status: PostStatus) {
    return prisma.post.update({ where: { id }, data: { status } });
  },

  delete(id: string) {
    return prisma.post.delete({ where: { id } });
  },

  replaceMedia(postId: string, fileIds: string[]) {
    return prisma.$transaction([
      prisma.postMedia.deleteMany({ where: { postId } }),
      prisma.postMedia.createMany({ data: fileIds.map((fileId, order) => ({ postId, fileId, order })) }),
    ]);
  },

  replaceTags(postId: string, tagNames: string[]) {
    return prisma.$transaction(async (tx) => {
      await tx.postTag.deleteMany({ where: { postId } });
      for (const name of tagNames) {
        const tag = await tx.tag.upsert({ where: { name }, update: {}, create: { name } });
        await tx.postTag.create({ data: { postId, tagId: tag.id } });
      }
    });
  },
};
