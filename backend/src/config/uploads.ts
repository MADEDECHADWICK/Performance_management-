// This module defines the configuration and utilities for handling file uploads in the application. It specifies different upload buckets (e.g., "documents" and "knowledge-hub") with their respective subdirectories, maximum file size limits, and allowed MIME types. The module provides functions to get the upload directory, build public URLs for uploaded files, resolve local file paths, and create multer disk storage configurations for handling file uploads. By centralizing this logic, we can ensure consistent handling of file uploads across the application and enforce security and validation rules for uploaded content.

import fs from "fs";
import path from "path";
import multer from "multer";
import { runtimeConfig } from "./env";
import {
  deleteObjectStorageObject,
  downloadObjectStorageBuffer,
  getObjectStorageSignedReadUrl,
  uploadObjectStorageBuffer,
  type UploadStorageBucket,
} from "../services/uploadObjectStorage.service";

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

const extractPathName = (value: string) => {
  try {
    return new URL(value).pathname;
  } catch {
    return value;
  }
};

export const isObjectStorageEnabled = () => runtimeConfig.objectStorageEnabled;

export const isUploadWriteEnabled = () =>
  runtimeConfig.diskUploadsEnabled || runtimeConfig.objectStorageEnabled;

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

export const isManagedUploadPath = (bucket: UploadBucket, value: string | null | undefined) => {
  const pathName = extractPathName(String(value || "").split("?")[0].split("#")[0]);
  return typeof pathName === "string" && pathName.startsWith(`${getPublicUploadPrefix(bucket)}/`);
};

export const resolveLocalUploadPath = (bucket: UploadBucket, fileName: string) =>
  path.join(getUploadDirectory(bucket), path.basename(fileName));

export const extractUploadFileName = (value: string | null | undefined) => {
  const pathName = extractPathName(String(value || "").split("?")[0].split("#")[0]);
  const fileName = path.basename(pathName || "");
  return fileName ? fileName : null;
};

export const deleteStoredUpload = async (
  bucket: UploadBucket,
  value: string | null | undefined
) => {
  const fileName = extractUploadFileName(value);
  if (!fileName) return;

  if (runtimeConfig.objectStorageEnabled) {
    await deleteObjectStorageObject(bucket as UploadStorageBucket, fileName);
    return;
  }

  const localPath = resolveLocalUploadPath(bucket, fileName);
  try {
    if (fs.existsSync(localPath)) {
      await fs.promises.unlink(localPath);
    }
  } catch {
    // Best-effort cleanup. The caller already controls the main failure path.
  }
};

export const downloadStoredUploadBuffer = async (
  bucket: UploadBucket,
  value: string | null | undefined
) => {
  const fileName = extractUploadFileName(value);
  if (!fileName) return null;

  if (runtimeConfig.objectStorageEnabled) {
    return downloadObjectStorageBuffer(bucket as UploadStorageBucket, fileName);
  }

  const localPath = resolveLocalUploadPath(bucket, fileName);
  if (!fs.existsSync(localPath)) return null;
  return fs.promises.readFile(localPath);
};

export const getStoredUploadReadUrl = async (
  bucket: UploadBucket,
  value: string | null | undefined
) => {
  const fileName = extractUploadFileName(value);
  if (!fileName) return null;

  if (runtimeConfig.objectStorageEnabled) {
    return getObjectStorageSignedReadUrl(bucket as UploadStorageBucket, fileName);
  }

  return buildPublicUploadPath(bucket, fileName);
};

export const buildDiskUpload = (bucket: UploadBucket) => {
  const bucketConfig = BUCKET_CONFIG[bucket];

  return multer({
    storage: runtimeConfig.objectStorageEnabled
      ? multer.memoryStorage()
      : multer.diskStorage({
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

export const storeUploadedFile = async (
  bucket: UploadBucket,
  file: Express.Multer.File
) => {
  if (!file) {
    throw new Error("No file received for upload");
  }

  if (runtimeConfig.objectStorageEnabled) {
    const storedName = `${Date.now()}-${sanitizeFileName(file.originalname || "upload")}`;
    const buffer = Buffer.isBuffer(file.buffer) ? file.buffer : Buffer.alloc(0);

    await uploadObjectStorageBuffer({
      bucket: bucket as UploadStorageBucket,
      fileName: storedName,
      buffer,
      mimeType: file.mimetype || null,
    });

    return {
      storedName,
      publicPath: buildPublicUploadPath(bucket, storedName),
      fileSize: file.size,
      mimeType: file.mimetype || null,
      originalName: file.originalname || storedName,
    };
  }

  const storedName = path.basename((file as Express.Multer.File & { filename?: string }).filename || "");
  if (!storedName) {
    throw new Error("Stored file name is missing after upload");
  }

  return {
    storedName,
    publicPath: buildPublicUploadPath(bucket, storedName),
    fileSize: file.size,
    mimeType: file.mimetype || null,
    originalName: file.originalname || storedName,
  };
};

export const storeGeneratedUploadBuffer = async (input: {
  bucket: UploadBucket;
  fileName: string;
  buffer: Buffer;
  mimeType?: string | null;
}) => {
  const storedName = `${Date.now()}-${sanitizeFileName(input.fileName)}`;

  if (runtimeConfig.objectStorageEnabled) {
    await uploadObjectStorageBuffer({
      bucket: input.bucket as UploadStorageBucket,
      fileName: storedName,
      buffer: input.buffer,
      mimeType: input.mimeType || null,
    });
  } else {
    const absolutePath = resolveLocalUploadPath(input.bucket, storedName);
    await fs.promises.writeFile(absolutePath, input.buffer);
  }

  return {
    storedName,
    publicPath: buildPublicUploadPath(input.bucket, storedName),
  };
};
