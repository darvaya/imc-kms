# Plan: Remove Legacy Auth Providers & Cleanup

## 1. Goal

Remove all six legacy Passport.js-based authentication providers (Google, Slack, Azure, Discord, Email, OIDC) and all Passport.js infrastructure from the codebase. After this slice, Microsoft OIDC via Better Auth (established in Slice 1) is the sole authentication path. No Passport.js code or dependencies remain.

## 2. Files to create / modify

| File path | Action | Purpose |
|-----------|--------|---------|
| `server/utils/team.ts` | **Create** | Relocate `getTeamFromContext` and `parseState` from `passport.ts` (used by 5 core server files) |
| `server/routes/index.ts` | Modify | Update import: `getTeamFromContext` from `@server/utils/team` |
| `server/routes/app.ts` | Modify | Update import: `getTeamFromContext` from `@server/utils/team` |
| `server/routes/api/documents/documents.ts` | Modify | Update import: `getTeamFromContext` from `@server/utils/team` |
| `server/routes/api/shares/shares.ts` | Modify | Update import: `getTeamFromContext` from `@server/utils/team` |
| `server/routes/api/emojis/emojis.ts` | Modify | Update import: `getTeamFromContext` from `@server/utils/team` |
| `server/routes/auth/index.ts` | Modify | Remove Passport.js init and provider router mounting; keep `/auth/redirect` |
| `server/routes/api/auth/auth.ts` | Modify | Remove legacy provider merging from `auth.config`; only return `betterAuthProviders` |
| `server/models/AuthenticationProvider.ts` | Modify | Remove hardcoded plugin imports; simplify `oauthClient` getter |
| `server/env.ts` | Modify | Remove `GOOGLE_ALLOWED_DOMAINS` alias from `ALLOWED_DOMAINS` |
| `server/presenters/index.ts` | Modify | Remove `presentProviderConfig` export |
| `app/scenes/Login/Login.tsx` | Modify | Remove email sign-in flow, OIDC auto-redirect, related state/imports |
| `app/scenes/Login/components/AuthenticationProvider.tsx` | Modify | Remove email provider handling; simplify to button-only component |
| `app/scenes/Login/components/Notices.tsx` | Modify | Remove legacy provider-specific notices |
| `package.json` | Modify | Remove 7 Passport.js packages |
| `yarn.lock` | Modify | Regenerated after package removal |
| `plugins/google/` | **Delete** | Remove Google auth plugin (entire directory) |
| `plugins/slack/` | **Delete** | Remove Slack auth plugin (entire directory) |
| `plugins/azure/` | **Delete** | Remove Azure auth plugin (entire directory) |
| `plugins/discord/` | **Delete** | Remove Discord auth plugin (entire directory) |
| `plugins/email/` | **Delete** | Remove Email auth plugin (entire directory) |
| `plugins/oidc/` | **Delete** | Remove OIDC auth plugin (entire directory) |
| `server/middlewares/passport.ts` | **Delete** | Remove Passport middleware factory |
| `server/utils/passport.ts` | **Delete** | Remove Passport utility (after extracting `getTeamFromContext`) |
| `server/utils/oauth.ts` | **Delete** | Remove OAuthClient base class (only used by deleted plugins) |
| `server/presenters/providerConfig.ts` | **Delete** | Remove provider config presenter (no longer used) |
| `server/typings/outlinewiki__koa-passport.d.ts` | **Delete** | Remove Passport type definitions |
| `server/typings/passport-google-oauth2.d.ts` | **Delete** | Remove Google OAuth type definitions |
| `server/typings/passport-slack-oauth2.d.ts` | **Delete** | Remove Slack OAuth type definitions |
| `server/typings/outlinewiki__passport-azure-ad-oauth2.d.ts` | **Delete** | Remove Azure OAuth type definitions |

## 3. Schema / data changes

**None.** No database migrations in this slice. The `authentication_providers` and `user_authentications` tables remain untouched (data cleanup is out of scope per spec).

## 4. API endpoints

No new endpoints. One endpoint modified:

| Method | Path | Change |
|--------|------|--------|
| POST | `/api/auth.config` | Remove legacy provider entries from `providers` array. Only `microsoft-better-auth` returned when `MICROSOFT_CLIENT_ID` is configured. Response shape unchanged. |

## 5. Components & UI

