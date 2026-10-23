import env from "@server/env";
import Logger from "@server/logging/Logger";

/**
 * After a better-auth session is created, provision the corresponding Outline
 * user/team via `accountProvisioner` and store the Outline user ID on the
 * better-auth user and session records.
 *
 * This hook is called with the session object after creation. The `context`
 * parameter is the GenericEndpointContext from better-auth but we type it
 * loosely to avoid import issues with the ESM-only package.
 */
export async function afterSignInHook(
  session: { id: string; userId: string; token: string; ipAddress?: string | null } & Record<string, unknown>,
  _context?: unknown
): Promise<void> {
  try {
    const { getBetterAuth } = await import("./betterAuth");
    const auth = await getBetterAuth();

    // Look up the better-auth user that owns this session
    const ctx = await auth.$context;
    const baUser = await ctx.internalAdapter.findUserById(session.userId);

    if (!baUser) {
      Logger.warn("better-auth hook: session created but user not found");
      return;
    }

    // Look up the account to get the provider info. Support both the Microsoft
    // SSO account and the email/password credential account (used when Entra is
    // not configured — see server/auth/betterAuth.ts).
    const accounts = await ctx.internalAdapter.findAccounts(session.userId);
    const account =
      accounts.find((a) => a.providerId === "microsoft") ??
      accounts.find((a) => a.providerId === "credential") ??
      accounts[0];

    if (!account) {
      Logger.warn("better-auth hook: no account found for user");
      return;
    }

    // If the user already has an outlineUserId, just update the session.
    // NOTE: internalAdapter.findUserById returns the user record FLAT (better-
    // auth 1.2.8) — read fields off `baUser` directly, not `baUser.user`.
    const existingOutlineUserId = baUser.outlineUserId as
      | string
      | null
      | undefined;
    if (existingOutlineUserId) {
      await ctx.internalAdapter.updateSession(session.token, {
        outlineUserId: existingOutlineUserId,
      });

      // Track sign-in (replaces signIn() from authentication.ts)
      await trackSignIn(existingOutlineUserId, session.ipAddress, account.providerId);
      return;
    }

    // Provision the Outline user inside a transaction so partial failures
    // don't leave orphaned records (team without user, etc.)
    const { createContext } = await import("@server/context");
    const accountProvisioner = (
      await import("@server/commands/accountProvisioner")
    ).default;
    const { sequelize } = await import("@server/storage/database");

    const transaction = await sequelize.transaction();
    let outlineUserId: string;

    try {
      const apiCtx = createContext({
        // better-auth reports an unresolvable client address as an empty string,
        // which the Event model's isIP validation rejects.
        ip: session.ipAddress || undefined,
        transaction,
      });

      const result = await accountProvisioner(apiCtx, {
        user: {
          name: baUser.name,
          email: baUser.email,
          avatarUrl: baUser.image,
        },
        team: {
          name: env.APP_NAME,
          domain: baUser.email.split("@")[1],
          subdomain: baUser.email.split("@")[1].split(".")[0],
        },
        authenticationProvider: {
          name: account.providerId,
          providerId: account.providerId,
        },
        authentication: {
          providerId: account.accountId,
          scopes: account.scope
            ? account.scope.split(" ")
            : account.providerId === "microsoft"
              ? ["openid", "profile", "email"]
              : ["email"],
          accessToken: account.accessToken ?? undefined,
          refreshToken: account.refreshToken ?? undefined,
        },
      });

      outlineUserId = result.user.id;
      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }

    // Update the better-auth user and session with the Outline user ID
    await ctx.internalAdapter.updateUser(session.userId, {
      outlineUserId,
    });

    await ctx.internalAdapter.updateSession(session.token, {
      outlineUserId,
    });

    // Track sign-in for newly provisioned user
    await trackSignIn(outlineUserId, session.ipAddress, account.providerId);

    Logger.info(
      "lifecycle",
      `better-auth: provisioned Outline user ${outlineUserId} for ${baUser.email}`
    );
  } catch (err) {
    Logger.error(
      "better-auth hook: failed to provision Outline user after sign-in",
      err as Error
    );

    // The ba_session row was inserted before this hook ran and the browser is
    // about to receive its cookie. Without an outlineUserId the session can
    // never authenticate (the session bridge treats it as signed-out), so
    // revoke it — the user lands back on the login page instead of holding a
    // cookie that 401s on every request.
    try {
      const { getBetterAuth } = await import("./betterAuth");
      const auth = await getBetterAuth();
      const ctx = await auth.$context;
      await ctx.internalAdapter.deleteSession(session.token);
    } catch (cleanupErr) {
      Logger.error(
        "better-auth hook: failed to revoke unprovisioned session",
        cleanupErr as Error
      );
    }
  }
}

/**
 * Track a sign-in event for the given Outline user. This replaces the
 * tracking that the removed `signIn()` utility used to perform.
 */
async function trackSignIn(
  outlineUserId: string,
  ipAddress: string | null | undefined,
  providerId: string
): Promise<void> {
  try {
    const { User: UserModel, Event } = await import("@server/models");
    const user = await UserModel.findByPk(outlineUserId);

    if (!user) {
      return;
    }

    const now = new Date();
    user.lastActiveAt = now;
    user.lastActiveIp = ipAddress || null;
    user.lastSignedInAt = now;
    user.lastSignedInIp = ipAddress || null;
    await user.save({ hooks: false });

    await Event.create({
      name: "users.signin",
      userId: outlineUserId,
      teamId: user.teamId,
      actorId: outlineUserId,
      ip: ipAddress || null,
      data: {
        name: user.name,
        service: providerId,
      },
    });
  } catch (err) {
    Logger.error("better-auth hook: failed to track sign-in", err as Error);
  }
}
