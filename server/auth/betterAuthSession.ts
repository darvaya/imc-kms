import type { IncomingHttpHeaders } from "http";
import { QueryTypes } from "sequelize";
import env from "@server/env";
import { User, Team } from "@server/models";
import { sequelize } from "@server/storage/database";
import type { AppContext } from "@server/types";
import { AuthenticationType } from "@server/types";

interface BetterAuthSessionResult {
  user: User;
  token: string;
  type: AuthenticationType;
}

/**
 * Validates a better-auth session from the Koa context. Returns the Outline
 * user if a valid better-auth session exists with an `outlineUserId`, or null
 * if no better-auth session is present.
 */
export async function validateBetterAuthSession(
  ctx: AppContext
): Promise<BetterAuthSessionResult | null> {
  // Skip if better-auth is not configured
  if (!env.BETTER_AUTH_SECRET || !env.MICROSOFT_CLIENT_ID) {
    return null;
  }

  try {
    const { getBetterAuth } = await import("./betterAuth");
    const { fromNodeHeaders } = await import("better-auth/node");
    const auth = await getBetterAuth();

    const result = await auth.api.getSession({
      headers: fromNodeHeaders(ctx.req.headers),
    });

    if (!result?.session || !result?.user) {
      return null;
    }

    const outlineUserId = result.session.outlineUserId as string | null;
    if (!outlineUserId) {
      return null;
    }

    const user = await User.findByPk(outlineUserId, {
      include: [
        {
          model: Team,
          as: "team",
          required: true,
        },
      ],
    });

    if (!user) {
      return null;
    }

    return {
      user,
      token: result.session.token,
      type: AuthenticationType.APP,
    };
  } catch {
    return null;
  }
}

/**
 * Validates a better-auth session from raw Node IncomingHttpHeaders.
 * Used by the websocket service which doesn't have a Koa context.
 */
export async function validateBetterAuthSessionFromHeaders(
  headers: IncomingHttpHeaders
): Promise<BetterAuthSessionResult | null> {
  if (!env.BETTER_AUTH_SECRET || !env.MICROSOFT_CLIENT_ID) {
    return null;
  }

  try {
    const { getBetterAuth } = await import("./betterAuth");
    const { fromNodeHeaders } = await import("better-auth/node");
    const auth = await getBetterAuth();

    const result = await auth.api.getSession({
      headers: fromNodeHeaders(headers),
    });

    if (!result?.session || !result?.user) {
      return null;
    }

    const outlineUserId = result.session.outlineUserId as string | null;
    if (!outlineUserId) {
      return null;
    }

    const user = await User.findByPk(outlineUserId, {
      include: [
        {
          model: Team,
          as: "team",
          required: true,
        },
      ],
    });

    if (!user) {
      return null;
    }

    return {
      user,
      token: result.session.token,
      type: AuthenticationType.APP,
    };
  } catch {
    return null;
  }
}

/**
 * Validates a better-auth session token passed directly (e.g. in request
 * body or Authorization header) by looking it up in the ba_session table.
 */
export async function validateBetterAuthSessionFromToken(
  token: string
): Promise<BetterAuthSessionResult | null> {
  try {
    const [session] = await sequelize.query<{
      outlineUserId: string;
      expiresAt: Date;
    }>(
      `SELECT "outlineUserId", "expiresAt" FROM ba_session WHERE token = :token LIMIT 1`,
      { replacements: { token }, type: QueryTypes.SELECT }
    );

    if (!session?.outlineUserId) {
      return null;
    }

    if (session.expiresAt && new Date(session.expiresAt) < new Date()) {
      return null;
    }

    const user = await User.findByPk(session.outlineUserId, {
      include: [
        {
          model: Team,
          as: "team",
          required: true,
        },
      ],
    });

    if (!user) {
      return null;
    }

    return {
      user,
      token,
      type: AuthenticationType.APP,
    };
  } catch {
    return null;
  }
}