### `Login.tsx` changes
- Remove `emailLinkSentTo` state, `handleReset`, `handleEmailSuccess` callbacks
- Remove `forceOTP` query param reading, `preferOTP` computed value
- Remove email link sent / OTP form UI block (lines 221-272)
- Remove OIDC auto-redirect block (lines 274-284)
- Remove `onEmailSuccess` and `preferOTP` props from `<AuthenticationProvider>` instances
- Remove unused imports: `EmailIcon`, `OneTimePasswordInput`, `isPWA`
- Remove unused styled components: `Form`, `CheckEmailIcon`

### `AuthenticationProvider.tsx` changes
- Remove `onEmailSuccess`, `preferOTP` from Props type
- Remove `AuthState` type, `authState`, `email` state, `isSubmitting` state
- Remove `handleChangeEmail`, `handleSubmitEmail` handlers
- Remove entire `if (id === "email")` block (renders email form)
- Remove `_authType` from destructuring
- Remove unused imports: `EmailIcon`, `InputLarge`, `client` from ApiClient
- Remove unused styled components: `Wrapper`, `Form`
- Component becomes: a button that handles microsoft-better-auth (POST) or generic redirect

### `Notices.tsx` changes
- Remove `"gmail-account-creation"` case
- Remove `"email-auth-required"` and `"email-auth-ratelimit"` cases

## 6. Implementation order

### Phase 1: Extract `getTeamFromContext` (prerequisite for safe deletion)

1. Create `server/utils/team.ts` with `getTeamFromContext` and `parseState` functions extracted from `server/utils/passport.ts` (with their necessary imports: `Context` from koa, `parseDomain`, `env`, `Team`)
2. Update the 5 consumer files to import from `@server/utils/team` instead of `@server/utils/passport`:
   - `server/routes/index.ts`
   - `server/routes/app.ts`
   - `server/routes/api/documents/documents.ts`
   - `server/routes/api/shares/shares.ts`
   - `server/routes/api/emojis/emojis.ts`

**Verify**: `yarn build` succeeds; grep for `from "@server/utils/passport"` returns only plugin files and `server/middlewares/passport.ts`

### Phase 2: Remove Passport.js from auth routes

3. Modify `server/routes/auth/index.ts`:
   - Remove `import passport from "@outlinewiki/koa-passport"`
   - Remove `import AuthenticationHelper from "@server/models/helpers/AuthenticationHelper"`
   - Remove `router.use(passport.initialize())`
   - Remove the entire async IIFE that mounts provider routers (lines 19-31)
   - **KEEP** the `/auth/redirect` GET endpoint (critical for better-auth callback flow)

**Verify**: `yarn build` succeeds

### Phase 3: Update server API layer

4. Modify `server/routes/api/auth/auth.ts`:
   - Remove `AuthenticationHelper` import
   - Remove `presentProviderConfig` from the presenters import
   - In all 4 response branches, remove `...AuthenticationHelper.providersForTeam(team).map(presentProviderConfig)` spreads
   - Providers arrays now contain only `...betterAuthProviders`

5. Modify `server/models/AuthenticationProvider.ts`:
   - Remove lines 29-31: `import AzureClient`, `import GoogleClient`, `import OIDCClient`
   - Simplify `oauthClient` getter to return `undefined` (remove the switch statement)

6. Remove `presentProviderConfig` from `server/presenters/index.ts` export
7. Delete `server/presenters/providerConfig.ts`
8. Modify `server/env.ts` line 350: remove `?? environment.GOOGLE_ALLOWED_DOMAINS` fallback

**Verify**: `yarn build` succeeds

### Phase 4: Update frontend

9. Modify `app/scenes/Login/components/AuthenticationProvider.tsx` — remove email handling:
   - Remove Props: `onEmailSuccess`, `preferOTP`
   - Remove state: `authState`, `isSubmitting`, `email`
   - Remove handlers: `handleChangeEmail`, `handleSubmitEmail`
   - Remove the `if (id === "email")` block
   - Remove `_authType` and `onEmailSuccess` from destructuring
   - Remove unused imports and styled components

10. Modify `app/scenes/Login/Login.tsx` — remove email flow and OIDC redirect:
    - Remove state: `emailLinkSentTo`, `forceOTP`, `preferOTP`
    - Remove handlers: `handleReset`, `handleEmailSuccess`
    - Remove the `emailLinkSentTo` UI block (email sent / OTP form)
    - Remove the OIDC auto-redirect block
    - Remove `onEmailSuccess={handleEmailSuccess}` and `preferOTP={preferOTP}` from `<AuthenticationProvider>` props
    - Remove unused imports: `EmailIcon`, `OneTimePasswordInput`, `isPWA`
    - Remove unused styled components: `Form`, `CheckEmailIcon`

