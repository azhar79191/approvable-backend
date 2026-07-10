import { Router } from "express";
import { authenticate } from "../middlewares/authenticate";
import { notificationController } from "../controllers/notification.controller";

const router = Router();

router.use(authenticate);

router.get("/", notificationController.list);
router.put("/read", notificationController.markRead);
router.delete("/:id", notificationController.delete);

export default router;
