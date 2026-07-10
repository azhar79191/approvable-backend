import { PrismaClient } from "@prisma/client";
import { env } from "./env";

// Prevent creating multiple PrismaClient instances during ts-node-dev hot reloads.
declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

export const prisma =
  global.__prisma ??
  new PrismaClient({
    log: env.isProd ? ["error", "warn"] : ["query", "error", "warn"],
  });

if (!env.isProd) {
  global.__prisma = prisma;
}
