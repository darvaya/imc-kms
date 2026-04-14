### Slice: slice-03-session-token-migration

**Date:** 2026-04-12

**What was built:**
- Replaced Outline's custom JWT session system with Better Auth's built-in session management
- Removed `signIn()`, `getSessionsInCookie()`, and `getUserForJWT()` — deleted `server/utils/authentication.ts` entirely
- Removed `getJwtToken()`, `getTransferToken()`, `getEmailSigninToken()` from User model
- Added `getUserForCollaborationToken()` in `server/utils/jwt.ts` (restricted to collaboration-type JWTs only)
- Updated auth middleware to use only Better Auth sessions + API keys + OAuth tokens (JWT fallback removed)
- Updated websocket service to authenticate via Better Auth session cookies instead of `accessToken` cookie
- Updated collaboration extension to use `getUserForCollaborationToken()`
- Updated `auth.delete` to revoke Better Auth sessions (both cookie-based and direct token-based via SQL)
- Updated `ValidateSSOAccessTask` to delete Better Auth sessions via raw SQL
- Removed `/auth/redirect` transfer token route
- Updated `teams.create` to return plain team URL (no transfer token)
- Removed dead `getEmailSigninToken()` calls from `userInviter.ts` and `users.ts`
- Added `validateBetterAuthSessionFromHeaders()` for websocket auth (raw Node headers)
- Added `validateBetterAuthSessionFromToken()` for token-based session validation
- Added sign-in tracking in Better Auth hooks (`user.updateSignedIn()` + `users.signin` event with dynamic provider name)
- Created `TestUser` type and updated `buildUser()` factory to create Better Auth session records for tests
- Updated 35+ test files to use typed `TestUser.sessionToken` (no `as any` casts)
- Cleaned up `BetterAuthInstance` interface — removed unused `revokeSessions`, `listSessions`, `deleteSession` members

**Key decisions:**
- `jwtSecret` remains on User model — still used by collaboration tokens, email-update tokens, and delete confirmation codes
- `rotateJwtSecret()` is still called on sign-out for defense in depth (invalidates outstanding collaboration tokens)
- Raw SQL used for `ba_session` queries in `ValidateSSOAccessTask` and test factory — pragmatic choice to avoid complex async initialization
- Sign-in tracking derives provider name from Better Auth's `providerId` rather than hardcoding
- `installation.create` redirects to `/home` instead of calling `signIn()` — users authenticate via Microsoft SSO
- `teams.create` `transferUrl` returns team URL directly — user re-authenticates via Microsoft on the new team

**Files changed:**
- `server/auth/betterAuth.ts` — cleaned up interface (removed unused members)
- `server/auth/betterAuthHooks.ts` — added sign-in tracking with dynamic provider name
- `server/auth/betterAuthSession.ts` — added `validateBetterAuthSessionFromHeaders()` and `validateBetterAuthSessionFromToken()`
- `server/collaboration/AuthenticationExtension.ts` — switched to `getUserForCollaborationToken()`
- `server/commands/userInviter.ts` — removed dead email sign-in code
- `server/middlewares/authentication.ts` — removed JWT fallback, added BA session token validation
- `server/middlewares/authentication.test.ts` — updated for new auth flow
- `server/models/User.ts` — removed `getJwtToken()`, `getTransferToken()`, `getEmailSigninToken()`
- `server/models/User.test.ts` — updated tests
- `server/queues/tasks/ValidateSSOAccessTask.ts` — Better Auth session revocation via SQL
- `server/routes/api/auth/auth.ts` — Better Auth session revocation in `auth.delete`; removed `getSessionsInCookie` from `auth.info`
- `server/routes/api/auth/auth.test.ts` — updated test assertions
- `server/routes/api/installation/installation.ts` — replaced `signIn()` with redirect
- `server/routes/api/teams/teams.ts` — removed transfer token from `teams.create`
- `server/routes/api/users/users.ts` — removed dead email sign-in code
- `server/routes/auth/index.ts` — removed `/redirect` route
- `server/routes/auth/index.test.ts` — updated for removed redirect route
- `server/services/websockets.ts` — Better Auth session auth for websockets
- `server/test/factories.ts` — `TestUser` type, Better Auth session creation in `buildUser()`
- `server/test/support.ts` — updated `withAPIContext()` token generation
- `server/utils/authentication.ts` — **deleted**
- `server/utils/jwt.ts` — removed `getUserForJWT()`, added `getUserForCollaborationToken()`
- 35 additional test files — replaced `getJwtToken()` with typed `sessionToken` access

**Known issues / tech debt:**
- Manual testing not yet completed — blocked by Azure AD redirect URI configuration (IT needs to add `http://localhost:3000/api/better-auth/callback/microsoft`)
- `parseAuthentication()` still reads legacy `accessToken` cookie (dead code, kept per plan — clean up later)
- Raw SQL queries against `ba_session` table are coupled to Better Auth's internal schema — consider centralizing behind a helper if BA upgrades
- Silent `catch {}` in test factory when BA tables don't exist (could add warning log)
- `emailSigninEnabled` team preference remains in database/settings UI — no functional impact with email plugin removed
- 1142 pre-existing lint warnings (mostly `no-explicit-any`) — not introduced by this slice

**Dependencies for future slices:**
- `TestUser` type exported from `server/test/factories.ts` — all test files should use this for authenticated test users
- `getUserForCollaborationToken()` in `server/utils/jwt.ts` — the only remaining JWT validation function for user-facing tokens
- `validateBetterAuthSessionFromHeaders()` in `server/auth/betterAuthSession.ts` — for validating sessions from raw Node headers
- `validateBetterAuthSessionFromToken()` in `server/auth/betterAuthSession.ts` — for token-based auth in middleware
- `ba_session` table is now the sole session store — no more `accessToken` cookies
- `jwtSecret` still on User model — used by `getCollaborationToken()`, `getEmailUpdateToken()`, `deleteConfirmationCode`, `rotateJwtSecret()`
