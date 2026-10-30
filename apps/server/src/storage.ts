import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const bucket = process.env.S3_BUCKET;
const region = process.env.S3_REGION ?? "us-east-1";
const accessKeyId = process.env.S3_ACCESS_KEY_ID;
const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
const endpoint = process.env.S3_ENDPOINT;
const forcePathStyle = process.env.S3_FORCE_PATH_STYLE === "true";

export const isStorageConfigured = Boolean(bucket && accessKeyId && secretAccessKey);

export const storageDriver = isStorageConfigured ? "s3" : "local";

const s3 = isStorageConfigured
  ? new S3Client({
      region,
      credentials: { accessKeyId: accessKeyId!, secretAccessKey: secretAccessKey! },
      ...(endpoint ? { endpoint, forcePathStyle: true } : { forcePathStyle }),
    })
  : null;

const LOCAL_ROOT = resolve(process.cwd(), process.env.LOCAL_STORAGE_DIR ?? ".storage");

function localPath(key: string) {
  const full = resolve(LOCAL_ROOT, key);
  if (!full.startsWith(LOCAL_ROOT)) throw new Error("Invalid storage key.");
  return full;
}

export async function putObject(key: string, body: Buffer, contentType: string) {
  if (s3) {
    await s3.send(
      new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }),
    );
    return;
  }
  const full = localPath(key);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, body);
}

export async function getObject(key: string): Promise<Buffer> {
  if (s3) {
    const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const bytes = await res.Body!.transformToByteArray();
    return Buffer.from(bytes);
  }
  return readFile(localPath(key));
}

export async function deleteObject(key: string) {
  if (s3) {
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    return;
  }
  await unlink(localPath(key)).catch(() => {});
}

export async function signedGetUrl(key: string, filename?: string, expiresIn = 300) {
  if (!s3) return null;
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
    ...(filename
      ? { ResponseContentDisposition: `inline; filename="${filename.replace(/"/g, "")}"` }
      : {}),
  });
  return getSignedUrl(s3, command, { expiresIn });
}

export function attachmentKey(documentId: string, attachmentId: string, ext: string) {
  return join("documents", documentId, "attachments", `${attachmentId}${ext}`);
}
