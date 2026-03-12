import { Router } from "express";
import { body, param } from "express-validator";
import FeedbackController from "../controllers/feedback.controller";
import { handleValidationErrors } from "../middleware/validate";
import { authenticated } from "../utils/middleware";

const router = Router();

router.post(
  "/",
  ...authenticated(),
  body("receiverId").isInt({ min: 1 }),
  body("jobId").optional({ nullable: true }).isInt({ min: 1 }),
  body("feedbackType").isString().isIn(["praise", "coaching", "concern"]),
  body("message").isString().trim().isLength({ min: 5, max: 2000 }),
  body("isPrivate").optional().isBoolean(),
  body("visibility").optional().isIn(["self", "manager", "hr", "all"]),
  handleValidationErrors,
  FeedbackController.submitFeedback
);

router.get(
  "/received/:userId",
  ...authenticated(),
  param("userId").isInt({ min: 1 }).toInt(),
  handleValidationErrors,
  FeedbackController.getFeedbackForUser
);

export default router;
