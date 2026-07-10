import { Router } from "express";
import { authenticate } from "../middlewares/authenticate";
import { authorizePermission } from "../middlewares/authorize";
import { validate } from "../middlewares/validate";
import { upload } from "../middlewares/upload";
import { PERMISSIONS } from "../config/permissions";
import { fileController } from "../controllers/file.controller";
import { uploadFileQuerySchema, listFilesQuerySchema, fileIdParamSchema } from "../validators/file.validator";

const router = Router();

router.use(authenticate);

router.get("/", authorizePermission(PERMISSIONS.MEDIA_UPLOAD), validate(listFilesQuerySchema), fileController.list);
router.post(
  "/upload",
  authorizePermission(PERMISSIONS.MEDIA_UPLOAD),
  validate(uploadFileQuerySchema),
  upload.single("file"),
  fileController.upload
);
router.delete(
  "/:id",
  authorizePermission(PERMISSIONS.MEDIA_DELETE),
  validate(fileIdParamSchema),
  fileController.delete
);

export default router;
