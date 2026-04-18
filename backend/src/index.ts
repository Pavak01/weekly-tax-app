import bcrypt from "bcryptjs";
import cors from "cors";
import express from "express";
import type { NextFunction, Request, Response } from "express";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import multer from "multer";
import { z } from "zod";
import "dotenv/config";
import { fileURLToPath } from "node:url";
import { db } from "./db.js";
import { getDeductionSuggestions } from "./deductionEngine.js";
import { getRuleMonitoringSnapshot, getRulesForTaxYear, getTaxYearFromDate } from "./rulesEngine.js";
import { calculateTaxEstimate, generateComplianceWarnings } from "./taxEngine.js";

const app = express();
const isProduction = process.env.NODE_ENV === "production";
const configuredOrigins = String(process.env.ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const allowedOrigins = new Set([
  ...configuredOrigins,
  "http://localhost:19006",
  "http://localhost:8081",
  "http://localhost:8082",
  "http://localhost:4000",
  "https://weekly-tax-app-production.up.railway.app"
]);

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use((req: Request, res: Response, next: NextFunction) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (isProduction) {
    res.setHeader("Cache-Control", "no-store");
  }
  next();
});
app.use(
  cors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error("Origin not allowed"));
    }
  })
);
app.use(express.json({ limit: "1mb" }));

const port = Number(process.env.PORT || 4000);
const jwtSecret: string = process.env.JWT_SECRET ?? "";
const rulePublishSecret: string = process.env.RULE_PUBLISH_SECRET?.trim() ?? "";
const adminEmails = new Set(
  String(process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)
);
const currentFilePath = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFilePath);
const uploadsDir = path.resolve(currentDir, "..", "uploads");
const maxReceiptSizeBytes = 8 * 1024 * 1024;
const receiptDownloadTtlSeconds = 15 * 60;
const passwordResetTtlMinutes = Math.max(5, Number(process.env.PASSWORD_RESET_TTL_MINUTES || 15));
const twoFactorChallengeTtlMinutes = Math.max(5, Number(process.env.TWO_FACTOR_CHALLENGE_TTL_MINUTES || 10));
const twoFactorTimeStepSeconds = 30;
const twoFactorAppName = "Qbit";
const allowPasswordResetCodePreview = process.env.NODE_ENV !== "production";
const allowedReceiptMimeTypes = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/plain"
]);

if (!jwtSecret) {
  throw new Error("JWT_SECRET is required");
}

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir),
    filename: (_req, file, cb) => {
      const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
      cb(null, `${Date.now()}-${safeName}`);
    }
  }),
  limits: { fileSize: maxReceiptSizeBytes },
  fileFilter: (_req, file, cb) => {
    if (!allowedReceiptMimeTypes.has(file.mimetype)) {
      cb(new Error("Unsupported receipt file type"));
      return;
    }
    cb(null, true);
  }
});

type AuthenticatedRequest = Request & { userId: string };

const expenseSchema = z.object({
  category: z.string().min(1),
  total_amount: z.number().min(0),
  reimbursed_amount: z.number().min(0).optional().default(0)
});

const weeklyEntrySchema = z.object({
  week_start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  entry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  entry_mode: z.enum(["weekly", "daily"]).default("weekly"),
  income_total: z.number().min(0),
  company_providing_services_for: z.string().max(200).nullable().optional(),
  expenses: z.array(expenseSchema).default([])
});

const authSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128)
});

const passwordResetRequestSchema = z.object({
  email: z.string().email()
});

const passwordResetConfirmSchema = z.object({
  email: z.string().email(),
  code: z.string().trim().regex(/^\d{6}$/),
  new_password: z.string().min(8).max(128)
});

const twoFactorCodeSchema = z.object({
  code: z.string().trim().regex(/^\d{6}$/)
});

const twoFactorVerifySchema = z.object({
  challenge_token: z.string().min(20),
  code: z.string().trim().regex(/^\d{6}$/)
});

const receiptUploadSchema = z.object({
  weekly_entry_id: z.string().uuid()
});

const rulePublishSchema = z.object({
  effective_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  effective_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  source_reference: z.string().url().max(500).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  personal_allowance: z.number().min(0),
  basic_rate_limit: z.number().min(0),
  basic_rate: z.number().min(0).max(1),
  higher_rate: z.number().min(0).max(1),
  ni_class2_weekly: z.number().min(0),
  ni_class4_threshold: z.number().min(0),
  ni_class4_rate: z.number().min(0).max(1)
});

const adminRoleUpdateSchema = z.object({
  email: z.string().email(),
  role: z.enum(["admin", "user"])
});

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

const rateLimitStore = new Map<string, RateLimitEntry>();

function createRateLimitMiddleware({
  key,
  windowMs,
  max,
  message
}: {
  key: string;
  windowMs: number;
  max: number;
  message: string;
}) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now();
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const entryKey = `${key}:${ip}`;
    const existing = rateLimitStore.get(entryKey);

    if (!existing || existing.resetAt <= now) {
      rateLimitStore.set(entryKey, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    existing.count += 1;
    rateLimitStore.set(entryKey, existing);

    if (existing.count > max) {
      const retryAfterSeconds = Math.ceil((existing.resetAt - now) / 1000);
      res.setHeader("Retry-After", String(Math.max(1, retryAfterSeconds)));
      res.status(429).json({ error: message });
      return;
    }

    next();
  };
}

const authRateLimit = createRateLimitMiddleware({
  key: "auth",
  windowMs: 15 * 60 * 1000,
  max: 12,
  message: "Too many authentication attempts. Please try again later."
});

const uploadRateLimit = createRateLimitMiddleware({
  key: "upload",
  windowMs: 10 * 60 * 1000,
  max: 25,
  message: "Too many upload attempts. Please try again later."
});

const adminRateLimit = createRateLimitMiddleware({
  key: "admin",
  windowMs: 10 * 60 * 1000,
  max: 60,
  message: "Too many admin actions. Please try again later."
});

function formatErrorDetails(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function sendError(res: Response, statusCode: number, publicMessage: string, error?: unknown): Response {
  if (error) {
    console.error(publicMessage, error);
  }

  if (isProduction || error === undefined) {
    return res.status(statusCode).json({ error: publicMessage });
  }

  return res.status(statusCode).json({ error: publicMessage, details: formatErrorDetails(error) });
}

function safeSecretMatch(expected: string, provided: string): boolean {
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);
  if (expectedBuffer.length !== providedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, providedBuffer);
}

function getTodayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function getWeekStartFromIsoDate(value: string): string {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const utcDay = date.getUTCDay();
  const offset = utcDay === 0 ? -6 : 1 - utcDay;
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function signToken(userId: string): string {
  return jwt.sign({ sub: userId }, jwtSecret, { expiresIn: "7d" });
}

function signReceiptDownloadToken(userId: string, receiptId: string): string {
  return jwt.sign({ sub: userId, rid: receiptId, purpose: "receipt-download" }, jwtSecret, {
    expiresIn: receiptDownloadTtlSeconds
  });
}

function getReceiptDownloadUrl(req: Request, userId: string, receiptId: string): string {
  const token = signReceiptDownloadToken(userId, receiptId);
  return `${req.protocol}://${req.get("host")}/receipts/${receiptId}/download?token=${encodeURIComponent(token)}`;
}

function generatePasswordResetCode(): string {
  return crypto.randomInt(100000, 1000000).toString();
}

function hashPasswordResetCode(email: string, code: string): string {
  return crypto.createHash("sha256").update(`${email}:${code}:${jwtSecret}`).digest("hex");
}

function signTwoFactorChallengeToken(userId: string): string {
  return jwt.sign({ sub: userId, purpose: "two-factor-login" }, jwtSecret, {
    expiresIn: `${twoFactorChallengeTtlMinutes}m`
  });
}

function getTwoFactorEncryptionKey(): Buffer {
  const seed = process.env.TWO_FACTOR_ENCRYPTION_KEY?.trim() || jwtSecret;
  return crypto.createHash("sha256").update(seed).digest();
}

function encryptTwoFactorSecret(secret: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getTwoFactorEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

function decryptTwoFactorSecret(payload: string | null | undefined): string | null {
  if (!payload) {
    return null;
  }

  const [ivPart, tagPart, encryptedPart] = payload.split(".");
  if (!ivPart || !tagPart || !encryptedPart) {
    return null;
  }

  try {
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      getTwoFactorEncryptionKey(),
      Buffer.from(ivPart, "base64url")
    );
    decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedPart, "base64url")),
      decipher.final()
    ]);
    return decrypted.toString("utf8");
  } catch {
    return null;
  }
}

function base32Encode(buffer: Buffer): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  let output = "";

  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;

    while (bits >= 5) {
      output += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += alphabet[(value << (5 - bits)) & 31];
  }

  return output;
}

function base32Decode(value: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let current = 0;
  const output: number[] = [];

  for (const char of value.toUpperCase().replace(/=+$/g, "").replace(/\s+/g, "")) {
    const index = alphabet.indexOf(char);
    if (index === -1) {
      continue;
    }

    current = (current << 5) | index;
    bits += 5;

    if (bits >= 8) {
      output.push((current >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(output);
}

function generateTwoFactorSecret(): string {
  return base32Encode(crypto.randomBytes(20));
}

function generateTotpCode(secret: string, timestampMs = Date.now()): string {
  const counter = Math.floor(timestampMs / 1000 / twoFactorTimeStepSeconds);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));

  const digest = crypto.createHmac("sha1", base32Decode(secret)).update(buffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const code = (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;

  return code.toString().padStart(6, "0");
}

function verifyTotpCode(secret: string, code: string): boolean {
  const normalized = code.trim();
  if (!/^\d{6}$/.test(normalized)) {
    return false;
  }

  for (let offset = -1; offset <= 1; offset += 1) {
    const timestamp = Date.now() + offset * twoFactorTimeStepSeconds * 1000;
    if (generateTotpCode(secret, timestamp) === normalized) {
      return true;
    }
  }

  return false;
}

function buildTwoFactorSetup(email: string, secret: string): { manual_entry_key: string; otpauth_url: string } {
  return {
    manual_entry_key: secret,
    otpauth_url: `otpauth://totp/${encodeURIComponent(`${twoFactorAppName}:${email}`)}?secret=${secret}&issuer=${encodeURIComponent(twoFactorAppName)}&algorithm=SHA1&digits=6&period=${twoFactorTimeStepSeconds}`
  };
}

function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing bearer token" });
    return;
  }

  const token = header.slice("Bearer ".length).trim();

  try {
    const decoded = jwt.verify(token, jwtSecret);
    if (typeof decoded !== "object" || decoded === null || !("sub" in decoded)) {
      res.status(401).json({ error: "Invalid token" });
      return;
    }

    const sub = (decoded as jwt.JwtPayload).sub;
    if (typeof sub !== "string") {
      res.status(401).json({ error: "Invalid token subject" });
      return;
    }

    (req as AuthenticatedRequest).userId = sub;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authReq = req as AuthenticatedRequest;

  try {
    const result = await db.query<{ role: string | null }>(
      "SELECT role FROM users WHERE id = $1 LIMIT 1",
      [authReq.userId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const role = (result.rows[0].role ?? "user").toLowerCase();
    if (role !== "admin") {
      res.status(403).json({ error: "Admin privileges required" });
      return;
    }

    next();
  } catch (error) {
    sendError(res, 500, "Failed to validate admin access", error);
  }
}

app.get("/health", (_req: Request, res: Response) => {
  res.json({ ok: true });
});

app.post("/auth/register", authRateLimit, async (req: Request, res: Response) => {
  const parsed = authSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
  }

  const email = parsed.data.email.trim().toLowerCase();
  const role = adminEmails.has(email) ? "admin" : "user";
  const passwordHash = await bcrypt.hash(parsed.data.password, 12);

  try {
    const existing = await db.query<{ id: string }>("SELECT id FROM users WHERE email = $1 LIMIT 1", [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: "Email already registered" });
    }

    const inserted = await db.query<{ id: string; email: string; role: string }>(
      `INSERT INTO users (email, password_hash, role, created_at)
       VALUES ($1, $2, $3, NOW())
       RETURNING id, email, role`,
      [email, passwordHash, role]
    );

    const user = inserted.rows[0];
    const token = signToken(user.id);
    return res.status(201).json({ token, user });
  } catch (error) {
    return sendError(res, 500, "Failed to register", error);
  }
});

app.post("/auth/login", authRateLimit, async (req: Request, res: Response) => {
  const parsed = authSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
  }

  const email = parsed.data.email.trim().toLowerCase();

  try {
    const result = await db.query<{
      id: string;
      email: string;
      role: string | null;
      password_hash: string | null;
      two_factor_enabled: boolean | null;
      two_factor_secret: string | null;
    }>(
      `SELECT id, email, role, password_hash, two_factor_enabled, two_factor_secret
       FROM users
       WHERE email = $1
       LIMIT 1`,
      [email]
    );

    if (result.rows.length === 0 || !result.rows[0].password_hash) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const user = result.rows[0];
    const passwordHash = user.password_hash;
    if (!passwordHash) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const ok = await bcrypt.compare(parsed.data.password, passwordHash);
    if (!ok) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const twoFactorSecret = decryptTwoFactorSecret(user.two_factor_secret);
    if (user.two_factor_enabled && twoFactorSecret) {
      return res.json({
        two_factor_required: true,
        challenge_token: signTwoFactorChallengeToken(user.id),
        user: { id: user.id, email: user.email, role: user.role ?? "user" },
        message: "Enter the 6-digit code from your authenticator app to finish signing in."
      });
    }

    const token = signToken(user.id);
    return res.json({ token, user: { id: user.id, email: user.email, role: user.role ?? "user" } });
  } catch (error) {
    return sendError(res, 500, "Failed to login", error);
  }
});

app.post("/auth/forgot-password", authRateLimit, async (req: Request, res: Response) => {
  const parsed = passwordResetRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
  }

  const email = parsed.data.email.trim().toLowerCase();
  const genericMessage = "If an account exists for that email, a reset code has been issued.";

  try {
    const result = await db.query<{ id: string }>("SELECT id FROM users WHERE email = $1 LIMIT 1", [email]);

    if (result.rows.length === 0) {
      return res.json({ message: genericMessage });
    }

    const code = generatePasswordResetCode();
    const codeHash = hashPasswordResetCode(email, code);
    const expiresAt = new Date(Date.now() + passwordResetTtlMinutes * 60 * 1000).toISOString();

    await db.query(
      `UPDATE users
       SET password_reset_code_hash = $1,
           password_reset_expires_at = $2,
           password_reset_requested_at = NOW()
       WHERE email = $3`,
      [codeHash, expiresAt, email]
    );

    return res.json({
      message: genericMessage,
      reset_code_preview: allowPasswordResetCodePreview ? code : undefined,
      expires_at: allowPasswordResetCodePreview ? expiresAt : undefined
    });
  } catch (error) {
    return sendError(res, 500, "Failed to start password reset", error);
  }
});

app.post("/auth/reset-password", authRateLimit, async (req: Request, res: Response) => {
  const parsed = passwordResetConfirmSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
  }

  const email = parsed.data.email.trim().toLowerCase();
  const codeHash = hashPasswordResetCode(email, parsed.data.code.trim());
  const newPasswordHash = await bcrypt.hash(parsed.data.new_password, 12);

  try {
    const updated = await db.query<{ id: string; email: string; role: string | null }>(
      `UPDATE users
       SET password_hash = $1,
           password_reset_code_hash = NULL,
           password_reset_expires_at = NULL,
           password_reset_requested_at = NULL
       WHERE email = $2
         AND password_reset_code_hash = $3
         AND password_reset_expires_at IS NOT NULL
         AND password_reset_expires_at > NOW()
       RETURNING id, email, role`,
      [newPasswordHash, email, codeHash]
    );

    if (updated.rows.length === 0) {
      return res.status(400).json({ error: "Invalid or expired reset code" });
    }

    const user = updated.rows[0];
    const token = signToken(user.id);
    return res.json({
      message: "Password updated successfully.",
      token,
      user: { id: user.id, email: user.email, role: user.role ?? "user" }
    });
  } catch (error) {
    return sendError(res, 500, "Failed to reset password", error);
  }
});

