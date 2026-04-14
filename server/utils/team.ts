import type { Context } from "koa";
import { parseDomain } from "@shared/utils/domains";
import env from "@server/env";
import { Team } from "@server/models";

/**
 * Parses the state string into its components.
 *
 * @param state The state string
 * @returns An object containing the parsed components
 */
export function parseState(state: string) {
  const [host, token, client, rawCodeVerifier, rawAccessToken] =
    state.split("|");
  const codeVerifier = rawCodeVerifier ? rawCodeVerifier : undefined;
  const accessToken = rawAccessToken ? rawAccessToken : undefined;
  return { host, token, client, codeVerifier, accessToken };
}

type TeamFromContextOptions = {
  /**
   * Whether to consider the state cookie in the context when determining the team.
   * If true, the state cookie will be parsed to determine the host and infer the team
   * this should only be used in the authentication process.
   */
  includeStateCookie?: boolean;
};

/**
 * Infers the team from the context based on the hostname or state cookie.
 *
 * @param ctx The Koa context
 * @param options Options for determining the team
 * @returns The inferred team or undefined if not found
 */
export async function getTeamFromContext(
  ctx: Context,
  options: TeamFromContextOptions = { includeStateCookie: true }
) {
  // "domain" is the domain the user came from when attempting auth
  // we use it to infer the team they intend on signing into
  const state = options.includeStateCookie
    ? ctx.cookies.get("state")
    : undefined;
  const host = state ? parseState(state).host : ctx.hostname;
  const domain = parseDomain(host);

  let team;
  if (!env.isCloudHosted) {
    if (env.ENVIRONMENT === "test") {
      team = await Team.findOne({ where: { domain: env.URL } });
    } else {
      team = await Team.findOne({
        order: [["createdAt", "DESC"]],
      });
    }
  } else if (ctx.state?.rootShare) {
    team = await Team.findByPk(ctx.state.rootShare.teamId);
  } else if (domain.custom) {
    team = await Team.findOne({ where: { domain: domain.host } });
  } else if (domain.teamSubdomain) {
    team = await Team.findBySubdomain(domain.teamSubdomain);
  }

  return team;
}
