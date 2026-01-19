/**
 * validator.ts
 * Central validation middleware + helpers using express-validator.
 *
 * Usage pattern:
 *   router.post(
 *     "/jobs",
 *     authMiddleware,
 *     loadProfile,
 *     requirePermission("job.create"),
 *     rejectUnknownFields(["jobName", "clientId", "startDate"]),
 *     validateRequest(createJobValidators),
 *     createJobHandler
 *   );
 */

import type { Request, Response, NextFunction, RequestHandler } from "express";
import {
  validationResult,
  type ValidationChain,
  matchedData,
} from "express-validator";

/**
 * Standard API error response for validation failures.
 */
export interface ValidationErrorResponse {
  error: "Validation failed";
  message: string;
  errors: Array<{
    field?: string;
    message: string;
    location?: "body" | "query" | "params" | "headers" | "cookies";
    value?: unknown;
  }>;
}

/**
 * Handle express-validator errors and return a clean response.
 * - Safe for express-validator v6/v7 shapes
 * - Returns 400 on client-side validation issues
 */
export const handleValidationErrors = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const result = validationResult(req);

  if (result.isEmpty()) {
    next();
    return;
  }

  const errors = result.array().map((err: any) => ({
    field: typeof err.param === "string" ? err.param : undefined,
    message: String(err.msg ?? "Invalid value"),
    location: err.location,
    value: err.value,
  }));

  const payload: ValidationErrorResponse = {
    error: "Validation failed",
    message: "One or more fields failed validation.",
    errors,
  };

  res.status(400).json(payload);
};

/**
 * Wrap an array of validators so you can do:
 *   validateRequest([ body("x").isInt() ])
 * instead of manually adding handleValidationErrors every time.
 *
 * NOTE: This runs the validators sequentially, then applies handleValidationErrors.
 */
export const validateRequest = (validators: ValidationChain[]): RequestHandler[] => {
  return [
    ...validators,
    (req: Request, res: Response, next: NextFunction) => {
      handleValidationErrors(req, res, next);
    },
  ];
};

/**
 * OPTIONAL STRICT MODE:
 * Reject unknown fields in req.body to prevent accidental / malicious payloads.
 *
 * Example:
 *   rejectUnknownFields(["title", "description", "dueDate"])
 */
export const rejectUnknownFields =
  (allowedFields: string[]): RequestHandler =>
  (req: Request, res: Response, next: NextFunction): void => {
    if (!req.body || typeof req.body !== "object") {
      next();
      return;
    }

    const extras = Object.keys(req.body).filter(
      (k) => !allowedFields.includes(k)
    );

    if (extras.length > 0) {
      res.status(400).json({
        error: "Validation failed",
        message: "Unknown fields detected in request body.",
        errors: extras.map((field) => ({
          field,
          message: "Field is not allowed.",
          location: "body",
        })),
      } satisfies ValidationErrorResponse);
      return;
    }

    next();
  };

/**
 * Convenience helper: validate a params id like :jobId, :timeEntryId, etc.
 *
 * Example:
 *   router.get("/jobs/:jobId", ...validateRequest(validateParamsInt("jobId")), handler)
 */
export const validateParamsInt = (
  paramName: string,
  options?: { min?: number; max?: number }
): ValidationChain[] => {
  // Import lazily to keep this file compact for users who prefer manual chains.
  const { param } = require("express-validator") as typeof import("express-validator");

  let chain = param(paramName)
    .exists({ checkFalsy: true })
    .withMessage(`${paramName} is required`)
    .bail()
    .isInt()
    .withMessage(`${paramName} must be an integer`)
    .bail()
    .toInt();

  if (typeof options?.min === "number") {
    chain = chain
      .isInt({ min: options.min })
      .withMessage(`${paramName} must be >= ${options.min}`)
      .bail();
  }

  if (typeof options?.max === "number") {
    chain = chain
      .isInt({ max: options.max })
      .withMessage(`${paramName} must be <= ${options.max}`)
      .bail();
  }

  return [chain];
};

/**
 * OPTIONAL: Extract only validated data (whitelisted by validators).
 * Useful in controllers:
 *   const data = getValidatedData(req);
 */
export const getValidatedData = <T extends Record<string, any> = any>(
  req: Request
): T => {
  return matchedData(req, { locations: ["body", "params", "query"] }) as T;
};