app.post("/auth/verify-2fa", authRateLimit, async (req: Request, res: Response) => {
  const parsed = twoFactorVerifySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
  }

  let userId = "";
  try {
    const decoded = jwt.verify(parsed.data.challenge_token, jwtSecret);
    if (typeof decoded !== "object" || decoded === null || decoded.purpose !== "two-factor-login") {
      return res.status(401).json({ error: "Invalid verification challenge" });
    }

    if (typeof decoded.sub !== "string") {
      return res.status(401).json({ error: "Invalid verification challenge" });
    }

    userId = decoded.sub;
  } catch {
    return res.status(401).json({ error: "Verification challenge expired" });
  }

  try {
    const result = await db.query<{ id: string; email: string; role: string | null; two_factor_secret: string | null }>(
      `SELECT id, email, role, two_factor_secret
       FROM users
       WHERE id = $1
       LIMIT 1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const user = result.rows[0];
    const secret = decryptTwoFactorSecret(user.two_factor_secret);
    if (!secret || !verifyTotpCode(secret, parsed.data.code)) {
      return res.status(401).json({ error: "Invalid verification code" });
    }

    const token = signToken(user.id);
    return res.json({ token, user: { id: user.id, email: user.email, role: user.role ?? "user" } });
  } catch (error) {
    return sendError(res, 500, "Failed to verify two-step code", error);
  }
});

app.get("/auth/2fa/status", requireAuth, async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;

  try {
    const result = await db.query<{ two_factor_enabled: boolean | null; two_factor_pending_secret: string | null }>(
      `SELECT two_factor_enabled, two_factor_pending_secret
       FROM users
       WHERE id = $1
       LIMIT 1`,
      [authReq.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    return res.json({
      enabled: Boolean(result.rows[0].two_factor_enabled),
      pending_setup: Boolean(result.rows[0].two_factor_pending_secret)
    });
  } catch (error) {
    return sendError(res, 500, "Failed to load two-step status", error);
  }
});

app.post("/auth/2fa/setup", requireAuth, authRateLimit, async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;

  try {
    const result = await db.query<{ email: string }>("SELECT email FROM users WHERE id = $1 LIMIT 1", [authReq.userId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const secret = generateTwoFactorSecret();
    const encryptedSecret = encryptTwoFactorSecret(secret);
    await db.query(
      `UPDATE users
       SET two_factor_pending_secret = $1
       WHERE id = $2`,
      [encryptedSecret, authReq.userId]
    );

    return res.json({
      message: "Two-step verification setup is ready.",
      ...buildTwoFactorSetup(result.rows[0].email, secret)
    });
  } catch (error) {
    return sendError(res, 500, "Failed to start two-step setup", error);
  }
});

app.post("/auth/2fa/enable", requireAuth, authRateLimit, async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const parsed = twoFactorCodeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
  }

  try {
    const result = await db.query<{ two_factor_pending_secret: string | null }>(
      `SELECT two_factor_pending_secret
       FROM users
       WHERE id = $1
       LIMIT 1`,
      [authReq.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const secret = decryptTwoFactorSecret(result.rows[0].two_factor_pending_secret);
    if (!secret || !verifyTotpCode(secret, parsed.data.code)) {
      return res.status(400).json({ error: "Invalid verification code" });
    }

    await db.query(
      `UPDATE users
       SET two_factor_enabled = TRUE,
           two_factor_secret = $1,
           two_factor_pending_secret = NULL,
           two_factor_enabled_at = NOW()
       WHERE id = $2`,
      [encryptTwoFactorSecret(secret), authReq.userId]
    );

    return res.json({ message: "Two-step verification enabled." });
  } catch (error) {
    return sendError(res, 500, "Failed to enable two-step verification", error);
  }
});

app.post("/auth/2fa/disable", requireAuth, authRateLimit, async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const parsed = twoFactorCodeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
  }

  try {
    const result = await db.query<{ two_factor_secret: string | null }>(
      `SELECT two_factor_secret
       FROM users
       WHERE id = $1
       LIMIT 1`,
      [authReq.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const secret = decryptTwoFactorSecret(result.rows[0].two_factor_secret);
    if (!secret || !verifyTotpCode(secret, parsed.data.code)) {
      return res.status(400).json({ error: "Invalid verification code" });
    }

    await db.query(
      `UPDATE users
       SET two_factor_enabled = FALSE,
           two_factor_secret = NULL,
           two_factor_pending_secret = NULL,
           two_factor_enabled_at = NULL
       WHERE id = $1`,
      [authReq.userId]
    );

    return res.json({ message: "Two-step verification disabled." });
  } catch (error) {
    return sendError(res, 500, "Failed to disable two-step verification", error);
  }
});

app.get("/auth/me", requireAuth, async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;

  try {
    const result = await db.query<{ id: string; email: string; role: string | null }>(
      "SELECT id, email, role FROM users WHERE id = $1 LIMIT 1",
      [authReq.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    return res.json({ user: result.rows[0] });
  } catch (error) {
    return sendError(res, 500, "Failed to load profile", error);
  }
});

app.get("/entry-mode-lock/:weekStartDate", requireAuth, async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const weekStartDate = String(req.params.weekStartDate ?? "").trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStartDate)) {
    return res.status(400).json({ error: "Week start date must be in YYYY-MM-DD format." });
  }

  try {
    const result = await db.query<{ entry_mode: string; entry_date: string | null }>(
      `SELECT COALESCE(NULLIF(entry_mode, ''), 'weekly') AS entry_mode,
              entry_date::text
       FROM weekly_entries
       WHERE user_id = $1 AND week_start_date = $2
       ORDER BY created_at DESC`,
      [authReq.userId, weekStartDate]
    );

    if (result.rows.length === 0) {
      return res.json({ locked: false, week_start_date: weekStartDate });
    }

    const lockedMode = result.rows[0].entry_mode === "daily" ? "daily" : "weekly";
    return res.json({
      locked: true,
      locked_mode: lockedMode,
      week_start_date: weekStartDate,
      existing_entry_dates: result.rows.map((row) => row.entry_date).filter(Boolean)
    });
  } catch (error) {
    return sendError(res, 500, "Failed to load week mode lock", error);
  }
});

app.post("/weekly-entry", requireAuth, async (req: Request, res: Response) => {
  const parsed = weeklyEntrySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
  }

  const authReq = req as AuthenticatedRequest;
  const payload = parsed.data;
  const taxYear = getTaxYearFromDate(payload.week_start_date);
  const entryMode = payload.entry_mode;
  const entryDate = payload.entry_date ?? payload.week_start_date;

  if (entryDate > getTodayIsoDate()) {
    return res.status(400).json({ error: "Entry date cannot be in the future." });
  }

  if (entryMode === "daily" && getWeekStartFromIsoDate(entryDate) !== payload.week_start_date) {
    return res.status(400).json({ error: "Daily entry date must belong to the selected week bucket." });
  }

  let totalNetExpenses = 0;
  let totalExpenseAmount = 0;
  let totalReimbursedAmount = 0;
  let excessReimbursement = 0;

  for (const expense of payload.expenses) {
    totalExpenseAmount += expense.total_amount;
    totalReimbursedAmount += expense.reimbursed_amount;
    if (expense.reimbursed_amount > expense.total_amount) {
      excessReimbursement += expense.reimbursed_amount - expense.total_amount;
    }
    totalNetExpenses += Math.max(0, expense.total_amount - expense.reimbursed_amount);
  }

  const adjustedIncome = payload.income_total + excessReimbursement;
  const weeklyProfit = adjustedIncome - totalNetExpenses;

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const existingEntries = await client.query<{ entry_mode: string; entry_date: string | null }>(
      `SELECT COALESCE(NULLIF(entry_mode, ''), 'weekly') AS entry_mode,
              entry_date::text
       FROM weekly_entries
       WHERE user_id = $1 AND week_start_date = $2
       ORDER BY created_at DESC
       FOR UPDATE`,
      [authReq.userId, payload.week_start_date]
    );

    if (existingEntries.rows.length > 0) {
      const lockedMode = existingEntries.rows[0].entry_mode === "daily" ? "daily" : "weekly";

      if (lockedMode !== entryMode) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          error: `This week is already locked to ${lockedMode} mode. You can switch again next week.`,
          locked_mode: lockedMode,
          week_start_date: payload.week_start_date
        });
      }

      if (entryMode === "weekly") {
        await client.query("ROLLBACK");
        return res.status(409).json({
          error: "A weekly entry has already been recorded for this week and is locked.",
          locked_mode: lockedMode,
          week_start_date: payload.week_start_date
        });
      }

      if (entryMode === "daily" && existingEntries.rows.some((row) => row.entry_date === entryDate)) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          error: "A daily entry for this date has already been recorded and is locked.",
          locked_mode: lockedMode,
          week_start_date: payload.week_start_date,
          entry_date: entryDate
        });
      }
    }

    const weeklyInsert = await client.query<{ id: string; created_at: string }>(
      `INSERT INTO weekly_entries (
         user_id, week_start_date, entry_date, entry_mode, tax_year, income_total, company_providing_services_for, created_at, version, is_locked
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), 1, TRUE)
       RETURNING id, created_at::text`,
      [
        authReq.userId,
        payload.week_start_date,
        entryDate,
        entryMode,
        taxYear,
        payload.income_total,
        payload.company_providing_services_for?.trim() || null
      ]
    );

    const weeklyEntryId = weeklyInsert.rows[0].id;

    for (const expense of payload.expenses) {
      const reimbursed = expense.reimbursed_amount ?? 0;
      const net = Math.max(0, expense.total_amount - reimbursed);

      await client.query(
        `INSERT INTO expenses (weekly_entry_id, category, total_amount, reimbursed_amount, net_amount, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [weeklyEntryId, expense.category, expense.total_amount, reimbursed, net]
      );
    }

    await client.query("COMMIT");

    const allWeeksForYear = await db.query<{ week_start_date: string; income: string; expenses: string }>(
      `SELECT we.week_start_date::text AS week_start_date,
              we.income_total::text AS income,
              COALESCE(SUM(e.net_amount), 0)::text AS expenses
       FROM weekly_entries we
       LEFT JOIN expenses e ON e.weekly_entry_id = we.id
       WHERE we.user_id = $1 AND we.tax_year = $2
       GROUP BY we.id`,
      [authReq.userId, taxYear]
    );

    const weeksLogged = new Set(allWeeksForYear.rows.map((row) => row.week_start_date)).size;
    const annualIncome =
      allWeeksForYear.rows.reduce((sum: number, row: { income: string; expenses: string }) => sum + Number(row.income), 0) +
      excessReimbursement;
    const annualExpenses = allWeeksForYear.rows.reduce(
      (sum: number, row: { income: string; expenses: string }) => sum + Number(row.expenses),
      0
    );
    const annualProfit = annualIncome - annualExpenses;

    const rules = await getRulesForTaxYear(taxYear);
    const estimate = calculateTaxEstimate({
      annualProfit,
      weeksLogged,
      rules
    });
    const warnings = generateComplianceWarnings({
      annualProfit,
      weeksLogged,
      totalExpenseAmount,
      totalReimbursedAmount,
      hasFoodExpense: payload.expenses.some((expense) => expense.category.toLowerCase() === "food"),
      excessReimbursement
    });
    const monitoringSnapshot = await getRuleMonitoringSnapshot(taxYear);

    await db.query(
      `INSERT INTO tax_summaries (
         user_id, tax_year, total_income, total_expenses, net_profit,
         estimated_income_tax, estimated_ni, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       ON CONFLICT (user_id, tax_year)
       DO UPDATE SET
         total_income = EXCLUDED.total_income,
         total_expenses = EXCLUDED.total_expenses,
         net_profit = EXCLUDED.net_profit,
         estimated_income_tax = EXCLUDED.estimated_income_tax,
         estimated_ni = EXCLUDED.estimated_ni,
         updated_at = NOW()`,
      [
        authReq.userId,
        taxYear,
        annualIncome,
        annualExpenses,
        annualProfit,
        estimate.estimated_income_tax,
        estimate.estimated_ni
      ]
    );

    return res.status(201).json({
      weekly_entry_id: weeklyEntryId,
      submitted_at: weeklyInsert.rows[0].created_at,
      entry_mode: entryMode,
      entry_date: entryDate,
      tax_year: taxYear,
      weekly_profit: Number(weeklyProfit.toFixed(2)),
      excess_reimbursement_added_to_income: Number(excessReimbursement.toFixed(2)),
      deduction_suggestions: getDeductionSuggestions(
        payload.expenses.map((e: { category: string }) => e.category)
      ),
      estimate,
      monitoring: {
        rule_set_id: rules.id,
        rule_version: rules.version,
        rule_source_reference: rules.source_reference,
        warnings,
        review: monitoringSnapshot.review
      }
    });
  } catch (error) {
    await client.query("ROLLBACK");
    return sendError(res, 500, "Failed to create weekly entry", error);
  } finally {
    client.release();
  }
});

