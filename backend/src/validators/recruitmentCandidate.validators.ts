import { body, param, query } from "express-validator";
import { RecruitmentStage } from "@prisma/client";

export const listRecruitmentCandidatesValidators = [
  query("page").optional().isInt({ min: 1 }),
  query("pageSize").optional().isInt({ min: 1, max: 100 }),
  query("stage").optional().isIn(Object.values(RecruitmentStage)),
  query("departmentId").optional().isInt({ min: 1 }),
  query("search").optional().isString().trim().isLength({ min: 1 }),
];

export const getRecruitmentCandidateValidators = [
  param("id").isInt({ min: 1 }),
];

export const createRecruitmentCandidateValidators = [
  body("fullName").isString().trim().isLength({ min: 2 }),
  body("positionApplied").isString().trim().isLength({ min: 2 }),
  body("email").optional().isEmail(),
  body("phoneNumber").optional().isString().trim().isLength({ min: 5, max: 30 }),
  body("departmentId").optional().isInt({ min: 1 }),
  body("stage").optional().isIn(Object.values(RecruitmentStage)),
  body("notes").optional().isString(),
];

export const updateRecruitmentCandidateValidators = [
  param("id").isInt({ min: 1 }),
  body("fullName").optional().isString().trim().isLength({ min: 2 }),
  body("positionApplied").optional().isString().trim().isLength({ min: 2 }),
  body("email").optional().isEmail(),
  body("phoneNumber").optional().isString().trim().isLength({ min: 5, max: 30 }),
  body("departmentId").optional().isInt({ min: 1 }),
  body("stage").optional().isIn(Object.values(RecruitmentStage)),
  body("notes").optional().isString(),
];

export const updateRecruitmentStageValidators = [
  param("id").isInt({ min: 1 }),
  body("stage").isIn(Object.values(RecruitmentStage)),
];

export const attachOfferLetterValidators = [
  param("id").isInt({ min: 1 }),
  body("documentId").isInt({ min: 1 }),
];
