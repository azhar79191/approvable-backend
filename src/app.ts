import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import morgan from "morgan";
import { env } from "./config/env";
import apiRouter from "./routes";
import { errorHandler } from "./middlewares/errorHandler";
import { auditLogger } from "./middlewares/auditLogger";
import { apiLimiter } from "./middlewares/rateLimiter";
import { AppError } from "./utils/AppError";

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: [
        env.clientUrl,
        "https://approvable-three.vercel.app", // Without trailing slash
        "https://approvable-three.vercel.app/", // With trailing slash
        "http://localhost:3000", // Allow local frontend
        "http://localhost:3001", // Allow port 3001 as fallback
      ],
      credentials: true,
    })
  );
  app.use(express.json({ limit: "5mb" }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser(env.cookieSecret));
  app.use(morgan(env.isProd ? "combined" : "dev"));
  app.use(apiLimiter);
  app.use(auditLogger);

  app.get("/health", (_req, res) => {
    res.status(200).json({ success: true, message: "ok", timestamp: new Date().toISOString() });
  });

  app.use("/api", apiRouter);

  // Unmatched routes.
  app.use((req, _res, next) => {
    next(AppError.notFound(`Route ${req.method} ${req.originalUrl} not found`));
  });

  app.use(errorHandler);

  return app;
}