app.post(
  "/receipts/upload",
  requireAuth,
  uploadRateLimit,
  upload.single("receipt"),
  async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const parsed = receiptUploadSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
    }

    if (!req.file) {
      return res.status(400).json({ error: "receipt file is required" });
    }

    try {
      const weekCheck = await db.query<{ id: string }>(
        "SELECT id FROM weekly_entries WHERE id = $1 AND user_id = $2 LIMIT 1",
        [parsed.data.weekly_entry_id, authReq.userId]
      );

      if (weekCheck.rows.length === 0) {
        return res.status(404).json({ error: "Weekly entry not found" });
      }

      const inserted = await db.query<{
        id: string;
        weekly_entry_id: string;
        original_filename: string;
        storage_path: string;
        mime_type: string | null;
        file_size_bytes: number;
        created_at: string;
      }>(
        `INSERT INTO receipts (
           weekly_entry_id, user_id, original_filename, storage_path, mime_type, file_size_bytes, created_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, NOW())
         RETURNING id, weekly_entry_id, original_filename, storage_path, mime_type, file_size_bytes, created_at`,
        [
          parsed.data.weekly_entry_id,
          authReq.userId,
          req.file.originalname,
          `/uploads/${path.basename(req.file.path)}`,
          req.file.mimetype,
          req.file.size
        ]
      );

      const receipt = inserted.rows[0];
      return res.status(201).json({
        receipt: {
          ...receipt,
          download_url: getReceiptDownloadUrl(req, authReq.userId, receipt.id)
        }
      });
    } catch (error) {
      return sendError(res, 500, "Failed to upload receipt", error);
    }
  }
);

