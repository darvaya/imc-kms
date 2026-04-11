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

    // Look up the account to get the provider info
    const accounts = await ctx.internalAdapter.findAccounts(session.userId);
    const microsoftAccount = accounts.find(
      (a) => a.providerId === "microsoft"
    );

    if (!microsoftAccount) {
      Logger.warn("better-auth hook: no Microsoft account found for user");
      return;
    }

    // If the user already has an outlineUserId, just update the session
    const existingOutlineUserId = baUser.user.outlineUserId as
      | string
      | null
      | undefined;
    if (existingOutlineUserId) {
      await ctx.internalAdapter.updateSession(session.token, {
        outlineUserId: existingOutlineUserId,
      });
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
        ip: session.ipAddress ?? undefined,
        transaction,
      });

      const result = await accountProvisioner(apiCtx, {
        user: {
          name: baUser.user.name,
          email: baUser.user.email,
          avatarUrl: baUser.user.image,
        },
        team: {
          name: env.APP_NAME,
          domain: baUser.user.email.split("@")[1],
          subdomain: baUser.user.email.split("@")[1].split(".")[0],
        },
        authenticationProvider: {
          name: "microsoft",
          providerId: "microsoft",
        },
        authentication: {
          providerId: microsoftAccount.accountId,
          scopes: microsoftAccount.scope
            ? microsoftAccount.scope.split(" ")
            : ["openid", "profile", "email"],
          accessToken: microsoftAccount.accessToken ?? undefined,
          refreshToken: microsoftAccount.refreshToken ?? undefined,
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

    Logger.info(
      "lifecycle",
      `better-auth: provisioned Outline user ${outlineUserId} for ${baUser.user.email}`
    );
  } catch (err) {
    Logger.error(
      "better-auth hook: failed to provision Outline user after sign-in",
      err as Error
    );
  }
}
