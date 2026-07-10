import { Router } from "express";
import { authenticate } from "../middlewares/authenticate";
import { tagController } from "../controllers/tag.controller";

const router = Router();

router.use(authenticate);

router.get("/", tagController.list);
router.post("/", tagController.create);
router.delete("/:id", tagController.delete);

export default router;
