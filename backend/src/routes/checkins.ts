import { Router } from "express";
import { body, param } from "express-validator";
import CheckInController from "../controllers/checkin.controller";
import { handleValidationErrors } from "../middleware/validate";
import { authenticated } from "../utils/middleware";

const router = Router();

router.post(
  "/",
  ...authenticated(),
  body("managerId").isInt({ min: 1 }),
  body("employeeId").isInt({ min: 1 }),
  body("scheduledAt").isISO8601(),
  handleValidationErrors,
  CheckInController.scheduleCheckIn
);

router.patch(
  "/:checkInId/complete",
  ...authenticated(),
  param("checkInId").isInt({ min: 1 }).toInt(),
  body("notes").optional().isString().trim().isLength({ max: 4000 }),
  body("actionItems").optional().isArray(),
  handleValidationErrors,
  CheckInController.completeCheckIn
);

router.get(
  "/team/:managerId",
  ...authenticated(),
  param("managerId").isInt({ min: 1 }).toInt(),
  handleValidationErrors,
  CheckInController.getTeamCheckIns
);

export default router;
