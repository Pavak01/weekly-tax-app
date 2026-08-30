import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

let s3Client: S3Client | null = null;

// Lazily creates (and memoizes) the S3 client. AWS credentials are only
// validated here, at the moment an S3 operation is actually performed,
// rather than at module import time. This ensures the module can be safely
// imported before Railway has finished injecting environment variables into
// the process.
function getS3Client(): S3Client {
  if (s3Client) {
    return s3Client;
  }

  const bucket = process.env.AWS_S3_BUCKET_NAME ?? "";
  const endpoint = process.env.AWS_ENDPOINT_URL ?? "";
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID ?? "";
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY ?? "";

  if (!bucket || !endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "AWS_S3_BUCKET_NAME, AWS_ENDPOINT_URL, AWS_ACCESS_KEY_ID, and AWS_SECRET_ACCESS_KEY are required"
    );
  }

  const region = process.env.AWS_DEFAULT_REGION ?? "auto";
  const forcePathStyle = String(process.env.RECEIPTS_S3_FORCE_PATH_STYLE ?? "").trim().toLowerCase() === "true";

  s3Client = new S3Client({
    region,
    endpoint,
    forcePathStyle,
    credentials: { accessKeyId, secretAccessKey }
  });
  return s3Client;
}

function getBucketName(): string {
  const bucket = process.env.AWS_S3_BUCKET_NAME ?? "";

  if (!bucket) {
    throw new Error(
      "AWS_S3_BUCKET_NAME, AWS_ENDPOINT_URL, AWS_ACCESS_KEY_ID, and AWS_SECRET_ACCESS_KEY are required"
    );
  }

  return bucket;
}

// `s3` behaves like an `S3Client` for all existing call sites (s3.send,
// etc.), but defers actual client construction/validation until the first
// property access, i.e. the first real S3 operation.
const s3: S3Client = new Proxy({} as S3Client, {
  get(_target, prop, receiver) {
    const actualClient = getS3Client();
    const value = Reflect.get(actualClient, prop, actualClient);
    return typeof value === "function" ? value.bind(actualClient) : value;
  }
});

export async function uploadReceiptObject(key: string, body: Buffer, contentType: string): Promise<void> {
  await s3.send(
    new PutObjectCommand({
      Bucket: getBucketName(),
      Key: key,
      Body: body,
      ContentType: contentType
    })
  );
}

export async function deleteReceiptObject(key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: getBucketName(), Key: key }));
}

export async function deleteReceiptObjects(keys: string[]): Promise<void> {
  const uniqueKeys = Array.from(new Set(keys.map((key) => key.trim()).filter(Boolean)));

  await Promise.all(
    uniqueKeys.map(async (key) => {
      try {
        await deleteReceiptObject(key);
      } catch (error) {
        console.warn(`Failed to delete receipt object ${key}:`, error);
      }
    })
  );
}

export async function getReceiptPresignedUrl(key: string, downloadFilename: string): Promise<string> {
  const safeFilename = downloadFilename.replace(/[\r\n"]/g, "");
  const command = new GetObjectCommand({
    Bucket: getBucketName(),
    Key: key,
    ResponseContentDisposition: `attachment; filename="${safeFilename}"`
  });
  return getSignedUrl(s3, command, { expiresIn: 300 });
}

const knownFileSignatures: Record<string, number[][]> = {
  "application/pdf": [[0x25, 0x50, 0x44, 0x46]],
  "image/jpeg": [[0xff, 0xd8, 0xff]],
  "image/png": [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]]
};

const dangerousSignatures: number[][] = [
  [0x4d, 0x5a], // Windows PE executable ("MZ")
  [0x7f, 0x45, 0x4c, 0x46], // Linux ELF executable
  [0x23, 0x21] // shebang script ("#!")
];

function matchesSignature(buffer: Buffer, signature: number[]): boolean {
  return signature.length <= buffer.length && signature.every((byte, index) => buffer[index] === byte);
}

function isWebp(buffer: Buffer): boolean {
  return buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP";
}

export function receiptContentMatchesDeclaredType(buffer: Buffer, declaredMimeType: string): boolean {
  if (dangerousSignatures.some((signature) => matchesSignature(buffer, signature))) {
    return false;
  }

  if (declaredMimeType === "image/webp") {
    return isWebp(buffer);
  }

  if (declaredMimeType === "text/plain") {
    return !buffer.subarray(0, Math.min(buffer.length, 8000)).includes(0);
  }

  const signatures = knownFileSignatures[declaredMimeType];
  if (!signatures) {
    return false;
  }

  return signatures.some((signature) => matchesSignature(buffer, signature));
}
