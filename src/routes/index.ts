import { Router } from "express";
import authRoutes from "./auth.routes";
import userRoutes from "./user.routes";
import agencyRoutes from "./agency.routes";
import clientRoutes from "./client.routes";
import postRoutes from "./post.routes";
import commentRoutes from "./comment.routes";
import fileRoutes from "./file.routes";
import notificationRoutes from "./notification.routes";
import analyticsRoutes from "./analytics.routes";
import auditRoutes from "./audit.routes";
import tagRoutes from "./tag.routes";
import socialRoutes from "./social.routes";
import oauthRoutes from "./oauth.routes";

const router = Router();

router.use("/auth", authRoutes);
router.use("/users", userRoutes);
router.use("/agency", agencyRoutes);
router.use("/clients", clientRoutes);
router.use("/posts", postRoutes);
router.use("/", commentRoutes);
router.use("/files", fileRoutes);
router.use("/notifications", notificationRoutes);
router.use("/analytics", analyticsRoutes);
router.use("/audit-logs", auditRoutes);
router.use("/tags", tagRoutes);
router.use("/social-accounts", socialRoutes);
router.use("/oauth", oauthRoutes);

export default router;
