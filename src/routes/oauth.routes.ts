import { Router } from "express";
import { oauthController } from "../controllers/oauth.controller";
import { authenticate } from "../middlewares/authenticate";

const router = Router();

// Connect: auth handled inline so errors return closePopup HTML, never JSON
router.get("/:platform/connect", oauthController.connect);

// Callback: public — platform redirects here, state carries identity
router.get("/:platform/callback", oauthController.callback);

// Refresh OAuth token for a connected account
router.post("/:id/refresh", authenticate, oauthController.refreshToken);

export default router;
