import { ApprovalAction, ApprovalStepStatus, PostStatus } from "@prisma/client";
import { prisma } from "../config/database";
import { AppError } from "../utils/AppError";
import { notificationService } from "./notification.service";
import { activityService } from "./activity.service";
import { schedulePostPublish, cancelScheduledPublish } from "../jobs/publish.queue";

/**
 * Default approval chain per the spec: Designer -> Marketing Manager ->
 * Client -> CEO -> Published. Agencies can override this per-post by
 * passing custom `approvalSteps` on post creation.
 */
export const DEFAULT_APPROVAL_CHAIN = [
  { order: 1, roleLabel: "Designer" },
  { order: 2, roleLabel: "Marketing Manager" },
  { order: 3, roleLabel: "Client" },
  { order: 4, roleLabel: "CEO" },
];

/**
 * Helper function to check and fix an approval if all steps are already approved
 * but approval.completed is false or post status isn't correct
 */
async function checkAndFixApprovalCompletion(approval: any) {
  // Check if all steps are approved
  const allStepsApproved = approval.steps.every((step: any) => step.status === "APPROVED");
  
  if (allStepsApproved && !approval.completed) {
    // Update approval.completed to true
    await prisma.approval.update({
      where: { id: approval.id },
      data: { completed: true }
    });
    approval.completed = true;
    
    // Update post status
    const post = await prisma.post.findUniqueOrThrow({ where: { id: approval.postId } });
    const finalStatus: PostStatus = post.publishDate ? "SCHEDULED" : "APPROVED";
    await prisma.post.update({ 
      where: { id: approval.postId }, 
      data: { status: finalStatus } 
    });
    
    if (finalStatus === "SCHEDULED" && post.publishDate) {
      await schedulePostPublish(approval.postId, post.publishDate);
    }
  }
  
  return approval;
}

