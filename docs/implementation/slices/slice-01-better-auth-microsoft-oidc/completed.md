### Slice: slice-01-better-auth-microsoft-oidc

**Date:** 2026-04-11

**What was built:**
- Installed and configured `better-auth` v1.2.8 as the authentication framework on the Koa.js backend
- Configured Microsoft Entra ID as the sole OIDC provider via `socialProviders.microsoft`
- Created Koa middleware bridge (`toNodeHandler`) mounted before body parser to handle `/api/better-auth/*` routes
- Implemented after-sign-in hook that provisions Outline users/teams via `accountProvisioner` with Sequelize transaction
- Added dual-mode authentication middleware: better-auth session validation first, falling back to existing JWT/API key validation
- Created frontend "Continue with Microsoft" button using direct `fetch()` POST to get OAuth URL + explicit redirect
- Integrated better-auth sign-out into the existing logout flow
- Added environment variables: `BETTER_AUTH_SECRET`, `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_TENANT_ID`
- Created database migration for `ba_user`, `ba_session`, `ba_account`, `ba_verification` tables

**Key decisions:**
- Used dynamic `import()` for better-auth (ESM-only) in the CJS build pipeline instead of `.mjs` wrapper files
- Used a hand-rolled `BetterAuthInstance` interface with runtime assertions instead of better-auth's complex generic return type (accepted fragility, see I5)
- Removed auto-redirect for better-auth providers — the social sign-in requires a POST, making synchronous auto-redirect impossible. Users must click the button.
- Used direct `fetch()` POST + `window.location.href` instead of `betterAuthClient.signIn.social()` for the login button — the client library's redirect plugin was unreliable
- Prefixed all better-auth tables with `ba_` to avoid conflicts with existing Outline tables
- Used camelCase column names in migration (matches better-auth v1.2.8 internal expectations, not the snake_case in the plan)
- Configured better-auth's pg Pool with `max: 5` connections to avoid pool exhaustion alongside Sequelize

**Files changed:**
- `server/auth/betterAuth.ts` (created) — better-auth instance configuration
- `server/auth/betterAuthHandler.ts` (created) — Koa middleware bridge
- `server/auth/betterAuthHooks.ts` (created) — after-sign-in hook for user provisioning
- `server/auth/betterAuthSession.ts` (created) — session validation helper
- `server/migrations/20260410000000-create-better-auth-tables.js` (created) — database migration
- `app/utils/betterAuthClient.ts` (created) — frontend better-auth client
- `server/env.ts` (modified) — added 4 environment variables
- `server/services/web.ts` (modified) — mounted better-auth handler before body parser
- `server/routes/api/auth/auth.ts` (modified) — added Microsoft provider to `auth.config` response
- `server/middlewares/authentication.ts` (modified) — dual-mode session validation
- `app/scenes/Login/Login.tsx` (modified) — no auto-redirect for better-auth providers
- `app/scenes/Login/components/AuthenticationProvider.tsx` (modified) — better-auth sign-in button handler
- `app/scenes/Login/urls.ts` (modified) — `getRedirectUrl` handles query params in authUrl
- `app/stores/AuthStore.ts` (modified) — calls `signOutBetterAuth()` on logout
- `package.json` (modified) — added `better-auth` dependency
- `shared/i18n/locales/en_US/translation.json` (modified) — added translation strings
- `yarn.lock` (modified) — lockfile update

**Known issues / tech debt:**
- `BetterAuthInstance` hand-rolled interface is fragile — will need updating if better-auth is upgraded (I5, accepted)
- Session hook runs on every session creation, not just sign-in — mitigated by early return for existing `outlineUserId` (N2, accepted)
- Lint check (`yarn lint`) fails due to pre-existing missing `.oxlintrc.json` — not introduced by this slice
- `_authType` prop in `AuthenticationProvider.tsx` is destructured but unused (click handler checks `id` instead)

**Dependencies for future slices:**
- `getBetterAuth()` from `server/auth/betterAuth.ts` — the singleton accessor for the better-auth instance
- `validateBetterAuthSession()` from `server/auth/betterAuthSession.ts` — used by the auth middleware for session validation
- `ba_user.outlineUserId` and `ba_session.outlineUserId` — the link between better-auth and Outline user records
- `signOutBetterAuth()` from `app/utils/betterAuthClient.ts` — called during logout
- Slice 2: Remove legacy auth plugins (Google, Slack, Azure, Discord, Email) and Passport.js dependencies
- Slice 3: Migrate custom JWT session system and implement subdomain-aware session sharing
