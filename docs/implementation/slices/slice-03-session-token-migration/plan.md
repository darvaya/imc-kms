# Plan: Slice 03 — Session & Token Migration

## 1. Goal

Replace Outline's custom JWT session system with Better Auth's built-in session management. After this slice, the auth middleware validates sessions exclusively through Better Auth (plus API keys and OAuth tokens), the legacy `signIn()` flow and transfer token mechanism are removed, and ancillary consumers (websockets, collaboration server, sign-out, SSO validation task) use Better Auth sessions or scoped-down JWT utilities for non-session purposes only. The `jwtSecret` field remains on the User model for non-session uses (collaboration tokens, email-update tokens, delete confirmation codes) but is no longer involved in session validation.

## 2. Files to create / modify

| File path | Action | Purpose |
|-----------|--------|---------|
| `server/auth/betterAuth.ts` | modify | Extend `BetterAuthInstance` interface with `revokeSession`, `revokeSessions`, `deleteSessions`, and `listSessions` APIs; add `signOut` to the interface |
| `server/auth/betterAuthSession.ts` | modify | Add `validateBetterAuthSessionFromHeaders()` that works with raw Node `IncomingHttpHeaders` (for websocket auth) |
| `server/auth/betterAuthHooks.ts` | modify | Add sign-in tracking: call `user.updateSignedIn()` and create `users.signin` event in the after-session-create hook |
| `server/middlewares/authentication.ts` | modify | Remove JWT fallback from `validateAuthentication()` — only Better Auth sessions + API keys + OAuth tokens remain |
| `server/utils/jwt.ts` | modify | Remove `getUserForJWT()` and `getUserForEmailSigninToken()`. Keep `getJWTPayload()` and `getDetailsForEmailUpdateToken()`. Add `getUserForCollaborationToken()` (extracted from former `getUserForJWT`, restricted to `"collaboration"` type only) |
| `server/utils/authentication.ts` | modify | Remove `signIn()` function and `getSessionsInCookie()` function entirely |
| `server/routes/auth/index.ts` | modify | Remove the `/auth/redirect` route (transfer token consumer); replace with a simple redirect to `/home` or keep the file minimal |
| `server/routes/api/auth/auth.ts` | modify | Update `auth.info` to remove `getSessionsInCookie` dependency; update `auth.delete` to revoke Better Auth session instead of rotating JWT + clearing `accessToken` cookie |
| `server/routes/api/teams/teams.ts` | modify | Remove `getTransferToken()` call from `teams.create`; return team URL directly |
| `server/services/websockets.ts` | modify | Replace `getUserForJWT(accessToken)` with Better Auth session validation from cookie headers |
| `server/collaboration/AuthenticationExtension.ts` | modify | Replace `getUserForJWT(token, ["session", "collaboration"])` with `getUserForCollaborationToken(token)` |
| `server/models/User.ts` | modify | Remove `getJwtToken()`, `getTransferToken()`, `getEmailSigninToken()` methods. Keep `getCollaborationToken()`, `getEmailUpdateToken()`, `jwtSecret`, `rotateJwtSecret()`, `setRandomJwtSecret()`, `deleteConfirmationCode` |
| `server/queues/tasks/ValidateSSOAccessTask.ts` | modify | Replace `rotateJwtSecret()` with Better Auth session revocation (delete all `ba_session` rows for the Outline user) |
| `server/commands/userInviter.ts` | modify | Remove dead `getEmailSigninToken()` call and email sign-in link logging |
| `server/routes/api/users/users.ts` | modify | Remove dead `getEmailSigninToken()` usage in the user re-activate flow |
| `server/test/support.ts` | modify | Update `withAPIContext()` to generate a token string without `user.getJwtToken()` — use a simple identifier string since test auth bypasses cookie validation |

## 3. Schema / data changes

No new migrations. No schema changes. The `jwtSecret` column stays on the `users` table (used by collaboration tokens, email-update tokens, and delete confirmation codes). The `ba_session` table (created in Slice 1) is the sole session store.