11. Modify `app/scenes/Login/components/Notices.tsx` — remove legacy notices:
    - Remove `"gmail-account-creation"` case
    - Remove `"email-auth-required"` case
    - Remove `"email-auth-ratelimit"` case

**Verify**: `yarn build` succeeds; login page renders only Microsoft SSO button

### Phase 5: Delete plugin directories and Passport infrastructure

12. Delete 6 plugin directories: `plugins/google/`, `plugins/slack/`, `plugins/azure/`, `plugins/discord/`, `plugins/email/`, `plugins/oidc/`
13. Delete `server/middlewares/passport.ts`
14. Delete `server/utils/passport.ts`
15. Delete `server/utils/oauth.ts`
16. Delete 4 type definition files:
    - `server/typings/outlinewiki__koa-passport.d.ts`
    - `server/typings/passport-google-oauth2.d.ts`
    - `server/typings/passport-slack-oauth2.d.ts`
    - `server/typings/outlinewiki__passport-azure-ad-oauth2.d.ts`

**Verify**: `yarn build` succeeds; no dangling imports

### Phase 6: Remove Passport packages

17. Remove from `package.json` dependencies:
    - `@outlinewiki/koa-passport`
    - `@outlinewiki/passport-azure-ad-oauth2`
    - `passport`
    - `passport-google-oauth2`
    - `passport-oauth2`
    - `passport-slack-oauth2`
18. Remove from `package.json` devDependencies:
    - `@types/passport-oauth2`
19. Run `yarn install` to regenerate `yarn.lock`

**Verify**: `yarn install` succeeds; `yarn build` succeeds

## 7. Manual test walkthrough

1. **Start the application**: `yarn dev` — should start without errors
2. **Visit the login page** (`/`):
   - Should show only the "Continue with Microsoft" button
   - No email form, no Google/Slack/Azure/Discord/OIDC buttons
   - No OIDC auto-redirect behavior
3. **Check auth.config API**: `curl -X POST http://localhost:3000/api/auth.config`
   - Response `data.providers` should contain exactly one entry: `{ id: "microsoft-better-auth", name: "Microsoft", authUrl: "/api/better-auth/sign-in/social?provider=microsoft", authType: "betterAuth" }`
4. **Sign in with Microsoft**: Click "Continue with Microsoft" → complete OAuth flow → should be redirected to workspace home
5. **Verify `/auth/redirect`**: After Microsoft OAuth callback, the flow redirects through `/auth/redirect` which sets the JWT cookie — confirm the cookie is set and the redirect lands correctly
6. **Check admin settings**: Navigate to Settings > Authentication — should show no legacy providers (empty list is expected)
7. **Check notice URLs**: Visit `/?notice=auth-error` — should display generic error message; `/?notice=gmail-account-creation` should fall through to default "unknown error" message

## 8. Risks & open questions

| Risk | Severity | Mitigation |
|------|----------|------------|
| `getTeamFromContext` extraction breaks team resolution in core routes | High | Phase 1 is isolated with its own build verification before proceeding |
| Removing `/auth/redirect` accidentally (it's in the same file as Passport init) | High | Plan explicitly preserves this endpoint; dual-mode auth middleware validates better-auth sessions |
| `ValidateSSOAccessTask` encounters legacy `UserAuthentication` rows with no `oauthClient` | Low | `oauthClient` returns `undefined`; `UserAuthentication.validateAccess()` line 114 guards with `if (client)` — silently passes validation |
| Slack plugin has non-auth features (API hooks, processor) being removed | Low | Deliberate: this KMS instance only needs Microsoft auth; Slack integration is unused |
| `emailSigninEnabled` team preference remains in database/settings UI | Low | Out of scope (data cleanup); field has no functional impact with email plugin removed |

### Deliberately unchanged (out of scope)

- `AuthenticationHelper` class — returns empty providers array (correct behavior after plugin deletion)
- `AuthenticationProvider` and `UserAuthentication` models — tables still exist; models are functional
- `ValidateSSOAccessTask` — becomes a no-op; removal is future cleanup
- `server/routes/api/authenticationProviders/` admin API — returns empty list (correct)
- `server/utils/authentication.ts` — `signIn` function used by installation route; no Passport dependency
- `PluginManager` and `Hook.AuthProvider` enum — other hook types still used; AuthProvider type is inert
- SMTP env vars — used for transactional emails (invites, notifications), not auth
- Migration files referencing `GOOGLE_ALLOWED_DOMAINS` — migrations are historical records