export const approvalService = {
  /** Creates the Approval + ordered ApprovalStep records for a freshly created post. */
  async initialize(
    postId: string,
    steps: { order: number; roleLabel: string; assigneeId?: string }[] = DEFAULT_APPROVAL_CHAIN
  ) {
    const sorted = [...steps].sort((a, b) => a.order - b.order);
    await prisma.approval.create({
      data: {
        postId,
        currentStepOrder: sorted[0]?.order ?? 1,
        steps: { create: sorted },
      },
    });
  },

  async getByPostId(postId: string) {
    let approval: any = await prisma.approval.findUnique({
      where: { postId },
      include: {
        steps: {
          orderBy: { order: "asc" },
          include: { assignee: { select: { id: true, firstName: true, lastName: true } } },
        },
      },
    });
    if (!approval) throw AppError.notFound("Approval workflow not found for this post");
    
    // Check and fix approval completion status
    approval = await checkAndFixApprovalCompletion(approval);
    return approval;
  },

  /**
   * Applies a decision (approve / reject / request changes) to the CURRENT
   * step of a post's approval chain, then advances or halts the workflow:
   *  - APPROVE  -> marks step approved; if it was the last step, post becomes
   *                APPROVED (and SCHEDULED if publishDate is set); otherwise
   *                advances currentStepOrder to the next step.
   *  - REJECT   -> halts the chain entirely; post becomes REJECTED.
   *  - REQUEST_CHANGES -> halts the chain; post becomes NEEDS_CHANGES so the
   *                team can revise and resubmit (see `resubmit`).
   */
  async decide(postId: string, actorId: string, action: ApprovalAction, comment?: string) {
    const approval: any = await approvalService.getByPostId(postId);
    if (approval.completed) {
      throw AppError.conflict("This post's approval workflow has already completed");
    }

    const currentStep = approval.steps.find((s: any) => s.order === approval.currentStepOrder);
    if (!currentStep) throw AppError.internal("Approval chain is missing its current step");
    if (currentStep.status !== "PENDING") {
      throw AppError.conflict("This approval step has already been decided");
    }

    const stepStatus: Record<ApprovalAction, ApprovalStepStatus> = {
      APPROVE: "APPROVED",
      REJECT: "REJECTED",
      REQUEST_CHANGES: "NEEDS_CHANGES",
    };

    await prisma.approvalStep.update({
      where: { id: currentStep.id },
      data: {
        status: stepStatus[action],
        action,
        comment,
        decidedAt: new Date(),
        assigneeId: currentStep.assigneeId ?? actorId, // record who actually acted if unassigned
      },
    });

    const post = await prisma.post.findUniqueOrThrow({ where: { id: postId } });

    if (action === "REJECT") {
      await prisma.approval.update({ where: { id: approval.id }, data: { completed: true } });
      await prisma.post.update({ where: { id: postId }, data: { status: "REJECTED" as PostStatus } });
      await activityService.record({ postId, userId: actorId, action: "post.rejected", metadata: { comment } });
      await notificationService.notifyUser({
        userId: post.createdById,
        type: "REJECTION",
        title: `"${post.title}" was rejected`,
        body: comment,
        postId,
      });
      return { completed: true, post: await prisma.post.findUniqueOrThrow({ where: { id: postId } }) };
    }

    if (action === "REQUEST_CHANGES") {
      await prisma.approval.update({ where: { id: approval.id }, data: { completed: true } });
      await prisma.post.update({ where: { id: postId }, data: { status: "NEEDS_CHANGES" as PostStatus } });
      await activityService.record({ postId, userId: actorId, action: "post.changes_requested", metadata: { comment } });
      await notificationService.notifyUser({
        userId: post.createdById,
        type: "REJECTION",
        title: `Changes requested on "${post.title}"`,
        body: comment,
        postId,
      });
      return { completed: true, post: await prisma.post.findUniqueOrThrow({ where: { id: postId } }) };
    }

    // action === "APPROVE"
    const remaining = approval.steps.filter((s: any) => s.order > approval.currentStepOrder);
    const nextStep = remaining.sort((a: any, b: any) => a.order - b.order)[0];

    if (!nextStep) {
      // Final step approved -> whole chain complete.
      await prisma.approval.update({ where: { id: approval.id }, data: { completed: true } });
      const finalStatus: PostStatus = post.publishDate ? "SCHEDULED" : "APPROVED";
      await prisma.post.update({ where: { id: postId }, data: { status: finalStatus } });
      if (finalStatus === "SCHEDULED" && post.publishDate) {
        await schedulePostPublish(postId, post.publishDate);
      }
      await activityService.record({ postId, userId: actorId, action: "post.approved" });
      await notificationService.notifyUser({
        userId: post.createdById,
        type: "APPROVAL",
        title: `"${post.title}" was fully approved`,
        postId,
      });
      return { completed: true, post: await prisma.post.findUniqueOrThrow({ where: { id: postId } }) };
    }

    await prisma.approval.update({
      where: { id: approval.id },
      data: { currentStepOrder: nextStep.order },
    });
    await activityService.record({ postId, userId: actorId, action: "post.step_approved", metadata: { step: currentStep.roleLabel } });

    if (nextStep.assigneeId) {
      await notificationService.notifyUser({
        userId: nextStep.assigneeId,
        type: "APPROVAL",
        title: `"${post.title}" is awaiting your approval`,
        postId,
      });
    }

    return { completed: false, post: await prisma.post.findUniqueOrThrow({ where: { id: postId } }) };
  },

  /** Resets a NEEDS_CHANGES post back to step 1 so it can go through approval again. */
  async resubmit(postId: string) {
    const approval: any = await approvalService.getByPostId(postId);
    const firstStep = [...approval.steps].sort((a: any, b: any) => a.order - b.order)[0];
    if (!firstStep) throw AppError.internal("Approval chain has no steps");

    await prisma.$transaction([
      prisma.approvalStep.updateMany({
        where: { approvalId: approval.id },
        data: { status: "PENDING", action: null, comment: null, decidedAt: null },
      }),
      prisma.approval.update({
        where: { id: approval.id },
        data: { completed: false, currentStepOrder: firstStep.order },
      }),
      prisma.post.update({ where: { id: postId }, data: { status: "PENDING_APPROVAL" } }),
    ]);
  },
};
