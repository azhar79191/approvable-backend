import { Router } from "express";
import { authenticate } from "../middlewares/authenticate";
import { authorizePermission } from "../middlewares/authorize";
import { PERMISSIONS } from "../config/permissions";
import { analyticsController } from "../controllers/analytics.controller";

const router = Router();

router.use(authenticate, authorizePermission(PERMISSIONS.ANALYTICS_VIEW));

router.get("/", analyticsController.overview);
router.get("/activity", analyticsController.recentActivity);

export default router;
