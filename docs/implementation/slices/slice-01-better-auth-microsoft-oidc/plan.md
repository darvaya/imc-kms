# Plan: Better Auth Core Setup + Microsoft OIDC Login

## 1. Goal

Replace Passport.js-based authentication with [better-auth](https://www.better-auth.com/) and configure Microsoft Entra ID as the sole OIDC login provider. After this slice, employees can sign in via Microsoft SSO through better-auth, sessions are managed by better-auth's cookie-based session system, and the existing Passport.js auth middleware supports dual-mode validation (better-auth sessions + legacy JWT fallback). Legacy JWT session migration is deferred to Slice 3; legacy provider removal is deferred to Slice 2.

## 2. Files to create / modify

| File path | Action | Purpose |
|-----------|--------|---------|
| `server/auth/betterAuth.ts` | Create | better-auth instance configuration with Microsoft provider, database, hooks, and custom fields. Uses dynamic `import()` to handle ESM-only package in CJS build. |
| `server/auth/betterAuthHandler.ts` | Create | Koa middleware that bridges better-auth's Node.js handler via `toNodeHandler` + `ctx.req`/`ctx.res` |
| `server/auth/betterAuthHooks.ts` | Create | After-sign-in hook: provisions Outline user/team via `accountProvisioner`, stores `outlineUserId` on better-auth session |
| `server/auth/betterAuthSession.ts` | Create | Helper to validate a better-auth session from Koa context, returns Outline user or null |
| `server/migrations/20260410000000-create-better-auth-tables.js` | Create | Sequelize migration to create `ba_user`, `ba_session`, `ba_account`, `ba_verification` tables |
| `app/utils/betterAuthClient.ts` | Create | Frontend better-auth client instance (`createAuthClient`) configured with `baseURL` and `genericOAuthClient` plugin |
| `server/env.ts` | Modify | Add environment variables: `BETTER_AUTH_SECRET`, `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_TENANT_ID` |
| `server/routes/auth/index.ts` | Modify | Mount better-auth handler before body parser (critical: body must not be pre-parsed) |
| `server/middlewares/authentication.ts` | Modify | Add dual-mode validation: try better-auth session first, fall back to existing JWT/API key validation |
| `server/routes/api/auth/auth.ts` | Modify | Extend `auth.config` response to include better-auth Microsoft provider when configured |
| `app/scenes/Login/Login.tsx` | Modify | Add Microsoft SSO button that uses better-auth client, preserve auto-redirect behavior for single-provider case |
| `app/scenes/Login/components/AuthenticationProvider.tsx` | Modify | Handle `betterAuth` provider type — call `authClient.signIn.social()` instead of navigating to `authUrl` |
| `package.json` | Modify | Add `better-auth` dependency |

## 3. Schema / data changes

### New database tables (via Sequelize migration)

All tables are prefixed with `ba_` to avoid conflicts with existing Outline tables.

**`ba_user`**
| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `VARCHAR(36)` | PK |
| `name` | `VARCHAR(255)` | NOT NULL |
| `email` | `VARCHAR(255)` | NOT NULL, UNIQUE |
| `email_verified` | `BOOLEAN` | NOT NULL, DEFAULT false |
| `image` | `TEXT` | NULLABLE |
| `outline_user_id` | `UUID` | NULLABLE, FK → `users.id` |
| `created_at` | `TIMESTAMP WITH TIME ZONE` | NOT NULL |
| `updated_at` | `TIMESTAMP WITH TIME ZONE` | NOT NULL |

**`ba_session`**
| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `VARCHAR(36)` | PK |
| `user_id` | `VARCHAR(36)` | NOT NULL, FK → `ba_user.id` ON DELETE CASCADE |
| `token` | `VARCHAR(255)` | NOT NULL, UNIQUE |
| `expires_at` | `TIMESTAMP WITH TIME ZONE` | NOT NULL |
| `ip_address` | `VARCHAR(45)` | NULLABLE |
| `user_agent` | `TEXT` | NULLABLE |
| `outline_user_id` | `UUID` | NULLABLE |
| `created_at` | `TIMESTAMP WITH TIME ZONE` | NOT NULL |
| `updated_at` | `TIMESTAMP WITH TIME ZONE` | NOT NULL |

**`ba_account`**
| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `VARCHAR(36)` | PK |
| `user_id` | `VARCHAR(36)` | NOT NULL, FK → `ba_user.id` ON DELETE CASCADE |
| `account_id` | `VARCHAR(255)` | NOT NULL |
| `provider_id` | `VARCHAR(255)` | NOT NULL |
| `access_token` | `TEXT` | NULLABLE |
| `refresh_token` | `TEXT` | NULLABLE |
| `access_token_expires_at` | `TIMESTAMP WITH TIME ZONE` | NULLABLE |
| `refresh_token_expires_at` | `TIMESTAMP WITH TIME ZONE` | NULLABLE |
| `scope` | `TEXT` | NULLABLE |
| `id_token` | `TEXT` | NULLABLE |
| `password` | `TEXT` | NULLABLE |
| `created_at` | `TIMESTAMP WITH TIME ZONE` | NOT NULL |
| `updated_at` | `TIMESTAMP WITH TIME ZONE` | NOT NULL |

**`ba_verification`**
| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `VARCHAR(36)` | PK |
| `identifier` | `VARCHAR(255)` | NOT NULL |
| `value` | `TEXT` | NOT NULL |
| `expires_at` | `TIMESTAMP WITH TIME ZONE` | NOT NULL |
| `created_at` | `TIMESTAMP WITH TIME ZONE` | NOT NULL |
| `updated_at` | `TIMESTAMP WITH TIME ZONE` | NOT NULL |

### No changes to existing Outline tables

Existing `users`, `teams`, `authentication_providers`, `user_authentications` tables remain unchanged. The link between better-auth and Outline is via `ba_user.outline_user_id` and `ba_session.outline_user_id`.

## 4. API endpoints

### Endpoints managed by better-auth (mounted at `/api/better-auth/*`)

| Method | Path | Purpose | Auth |
|--------|------|---------|------|
| `GET` | `/api/better-auth/sign-in/social?provider=microsoft` | Initiates Microsoft OIDC flow, redirects to Microsoft login | None |
| `GET` | `/api/better-auth/callback/microsoft` | Handles Microsoft OIDC callback, creates session, redirects to app | None (OAuth callback) |
| `POST` | `/api/better-auth/sign-out` | Destroys better-auth session, clears session cookie | Session cookie |
| `GET` | `/api/better-auth/get-session` | Returns current session + user info | Session cookie |

These endpoints are fully managed by better-auth's internal router. We do not write handler code for them.

### Modified existing endpoint

| Method | Path | Change | Auth |
|--------|------|--------|------|
| `POST` | `/api/auth.config` | Add Microsoft better-auth provider to `providers` array when `MICROSOFT_CLIENT_ID` is configured | None |

The provider entry added to `auth.config` response:

```
{
  id: "microsoft-better-auth",
  name: "Microsoft",
  authUrl: "/api/better-auth/sign-in/social?provider=microsoft",
  type: "betterAuth"
}
```

The `type: "betterAuth"` field tells the frontend to use the better-auth client for sign-in instead of direct navigation.

## 5. Components & UI

### `app/utils/betterAuthClient.ts` (new)

- Exports a `betterAuthClient` instance created via `createAuthClient` from `better-auth/client`
- Configured with `baseURL` pointing to the app origin
- Includes `genericOAuthClient` plugin (needed if using genericOAuth server-side; not needed for `socialProviders.microsoft`)
- Exports a `signInWithMicrosoft()` helper that calls `betterAuthClient.signIn.social({ provider: "microsoft", callbackURL: "/home" })`

### `app/scenes/Login/components/AuthenticationProvider.tsx` (modify)

- Current: all providers navigate to `authUrl` via `window.location.href = getRedirectUrl(authUrl)`
- Change: if `provider.id === "microsoft-better-auth"`, use a direct `fetch()` POST to `/api/better-auth/sign-in/social` to get the OAuth URL, then redirect via `window.location.href = data.url`
- Falls back to direct `authUrl` navigation on fetch error
- The button appearance remains the same (icon + "Continue with Microsoft" label)
- Does NOT use the better-auth client library (`betterAuthClient.signIn.social()`) as its internal redirect plugin is unreliable in this context

### `app/scenes/Login/Login.tsx` (modify)

- No auto-redirect for better-auth providers (unlike OIDC which uses synchronous `window.location.href`)
- The better-auth social sign-in requires a POST (not GET), making synchronous auto-redirect impossible
- Users must click the "Continue with Microsoft" button to initiate login
- The `logout` and `notice` query params continue to suppress auto-redirect for OIDC providers

### Logout flow

- The existing logout action (`app/stores/AuthStore.ts` or equivalent) needs to also call `betterAuthClient.signOut()` to clear the better-auth session cookie
- The `?logout=true` query param on the login page prevents auto-redirect (existing behavior preserved)

## 6. Implementation order

### Phase A: Foundation (server-side setup)

1. **Add `better-auth` to `package.json`** and install
2. **Add environment variables to `server/env.ts`**: `BETTER_AUTH_SECRET`, `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_TENANT_ID` — all with `@IsOptional()` decorator and validation
3. **Create database migration** (`server/migrations/20260410000000-create-better-auth-tables.js`): creates `ba_user`, `ba_session`, `ba_account`, `ba_verification` tables with all columns and indexes
4. **Run migration** to verify tables are created correctly

### Phase B: better-auth configuration

5. **Create `server/auth/betterAuth.ts`**: Initialize better-auth with dynamic `import()` pattern. Configure:
   - Database: `pg.Pool` using `DATABASE_URL` from env (same Postgres DB, different tables via `modelName` mapping)
   - `socialProviders.microsoft` with `clientId`, `clientSecret`, `tenantId` from env
   - `basePath: "/api/better-auth"` to avoid route conflicts
   - Custom fields on `user` and `session` schemas (`outlineUserId`)
   - Table name mapping: `user` → `ba_user`, `session` → `ba_session`, `account` → `ba_account`, `verification` → `ba_verification`
   - `BETTER_AUTH_SECRET` as the auth secret
6. **Create `server/auth/betterAuthHooks.ts`**: After-sign-in hook that:
   - Extracts email, name, avatar from the better-auth user
   - Calls `accountProvisioner` with Microsoft provider data to create/find Outline user + team
   - Updates `ba_user.outline_user_id` and `ba_session.outline_user_id` with the Outline user's ID
   - Creates `AuthenticationProvider` record for the team if it doesn't exist
7. **Create `server/auth/betterAuthHandler.ts`**: Koa middleware that:
   - Checks if request path starts with `/api/better-auth`
   - Sets `ctx.respond = false` to prevent Koa from handling the response
   - Passes `ctx.req` and `ctx.res` to better-auth's `toNodeHandler`
   - Waits for the response to finish via a Promise wrapping `ctx.res.on('finish')`

### Phase C: Auth middleware integration

8. **Create `server/auth/betterAuthSession.ts`**: Helper function `validateBetterAuthSession(ctx)` that:
   - Calls `auth.api.getSession({ headers: fromNodeHeaders(ctx.req.headers) })`
   - If session exists and has `outlineUserId`, loads the Outline `User` model by ID (with team relation)
   - Returns `{ user, token, type: "BETTER_AUTH" }` or `null`
9. **Modify `server/middlewares/authentication.ts`**:
   - At the top of the `auth()` middleware, before existing token parsing, call `validateBetterAuthSession(ctx)`
   - If a valid better-auth session is found, attach the Outline user to `ctx.state.auth` and proceed (skip JWT/API key validation)
   - If no better-auth session, fall through to existing JWT/API key validation (backward compatible)
   - This dual-mode ensures existing sessions continue working until Slice 3

### Phase D: Route mounting

10. **Modify `server/routes/auth/index.ts`**:
    - Import the better-auth Koa handler
    - Mount it BEFORE `bodyParser()` middleware (critical: better-auth must parse its own request bodies)
    - The handler only intercepts `/api/better-auth/*` paths; all other paths fall through to existing routes
11. **Modify `server/routes/api/auth/auth.ts`**:
    - In the `auth.config` handler, check if `MICROSOFT_CLIENT_ID` is configured
    - If so, add a Microsoft provider entry to the `providers` array with `type: "betterAuth"` and `authUrl: "/api/better-auth/sign-in/social?provider=microsoft"`

### Phase E: Frontend

12. **Create `app/utils/betterAuthClient.ts`**: better-auth client with `signInWithMicrosoft()` and `signOut()` helpers
13. **Modify `app/scenes/Login/components/AuthenticationProvider.tsx`**: Handle `type === "betterAuth"` — call better-auth client's sign-in instead of URL navigation
14. **Modify `app/scenes/Login/Login.tsx`**: Add auto-redirect logic for single better-auth Microsoft provider (parallel to existing OIDC auto-redirect)

### Phase F: Logout

15. **Integrate better-auth signOut**: Ensure the logout flow calls `betterAuthClient.signOut()` to clear the better-auth session cookie, then redirects to `/login?logout=true` to prevent auto-redirect loop

## 7. Manual test walkthrough

### Prerequisites
- Set environment variables: `BETTER_AUTH_SECRET` (32+ char random string), `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_TENANT_ID`
- Register the callback URL in Azure Entra ID: `https://<app-host>/api/better-auth/callback/microsoft`
- Run database migrations: `yarn db:migrate`

### Test 1: Login with Microsoft SSO
1. Navigate to the login page (`/login`)
2. Verify a "Continue with Microsoft" button appears
3. Click the button
4. Verify redirect to Microsoft's login page
5. Sign in with a company Microsoft account
6. Verify redirect back to the app (to `/home` or default collection)
7. Verify you are authenticated: user name/avatar visible, can access documents

### Test 2: Session persistence
1. After successful login (Test 1), close the browser tab
2. Open a new tab, navigate to the app
3. Verify you are still authenticated (session cookie is valid)
4. Check that API requests succeed (no 401 errors)

### Test 3: First-time user provisioning
1. Sign in with a Microsoft account that has never been used with this app
2. Verify a new user is created in the Outline `users` table
3. Verify the user is associated with the correct team
4. Verify the "Welcome" collection is created with onboarding documents

### Test 4: Logout
1. While logged in, trigger logout (via user menu → "Log out")
2. Verify redirect to `/login?logout=true`
3. Verify the login page does NOT auto-redirect back to Microsoft
4. Verify API requests now return 401
5. Verify the better-auth session cookie is cleared

### Test 5: Existing JWT sessions still work (backward compatibility)
1. Before this change: log in via the old auth system to get a JWT session
2. After deploying this change: verify the JWT session still works
3. API requests with the old JWT token should still authenticate successfully
4. This confirms the dual-mode auth middleware works

### Test 6: Unauthenticated access
1. Open an incognito/private browser window
2. Navigate to a document URL directly
3. Verify redirect to the login page
4. Verify API requests return 401

### Test 7: Single provider login page
1. Configure only the Microsoft better-auth provider (no other providers enabled)
2. Navigate to `/login`
3. Verify the login page shows with the "Continue with Microsoft" button (no auto-redirect — better-auth requires POST, not GET)
4. Click the button and verify redirect to Microsoft login

## 8. Risks & open questions

### ESM compatibility (HIGH RISK)
better-auth is ESM-only. The project uses Babel to compile TypeScript to CJS. The plan uses dynamic `import()` to load better-auth, which Babel preserves as-is. **Risk**: If the Babel pipeline transforms `import()` to `require()` (unlikely with `@babel/preset-env` targeting Node 20, but possible), this approach will fail. **Mitigation**: Test the dynamic import in isolation before building the full integration. Fallback: create a thin `.mjs` wrapper file that re-exports better-auth and is loaded via `import()`.

### Body parser conflict (MEDIUM RISK)
better-auth must receive unparsed request bodies. The Koa app uses `koa-body` for body parsing. **Mitigation**: Mount the better-auth handler BEFORE the body parser middleware in the route chain, and only for `/api/better-auth/*` paths.

### Database coexistence (LOW RISK)
better-auth uses Kysely (via `pg.Pool`) while Outline uses Sequelize. Both connect to the same PostgreSQL database but manage different tables. **Risk**: Connection pool exhaustion if both create large pools. **Mitigation**: Configure better-auth's pool with a modest `max` (e.g., 3-5 connections) since auth operations are infrequent compared to app queries.

### Account provisioner integration (MEDIUM RISK)
The after-sign-in hook must call `accountProvisioner` which expects an `APIContext` parameter. The hook runs inside better-auth's context, not a Koa request context. **Risk**: Missing context fields (transaction, IP, etc.) needed by accountProvisioner. **Mitigation**: Construct a minimal context object in the hook with the required fields, or extract the core provisioning logic into a context-free function.

### better-auth session cookie vs. Outline JWT cookie (LOW RISK)
Both systems set cookies. better-auth's session cookie (default name: `better-auth.session_token`) is distinct from Outline's `accessToken` cookie. They should not conflict. **Mitigation**: Verify cookie names don't collide; configure better-auth's cookie name explicitly if needed.

### Subdomain-aware sessions (DEFERRED — Slice 3)
Outline supports team-specific subdomains. The current auth system uses "transfer tokens" to share sessions across subdomains. better-auth's session cookie is domain-scoped. **Risk**: If the app uses subdomains, better-auth sessions won't work across them. **Mitigation**: For self-hosted single-team deployments (the target for this slice), subdomains are typically not used. Full subdomain support is deferred to Slice 3.

### Open question: better-auth version pinning
The plan assumes better-auth v1.6.x API. The library is actively developed. Pin to a specific version in package.json to avoid breaking changes.

### Open question: PKCE support
Microsoft Entra ID supports PKCE (Proof Key for Code Exchange). better-auth's `socialProviders.microsoft` should handle this automatically. Verify during implementation that the OAuth flow uses PKCE for added security.