app.get("/receipts/:weeklyEntryId", requireAuth, async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const weeklyEntryId = req.params.weeklyEntryId;

  try {
    const rows = await db.query<{
      id: string;
      weekly_entry_id: string;
      original_filename: string;
      storage_path: string;
      mime_type: string | null;
      file_size_bytes: string;
      created_at: string;
    }>(
      `SELECT id, weekly_entry_id, original_filename, storage_path, mime_type,
              file_size_bytes::text, created_at::text
       FROM receipts
       WHERE weekly_entry_id = $1 AND user_id = $2
       ORDER BY created_at DESC`,
      [weeklyEntryId, authReq.userId]
    );

    return res.json({
      receipts: rows.rows.map((row) => ({
        id: row.id,
        weekly_entry_id: row.weekly_entry_id,
        original_filename: row.original_filename,
        storage_path: row.storage_path,
        mime_type: row.mime_type,
        file_size_bytes: Number(row.file_size_bytes),
        created_at: row.created_at,
        download_url: getReceiptDownloadUrl(req, authReq.userId, row.id)
      }))
    });
  } catch (error) {
    return sendError(res, 500, "Failed to list receipts", error);
  }
});

app.get("/receipts/:receiptId/download", requireAuth, async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const receiptId = req.params.receiptId;
  const token = String(req.query.token ?? "");

  if (!token) {
    return res.status(401).json({ error: "Download token is required" });
  }

  try {
    const decoded = jwt.verify(token, jwtSecret);
    if (typeof decoded !== "object" || decoded === null) {
      return res.status(401).json({ error: "Invalid download token" });
    }

    const payload = decoded as jwt.JwtPayload;
    if (payload.purpose !== "receipt-download" || payload.sub !== authReq.userId || payload.rid !== receiptId) {
      return res.status(401).json({ error: "Invalid download token" });
    }

    const result = await db.query<{ original_filename: string; storage_path: string }>(
      "SELECT original_filename, storage_path FROM receipts WHERE id = $1 AND user_id = $2 LIMIT 1",
      [receiptId, authReq.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Receipt not found" });
    }

    const receipt = result.rows[0];
    const fileName = path.basename(receipt.storage_path);
    const filePath = path.resolve(uploadsDir, fileName);

    if (!filePath.startsWith(uploadsDir + path.sep) || !fs.existsSync(filePath)) {
      return res.status(404).json({ error: "Receipt file not found" });
    }

    return res.download(filePath, receipt.original_filename);
  } catch {
    return res.status(401).json({ error: "Invalid or expired download token" });
  }
});

