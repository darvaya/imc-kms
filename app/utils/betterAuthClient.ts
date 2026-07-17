import { createAuthClient } from "better-auth/client";
import env from "~/env";

export const betterAuthClient = createAuthClient({
  // Mirror the server's better-auth mount (see server/auth/betterAuth.ts):
  // keep baseURL ORIGIN-ONLY and fold BASE_PATH into basePath. better-auth's
  // client `withPath()` ignores basePath when baseURL carries a path, so
  // passing the full `env.URL` (which ends in `/kms`) would make signOut POST
  // to `${origin}/kms/sign-out` instead of `${origin}/kms/api/better-auth/sign-out`
  // → 404. Empty BASE_PATH (root-origin deploy) yields `/api/better-auth`.
  baseURL: new URL(env.URL).origin,
  basePath: `${env.BASE_PATH ?? ""}/api/better-auth`,
});

/**
 * Signs out the current better-auth session. Clears the session cookie.
 */
export async function signOutBetterAuth() {
  await betterAuthClient.signOut();
}
