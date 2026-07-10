import { Worker, Job } from "bullmq";
import { bullConnectionOptions } from "../config/redis";
import { prisma } from "../config/database";
import { notificationService } from "../services/notification.service";
import { activityService } from "../services/activity.service";
import { socialPublisherService } from "../services/social-publisher.service";
import { PUBLISH_QUEUE_NAME } from "./publish.queue";

interface PublishJobData {
  postId: string;
}

export function startPublishWorker() {
  try {
    const worker = new Worker<PublishJobData>(
      PUBLISH_QUEUE_NAME,
      async (job: Job<PublishJobData>) => {
        const { postId } = job.data;

        console.log(`\n[Publish Worker] ========================================`);
        console.log(`[Publish Worker] Processing job for post: ${postId}`);
        console.log(`[Publish Worker] Timestamp: ${new Date().toISOString()}`);

        // Fetch post with media and social account info
        const post = await prisma.post.findUnique({
          where: { id: postId },
          include: {
            media: {
              include: { file: true },
            },
          },
        });

        if (!post) {
          console.log(`[Publish Worker] ❌ Post ${postId} not found`);
          return;
        }

        if (post.status !== "SCHEDULED") {
          console.log(`[Publish Worker] ⚠️ Post ${postId} status is ${post.status}, not SCHEDULED`);
          return;
        }

        // Get social account for the post's platform
        const socialAccount = await prisma.socialAccount.findFirst({
          where: {
            platform: post.platform,
            isActive: true,
            clientId: post.clientId,
          },
        });

        if (!socialAccount) {
          console.error(`[Publish Worker] ❌ No active ${post.platform} account found for client`);
          
          // ✅ SET STATUS TO FAILED (if you add FAILED to schema, otherwise DRAFT for now)
          await prisma.post.update({
            where: { id: postId },
            data: {
              status: "DRAFT",
            },
          });

          await notificationService.notifyUser({
            userId: post.createdById,
            type: "PUBLISHED",
            title: `Failed to publish "${post.title}"`,
            body: `No active ${post.platform} account connected`,
            postId,
          });

          return;
        }

        // Prepare post data
        const mediaUrls = post.media.map((m) => m.file.url);
        const postData = {
          caption: post.caption || "",
          mediaUrls,
          title: post.title,
        };

        console.log(`[Publish Worker] Publishing to ${post.platform} account: ${socialAccount.accountName}`);
        console.log(`[Publish Worker] Caption: ${postData.caption.substring(0, 50)}...`);
        console.log(`[Publish Worker] Media files: ${mediaUrls.length}`);

        // ✅ ACTUALLY PUBLISH TO PLATFORM API
        const result = await socialPublisherService.publishPost(socialAccount, postData);

        console.log(`[Publish Worker] Publish result:`, JSON.stringify(result, null, 2));

        // ✅ UPDATE STATUS BASED ON ACTUAL API RESPONSE
        if (result.success) {
          console.log(`[Publish Worker] ✅ SUCCESS! Platform Post ID: ${result.platformPostId}`);

          await prisma.post.update({
            where: { id: postId },
            data: {
              status: "PUBLISHED",
            },
          });

          await activityService.record({
            clientId: post.clientId,
            postId,
            action: "post.published",
            metadata: {
              platform: post.platform,
              platformPostId: result.platformPostId,
              platformUrl: result.platformUrl,
            },
          });

          await notificationService.notifyUser({
            userId: post.createdById,
            type: "PUBLISHED",
            title: `"${post.title}" published successfully`,
            body: `Your post is now live on ${post.platform}`,
            postId,
          });
        } else {
          console.error(`[Publish Worker] ❌ FAILED: ${result.error}`);

          // ✅ SET STATUS TO FAILED (or DRAFT if schema not updated yet)
          await prisma.post.update({
            where: { id: postId },
            data: {
              status: "DRAFT",
            },
          });

          await activityService.record({
            clientId: post.clientId,
            postId,
            action: "post.publish_failed",
            metadata: {
              platform: post.platform,
              error: result.error,
              errorDetails: result.errorDetails,
            },
          });

          await notificationService.notifyUser({
            userId: post.createdById,
            type: "PUBLISHED",
            title: `Failed to publish "${post.title}"`,
            body: result.error || "Unknown error occurred",
            postId,
          });
        }

        console.log(`[Publish Worker] ========================================\n`);
      },
      { connection: bullConnectionOptions }
    );

    worker.on("failed", (job, err) => {
      console.error(`[Publish Worker] ❌ Job ${job?.id} FAILED:`, err.message);
      console.error(`[Publish Worker] Error stack:`, err.stack);
    });

    worker.on("completed", (job) => {
      console.log(`[Publish Worker] ✅ Job ${job.id} COMPLETED`);
    });

    console.log("[Publish Worker] ✅ Started successfully");
    return worker;
  } catch (err) {
    console.warn("[Publish Worker] ⚠️ Failed to start (Redis not running?):", (err as Error).message);
    return null;
  }
}
