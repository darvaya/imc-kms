# Plan: slice-01-credentials-login

**Spec:** [`spec.md`](./spec.md) · **Status:** Approved · **Module:** auth

## Approach

One toggle drives everything: `microsoftSsoEnabled = !!(env.MICROSOFT_CLIENT_ID && env.MICROSOFT_CLIENT_SECRET)`.
- `microsoftSsoEnabled === true` → Microsoft social provider on, `emailAndPassword` off, login page shows only the Microsoft button. (Production, unchanged behavior.)
- `microsoftSsoEnabled === false` → no social provider, `emailAndPassword: { enabled: true, disableSignUp: true }`, login page shows an email/password form. Better Auth still requires only `BETTER_AUTH_SECRET` + a database.

A credential login must resolve to an Outline user, so two existing Microsoft-only assumptions get generalized: the session→user bridge (`betterAuthSession.ts`) and the provisioning hook (`betterAuthHooks.ts`).

## File-by-file

### 1. `server/auth/betterAuth.ts` — conditional providers, no hard throw
- Compute `const microsoftSsoEnabled = !!(env.MICROSOFT_CLIENT_ID && env.MICROSOFT_CLIENT_SECRET);` before `betterAuth({...})`.
- **Remove** the throw at lines 98-102 (`MICROSOFT_CLIENT_ID … required`). Keep the `BETTER_AUTH_SECRET` and database throws.
- `socialProviders: microsoftSsoEnabled ? { microsoft: { clientId, clientSecret, tenantId } } : undefined`.
- Add `emailAndPassword: microsoftSsoEnabled ? { enabled: false } : { enabled: true, disableSignUp: true }`.
- Update the final `Logger.info` to state the active mode (`"Microsoft OIDC"` vs `"email/password credentials (Entra not configured)"`).
- `betterAuth` is imported dynamically already; no other change.

### 2. `server/auth/betterAuthSession.ts` — don't require Microsoft for session resolution
- Both `validateBetterAuthSession` (line 24) and `validateBetterAuthSessionFromHeaders` (line 77): change the guard `if (!env.BETTER_AUTH_SECRET || !env.MICROSOFT_CLIENT_ID)` → `if (!env.BETTER_AUTH_SECRET)`. Better Auth is now configured whenever the secret is present, regardless of provider. (`validateBetterAuthSessionFromToken` has no such guard — leave it.)

### 3. `server/auth/betterAuthHooks.ts` — provision/link for credential logins
- Generalize the account lookup: `const account = accounts.find(a => a.providerId === "microsoft") ?? accounts.find(a => a.providerId === "credential") ?? accounts[0];`
- Replace `microsoftAccount` references with `account`; guard `if (!account) return;` (keep the existing warn log, reworded).
- In `accountProvisioner(...)`, set `authenticationProvider: { name: account.providerId, providerId: account.providerId }` and `authentication.scopes: account.scope ? account.scope.split(" ") : ["email"]` (credential accounts carry no OAuth scope). Tokens stay optional (undefined for credential).
- `trackSignIn(..., account.providerId)` unchanged in shape.
- The existing-link short-circuit (lines 42-54) already works for the seed path.

### 4. `server/routes/api/auth/auth.ts` — advertise the credential provider
- In `auth.config`, keep the Microsoft push under `if (env.MICROSOFT_CLIENT_ID)`. Add an `else if (env.BETTER_AUTH_SECRET)` branch pushing:
  `{ id: "email-better-auth", name: "Email", authUrl: "/api/better-auth/sign-in/email", authType: "credential" }`.
- No other change; every response path already spreads `betterAuthProviders`.

### 5. `app/scenes/Login/components/AuthenticationProvider.tsx` — render the form
- When `authType === "credential"` (id `email-better-auth`): render an email + password `<form>` (Outline `Input` + `ButtonLarge`) instead of the social button. On submit:
  - `fetch(urlWithBasePath("/api/better-auth/sign-in/email"), { method: "POST", headers: {"Content-Type":"application/json"}, credentials: "include", body: JSON.stringify({ email, password }) })`.
  - On `res.ok`: `window.location.href = urlWithBasePath("/home")` (full reload so `auth.info` re-fetches with the new cookie).
  - On failure: show an inline error ("Incorrect email or password").