## 4. API endpoints

No new endpoints. Modified behavior:

| Endpoint | Change |
|----------|--------|
| `POST /api/auth.info` | Remove `getSessionsInCookie()` dependency. `signedInTeamIds` becomes empty array (was already empty in self-hosted mode). `collaborationToken` still returned (unchanged, uses `jwtSecret`). |
| `POST /api/auth.delete` | Revoke Better Auth session via `auth.api.revokeSession()` instead of `rotateJwtSecret()`. Remove `accessToken` cookie clearing (cookie no longer set). Still create `users.signout` event. Still call `rotateJwtSecret()` to invalidate collaboration tokens as a security measure. |
| `GET /auth/redirect` | Route removed. Was only needed for transfer token → `accessToken` cookie conversion. |
| `POST /api/teams.create` | Return `transferUrl` as just the team URL (no token). Frontend can navigate to it; user re-authenticates via Microsoft. |

## 5. Components & UI

No frontend component changes. The frontend already authenticates via Better Auth cookies (set during Microsoft OIDC login). The `collaborationToken` continues to flow through `auth.info` → `AuthStore.collaborationToken`. The `accessToken` cookie is no longer read or set by any code path.

## 6. Implementation order

### Phase 1: Extend Better Auth infrastructure

**Step 1.1** — Update `server/auth/betterAuth.ts`: extend the `BetterAuthInstance` interface to expose `revokeSession`, `revokeSessions`, and the internal adapter's `deleteSessions` and `listSessions` methods. Add runtime verification for the new APIs.

**Step 1.2** — Update `server/auth/betterAuthSession.ts`: add `validateBetterAuthSessionFromHeaders(headers: IncomingHttpHeaders)` function that converts raw Node headers via `fromNodeHeaders()` and validates against Better Auth. Returns `{ user: User; token: string; type: AuthenticationType }` or `null`. This is needed by the websocket service which doesn't have a Koa context.

**Step 1.3** — Update `server/auth/betterAuthHooks.ts`: in the `afterSignInHook`, after provisioning the Outline user (or finding existing), call `user.updateSignedIn()` with a minimal context and create a `users.signin` event. This replaces the tracking that `signIn()` in `authentication.ts` used to do.

### Phase 2: Update JWT utilities

**Step 2.1** — Update `server/utils/jwt.ts`:
- Remove `getUserForJWT()` function entirely.
- Remove `getUserForEmailSigninToken()` function (dead code — email plugin removed in Slice 2).
- Add `getUserForCollaborationToken(token: string): Promise<User>` — validates only `"collaboration"` type JWTs, verifies against `user.jwtSecret`, checks expiry. This is a slimmed-down version of the old `getUserForJWT` restricted to a single token type.
- Keep `getJWTPayload()` and `getDetailsForEmailUpdateToken()` unchanged.

### Phase 3: Update auth middleware

**Step 3.1** — Update `server/middlewares/authentication.ts`:
- In `validateAuthentication()`, remove the JWT fallback `else` branch at the end (the one that calls `getUserForJWT(token)`). After Better Auth + API key + OAuth checks, if no auth is found, throw `AuthenticationError`.
- Remove the `getUserForJWT` import.
- Keep `parseAuthentication()` as-is — it's still used to extract API key and OAuth tokens from headers/body/query.

### Phase 4: Update websocket and collaboration auth

**Step 4.1** — Update `server/services/websockets.ts`:
- Replace the `authenticate()` function: instead of reading `accessToken` cookie and calling `getUserForJWT()`, read Better Auth session cookie from `socket.request.headers` and call `validateBetterAuthSessionFromHeaders()`.
- Remove `getUserForJWT` import; add `validateBetterAuthSessionFromHeaders` import.

**Step 4.2** — Update `server/collaboration/AuthenticationExtension.ts`:
- Replace `getUserForJWT(token, ["session", "collaboration"])` with `getUserForCollaborationToken(token)`.
- Update import from `getUserForJWT` to `getUserForCollaborationToken`.

