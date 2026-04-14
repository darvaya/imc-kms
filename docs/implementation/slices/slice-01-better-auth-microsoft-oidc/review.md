# Review: Slice 01 — Better Auth Core Setup + Microsoft OIDC Login

## 1. Hard-rule audit

| Rule | Status |
|------|--------|
| No `any` types | PASS |
| No `@ts-ignore` / `@ts-expect-error` | PASS |
| No placeholder data or TODO for required functionality | PASS — team name now uses `env.APP_NAME` |
| No half-built features | PASS |
| Plan followed exactly (no extra features, no missing features) | PASS — all blockers resolved |
| TypeScript compiles (`yarn tsc --noEmit`) | PASS |
| Lint passes (`yarn lint`) | SKIP — pre-existing failure: `.oxlintrc.json` config file missing from repo |
| Changes stay within slice boundary | PASS |

## 2. Definition of Done checklist

| Acceptance criterion | Status | Notes |
|----------------------|--------|-------|
| `better-auth` installed and configured on Koa backend | PASS | v1.2.8 pinned, Koa handler bridges via `toNodeHandler` |
| Microsoft Entra ID configured as OIDC provider | PASS | `socialProviders.microsoft` with tenant, client ID/secret |
| Clicking "Sign in" initiates Microsoft OIDC flow | PASS | Button uses direct `fetch()` POST + `window.location.href` redirect |
| After OIDC login, user record created/matched + session established | PASS | `afterSignInHook` calls `accountProvisioner` |
| Logout clears session + redirects (no loop) | PASS | `signOutBetterAuth()` called in AuthStore logout, `?logout=true` prevents re-redirect |
| Passport.js middleware replaced with Better Auth session validation | PASS | Dual-mode in `authentication.ts` — better-auth first, JWT fallback |
| API requests with valid session authenticated; without → 401 | PASS | `validateBetterAuthSession` returns user or falls through |
| Environment variables documented | PASS | Added to `server/env.ts` with JSDoc and `@IsOptional()` |

## 3. Findings

### 🔴 Blockers — ALL RESOLVED

#### B1: Auto-redirect race condition + React Hooks violation ✅ FIXED

**File:** `app/scenes/Login/Login.tsx`

**What:** The auto-redirect `useEffect` was placed AFTER conditional early returns, violating React's Rules of Hooks. On first render `config` was null (13 hooks executed), on second render config loaded (14 hooks executed). React threw "Rendered more hooks than during the previous render", crashing the app.

Additionally, `betterAuthClient.signIn.social()` was unreliable for auto-redirect — the better-auth client's internal redirect plugin did not consistently trigger `window.location.href` in the browser, leaving a blank page.

**Resolution:** Removed auto-redirect for better-auth providers entirely. Users click the "Continue with Microsoft" button to initiate login. The button click handler in `AuthenticationProvider.tsx` was also changed from `betterAuthClient.signIn.social()` to a direct `fetch()` POST to `/api/better-auth/sign-in/social`, then explicit `window.location.href = data.url` redirect.

---

#### B2: Hardcoded team name `"Wiki"` ✅ FIXED

**File:** `server/auth/betterAuthHooks.ts:77`

**Resolution:** Changed to `env.APP_NAME` (resolves to "IMC Pelita Logistik KMS").

---

#### B3: Missing database transaction ✅ FIXED

**File:** `server/auth/betterAuthHooks.ts:61-100`

**Resolution:** `accountProvisioner` call is now wrapped in a Sequelize transaction with commit/rollback.

---

### 🟡 Important — RESOLVED OR VERIFIED

#### I1: Migration column naming deviates from plan ✅ VERIFIED

**File:** `server/migrations/20260410000000-create-better-auth-tables.js`

**What:** Plan specified snake_case columns; migration uses camelCase.

**Resolution:** Verified at runtime — better-auth v1.2.8 uses camelCase internally. The migration is correct. Plan's schema table should be treated as reference only; the migration is the source of truth.

---

#### I2: better-auth v1.2.8 vs plan assumption of v1.6.x ✅ VERIFIED

**File:** `package.json`

**Resolution:** Verified that v1.2.8 supports all used APIs: `socialProviders.microsoft`, `toNodeHandler`, `fromNodeHeaders`, `$context.internalAdapter.findUserById/findAccounts/updateUser/updateSession`, `databaseHooks.session.create.after`. Runtime assertions in `betterAuth.ts:161-165` provide early detection of version mismatches.

---

#### I3: No error state for auto-redirect failure ✅ FIXED

**Resolution:** Auto-redirect removed entirely (see B1). The login page always renders with a clickable button. The button click handler uses a direct `fetch()` with `try/catch` fallback.

---

#### I4: `require("pg")` replaced with dynamic import ✅ FIXED

**File:** `server/auth/betterAuth.ts:100`

**Resolution:** Uses `const { Pool } = await import("pg")` via dynamic import, consistent with the ESM-handling pattern used for better-auth itself.

---

#### I5: `BetterAuthInstance` hand-rolled interface is fragile ⚠️ ACCEPTED

**File:** `server/auth/betterAuth.ts:8-54`

**Resolution:** Accepted risk. Runtime assertions at `betterAuth.ts:161-165` verify `.handler` and `.api.getSession` exist. The interface is a pragmatic workaround for better-auth's complex generic return type that doesn't convert cleanly to the project's TypeScript config. Will be revisited if upgrading better-auth versions.

---

### ⚪ Nits

#### N1: `authType` prop naming ✅ FIXED

**File:** `app/scenes/Login/components/AuthenticationProvider.tsx:21`

**Resolution:** Prop renamed from `type` to `authType` to avoid collision with HTML `type` attribute. Destructured as `_authType` (currently unused in rendering logic; the click handler checks `id === "microsoft-better-auth"` instead).

---

#### N2: Session hook runs on every session creation, not just sign-in ⚠️ ACCEPTED

**File:** `server/auth/betterAuth.ts:152-156`

**Resolution:** Accepted. The early return for existing `outlineUserId` (line 46-51 in `betterAuthHooks.ts`) short-circuits quickly on session refresh. The overhead is minimal (one DB lookup). No more targeted hook is available in better-auth v1.2.8.

## 4. Summary

All **3 blockers** have been resolved:

1. **Auto-redirect race condition + React Hooks violation** — removed auto-redirect entirely; replaced `betterAuthClient.signIn.social()` with direct `fetch()` POST + explicit `window.location.href` redirect in the button click handler.
2. **Hardcoded "Wiki" team name** — changed to `env.APP_NAME`.
3. **Missing transaction in account provisioning** — wrapped in Sequelize transaction with commit/rollback.

All **important issues** verified or fixed:
- Migration camelCase columns confirmed compatible with better-auth v1.2.8
- Version v1.2.8 API verified against all used interfaces
- `require("pg")` replaced with dynamic `import("pg")`
- Auto-redirect error state is moot (auto-redirect removed)

**Status: Ready for `/test-commit`.**
