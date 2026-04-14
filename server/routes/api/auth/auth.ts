import { subHours } from "date-fns";
import Router from "koa-router";
import uniqBy from "lodash/uniqBy";
import { TeamPreference } from "@shared/types";
import { parseDomain } from "@shared/utils/domains";
import env from "@server/env";
import auth from "@server/middlewares/authentication";
import { transaction } from "@server/middlewares/transaction";
import { Event, Team } from "@server/models";
import {
  presentUser,
  presentTeam,
  presentPolicies,
  presentAvailableTeam,
  presentGroup,
  presentGroupUser,
} from "@server/presenters";
import ValidateSSOAccessTask from "@server/queues/tasks/ValidateSSOAccessTask";
import type { APIContext } from "@server/types";
import type * as T from "./schema";

const router = new Router();

router.post("auth.config", async (ctx: APIContext<T.AuthConfigReq>) => {
  // Build list of better-auth providers to append to the config response
  const betterAuthProviders: Array<{
    id: string;
    name: string;
    authUrl: string;
    authType: string;
  }> = [];

  if (env.MICROSOFT_CLIENT_ID) {
    betterAuthProviders.push({
      id: "microsoft-better-auth",
      name: "Microsoft",
      authUrl: "/api/better-auth/sign-in/social?provider=microsoft",
      authType: "betterAuth",
    });
  }

  // If self hosted AND there is only one team then that team becomes the
  // brand for the knowledge base and it's guest signin option is used for the
  // root login page.
  if (!env.isCloudHosted) {
    const team = await Team.scope("withAuthenticationProviders").findOne({
      order: [["createdAt", "DESC"]],
    });

    if (team) {
      ctx.body = {
        data: {
          name: team.name,
          customTheme: team.getPreference(TeamPreference.CustomTheme),
          logo: team.getPreference(TeamPreference.PublicBranding)
            ? team.avatarUrl
            : undefined,
          providers: [...betterAuthProviders],
        },
      };
      return;
    }
  }

  const domain = parseDomain(ctx.request.hostname);

  if (domain.custom) {
    const team = await Team.scope("withAuthenticationProviders").findOne({
      where: {
        domain: ctx.request.hostname,
      },
    });

    if (team) {
      ctx.body = {
        data: {
          name: team.name,
          customTheme: team.getPreference(TeamPreference.CustomTheme),
          logo: team.getPreference(TeamPreference.PublicBranding)
            ? team.avatarUrl
            : undefined,
          hostname: ctx.request.hostname,
          providers: [...betterAuthProviders],
        },
      };
      return;
    }
  }

  // If subdomain signin page then we return minimal team details to allow
  // for a custom screen showing only relevant signin options for that team.
  else if (env.isCloudHosted && domain.teamSubdomain) {
    const team = await Team.scope("withAuthenticationProviders").findOne({
      where: {
        subdomain: domain.teamSubdomain,
      },
    });

    if (team) {
      ctx.body = {
        data: {
          name: team.name,
          customTheme: team.getPreference(TeamPreference.CustomTheme),
          logo: team.getPreference(TeamPreference.PublicBranding)
            ? team.avatarUrl
            : undefined,
          hostname: ctx.request.hostname,
          providers: [...betterAuthProviders],
        },
      };
      return;
    }
  }

  // Otherwise, we're requesting from the standard root signin page
  ctx.body = {
    data: {
      providers: [...betterAuthProviders],
    },
  };
});

router.post("auth.info", auth(), async (ctx: APIContext<T.AuthInfoReq>) => {
  const { user } = ctx.state.auth;
  const signedInTeamIds: string[] = [];

  const [team, groups, availableTeams] = await Promise.all([
    Team.scope("withDomains").findByPk(user.teamId, {
      rejectOnEmpty: true,
    }),
    user.groups(),
    user.availableTeams(),
  ]);

  // If the user did not _just_ sign in then we need to check if they continue
  // to have access to the workspace they are signed into.
  if (user.lastSignedInAt && user.lastSignedInAt < subHours(new Date(), 1)) {
    await new ValidateSSOAccessTask().schedule({ userId: user.id });
  }

  ctx.body = {
    data: {
      user: presentUser(user, {
        includeDetails: true,
      }),
      team: presentTeam(team),
      groups: await Promise.all(groups.map(presentGroup)),
      groupUsers: groups.map((group) => presentGroupUser(group.groupUsers[0])),
      collaborationToken: user.getCollaborationToken(),
      availableTeams: uniqBy(availableTeams, "id").map(
        (availableTeam) =>
          presentAvailableTeam(
            availableTeam,
            signedInTeamIds.includes(team.id) ||
              availableTeam.id === user.teamId
          )
      ),
    },
    policies: presentPolicies(user, [team, user, ...groups]),
  };
});

router.post(
  "auth.delete",
  auth(),
  transaction(),
  async (ctx: APIContext<T.AuthDeleteReq>) => {
    const { auth: authState, transaction } = ctx.state;
    const { user } = authState;

    // Revoke the current Better Auth session via cookie (production browser flow)
    try {
      const { getBetterAuth } = await import("@server/auth/betterAuth");
      const { fromNodeHeaders } = await import("better-auth/node");
      const betterAuth = await getBetterAuth();
      await betterAuth.api.revokeSession({
        headers: fromNodeHeaders(ctx.req.headers),
      });
    } catch {
      // Cookie-based revocation may fail when authenticating via body/header token
    }

    // Also delete the session directly by token to handle body/header auth
    const { sequelize } = await import("@server/storage/database");
    const { QueryTypes } = await import("sequelize");
    await sequelize.query(
      `DELETE FROM ba_session WHERE token = :token`,
      {
        replacements: { token: authState.token },
        type: QueryTypes.DELETE,
        transaction,
      }
    );

    // Still rotate JWT secret to invalidate outstanding collaboration tokens
    await user.rotateJwtSecret({ transaction });

    await Event.createFromContext(ctx, {
      name: "users.signout",
      userId: user.id,
      data: {
        name: user.name,
      },
    });

    ctx.body = {
      success: true,
    };
  }
);

export default router;
