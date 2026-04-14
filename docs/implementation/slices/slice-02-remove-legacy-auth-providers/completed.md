### Slice: slice-02-remove-legacy-auth-providers

**Date:** 2026-04-11

**What was built:**
- Removed all 6 legacy Passport.js-based auth plugins: Google, Slack, Azure, Discord, Email, OIDC
- Removed Passport.js infrastructure: middleware, utilities, OAuth base class, and 4 type definition files
- Removed 7 Passport.js packages from `package.json` (`@outlinewiki/koa-passport`, `passport`, `passport-google-oauth2`, `passport-oauth2`, `passport-slack-oauth2`, `@outlinewiki/passport-azure-ad-oauth2`, `@types/passport-oauth2`)
- Extracted `getTeamFromContext` and `parseState` to `server/utils/team.ts` (used by 5 core server files)
- Simplified `auth.config` API to return only `betterAuthProviders` (Microsoft SSO)
- Cleaned up frontend Login page: removed email sign-in flow, OTP form, OIDC auto-redirect, and legacy notice cases
- Simplified `AuthenticationProvider` component to button-only (no email form handling)

**Key decisions:**
- `getTeamFromContext` was extracted to its own module rather than deleted, since 5 non-auth files depend on it
- `AuthenticationHelper` class left intact — returns empty providers array (correct behavior after plugin deletion)
- `AuthenticationProvider` and `UserAuthentication` models left intact — tables still exist; data cleanup is out of scope
- Slack plugin non-auth features (API hooks, processor) deliberately removed — only Microsoft auth is needed for this KMS instance
- `GOOGLE_ALLOWED_DOMAINS` alias removed from `server/env.ts`; SMTP env vars kept (used for transactional emails, not auth)

**Files changed:**
- `server/utils/team.ts` (created) — extracted `getTeamFromContext` and `parseState`
- `server/routes/index.ts` — updated import to `@server/utils/team`
- `server/routes/app.ts` — updated import to `@server/utils/team`
- `server/routes/api/documents/documents.ts` — updated import to `@server/utils/team`
- `server/routes/api/shares/shares.ts` — updated import to `@server/utils/team`
- `server/routes/api/emojis/emojis.ts` — updated import to `@server/utils/team`
- `server/routes/auth/index.ts` — removed Passport.js init and provider router mounting
- `server/routes/api/auth/auth.ts` — removed legacy provider merging from `auth.config`
- `server/models/AuthenticationProvider.ts` — removed hardcoded plugin imports; simplified `oauthClient`
- `server/env.ts` — removed `GOOGLE_ALLOWED_DOMAINS` alias
- `server/presenters/index.ts` — removed `presentProviderConfig` export
- `server/presenters/providerConfig.ts` (deleted)
- `app/scenes/Login/Login.tsx` — removed email flow, OTP, OIDC auto-redirect
- `app/scenes/Login/components/AuthenticationProvider.tsx` — simplified to button-only
- `app/scenes/Login/components/Notices.tsx` — removed legacy notice cases
- `plugins/google/` (deleted)
- `plugins/slack/` (deleted)
- `plugins/azure/` (deleted)
- `plugins/discord/` (deleted)
- `plugins/email/` (deleted)
- `plugins/oidc/` (deleted)
- `server/middlewares/passport.ts` (deleted)
- `server/utils/passport.ts` (deleted)
- `server/utils/oauth.ts` (deleted)
- `server/utils/oauth.test.ts` (deleted)
- `server/typings/outlinewiki__koa-passport.d.ts` (deleted)
- `server/typings/passport-google-oauth2.d.ts` (deleted)
- `server/typings/passport-slack-oauth2.d.ts` (deleted)
- `server/typings/outlinewiki__passport-azure-ad-oauth2.d.ts` (deleted)
- `package.json` — removed 7 Passport.js packages
- `yarn.lock` — regenerated

**Known issues / tech debt:**
- `emailSigninEnabled` team preference remains in database/settings UI — no functional impact with email plugin removed
- `ValidateSSOAccessTask` becomes a no-op (oauthClient returns undefined) — future cleanup
- `No Icon registered for plugin {id: 'microsoft-better-auth'}` console warning — icon registration for Better Auth provider not yet implemented
- Lint fails due to pre-existing missing `.oxlintrc.json` config file — unrelated to this slice

**Dependencies for future slices:**
- `server/utils/team.ts` — new module providing `getTeamFromContext` and `parseState`, used by core routes
- `AuthenticationHelper.providersForTeam()` now returns empty array — any code depending on legacy providers will get no results
- `auth.config` API returns only `betterAuthProviders` array — frontend should only expect `authType: "betterAuth"` providers
