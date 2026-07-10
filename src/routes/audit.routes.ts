import { Router } from "express";
import { authenticate } from "../middlewares/authenticate";
import { authorizePermission } from "../middlewares/authorize";
import { PERMISSIONS } from "../config/permissions";
import { auditController } from "../controllers/audit.controller";

const router = Router();

router.use(authenticate, authorizePermission(PERMISSIONS.AUDIT_VIEW));

router.get("/", auditController.list);

export default router;
