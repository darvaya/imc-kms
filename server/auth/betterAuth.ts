import env from "@server/env";
import Logger from "@server/logging/Logger";
import { afterSignInHook } from "./betterAuthHooks";

// better-auth's return type includes customizations from plugins/config, so
// we use a narrow interface for the parts we consume instead of the generic
// `Auth` type which causes a complex conversion error.
interface BetterAuthInstance {
  handler: (request: Request) => Promise<Response>;
  api: {
    getSession: (opts: {
      headers: Headers;
    }) => Promise<{
      session: { token: string; userId: string } & Record<string, unknown>;
      user: { id: string; name: string; email: string } & Record<
        string,
        unknown
      >;
    } | null>;
  };
  $context: Promise<{
    internalAdapter: {
      findUserById: (
        id: string
      ) => Promise<{
        user: {
          id: string;
          name: string;
          email: string;
          image?: string | null;
        } & Record<string, unknown>;
      } | null>;
      findAccounts: (
        userId: string
      ) => Promise<
        Array<{
          providerId: string;
          accountId: string;
          accessToken?: string | null;
          refreshToken?: string | null;
          scope?: string | null;
        }>
      >;
      updateUser: (
        id: string,
        data: Record<string, unknown>
      ) => Promise<unknown>;
      updateSession: (
        token: string,
        data: Record<string, unknown>
      ) => Promise<unknown>;
    };
  }>;
}

let authInstance: BetterAuthInstance | null = null;
let authInitPromise: Promise<BetterAuthInstance> | null = null;

/**
 * Returns the initialized better-auth instance. Lazily initializes on first
 * call using dynamic import() to handle the ESM-only better-auth package in
 * the CJS build pipeline.
 */
export async function getBetterAuth(): Promise<BetterAuthInstance> {
  if (authInstance) {
    return authInstance;
  }
  if (authInitPromise) {
    return authInitPromise;
  }

  authInitPromise = initBetterAuth();
  authInstance = await authInitPromise;
  return authInstance;
}

async function initBetterAuth(): Promise<BetterAuthInstance> {
  const { betterAuth } = await import("better-auth");

  const databaseUrl = env.DATABASE_CONNECTION_POOL_URL || env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error(
      "better-auth requires DATABASE_URL or DATABASE_CONNECTION_POOL_URL to be set"
    );
  }

  if (!env.BETTER_AUTH_SECRET) {
    throw new Error(
      "BETTER_AUTH_SECRET environment variable is required for better-auth"
    );
  }

  if (!env.MICROSOFT_CLIENT_ID || !env.MICROSOFT_CLIENT_SECRET) {
    throw new Error(
      "MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET are required for Microsoft OIDC"
    );
  }

  const { Pool } = await import("pg");

  const pool = new Pool({
    connectionString: databaseUrl,
    max: 5,
  });

  const auth = betterAuth({
    database: pool as Parameters<typeof betterAuth>[0]["database"],
    secret: env.BETTER_AUTH_SECRET,
    basePath: "/api/better-auth",
    baseURL: env.URL,
    socialProviders: {
      microsoft: {
        clientId: env.MICROSOFT_CLIENT_ID,
        clientSecret: env.MICROSOFT_CLIENT_SECRET,
        tenantId: env.MICROSOFT_TENANT_ID ?? "common",
      },
    },
    user: {
      modelName: "ba_user",
      additionalFields: {
        outlineUserId: {
          type: "string",
          required: false,
          defaultValue: null,
          input: false,
        },
      },
    },
    session: {
      modelName: "ba_session",
      expiresIn: 60 * 60 * 24 * 90, // 90 days
      additionalFields: {
        outlineUserId: {
          type: "string",
          required: false,
          defaultValue: null,
          input: false,
        },
      },
    },
    account: {
      modelName: "ba_account",
    },
    verification: {
      modelName: "ba_verification",
    },
    databaseHooks: {
      session: {
        create: {
          after: afterSignInHook,
        },
      },
    },
  });

  // Runtime verification that the better-auth instance exposes the APIs we
  // rely on via the hand-rolled BetterAuthInstance interface. This catches
  // version mismatches early instead of failing silently at request time.
  const instance = auth as unknown as BetterAuthInstance;
  if (typeof instance.handler !== "function") {
    throw new Error("better-auth instance missing .handler — version mismatch?");
  }
  if (typeof instance.api?.getSession !== "function") {
    throw new Error("better-auth instance missing .api.getSession — version mismatch?");
  }

  Logger.info(
    "lifecycle",
    "better-auth initialized with Microsoft OIDC provider"
  );

  return instance;
}
