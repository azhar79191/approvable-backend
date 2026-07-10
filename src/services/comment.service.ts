import { prisma } from "../config/database";
import { AppError } from "../utils/AppError";
import { notificationService } from "./notification.service";
import { activityService } from "./activity.service";

const commentInclude = {
  author: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
  replies: {
    include: { author: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } } },
    orderBy: { createdAt: "asc" as const },
  },
};

async function notifyMentions(mentions: string[] | undefined, postTitle: string, postId: string, authorId: string) {
  if (!mentions?.length) return;
  const recipients = mentions.filter((id) => id !== authorId);
  if (recipients.length) {
    await notificationService.notifyUsers(recipients, {
      type: "MENTION",
      title: `You were mentioned on "${postTitle}"`,
      postId,
    });
  }
}

export const commentService = {
  async create(postId: string, authorId: string, input: { body: string; mentions?: string[]; attachments?: string[] }) {
    const post = await prisma.post.findUnique({ where: { id: postId } });
    if (!post) throw AppError.notFound("Post not found");

    const comment = await prisma.comment.create({
      data: {
        postId,
        clientId: post.clientId,
        authorId,
        body: input.body,
        mentions: input.mentions as never,
        attachments: input.attachments as never,
      },
      include: commentInclude,
    });

    await activityService.record({ postId, clientId: post.clientId, userId: authorId, action: "comment.created" });
    await notificationService.notifyUser({
      userId: post.createdById,
      type: "NEW_COMMENT",
      title: `New comment on "${post.title}"`,
      body: input.body.slice(0, 140),
      postId,
    });
    await notifyMentions(input.mentions, post.title, postId, authorId);

    return comment;
  },

  async listForPost(postId: string) {
    return prisma.comment.findMany({
      where: { postId },
      include: commentInclude,
      orderBy: { createdAt: "asc" },
    });
  },

  async reply(commentId: string, authorId: string, input: { body: string; mentions?: string[] }) {
    const comment = await prisma.comment.findUnique({ where: { id: commentId }, include: { post: true } });
    if (!comment) throw AppError.notFound("Comment not found");

    const reply = await prisma.commentReply.create({
      data: { commentId, authorId, body: input.body, mentions: input.mentions as never },
      include: { author: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } } },
    });

    await notifyMentions(input.mentions, comment.post.title, comment.postId, authorId);

    return reply;
  },

  async resolve(commentId: string) {
    const comment = await prisma.comment.findUnique({ where: { id: commentId } });
    if (!comment) throw AppError.notFound("Comment not found");
    return prisma.comment.update({ where: { id: commentId }, data: { resolved: true }, include: commentInclude });
  },

  async delete(commentId: string) {
    await prisma.comment.delete({ where: { id: commentId } });
  },
};