app.get("/rules/:taxYear/monitoring", requireAuth, async (req: Request, res: Response) => {
  const taxYear = req.params.taxYear;

  try {
    const snapshot = await getRuleMonitoringSnapshot(taxYear);
    return res.json({
      monitored_at: new Date().toISOString(),
      ...snapshot
    });
  } catch (error) {
    return sendError(res, 404, "No rule monitoring data found", error);
  }
});

app.get("/admin/rules/:taxYear/audit-events", requireAuth, requireAdmin, adminRateLimit, async (req: Request, res: Response) => {
  const taxYear = req.params.taxYear;
  const limitRaw = Number(req.query.limit ?? 50);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(200, Math.floor(limitRaw))) : 50;

  if (!/^\d{4}-\d{2}$/.test(taxYear)) {
    return res.status(400).json({ error: "Tax year must be in YYYY-YY format." });
  }

  if (rulePublishSecret) {
    const providedSecret = String(req.headers["x-rule-publish-secret"] ?? "");
    if (!providedSecret || !safeSecretMatch(rulePublishSecret, providedSecret)) {
      return res.status(403).json({ error: "Missing or invalid rule publish secret" });
    }
  }

  try {
    const events = await db.query<{
      id: string;
      tax_year: string;
      rule_set_id: string | null;
      event_type: string;
      event_payload: unknown;
      performed_by: string | null;
      performed_at: string;
    }>(
      `SELECT id,
              tax_year,
              rule_set_id::text,
              event_type,
              event_payload,
              performed_by,
              performed_at::text
       FROM tax_rule_audit_events
       WHERE tax_year = $1
       ORDER BY performed_at DESC
       LIMIT $2`,
      [taxYear, limit]
    );

    return res.json({
      tax_year: taxYear,
      events: events.rows
    });
  } catch (error) {
    return sendError(res, 500, "Failed to load rule audit events", error);
  }
});

app.post("/admin/users/role", requireAuth, requireAdmin, adminRateLimit, async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const parsed = adminRoleUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
  }

  const targetEmail = parsed.data.email.trim().toLowerCase();
  const targetRole = parsed.data.role;

  try {
    const actor = await db.query<{ email: string }>("SELECT email FROM users WHERE id = $1 LIMIT 1", [authReq.userId]);
    if (actor.rows.length === 0) {
      return res.status(404).json({ error: "Admin user not found" });
    }

    if (actor.rows[0].email.toLowerCase() === targetEmail && targetRole !== "admin") {
      return res.status(400).json({ error: "You cannot revoke your own admin access" });
    }

    const updated = await db.query<{ id: string; email: string; role: string }>(
      `UPDATE users
       SET role = $1
       WHERE email = $2
       RETURNING id, email, role`,
      [targetRole, targetEmail]
    );

    if (updated.rows.length === 0) {
      return res.status(404).json({ error: "Target user not found" });
    }

    return res.json({
      message: "User role updated",
      user: updated.rows[0]
    });
  } catch (error) {
    return sendError(res, 500, "Failed to update user role", error);
  }
});

