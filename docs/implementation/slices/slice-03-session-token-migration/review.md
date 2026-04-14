# Review: Slice 03 — Session & Token Migration

## 1. Hard-rule audit

| Rule | Status |
|------|--------|
| No `any` types | **FAIL** — 816 instances of `(... as any).sessionToken` across 35 test files |
| No `@ts-ignore` / `@ts-expect-error` | PASS — all 51 occurrences in 22 files are pre-existing |
| No placeholder data or TODO for required functionality | PASS |
| No half-built features | **FAIL** — `revokeSessions`, `listSessions`, `deleteSession` added to `BetterAuthInstance` interface but never used anywhere |
| Plan followed exactly (no extra features, no missing features) | FAIL — plan Step 5.2 specifies using internal adapter for session revocation; implementation uses raw SQL instead; unused interface members added per plan but with no consumers |
| TypeScript compiles (`yarn tsc --noEmit`) | PASS — 0 errors |
| Lint passes (`yarn lint`) | PASS — 0 errors (1142 warnings are pre-existing) |
| Changes stay within slice boundary | PASS |

## 2. Definition of Done checklist

| Acceptance criterion | Status |
|---------------------|--------|
| Custom JWT session utilities removed/reduced to non-auth uses | **PASS** — `getUserForJWT`, `getUserForEmailSigninToken` removed; `getUserForCollaborationToken` added for collaboration only |
| `signIn()` and `getSessionsInCookie()` replaced by Better Auth | **PASS** — `server/utils/authentication.ts` deleted entirely |
| `jwtSecret` no longer used for session validation | **PASS** — only used for collaboration tokens, email-update tokens, delete codes |
| Transfer tokens replaced | **PASS** — `getTransferToken()` removed; `teams.create` returns plain URL |
| API key auth works independently | **PASS** — API key code path in middleware is unchanged |
| Sessions have configurable expiry via Better Auth | **PASS** — expiry checked in `validateBetterAuthSessionFromToken` |
| Auth middleware uses only Better Auth for session validation | **PASS** — JWT fallback removed; `parseAuthentication` still reads legacy `accessToken` cookie but plan says "Keep `parseAuthentication()` as-is" |
| All existing API routes work with Better Auth sessions | **PARTIAL** — architecture supports this, but `auth.delete` has a session revocation bug (see finding #2) |

## 3. Findings

### Finding 1 — `(user as any).sessionToken` across 35 test files

**Category:** **BLOCKER**

**Files:** 35 test files (816 occurrences). Pattern: `(user as any).sessionToken`, `(admin as any).sessionToken`, etc.

**What is wrong:** The `buildUser()` factory in `server/test/factories.ts:268` attaches `sessionToken` as an ad-hoc property on the User instance via `(user as unknown as Record<string, unknown>).sessionToken = sessionToken`. Every test file then accesses it with an `as any` cast. This is a direct violation of the "No `any` types" hard rule.

**Why it matters:** `any` casts break type safety system-wide. If `sessionToken` is ever renamed or the factory changes, no compile-time error will catch the 816 broken call sites. The `any` also masks other potential type issues on the User object at each call site.

**Suggested fix:** Define a typed wrapper:
```typescript
export type TestUser = User & { sessionToken: string };
```
Update `buildUser` return type to `Promise<TestUser>`. Update all test files to use `user.sessionToken` without `any` casts. This is a find-and-replace operation.

---

### Finding 2 — `auth.delete` does not revoke Better Auth session for body/header token auth

**Category:** **BLOCKER**

**File:** `server/routes/api/auth/auth.ts:176-178`

**What is wrong:** The `auth.delete` handler calls:
```typescript
await betterAuth.api.revokeSession({
  headers: fromNodeHeaders(ctx.req.headers),
});
```
This relies on the Better Auth session cookie being present in `ctx.req.headers`. When the client authenticates via a token in the request body (as all tests do), there is no session cookie in headers, so `revokeSession` cannot identify which session to revoke. The call fails silently (caught by the empty `catch`).

After `revokeSession` fails, `rotateJwtSecret()` is called — but this has no effect on `ba_session` records.

**Why it matters:**
1. The `auth.delete` test (`server/routes/api/auth/auth.test.ts:56-71`) expects the second `auth.info` call with the same token to return 401. But the session is never revoked from `ba_session`, so `validateBetterAuthSessionFromToken` will still find it — the test will return 200 instead of 401.
2. In production, any API client using Bearer token or body token authentication cannot properly sign out.

**Suggested fix:** After the `revokeSession` call, also delete the session directly using the authenticated token:
```typescript
const { sequelize } = await import("@server/storage/database");
const { QueryTypes } = await import("sequelize");
await sequelize.query(
  `DELETE FROM ba_session WHERE token = :token`,
  { replacements: { token: authState.token }, type: QueryTypes.DELETE }
);
```
Alternatively, pass `body: { token: authState.token }` to `revokeSession()` so Better Auth can identify the session by token rather than cookie.

---

### Finding 3 — Unused interface definitions on `BetterAuthInstance`

**Category:** **Important**

**File:** `server/auth/betterAuth.ts:24-27, 59-72`

**What is wrong:** Three interface members were added — `revokeSessions` (plural), `listSessions`, and `deleteSession` — but none are called anywhere in the codebase. The plan specified using these for `ValidateSSOAccessTask`, but the implementation uses raw SQL instead. No runtime verification was added for these APIs (only `revokeSession` has a runtime check at line 186-188).

**Why it matters:** Dead interface definitions add maintenance burden and confusion. If Better Auth changes its API shape, these unused type definitions won't cause runtime failures but will create false confidence that they're available.

**Suggested fix:** Remove `revokeSessions`, `listSessions`, and `deleteSession` from the interface. They can be re-added if/when a consumer is implemented.

---

### Finding 4 — `trackSignIn` hardcodes `service: "microsoft"`

**Category:** **Important**

**File:** `server/auth/betterAuthHooks.ts:153`

**What is wrong:** The sign-in event data hardcodes `service: "microsoft"`:
```typescript
data: {
  name: user.name,
  service: "microsoft",
},
```
The original `signIn()` utility derived the service name from the authentication provider context.

**Why it matters:** If another provider is added (e.g., Google), sign-in events will still report `"microsoft"` as the service. The event data becomes misleading.

**Suggested fix:** The `afterSignInHook` receives the Better Auth user context which contains provider information. Pass the provider name through from the hook's account data instead of hardcoding.

---

### Finding 5 — `validateBetterAuthSessionFromToken` uses raw SQL coupled to BA schema

**Category:** **Important**

**File:** `server/auth/betterAuthSession.ts:131-137`

**What is wrong:** The function queries `ba_session` directly via `sequelize.query()`:
```sql
SELECT "outlineUserId", "expiresAt" FROM ba_session WHERE token = :token LIMIT 1
```
This is tightly coupled to Better Auth's internal table schema. The same pattern appears in `ValidateSSOAccessTask.ts:56-60` and `server/test/factories.ts:240-264`.

**Why it matters:** If Better Auth changes its session table schema (column names, table name), these queries break silently at runtime with no compile-time warning. The `BetterAuthInstance` interface already exposes typed adapter methods that could be used instead.

**Suggested fix:** Consider using Better Auth's `api.getSession` with the token in a cookie header, or use the internal adapter's typed methods. At minimum, centralize the raw SQL behind a single helper function to limit the blast radius of schema changes.

---

### Finding 6 — Silent error swallowing in test factory

**Category:** Nit

**File:** `server/test/factories.ts:265`

**What is wrong:** `catch {}` silently swallows all errors when creating Better Auth session records:
```typescript
} catch {
  // BA tables may not exist in all test environments
}
```

**Why it matters:** If `ba_session` table creation fails for any reason (syntax error, connection issue), tests silently run without sessions, leading to confusing authentication failures that are hard to debug.

**Suggested fix:** Log a warning to stderr so developers get visibility: `console.warn("Failed to create BA session for test user:", err)`.

---

### Finding 7 — `parseAuthentication` still reads legacy `accessToken` cookie

**Category:** Nit

**File:** `server/middlewares/authentication.ts:131-137`

**What is wrong:** The function still reads `ctx.cookies.get("accessToken")`. This cookie is no longer set by any code path after this slice.

**Why it matters:** Benign — old cookies would be passed to `validateBetterAuthSessionFromToken` and fail gracefully. But it's dead code.

**Suggested fix:** None required — the plan explicitly says "Keep `parseAuthentication()` as-is." Can be cleaned up in a future slice.

## 4. Summary

The implementation successfully removes the core legacy JWT session system: `signIn()`, `getSessionsInCookie()`, `getUserForJWT()`, `getJwtToken()`, `getTransferToken()`, and `getEmailSigninToken()` are all gone. The auth middleware, websocket service, collaboration extension, and ValidateSSOAccessTask are correctly updated to use Better Auth sessions. The architectural direction is sound.

However, there are **two blockers** that must be fixed before proceeding to test-commit:

1. **816 `as any` casts** across 35 test files violate the "No `any` types" hard rule. A typed `TestUser` wrapper is the straightforward fix.
2. **`auth.delete` fails to revoke the Better Auth session** when authenticated via body/header token (which is how all tests authenticate). The `auth.delete` test will fail at runtime. The session must also be deleted directly from `ba_session` using the authenticated token.

Additionally, the unused `BetterAuthInstance` interface members (`revokeSessions`, `listSessions`, `deleteSession`) should be removed since the implementation pragmatically uses raw SQL instead of the internal adapter.

**Verdict: Needs rework on the two blockers.**