### Phase 5: Update sign-out and session management

**Step 5.1** — Update `server/routes/api/auth/auth.ts`:
- `auth.info`: remove `getSessionsInCookie` import and usage. Set `signedInTeamIds` to `[]` (or derive from Better Auth sessions if needed, but in self-hosted mode this was already empty). Remove `getSessionsInCookie` import from `@server/utils/authentication`.
- `auth.delete`: replace `rotateJwtSecret()` as the primary session invalidation with Better Auth's `revokeSession()` API. Still call `rotateJwtSecret()` afterward to invalidate any outstanding collaboration tokens. Remove `accessToken` cookie clearing. Use `fromNodeHeaders()` to pass headers to `revokeSession()`.

**Step 5.2** — Update `server/queues/tasks/ValidateSSOAccessTask.ts`:
- Instead of only calling `rotateJwtSecret()`, also revoke all Better Auth sessions: use the internal adapter to find `ba_user` by `outlineUserId`, then call `deleteSessions(baUserId)` to remove all sessions.
- Keep `rotateJwtSecret()` call to also invalidate collaboration tokens.

### Phase 6: Remove legacy auth utilities

**Step 6.1** — Update `server/utils/authentication.ts`:
- Remove `signIn()` function entirely (no longer called by any code — Better Auth handles the full sign-in flow via hooks).
- Remove `getSessionsInCookie()` function entirely (no longer called).
- Remove all imports that are only used by these functions (`addMonths`, `querystring`, `pick`, `Client`, `getCookieDomain`, `env`, `Logger`, `Event`, `Collection`, `View`, `AuthenticationType`).
- If the file becomes empty, delete it entirely.

**Step 6.2** — Update `server/routes/auth/index.ts`:
- Remove the `GET /redirect` route. This route was the transfer token consumer: it validated a transfer token via `getUserForJWT`, set an `accessToken` cookie, and redirected to the default collection.
- The file can either be deleted (if no other routes remain) or left with just the router/app setup.

**Step 6.3** — Update `server/models/User.ts`:
- Remove `getJwtToken()` method.
- Remove `getTransferToken()` method.
- Remove `getEmailSigninToken()` method (dead code — email plugin removed).
- Keep: `getCollaborationToken()`, `getEmailUpdateToken()`, `jwtSecret`, `rotateJwtSecret()`, `setRandomJwtSecret()`, `deleteConfirmationCode`.
- Remove the `addMinutes` import if only used by `getTransferToken()`.

**Step 6.4** — Update `server/routes/api/teams/teams.ts`:
- In `teams.create`, remove `getTransferToken()` call. Return `transferUrl` as just the team URL (e.g., `${team.url}/home`). The user navigates there and authenticates via Microsoft.

**Step 6.5** — Update `server/commands/userInviter.ts`:
- Remove the `getEmailSigninToken()` call and the debug log line that generates the email sign-in link (dead code — email auth removed).

**Step 6.6** — Update `server/routes/api/users/users.ts`:
- Remove the `getEmailSigninToken()` usage in the user re-activate flow (dead code).

### Phase 7: Update tests

**Step 7.1** — Update `server/test/support.ts`:
- In `withAPIContext()`, replace `user.getJwtToken()` with a simple placeholder string (e.g., `"test-token-${user.id}"`). The test helper constructs an `APIContext` directly, so the token value is never actually validated — it's just carried through `ctx.state.auth.token`.

**Step 7.2** — Review and update any test files that call `getJwtToken()` directly for constructing API requests (e.g., `auth.test.ts`, other `*.test.ts` files that pass `token: user.getJwtToken()` in request bodies). These tests will need to either:
  - Mock Better Auth session validation, or
  - Use a test helper that creates a real Better Auth session, or
  - Continue using the existing test server infrastructure which may already bypass auth via the test setup.

  The recommended approach: since the test `server` helper (from `server/test/support.ts`) likely sets up auth context directly, the tests that call API endpoints with `token: user.getJwtToken()` will fail. These need to be updated to authenticate via Better Auth sessions or via a test utility that injects auth state. The exact approach depends on how the test server processes tokens — if it uses the real auth middleware, a test helper to create Better Auth sessions is needed; if it mocks auth, the token string doesn't matter.

