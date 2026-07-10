import { Router } from "express";
import { authenticate } from "../middlewares/authenticate";
import { authorizePermission } from "../middlewares/authorize";
import { validate } from "../middlewares/validate";
import { PERMISSIONS } from "../config/permissions";
import { postController } from "../controllers/post.controller";
import { approvalController } from "../controllers/approval.controller";
import {
  createPostSchema,
  updatePostSchema,
  postIdParamSchema,
  listPostsQuerySchema,
} from "../validators/post.validator";
import { approvalActionSchema, postIdParamSchema as approvalPostIdParamSchema } from "../validators/approval.validator";

const router = Router();

router.use(authenticate);

router.get("/", authorizePermission(PERMISSIONS.POSTS_VIEW), validate(listPostsQuerySchema), postController.list);
router.post("/", authorizePermission(PERMISSIONS.POSTS_CREATE), validate(createPostSchema), postController.create);
router.get("/:id", authorizePermission(PERMISSIONS.POSTS_VIEW), validate(postIdParamSchema), postController.getById);
router.put("/:id", authorizePermission(PERMISSIONS.POSTS_EDIT), validate(updatePostSchema), postController.update);
router.delete(
  "/:id",
  authorizePermission(PERMISSIONS.POSTS_DELETE),
  validate(postIdParamSchema),
  postController.delete
);

router.post(
  "/:id/submit",
  authorizePermission(PERMISSIONS.POSTS_EDIT),
  validate(postIdParamSchema),
  postController.submitForApproval
);

router.get("/:id/versions", authorizePermission(PERMISSIONS.POSTS_VIEW), validate(postIdParamSchema), postController.listVersions);
router.post(
  "/:id/versions/:versionId/restore",
  authorizePermission(PERMISSIONS.POSTS_EDIT),
  postController.restoreVersion
);

// Approval workflow, nested under a post.
router.get(
  "/:postId/approval",
  authorizePermission(PERMISSIONS.APPROVALS_VIEW),
  validate(approvalPostIdParamSchema),
  approvalController.getForPost
);
router.post(
  "/:postId/approval/decide",
  authorizePermission(PERMISSIONS.APPROVALS_ACT),
  validate(approvalActionSchema),
  approvalController.decide
);

// Publish to social media
import { socialAccountController } from "../controllers/social.controller";
router.post(
  "/:postId/publish",
  authorizePermission(PERMISSIONS.POSTS_EDIT),
  socialAccountController.publishPost
);

export default router;
