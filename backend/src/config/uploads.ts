// This module defines the configuration and utilities for handling file uploads in the application. It specifies different upload buckets (e.g., "documents" and "knowledge-hub") with their respective subdirectories, maximum file size limits, and allowed MIME types. The module provides functions to get the upload directory, build public URLs for uploaded files, resolve local file paths, and create multer disk storage configurations for handling file uploads. By centralizing this logic, we can ensure consistent handling of file uploads across the application and enforce security and validation rules for uploaded content.

import fs from "fs";
import path from "path";
import multer from "multer";
import { runtimeConfig } from "./env";

export type UploadBucket = "documents" | "knowledge-hub";

const BUCKET_CONFIG: Record<
  UploadBucket,
  { subdirectory: string; maxBytes: number; allowedMimeTypes: Set<string> }
> = {
  documents: {
    subdirectory: "documents",
    maxBytes: runtimeConfig.documentUploadMaxBytes,
    allowedMimeTypes: new Set([
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-powerpoint",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "image/jpeg",
      "image/png",
      "text/plain",
    ]),
  },
  "knowledge-hub": {
    subdirectory: "knowledge-hub",
    maxBytes: runtimeConfig.knowledgeHubUploadMaxBytes,
    allowedMimeTypes: new Set([
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "image/jpeg",
      "image/png",
      "image/webp",
      "video/mp4",
      "video/webm",
      "text/plain",
    ]),
  },
};

const sanitizeFileName = (value: string) =>
  String(value || "upload")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_");

export const getUploadRoot = () => runtimeConfig.uploadRoot;

export const getUploadDirectory = (bucket: UploadBucket) => {
  const directory = path.join(runtimeConfig.uploadRoot, BUCKET_CONFIG[bucket].subdirectory);
  fs.mkdirSync(directory, { recursive: true });
  return directory;
};

export const getPublicUploadPrefix = (bucket: UploadBucket) =>
  `${runtimeConfig.uploadPublicBasePath}/${BUCKET_CONFIG[bucket].subdirectory}`;

export const buildPublicUploadPath = (bucket: UploadBucket, fileName: string) =>
  `${getPublicUploadPrefix(bucket)}/${path.basename(fileName)}`;

export const resolveLocalUploadPath = (bucket: UploadBucket, fileName: string) =>
  path.join(getUploadDirectory(bucket), path.basename(fileName));

export const buildDiskUpload = (bucket: UploadBucket) => {
  const bucketConfig = BUCKET_CONFIG[bucket];

  return multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => cb(null, getUploadDirectory(bucket)),
      filename: (_req, file, cb) => {
        cb(null, `${Date.now()}-${sanitizeFileName(file.originalname)}`);
      },
    }),
    limits: {
      fileSize: bucketConfig.maxBytes,
    },
    fileFilter: (_req, file, cb) => {
      if (!file.mimetype || bucketConfig.allowedMimeTypes.has(file.mimetype)) {
        cb(null, true);
        return;
      }

      cb(new Error(`Unsupported upload type '${file.mimetype}' for ${bucket}`));
    },
  });
};
