import { Router } from "express";
import { authenticate } from "../middlewares/authenticate";
import { validate } from "../middlewares/validate";
import { upload } from "../middlewares/upload";
import { userController } from "../controllers/user.controller";
import { updateMeSchema, changePasswordSchema } from "../validators/user.validator";

const router = Router();

router.use(authenticate);

router.get("/me", userController.me);
router.put("/me", validate(updateMeSchema), userController.updateMe);
router.put("/me/password", validate(changePasswordSchema), userController.changePassword);
router.post("/me/avatar", upload.single("file"), userController.uploadAvatar);

export default router;
