import path from "path";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { runtimeConfig } from "../config/env";

export type UploadStorageBucket = "documents" | "knowledge-hub";

const BUCKET_NAMES: Record<UploadStorageBucket, string> = {
  documents: runtimeConfig.r2DocumentsBucket,
  "knowledge-hub": runtimeConfig.r2KnowledgeBucket,
};

const OBJECT_PREFIXES: Record<UploadStorageBucket, string> = {
  documents: "documents",
  "knowledge-hub": "knowledge-hub",
};

let client: S3Client | null = null;

const getClient = () => {
  if (client) return client;

  client = new S3Client({
    region: "auto",
    endpoint: runtimeConfig.r2Endpoint,
    credentials: {
      accessKeyId: runtimeConfig.r2AccessKeyId,
      secretAccessKey: runtimeConfig.r2SecretAccessKey,
    },
  });

  return client;
};

const getBucketName = (bucket: UploadStorageBucket) => {
  const bucketName = BUCKET_NAMES[bucket];
  if (!bucketName) {
    throw new Error(`Missing R2 bucket configuration for ${bucket}`);
  }
  return bucketName;
};

const toSafeObjectName = (value: string) => path.basename(String(value || "").trim());

export const buildObjectStorageKey = (bucket: UploadStorageBucket, fileName: string) =>
  `${OBJECT_PREFIXES[bucket]}/${toSafeObjectName(fileName)}`;

export const uploadObjectStorageBuffer = async (input: {
  bucket: UploadStorageBucket;
  fileName: string;
  buffer: Buffer;
  mimeType?: string | null;
}) => {
  const objectKey = buildObjectStorageKey(input.bucket, input.fileName);
  await getClient().send(
    new PutObjectCommand({
      Bucket: getBucketName(input.bucket),
      Key: objectKey,
      Body: input.buffer,
      ContentType: input.mimeType || undefined,
    })
  );
  return { objectKey };
};

export const deleteObjectStorageObject = async (
  bucket: UploadStorageBucket,
  fileName: string | null | undefined
) => {
  const safeName = toSafeObjectName(String(fileName || ""));
  if (!safeName) return;

  await getClient().send(
    new DeleteObjectCommand({
      Bucket: getBucketName(bucket),
      Key: buildObjectStorageKey(bucket, safeName),
    })
  );
};

export const getObjectStorageSignedReadUrl = async (
  bucket: UploadStorageBucket,
  fileName: string
) =>
  getSignedUrl(
    getClient(),
    new GetObjectCommand({
      Bucket: getBucketName(bucket),
      Key: buildObjectStorageKey(bucket, fileName),
    }),
    {
      expiresIn: runtimeConfig.r2SignedUrlTtlSeconds,
    }
  );

export const downloadObjectStorageBuffer = async (
  bucket: UploadStorageBucket,
  fileName: string
) => {
  const response = await getClient().send(
    new GetObjectCommand({
      Bucket: getBucketName(bucket),
      Key: buildObjectStorageKey(bucket, fileName),
    })
  );

  const body = response.Body;
  if (!body) return null;
  const bytes = await body.transformToByteArray();
  return Buffer.from(bytes);
};
