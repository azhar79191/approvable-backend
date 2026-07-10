import { Router } from "express";
import { authenticate } from "../middlewares/authenticate";
import { socialAccountController } from "../controllers/social.controller";

const router = Router();

router.use(authenticate);

router.get("/", socialAccountController.list);
router.post("/", socialAccountController.connect);
router.delete("/:id", socialAccountController.disconnect);
router.post("/:id/refresh", socialAccountController.refresh);

export default router;
