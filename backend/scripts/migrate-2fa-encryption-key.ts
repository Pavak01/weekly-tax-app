import crypto from "node:crypto";
import { db } from "../src/db.js";

function deriveKey(seed: string): Buffer {
  return crypto.createHash("sha256").update(seed).digest();
}

function decryptTwoFactorSecret(payload: string, key: Buffer): string | null {
  const [ivPart, tagPart, encryptedPart] = payload.split(".");
  if (!ivPart || !tagPart || !encryptedPart) {
    return null;
  }

  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivPart, "base64url"));
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

function encryptTwoFactorSecret(secret: string, key: Buffer): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

async function main(): Promise<void> {
  const jwtSecret = process.env.JWT_SECRET;
  const newKeySeed = process.env.NEW_TWO_FACTOR_ENCRYPTION_KEY;
  const dryRun = process.argv.includes("--dry-run");

  if (!jwtSecret) {
    throw new Error("JWT_SECRET is required - used to derive the current fallback encryption key.");
  }
  if (!newKeySeed) {
    throw new Error(
      "NEW_TWO_FACTOR_ENCRYPTION_KEY is required - the new dedicated key to migrate stored secrets to. " +
        "This is deliberately a different variable name from TWO_FACTOR_ENCRYPTION_KEY so this script " +
        "can run before that variable is set live, avoiding a window where the app and this migration " +
        "disagree about which key is in effect."
    );
  }

  const oldKey = deriveKey(jwtSecret);
  const newKey = deriveKey(newKeySeed);

  const result = await db.query<{
    id: string;
    email: string;
    two_factor_secret: string | null;
    two_factor_pending_secret: string | null;
  }>(
    `SELECT id, email, two_factor_secret, two_factor_pending_secret
     FROM users
     WHERE two_factor_secret IS NOT NULL OR two_factor_pending_secret IS NOT NULL`
  );

  console.log(`Found ${result.rows.length} user(s) with a stored 2FA secret.`);

  let migrated = 0;
  let failed = 0;

  for (const row of result.rows) {
    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;
    let rowFailed = false;

    if (row.two_factor_secret) {
      const plain = decryptTwoFactorSecret(row.two_factor_secret, oldKey);
      if (plain === null) {
        console.error(`  [FAIL] ${row.email}: could not decrypt two_factor_secret with the current key`);
        rowFailed = true;
      } else {
        updates.push(`two_factor_secret = $${paramIndex++}`);
        values.push(encryptTwoFactorSecret(plain, newKey));
      }
    }

    if (row.two_factor_pending_secret) {
      const plain = decryptTwoFactorSecret(row.two_factor_pending_secret, oldKey);
      if (plain === null) {
        console.error(`  [FAIL] ${row.email}: could not decrypt two_factor_pending_secret with the current key`);
        rowFailed = true;
      } else {
        updates.push(`two_factor_pending_secret = $${paramIndex++}`);
        values.push(encryptTwoFactorSecret(plain, newKey));
      }
    }

    if (rowFailed) {
      failed += 1;
      continue;
    }

    if (updates.length === 0) {
      continue;
    }

    if (dryRun) {
      console.log(`  [DRY RUN] ${row.email}: would re-encrypt ${updates.length} field(s)`);
      migrated += 1;
      continue;
    }

    values.push(row.id);
    await db.query(`UPDATE users SET ${updates.join(", ")} WHERE id = $${paramIndex}`, values);
    console.log(`  [OK] ${row.email}: migrated`);
    migrated += 1;
  }

  console.log(
    dryRun
      ? `Dry run complete. ${migrated} would migrate, ${failed} would fail. No changes written.`
      : `Migration complete. ${migrated} migrated, ${failed} failed.`
  );

  if (failed > 0) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error("Migration failed:", error);
    process.exitCode = 1;
  })
  .finally(() => {
    void db.end();
  });
