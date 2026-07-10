import { Router } from "express";
import { authenticate } from "../middlewares/authenticate";
import { authorizePermission } from "../middlewares/authorize";
import { validate } from "../middlewares/validate";
import { PERMISSIONS } from "../config/permissions";
import { commentController } from "../controllers/comment.controller";
import {
  createCommentSchema,
  createReplySchema,
  commentIdParamSchema,
  postIdParamSchema,
} from "../validators/comment.validator";

const router = Router();

// Nested under a post: GET /posts/:postId/comments, POST /posts/:postId/comments
router.get(
  "/posts/:postId/comments",
  authenticate,
  authorizePermission(PERMISSIONS.POSTS_VIEW),
  validate(postIdParamSchema),
  commentController.listForPost
);
router.post(
  "/posts/:postId/comments",
  authenticate,
  authorizePermission(PERMISSIONS.COMMENTS_CREATE),
  validate(createCommentSchema),
  commentController.create
);

// Standalone comment operations.
router.post(
  "/comments/:commentId/replies",
  authenticate,
  authorizePermission(PERMISSIONS.COMMENTS_CREATE),
  validate(createReplySchema),
  commentController.reply
);
router.post(
  "/comments/:commentId/resolve",
  authenticate,
  authorizePermission(PERMISSIONS.COMMENTS_MODERATE),
  validate(commentIdParamSchema),
  commentController.resolve
);
router.delete(
  "/comments/:commentId",
  authenticate,
  authorizePermission(PERMISSIONS.COMMENTS_MODERATE),
  validate(commentIdParamSchema),
  commentController.delete
);

export default router;
