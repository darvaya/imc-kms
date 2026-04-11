import { createAuthClient } from "better-auth/client";
import env from "~/env";

export const betterAuthClient = createAuthClient({
  baseURL: env.URL,
});

/**
 * Signs out the current better-auth session. Clears the session cookie.
 */
export async function signOutBetterAuth() {
  await betterAuthClient.signOut();
}
