import { Queue } from "bullmq";
import { bullConnectionOptions } from "../config/redis";

export const PUBLISH_QUEUE_NAME = "post-publish";

let _publishQueue: Queue | null = null;

function getPublishQueue(): Queue | null {
  if (!_publishQueue) {
    try {
      _publishQueue = new Queue(PUBLISH_QUEUE_NAME, { connection: bullConnectionOptions });
      // eslint-disable-next-line no-console
      console.log("[publish-queue] initialized successfully");
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("[publish-queue] failed to initialize (Redis not running?):", (err as Error).message);
      _publishQueue = null;
    }
  }
  return _publishQueue;
}

/**
 * Schedules a post to be "published" at its publishDate. Call this whenever
 * a post transitions into SCHEDULED status (see approval.service.ts).
 * Actual platform publishing (Meta/LinkedIn/etc APIs) is a follow-up
 * integration — the worker currently flips status to PUBLISHED and notifies
 * the creator, which is enough to drive the UI end-to-end.
 */
export async function schedulePostPublish(postId: string, publishDate: Date) {
  const queue = getPublishQueue();
  if (!queue) {
    // eslint-disable-next-line no-console
    console.warn("[publish-queue] cannot schedule post publish: queue not available (Redis not running?)");
    return;
  }
  
  const delay = Math.max(0, publishDate.getTime() - Date.now());
  await queue.add(
    "publish-post",
    { postId },
    {
      delay,
      jobId: `publish-${postId}`, // idempotent: re-scheduling replaces the prior job
      removeOnComplete: true,
      removeOnFail: false,
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
    }
  );
}

export async function cancelScheduledPublish(postId: string) {
  const queue = getPublishQueue();
  if (!queue) {
    // eslint-disable-next-line no-console
    console.warn("[publish-queue] cannot cancel scheduled publish: queue not available (Redis not running?)");
    return;
  }
  
  const job = await queue.getJob(`publish-${postId}`);
  if (job) await job.remove();
}
