import "./bootstrap";
import crypto from "crypto";
import { QueryTypes } from "sequelize";
import env from "@server/env";
import { sequelize } from "@server/storage/database";

/**
 * Dev/test-only fixture. Creates a Better Auth email/password ("credential")
 * account so the KMS app can be signed into when Microsoft Entra is NOT
 * configured (see server/auth/betterAuth.ts — credentials login is the
 * fallback that appears only when MICROSOFT_SSO_ENABLED is false).
 *
 * On a fresh database, the FIRST login with these credentials provisions the
 * Outline admin (its own team, keyed on the email domain) via afterSignInHook.
 *
 * Idempotent: re-running upserts the credential account / re-hashes the
 * password. Refuses when Entra is configured, and (because it plants a known
 * password) refuses in production unless SEED_TEST_ADMIN_CONFIRM=yes.
 */
const EMAIL = process.env.SEED_ADMIN_EMAIL || "kms-test-admin@kms.local";
const PASSWORD = process.env.SEED_ADMIN_PASSWORD || "KmsTestAdmin123!";
const NAME = "KMS Test Admin";
const usingDefaultPassword = !process.env.SEED_ADMIN_PASSWORD;

export default async function main(exit = false): Promise<void> {
  const fail = (msg: string) => {
    console.error(msg);
    if (exit) {
      process.exit(1);
    }
  };

  if (env.MICROSOFT_SSO_ENABLED) {
    return fail(
      "Refusing to seed: Microsoft Entra SSO is configured, so email/password " +
        "login is disabled. Unset MICROSOFT_CLIENT_ID/MICROSOFT_CLIENT_SECRET " +
        "to use the credentials login."
    );
  }

  if (env.isProduction && process.env.SEED_TEST_ADMIN_CONFIRM !== "yes") {
    return fail(
      "Refusing to seed: NODE_ENV=production. This plants a known-password " +
        "admin account. If this really is a disposable test environment, " +
        "re-run with SEED_TEST_ADMIN_CONFIRM=yes."
    );
  }

  const { hashPassword } = await import("better-auth/crypto");
  const hashed = await hashPassword(PASSWORD);
  const now = new Date();

  await sequelize.transaction(async (transaction) => {
    const userRows = await sequelize.query<{ id: string }>(
      `SELECT id FROM ba_user WHERE email = :email LIMIT 1`,
      { replacements: { email: EMAIL }, type: QueryTypes.SELECT, transaction }
    );
    const userId = userRows[0]?.id ?? crypto.randomUUID();

    if (!userRows[0]) {
      await sequelize.query(
        `INSERT INTO ba_user (id, name, email, "emailVerified", "createdAt", "updatedAt")
         VALUES (:id, :name, :email, true, :now, :now)`,
        {
          replacements: { id: userId, name: NAME, email: EMAIL, now },
          type: QueryTypes.INSERT,
          transaction,
        }
      );
    }

    // Upsert the credential account — robust even if the ba_user existed
    // without a credential row (e.g. a prior different-provider login or a
    // manual delete), which a blind UPDATE would silently no-op.
    const accountRows = await sequelize.query<{ id: string }>(
      `SELECT id FROM ba_account
       WHERE "userId" = :userId AND "providerId" = 'credential' LIMIT 1`,
      { replacements: { userId }, type: QueryTypes.SELECT, transaction }
    );

    if (accountRows[0]) {
      await sequelize.query(
        `UPDATE ba_account SET password = :password, "updatedAt" = :now WHERE id = :id`,
        {
          replacements: { password: hashed, now, id: accountRows[0].id },
          type: QueryTypes.UPDATE,
          transaction,
        }
      );
      console.log(`Updated credential password for ${EMAIL}`);
    } else {
      await sequelize.query(
        `INSERT INTO ba_account (id, "userId", "accountId", "providerId", password, "createdAt", "updatedAt")
         VALUES (:id, :userId, :accountId, 'credential', :password, :now, :now)`,
        {
          replacements: {
            id: crypto.randomUUID(),
            userId,
            accountId: userId,
            password: hashed,
            now,
          },
          type: QueryTypes.INSERT,
          transaction,
        }
      );
      console.log(`Created credential account for ${EMAIL}`);
    }
  });

  console.log("");
  console.log("KMS test login (credentials) ready:");
  console.log(`  Email:    ${EMAIL}`);
  console.log(
    usingDefaultPassword
      ? `  Password: ${PASSWORD}`
      : "  Password: (the value you supplied via SEED_ADMIN_PASSWORD)"
  );
  console.log("");
  console.log(
    "Dev/test only. On a fresh database the first login provisions the Outline admin."
  );

  if (exit) {
    process.exit(0);
  }
}

// In the test suite we import the script rather than run via node CLI
if (process.env.NODE_ENV !== "test") {
  void main(true);
}