- Keep the existing Microsoft branch (`id === "microsoft-better-auth"`) untouched. This preserves the current button rendering for all non-credential providers.

### 6. `server/scripts/seed-test-admin.ts` (new) — dev fixture
- Guard: if `env.MICROSOFT_CLIENT_ID` is set, refuse (`credentials login is disabled when Entra is configured`) and exit non-zero.
- Constants: `EMAIL = "kms-test-admin@kms.local"`, `PASSWORD = "KmsTestAdmin123!"`, `NAME = "KMS Test Admin"` (obvious dev identifiers per Data Rules).
- Idempotent: look up `ba_user` by email. If absent, insert a `ba_user` (`id` = uuid, emailVerified true, no `outlineUserId`) + a `ba_account` (`providerId: "credential"`, `accountId` = the ba_user id, `password` = `await (await import("better-auth/crypto")).hashPassword(PASSWORD)`) via `sequelize.query`. If present, re-hash + update the password so the script is re-runnable.
- Print the email + password + a "dev-only; the first login provisions the Outline admin" note.
- Uses `@server/storage/database` `sequelize` and `@server/env`; mirrors the existing `server/scripts/*.ts` pattern (compiled by `yarn build` to `build/server/scripts/seed-test-admin.js`).

### 7. `package.json` — run the seed
- Add script: `"seed:test-admin": "node ./build/server/scripts/seed-test-admin.js"`.

### 8. `.env.example` — document the toggle
- Under the auth section: note that leaving `MICROSOFT_CLIENT_ID`/`MICROSOFT_CLIENT_SECRET` empty enables the email/password login box (dev/testing), that `yarn seed:test-admin` mints a test account, and that setting them switches to Microsoft-only.

## AC → verification map

| AC | Verified by |
|---|---|
| AC1 boots without Entra | Start server with Entra empty; no throw. Jest: `getBetterAuth()` resolves when only `BETTER_AUTH_SECRET` set (mock env). |
| AC2 form shown when Entra off | `auth.config` returns the `email-better-auth` provider (server unit test); manual: form visible. |
| AC3 Microsoft-only when Entra on | `auth.config` returns only `microsoft-better-auth`; no `email-better-auth`; `emailAndPassword.enabled === false`. Unit test both branches. |
| AC4 credential login → app | Manual test script steps 4–5 (seed + sign in), hook provisions Outline user. |
| AC5 no public sign-up | `disableSignUp: true`; manual curl step 6 returns error. |
| AC6 session resolves without Microsoft | `betterAuthSession` guard no longer references `MICROSOFT_CLIENT_ID`; credential session resolves to Outline user (manual step 5). |

## Risks / watch-items
- **CSP**: login form posts same-origin; `connectSrc: "*"` in `csp.ts` already allows it. No CSP change.
- **Sub-path**: all fetch/redirect URLs must use `urlWithBasePath` (Hard Rule 1). Redirect target `/home` → `${BASE_PATH}/home`.
- **Hook silent failure**: `afterSignInHook` swallows errors; if provisioning fails the user logs in but `outlineUserId` stays null → appears unauthenticated. Verify the credential branch actually provisions (the /verify step drives a real login).
- **first-user-is-admin**: the seeded credential user becomes admin only if it's the first user of a new team (Outline default). Acceptable for a fresh-DB fixture; documented in the seed output.
- **`emailAndPassword` disable shape**: the installed Better Auth is **1.2.8** (not 1.6.x). Verified in 1.2.8 that `emailAndPassword: undefined` (omitted) leaves `/sign-in/email` disabled and `disableSignUp: true` blocks `/sign-up/email`. The implementation omits the key entirely when Entra is on (`microsoftSsoEnabled ? undefined : {...}`).
