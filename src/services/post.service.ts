import { Platform, PostType } from "@prisma/client";
import { prisma } from "../config/database";
import { postRepository, PostListFilters } from "../repositories/post.repository";
import { approvalService } from "./approval.service";
import { activityService } from "./activity.service";
import { AppError } from "../utils/AppError";
import { paginate, paginationParams } from "../utils/pagination";
import { cancelScheduledPublish } from "../jobs/publish.queue";

interface CreatePostInput {
  clientId: string;
  title: string;
  caption?: string;
  type: PostType;
  platform: Platform;
  publishDate?: Date;
  tags?: string[];
  fileIds?: string[];
  approvalSteps?: { order: number; roleLabel: string; assigneeId?: string }[];
}

async function assertClientBelongsToAgency(agencyId: string, clientId: string) {
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client || client.agencyId !== agencyId) {
    throw AppError.notFound("Client not found");
  }
}

async function assertPostAccessible(agencyId: string, postId: string) {
  let post: any = await postRepository.findById(postId);
  if (!post) throw AppError.notFound("Post not found");
  await assertClientBelongsToAgency(agencyId, post.clientId);
  return post;
}

export const postService = {
  async create(agencyId: string, actorId: string, input: CreatePostInput) {
    await assertClientBelongsToAgency(agencyId, input.clientId);

    const post: any = await prisma.post.create({
      data: {
        clientId: input.clientId,
        title: input.title,
        caption: input.caption,
        type: input.type,
        platform: input.platform,
        publishDate: input.publishDate,
        createdById: actorId,
        status: "DRAFT",
      },
    });

    if (input.fileIds?.length) {
      await postRepository.replaceMedia(post.id, input.fileIds);
    }
    if (input.tags?.length) {
      await postRepository.replaceTags(post.id, input.tags);
    }

    await approvalService.initialize(post.id, input.approvalSteps);
    await activityService.record({
      clientId: input.clientId,
      postId: post.id,
      userId: actorId,
      action: "post.created",
      metadata: { title: post.title },
    });

    return postRepository.findById(post.id);
  },

  async getById(agencyId: string, id: string) {
    return assertPostAccessible(agencyId, id);
  },

  async list(agencyId: string, query: PostListFilters & { page?: number; limit?: number }) {
    const agencyClients = await prisma.client.findMany({
      where: { agencyId },
      select: { id: true },
    });
    const clientIds = agencyClients.map((c) => c.id);

    const { page, limit, skip } = paginationParams(query);
    const [items, total] = await postRepository.findMany(clientIds, query, skip, limit);

    return paginate(items as any, total, page, limit);
  },

  async update(agencyId: string, id: string, actorId: string, input: Partial<CreatePostInput>) {
    await assertPostAccessible(agencyId, id);

    const updated = await postRepository.update(id, {
      title: input.title,
      caption: input.caption,
      type: input.type,
      platform: input.platform,
      publishDate: input.publishDate,
    });

    if (input.fileIds) await postRepository.replaceMedia(id, input.fileIds);
    if (input.tags) await postRepository.replaceTags(id, input.tags);

    await prisma.postVersion.create({
      data: {
        postId: id,
        caption: updated.caption,
        schedule: updated.publishDate,
        editorId: actorId,
        mediaSnapshot: input.fileIds as never,
      },
    });

    await activityService.record({ postId: id, userId: actorId, action: "post.edited" });

    return postRepository.findById(id);
  },

  async delete(agencyId: string, id: string) {
    await assertPostAccessible(agencyId, id);
    await cancelScheduledPublish(id);
    await postRepository.delete(id);
  },

  async submitForApproval(agencyId: string, id: string, actorId: string) {
    const post: any = await assertPostAccessible(agencyId, id);
    if (post.status !== "DRAFT" && post.status !== "NEEDS_CHANGES") {
      throw AppError.conflict(`Cannot submit a post with status ${post.status} for approval`);
    }

    if (post.status === "NEEDS_CHANGES") {
      await approvalService.resubmit(id);
    } else {
      await postRepository.updateStatus(id, "PENDING_APPROVAL");
    }

    await activityService.record({ postId: id, userId: actorId, action: "post.submitted_for_approval" });
    return postRepository.findById(id);
  },

  async listVersions(agencyId: string, id: string) {
    await assertPostAccessible(agencyId, id);
    return prisma.postVersion.findMany({
      where: { postId: id },
      orderBy: { createdAt: "desc" },
      include: { editor: { select: { id: true, firstName: true, lastName: true } } },
    });
  },

  async restoreVersion(agencyId: string, id: string, versionId: string, actorId: string) {
    await assertPostAccessible(agencyId, id);
    const version: any = await prisma.postVersion.findUnique({ where: { id: versionId } });
    if (!version || version.postId !== id) throw AppError.notFound("Version not found");

    const updated = await postRepository.update(id, {
      caption: version.caption,
      publishDate: version.schedule,
    });

    await activityService.record({ postId: id, userId: actorId, action: "post.version_restored", metadata: { versionId } });
    return updated;
  },
};