app.post("/rules/:taxYear/publish", requireAuth, requireAdmin, adminRateLimit, async (req: Request, res: Response) => {
  const taxYear = req.params.taxYear;
  const authReq = req as AuthenticatedRequest;

  if (!/^\d{4}-\d{2}$/.test(taxYear)) {
    return res.status(400).json({ error: "Tax year must be in YYYY-YY format." });
  }

  if (rulePublishSecret) {
    const providedSecret = String(req.headers["x-rule-publish-secret"] ?? "");
    if (!providedSecret || !safeSecretMatch(rulePublishSecret, providedSecret)) {
      return res.status(403).json({ error: "Missing or invalid rule publish secret" });
    }
  }

  const parsed = rulePublishSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
  }

  const payload = parsed.data;
  if (payload.effective_to && payload.effective_to < payload.effective_from) {
    return res.status(400).json({ error: "effective_to must be on or after effective_from" });
  }

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const latest = await client.query<{ id: string; version: number }>(
      `SELECT id, version
       FROM tax_rule_sets
       WHERE tax_year = $1
       ORDER BY version DESC, created_at DESC
       LIMIT 1
       FOR UPDATE`,
      [taxYear]
    );

    const previousRuleSetId = latest.rows[0]?.id ?? null;
    const nextVersion = (latest.rows[0]?.version ?? 0) + 1;

    const inserted = await client.query<{
      id: string;
      tax_year: string;
      version: number;
      effective_from: string;
      effective_to: string | null;
      source_reference: string | null;
      notes: string | null;
      created_by: string | null;
      personal_allowance: string;
      basic_rate_limit: string;
      basic_rate: string;
      higher_rate: string;
      ni_class2_weekly: string;
      ni_class4_threshold: string;
      ni_class4_rate: string;
      created_at: string;
    }>(
      `INSERT INTO tax_rule_sets (
         tax_year, version, effective_from, effective_to, source_reference, notes, created_by,
         personal_allowance, basic_rate_limit, basic_rate, higher_rate,
         ni_class2_weekly, ni_class4_threshold, ni_class4_rate, created_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
       RETURNING id, tax_year, version, effective_from::text, effective_to::text, source_reference, notes,
                 created_by, personal_allowance::text, basic_rate_limit::text, basic_rate::text, higher_rate::text,
                 ni_class2_weekly::text, ni_class4_threshold::text, ni_class4_rate::text, created_at::text`,
      [
        taxYear,
        nextVersion,
        payload.effective_from,
        payload.effective_to ?? null,
        payload.source_reference ?? null,
        payload.notes ?? null,
        authReq.userId,
        payload.personal_allowance,
        payload.basic_rate_limit,
        payload.basic_rate,
        payload.higher_rate,
        payload.ni_class2_weekly,
        payload.ni_class4_threshold,
        payload.ni_class4_rate
      ]
    );

    await client.query(
      `INSERT INTO tax_rule_audit_events (tax_year, rule_set_id, event_type, event_payload, performed_by, performed_at)
       VALUES (
         $1,
         $2,
         'RULE_SET_PUBLISHED',
         jsonb_build_object(
           'version', $3::int,
           'previous_rule_set_id', $4::text,
           'effective_from', $5::text,
           'effective_to', $6::text,
           'source_reference', $7::text
         ),
         $8,
         NOW()
       )`,
      [
        taxYear,
        inserted.rows[0].id,
        nextVersion,
        previousRuleSetId,
        payload.effective_from,
        payload.effective_to ?? null,
        payload.source_reference ?? null,
        authReq.userId
      ]
    );

    await client.query("COMMIT");

    const snapshot = await getRuleMonitoringSnapshot(taxYear);
    const row = inserted.rows[0];
    return res.status(201).json({
      published_rule_set: {
        id: row.id,
        tax_year: row.tax_year,
        version: row.version,
        effective_from: row.effective_from,
        effective_to: row.effective_to,
        source_reference: row.source_reference,
        notes: row.notes,
        created_by: row.created_by,
        personal_allowance: Number(row.personal_allowance),
        basic_rate_limit: Number(row.basic_rate_limit),
        basic_rate: Number(row.basic_rate),
        higher_rate: Number(row.higher_rate),
        ni_class2_weekly: Number(row.ni_class2_weekly),
        ni_class4_threshold: Number(row.ni_class4_threshold),
        ni_class4_rate: Number(row.ni_class4_rate),
        created_at: row.created_at
      },
      monitoring: snapshot
    });
  } catch (error) {
    await client.query("ROLLBACK");
    return sendError(res, 500, "Failed to publish rule set", error);
  } finally {
    client.release();
  }
});

app.get("/summary/:taxYear", requireAuth, async (req: Request, res: Response) => {
  const taxYear = req.params.taxYear;
  const authReq = req as AuthenticatedRequest;
  const asOfDateRaw = String(req.query.as_of ?? "").trim();

  if (asOfDateRaw && !/^\d{4}-\d{2}-\d{2}$/.test(asOfDateRaw)) {
    return res.status(400).json({ error: "as_of must be in YYYY-MM-DD format" });
  }

  const asOfDate = asOfDateRaw || null;

  try {
    const rows = await db.query<{
      week_start_date: string;
      created_at: string;
      income: string;
      expenses: string;
    }>(
      `SELECT we.week_start_date::text,
              we.created_at::text,
              we.income_total::text AS income,
              COALESCE(SUM(e.net_amount), 0)::text AS expenses
       FROM weekly_entries we
       LEFT JOIN expenses e ON e.weekly_entry_id = we.id
       WHERE we.user_id = $1
         AND we.tax_year = $2
         AND ($3::date IS NULL OR we.week_start_date <= $3::date)
       GROUP BY we.id
       ORDER BY we.week_start_date ASC, we.created_at ASC`,
      [authReq.userId, taxYear, asOfDate]
    );

    if (rows.rows.length === 0) {
      return res.status(404).json({ error: "No summary found" });
    }

    const totalIncome = rows.rows.reduce((sum, row) => sum + Number(row.income), 0);
    const totalExpenses = rows.rows.reduce((sum, row) => sum + Number(row.expenses), 0);
    const netProfit = totalIncome - totalExpenses;
    const rules = await getRulesForTaxYear(taxYear);
    const estimate = calculateTaxEstimate({
      annualProfit: netProfit,
      weeksLogged: rows.rows.length,
      rules
    });
    const updatedAt = rows.rows[rows.rows.length - 1]?.created_at ?? null;

    return res.json({
      tax_year: taxYear,
      as_of_date: asOfDate ?? new Date().toISOString().slice(0, 10),
      weeks_logged: rows.rows.length,
      total_income: Number(totalIncome.toFixed(2)),
      total_expenses: Number(totalExpenses.toFixed(2)),
      net_profit: Number(netProfit.toFixed(2)),
      estimated_income_tax: Number(estimate.estimated_income_tax.toFixed(2)),
      estimated_ni: Number(estimate.estimated_ni.toFixed(2)),
      updated_at: updatedAt
    });
  } catch (error) {
    return sendError(res, 500, "Failed to get summary", error);
  }
});

