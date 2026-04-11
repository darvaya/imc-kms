import env from "@server/env";
import { User, Team } from "@server/models";
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
