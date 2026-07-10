import { Router } from "express";
import { authenticate } from "../middlewares/authenticate";
import { authorizePermission } from "../middlewares/authorize";
import { validate } from "../middlewares/validate";
import { upload } from "../middlewares/upload";
import { PERMISSIONS } from "../config/permissions";
import { agencyController } from "../controllers/agency.controller";
import { updateAgencySchema, inviteMemberSchema, memberUserIdParamSchema } from "../validators/agency.validator";

const router = Router();

router.use(authenticate);

router.get("/", agencyController.get);
router.put("/", authorizePermission(PERMISSIONS.USERS_MANAGE), validate(updateAgencySchema), agencyController.update);
router.post("/logo", authorizePermission(PERMISSIONS.USERS_MANAGE), upload.single("file"), agencyController.uploadLogo);

router.get("/members", agencyController.listMembers);
router.post("/members/invite", authorizePermission(PERMISSIONS.USERS_MANAGE), validate(inviteMemberSchema), agencyController.inviteMember);
router.delete("/members/:userId", authorizePermission(PERMISSIONS.USERS_MANAGE), validate(memberUserIdParamSchema), agencyController.removeMember);

router.get("/subscription", authorizePermission(PERMISSIONS.BILLING_MANAGE), agencyController.getSubscription);

export default router;
