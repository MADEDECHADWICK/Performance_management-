// This middleware is designed to reject multipart/form-data requests for file uploads when local disk uploads are disabled in the application's configuration. It checks the content type of incoming requests and, if it detects a multipart/form-data request while disk uploads are disabled, it responds with a 503 Service Unavailable status code and a message indicating that local disk uploads are not allowed. This helps to prevent clients from attempting to upload files when the server is not configured to handle them, and provides clear feedback about the issue. The middleware can be applied to specific routes or globally, depending on the desired behavior.

import type { NextFunction, Request, Response } from "express";
import { isUploadWriteEnabled, type UploadBucket } from "../config/uploads";
import { logger } from "../lib/logger";
import { errorResponse } from "../utils/response";

type DiskUploadGuardOptions = {
  enabled?: boolean;
};

const isMultipartRequest = (req: Request) =>
  String(req.headers["content-type"] || "")
    .toLowerCase()
    .startsWith("multipart/form-data");

export const buildRejectMultipartDiskUploadsDisabled =
  (bucket: UploadBucket, options: DiskUploadGuardOptions = {}) =>
  (req: Request, res: Response, next: NextFunction) => {
    const enabled = options.enabled ?? isUploadWriteEnabled();
    if (enabled || !isMultipartRequest(req)) {
      next();
      return;
    }

    logger.warn("multipart_disk_upload_rejected", {
      bucket,
      method: req.method,
      path: req.originalUrl || req.url,
      ip: req.ip,
    });
    res.status(503).json(
      errorResponse(
        "Local disk uploads are disabled in this environment. Configure managed object storage or explicitly enable local disk uploads.",
        503,
        { bucket }
      )
    );
  };

export const rejectMultipartDiskUploadsDisabled = (bucket: UploadBucket) =>
  buildRejectMultipartDiskUploadsDisabled(bucket);
