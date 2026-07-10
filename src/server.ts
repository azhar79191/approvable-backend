import http from "http";
import { createApp } from "./app";
import { env } from "./config/env";
import { prisma } from "./config/database";
import { initSocket } from "./socket";

async function main() {
  const app = createApp();
  const httpServer = http.createServer(app);

  // Initialize socket (Redis is optional for basic functionality)
  try {
    initSocket(httpServer);
  } catch (err) {
    console.warn("[server] Socket initialization failed (Redis not running?):", (err as Error).message);
  }

  // Start publish worker (optional)
  let publishWorker: any = null;
  try {
    const { startPublishWorker } = await import("./jobs/publish.worker");
    publishWorker = startPublishWorker();
  } catch (err) {
    console.warn("[server] Publish worker initialization failed (Redis not running?):", (err as Error).message);
  }

  await prisma.$connect();

  httpServer.listen(env.port, () => {
    // eslint-disable-next-line no-console
    console.log(`[server] listening on port ${env.port} (${env.nodeEnv})`);
  });

  const shutdown = async (signal: string) => {
    // eslint-disable-next-line no-console
    console.log(`[server] received ${signal}, shutting down...`);
    httpServer.close();
    if (publishWorker) {
      try {
        await publishWorker.close();
      } catch {}
    }
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[server] fatal startup error:", err);
  process.exit(1);
});
