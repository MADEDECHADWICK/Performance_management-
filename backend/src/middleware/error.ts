/**
 * error.ts
 * Global error handling + helpers for Express.
 *
 * Add in app.ts (order matters):
 *   app.use(notFoundHandler);
 *   app.use(errorHandler);
 */

import type { Request, Response, NextFunction, RequestHandler } from "express";
import { Prisma } from "@prisma/client";
import multer from "multer";
import { logger } from "../lib/logger";
import { ObservabilityService } from "../services/observability.service";

export type ErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "VALIDATION_ERROR"
  | "DATABASE_ERROR"
  | "INTERNAL_ERROR";

export interface AppError extends Error {
  statusCode?: number;
  code?: ErrorCode | string;
  details?: unknown;
  isOperational?: boolean; // mark trusted errors you throw intentionally
}

export interface ErrorResponseBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  statusCode: number;
  timestamp: string;
  path: string;
  method: string;
  requestId?: string;
}

/**
 * Create a typed AppError anywhere in your app.
 * Example:
 *   throw createAppError(403, "FORBIDDEN", "You cannot access this resource");
 */
export const createAppError = (
  statusCode: number,
  code: ErrorCode | string,
  message: string,
  details?: unknown
): AppError => {
  const err = new Error(message) as AppError;
  err.statusCode = statusCode;
  err.code = code;
  err.details = details;
  err.isOperational = true;
  return err;
};

/**
 * Wrap async route handlers to forward errors to error middleware.
 * Example:
 *   router.get("/x", asyncHandler(async (req,res)=>{ ... }));
 */
export const asyncHandler =
  <T extends (...args: any[]) => Promise<any>>(fn: T): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

/**
 * 404 handler for unknown routes.
 * Must be registered AFTER all routes, BEFORE errorHandler.
 */
export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: `Route not found: ${req.method} ${req.originalUrl}`,
    },
    statusCode: 404,
    timestamp: new Date().toISOString(),
    path: req.path,
    method: req.method,
  } satisfies ErrorResponseBody);
};

/**
 * Map Prisma errors to clean HTTP status codes/messages.
 */
const mapPrismaError = (err: unknown): AppError | null => {
  // Known request errors (unique constraint, FK constraint, etc.)
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case "P2002":
        return createAppError(409, "CONFLICT", "Duplicate value violates unique constraint.", {
          target: err.meta?.target,
        });
      case "P2003":
        return createAppError(409, "CONFLICT", "Foreign key constraint failed.", {
          field: err.meta?.field_name,
        });
      case "P2025":
        return createAppError(404, "NOT_FOUND", "Record not found.", {
          cause: err.meta?.cause,
        });
      default:
        return createAppError(400, "DATABASE_ERROR", "Database request error.", {
          prismaCode: err.code,
          meta: err.meta,
        });
    }
  }

  // Validation errors in Prisma client
  if (err instanceof Prisma.PrismaClientValidationError) {
    return createAppError(400, "VALIDATION_ERROR", "Database validation error.");
  }

  // Rust panic / unknown
  if (err instanceof Prisma.PrismaClientRustPanicError) {
    return createAppError(500, "DATABASE_ERROR", "Database engine error.");
  }

  // Initialization errors
  if (err instanceof Prisma.PrismaClientInitializationError) {
    return createAppError(500, "DATABASE_ERROR", "Database initialization error.");
  }

  return null;
};

/**
 * Map JWT errors (without importing jwt dependency here).
 */
const mapJwtError = (err: any): AppError | null => {
  if (!err || typeof err !== "object") return null;

  if (err.name === "TokenExpiredError") {
    return createAppError(401, "UNAUTHORIZED", "Token expired.");
  }

  if (err.name === "JsonWebTokenError") {
    return createAppError(401, "UNAUTHORIZED", "Invalid token.");
  }

  return null;
};

const mapUploadError = (err: unknown): AppError | null => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return createAppError(400, "VALIDATION_ERROR", "Uploaded file exceeds the allowed size limit.");
    }
    return createAppError(400, "VALIDATION_ERROR", err.message || "Upload validation failed.");
  }

  if (err instanceof Error && err.message.startsWith("Unsupported upload type")) {
    return createAppError(400, "VALIDATION_ERROR", err.message);
  }

  return null;
};

/**
 * Main error handler (must be last).
 */
export const errorHandler = (
  err: AppError,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction
): void => {
  const isDev = process.env.NODE_ENV === "development";

  // Normalize into AppError shape (Prisma/JWT/etc.)
  const prismaMapped = mapPrismaError(err);
  if (prismaMapped) err = prismaMapped;

  const jwtMapped = mapJwtError(err);
  if (jwtMapped) err = jwtMapped;

  const uploadMapped = mapUploadError(err);
  if (uploadMapped) err = uploadMapped;

  const statusCode = err.statusCode && Number.isInteger(err.statusCode) ? err.statusCode : 500;
  const code = (err.code as string) || (statusCode === 500 ? "INTERNAL_ERROR" : "BAD_REQUEST");

  // In production, avoid leaking internal error messages for 500s unless you marked it operational
  const safeMessage =
    statusCode >= 500 && !err.isOperational
      ? "Internal server error."
      : err.message || "Internal server error.";

  const timestamp = new Date().toISOString();

  // Optional request id support if you add one upstream (e.g., req.headers["x-request-id"])
  const requestId =
    (req.headers["x-request-id"] as string | undefined) ||
    (req.headers["x-correlation-id"] as string | undefined);

  logger.error("request_failed", {
    timestamp,
    statusCode,
    code,
    message: err.message,
    path: req.originalUrl ?? req.path,
    method: req.method,
    requestId,
    ...(isDev ? { stack: err.stack, details: err.details } : {}),
  });

  ObservabilityService.recordError({
    source: "http:request",
    severity: statusCode >= 500 ? "error" : "warning",
    error: err,
    code,
    requestId: requestId || res.locals?.requestId || null,
    context: {
      statusCode,
      path: req.originalUrl ?? req.path,
      method: req.method,
    },
  });

  const payload: ErrorResponseBody = {
    error: {
      code,
      message: safeMessage,
      ...(isDev && err.details !== undefined ? { details: err.details } : {}),
    },
    statusCode,
    timestamp,
    path: req.path,
    method: req.method,
    ...(requestId ? { requestId } : {}),
  };

  res.status(statusCode).json(payload);
};
