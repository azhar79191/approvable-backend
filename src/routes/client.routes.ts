import { Router } from "express";
import { authenticate } from "../middlewares/authenticate";
import { authorizePermission } from "../middlewares/authorize";
import { validate } from "../middlewares/validate";
import { clientController } from "../controllers/client.controller";
import { PERMISSIONS } from "../config/permissions";
import {
  createClientSchema,
  updateClientSchema,
  clientIdParamSchema,
  listClientsQuerySchema,
} from "../validators/client.validator";
import { addWorkspaceMemberSchema, removeWorkspaceMemberSchema } from "../validators/workspace.validator";

const router = Router();

router.use(authenticate);

router.get("/", authorizePermission(PERMISSIONS.CLIENTS_VIEW), validate(listClientsQuerySchema), clientController.list);
router.post("/", authorizePermission(PERMISSIONS.CLIENTS_MANAGE), validate(createClientSchema), clientController.create);
router.get("/:id", authorizePermission(PERMISSIONS.CLIENTS_VIEW), validate(clientIdParamSchema), clientController.getById);
router.put("/:id", authorizePermission(PERMISSIONS.CLIENTS_MANAGE), validate(updateClientSchema), clientController.update);
router.delete("/:id", authorizePermission(PERMISSIONS.CLIENTS_MANAGE), validate(clientIdParamSchema), clientController.delete);

// Workspace member management
router.get("/:id/workspace", authorizePermission(PERMISSIONS.CLIENTS_VIEW), validate(clientIdParamSchema), clientController.getWorkspace);
router.post("/:id/workspace/members", authorizePermission(PERMISSIONS.CLIENTS_MANAGE), validate(addWorkspaceMemberSchema), clientController.addWorkspaceMember);
router.delete("/:id/workspace/members/:userId", authorizePermission(PERMISSIONS.CLIENTS_MANAGE), validate(removeWorkspaceMemberSchema), clientController.removeWorkspaceMember);

export default router;
