import { Router } from "express";
import { authenticated, withRoles } from "../utils/middleware";
import { validateRequest, handleValidationErrors } from "../middleware/validate";
import { RecruitmentCandidateController } from "../controllers/recruitmentCandidate.controller";
import {
  listRecruitmentCandidatesValidators,
  getRecruitmentCandidateValidators,
  createRecruitmentCandidateValidators,
  updateRecruitmentCandidateValidators,
  updateRecruitmentStageValidators,
  attachOfferLetterValidators,
} from "../validators/recruitmentCandidate.validators";

const router = Router();

router.get(
  "/",
  authenticated(),
  validateRequest(listRecruitmentCandidatesValidators),
  handleValidationErrors,
  RecruitmentCandidateController.list
);

router.post(
  "/",
  withRoles("hr", "hr_manager", "admin", "super_admin"),
  validateRequest(createRecruitmentCandidateValidators),
  handleValidationErrors,
  RecruitmentCandidateController.create
);

router.get(
  "/:id",
  authenticated(),
  validateRequest(getRecruitmentCandidateValidators),
  handleValidationErrors,
  RecruitmentCandidateController.getById
);

router.patch(
  "/:id",
  withRoles("hr", "hr_manager", "admin", "super_admin"),
  validateRequest(updateRecruitmentCandidateValidators),
  handleValidationErrors,
  RecruitmentCandidateController.update
);

router.patch(
  "/:id/stage",
  withRoles("hr", "hr_manager", "admin", "super_admin"),
  validateRequest(updateRecruitmentStageValidators),
  handleValidationErrors,
  RecruitmentCandidateController.updateStage
);

router.patch(
  "/:id/offer-letter",
  withRoles("hr", "hr_manager", "admin", "super_admin"),
  validateRequest(attachOfferLetterValidators),
  handleValidationErrors,
  RecruitmentCandidateController.attachOfferLetter
);

router.delete(
  "/:id",
  withRoles("hr", "hr_manager", "admin", "super_admin"),
  validateRequest(getRecruitmentCandidateValidators),
  handleValidationErrors,
  RecruitmentCandidateController.remove
);

export default router;