## 7. Manual test walkthrough

1. **Start the server** with `yarn dev`. Confirm no startup errors.

2. **Sign in via Microsoft**: Navigate to the login page. Click "Continue with Microsoft." Complete OIDC flow. Verify you land on the home/default collection page. Check browser cookies: you should see a `better-auth.session_token` cookie but **not** an `accessToken` cookie.

3. **Verify session persistence**: Refresh the page. Verify you remain signed in. Navigate between pages. Verify no unexpected logouts.

4. **Verify API access**: Open browser DevTools Network tab. Navigate between documents. Verify API calls (e.g., `auth.info`, `documents.list`) return 200 with valid data.

5. **Verify collaboration**: Open a document for editing. Verify the collaboration connection establishes (check for websocket connection to the collaboration service). Type some text. Verify it saves.

6. **Verify websocket**: Check that real-time updates work — open the same document in two browser tabs, edit in one, verify changes appear in the other.

7. **Sign out**: Click your avatar → "Log out." Verify you're redirected to the login page. Verify the `better-auth.session_token` cookie is cleared. Refresh the page — verify you remain on the login page (not auto-redirected back in).

8. **Sign in again**: Sign in via Microsoft. Verify successful login.

9. **API key test** (if an API key exists): Use `curl` with an API key in the `Authorization: Bearer <api-key>` header to call `/api/auth.info`. Verify it returns 200.

10. **Verify no legacy cookies**: After completing the flow, verify there is no `accessToken` cookie, no `sessions` cookie in the browser.

## 8. Risks & open questions

### Risks

1. **Websocket authentication change**: The websocket service currently reads the `accessToken` cookie for auth. Switching to Better Auth session cookie is a breaking change for any existing connected clients. Mitigation: websocket connections are ephemeral and will reconnect, picking up the new cookie.

2. **Collaboration token continuity**: `getCollaborationToken()` still uses `jwtSecret` and JWT. The new `getUserForCollaborationToken()` is a direct extraction from `getUserForJWT`. Risk is low but needs careful testing of the multiplayer editor.

3. **Test suite breakage**: Many test files (40+) use `user.getJwtToken()` to authenticate test API requests. The test infrastructure needs a strategy for Better Auth session auth. If tests bypass the real middleware (e.g., mock auth), impact is limited to updating token strings. If tests go through the real middleware, a test utility for Better Auth sessions is needed.

4. **`ValidateSSOAccessTask` timing**: This task currently revokes sessions immediately via `rotateJwtSecret()`. The new approach (deleting `ba_session` rows) has the same immediate effect but requires an async import of Better Auth. If Better Auth is not initialized when the task runs, the session revocation silently fails. Mitigation: the task already handles errors gracefully.

5. **`teams.create` transfer flow**: Removing the transfer token from `teams.create` means users must re-authenticate when switching to a new team. This is acceptable for self-hosted single-tenant deployment but would be a UX regression for multi-tenant setups.

### Open questions

1. **Test strategy**: Should we create a `createTestBetterAuthSession(user)` helper that inserts directly into `ba_session`, or should tests mock `validateBetterAuthSession`? The former is more realistic; the latter is simpler. The implementer should examine how the test `server` helper handles auth to decide.

2. **`rotateJwtSecret()` in `auth.delete`**: Should we still call `rotateJwtSecret()` on sign-out? Pro: invalidates outstanding collaboration tokens (defense in depth). Con: no longer needed for session invalidation. Recommendation: keep it for defense in depth.

3. **Better Auth cookie name**: Better Auth's default session cookie is typically `better-auth.session_token`. The websocket auth code needs to know this cookie name. Verify the actual cookie name by inspecting browser cookies after a Better Auth sign-in, or by checking Better Auth's configuration.