app.get("/tax-estimate/:weekId", requireAuth, async (req: Request, res: Response) => {
  const weekId = req.params.weekId;
  const authReq = req as AuthenticatedRequest;

  try {
    const entry = await db.query<{ id: string; user_id: string; tax_year: string }>(
      `SELECT id, user_id, tax_year FROM weekly_entries WHERE id = $1 AND user_id = $2`,
      [weekId, authReq.userId]
    );

    if (entry.rows.length === 0) {
      return res.status(404).json({ error: "Weekly entry not found" });
    }

    const { user_id: userId, tax_year: taxYear } = entry.rows[0];

    const allWeeks = await db.query<{
      week_start_date: string;
      income: string;
      expenses: string;
      total_amount: string;
      reimbursed_amount: string;
      has_food_expense: boolean;
    }>(
      `SELECT we.week_start_date::text AS week_start_date,
              we.income_total::text AS income,
              COALESCE(SUM(e.net_amount), 0)::text AS expenses,
              COALESCE(SUM(e.total_amount), 0)::text AS total_amount,
              COALESCE(SUM(e.reimbursed_amount), 0)::text AS reimbursed_amount,
              BOOL_OR(e.category = 'food') AS has_food_expense
       FROM weekly_entries we
       LEFT JOIN expenses e ON e.weekly_entry_id = we.id
       WHERE we.user_id = $1 AND we.tax_year = $2
       GROUP BY we.id`,
      [userId, taxYear]
    );

    const annualIncome = allWeeks.rows.reduce(
      (sum: number, row: { income: string; expenses: string }) => sum + Number(row.income),
      0
    );
    const annualExpenses = allWeeks.rows.reduce(
      (sum: number, row: { income: string; expenses: string }) => sum + Number(row.expenses),
      0
    );
    const annualExpenseAmount = allWeeks.rows.reduce(
      (sum: number, row: { total_amount: string }) => sum + Number(row.total_amount),
      0
    );
    const annualReimbursedAmount = allWeeks.rows.reduce(
      (sum: number, row: { reimbursed_amount: string }) => sum + Number(row.reimbursed_amount),
      0
    );
    const hasFoodExpense = allWeeks.rows.some((row) => row.has_food_expense);
    const annualProfit = annualIncome - annualExpenses;
    const weeksLogged = new Set(allWeeks.rows.map((row) => row.week_start_date)).size;

    const rules = await getRulesForTaxYear(taxYear);
    const estimate = calculateTaxEstimate({
      annualProfit,
      weeksLogged,
      rules
    });
    const warnings = generateComplianceWarnings({
      annualProfit,
      weeksLogged,
      totalExpenseAmount: annualExpenseAmount,
      totalReimbursedAmount: annualReimbursedAmount,
      hasFoodExpense,
      excessReimbursement: 0
    });
    const monitoringSnapshot = await getRuleMonitoringSnapshot(taxYear);

    return res.json({
      week_id: weekId,
      tax_year: taxYear,
      annual_profit: Number(annualProfit.toFixed(2)),
      estimate,
      monitoring: {
        rule_set_id: rules.id,
        rule_version: rules.version,
        rule_source_reference: rules.source_reference,
        warnings,
        review: monitoringSnapshot.review
      }
    });
  } catch (error) {
    return sendError(res, 500, "Failed to calculate tax estimate", error);
  }
});

app.get("/export/:taxYear", requireAuth, async (req: Request, res: Response) => {
  const taxYear = req.params.taxYear;
  const authReq = req as AuthenticatedRequest;
  const format = (req.query.format || "json").toString().toLowerCase();

  try {
    const totals = await db.query<{
      total_income: string;
      total_expenses: string;
      net_profit: string;
      estimated_income_tax: string;
      estimated_ni: string;
    }>(
      `SELECT total_income::text, total_expenses::text, net_profit::text,
              estimated_income_tax::text, estimated_ni::text
       FROM tax_summaries
       WHERE user_id = $1 AND tax_year = $2`,
      [authReq.userId, taxYear]
    );

    if (totals.rows.length === 0) {
      return res.status(404).json({ error: "No export data found" });
    }

    const categories = await db.query<{ category: string; total: string }>(
      `SELECT e.category, SUM(e.net_amount)::text AS total
       FROM expenses e
       JOIN weekly_entries we ON we.id = e.weekly_entry_id
       WHERE we.user_id = $1 AND we.tax_year = $2
       GROUP BY e.category
       ORDER BY e.category ASC`,
      [authReq.userId, taxYear]
    );

    const companies = await db.query<{ company: string }>(
      `SELECT DISTINCT TRIM(company_providing_services_for) AS company
       FROM weekly_entries
       WHERE user_id = $1
         AND tax_year = $2
         AND company_providing_services_for IS NOT NULL
         AND TRIM(company_providing_services_for) <> ''
       ORDER BY company ASC`,
      [authReq.userId, taxYear]
    );

    const row = totals.rows[0];
    const payload = {
      tax_year: taxYear,
      total_income: Number(row.total_income),
      total_expenses: Number(row.total_expenses),
      net_profit: Number(row.net_profit),
      estimated_income_tax: Number(row.estimated_income_tax),
      estimated_ni: Number(row.estimated_ni),
      companies_worked_for: companies.rows.map((c: { company: string }) => c.company),
      expenses_by_category: categories.rows.map((c: { category: string; total: string }) => ({
        category: c.category,
        total: Number(c.total)
      }))
    };

    if (format === "csv") {
      const lines = [
        "field,value",
        `tax_year,${payload.tax_year}`,
        `total_income,${payload.total_income}`,
        `total_expenses,${payload.total_expenses}`,
        `net_profit,${payload.net_profit}`,
        `estimated_income_tax,${payload.estimated_income_tax}`,
        `estimated_ni,${payload.estimated_ni}`
      ];

      for (const company of payload.companies_worked_for) {
        lines.push(`company_worked_for,${company}`);
      }

      for (const category of payload.expenses_by_category) {
        lines.push(`expense_${category.category},${category.total}`);
      }

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename=self-assessment-${taxYear}.csv`);
      return res.send(lines.join("\n"));
    }

    return res.json(payload);
  } catch (error) {
    return sendError(res, 500, "Export failed", error);
  }
});

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res
        .status(400)
        .json({ error: `Receipt file is too large. Max size is ${Math.round(maxReceiptSizeBytes / (1024 * 1024))}MB.` });
    }

    return res.status(400).json({ error: `Upload error: ${err.message}` });
  }

  if (err instanceof Error && err.message === "Unsupported receipt file type") {
    return res.status(400).json({
      error: "Unsupported receipt file type. Allowed types: PDF, JPEG, PNG, WEBP, plain text."
    });
  }

  const requestId = crypto.randomUUID();
  console.error(`Unhandled error ${requestId}`, err);
  return res.status(500).json({ error: "Internal server error", request_id: requestId });
});

app.listen(port, () => {
  console.log(`Backend running on port ${port}`);
});
