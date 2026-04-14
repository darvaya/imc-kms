# Review: Remove Legacy Auth Providers & Cleanup

## 1. Hard-rule audit

| Rule | Status |
|------|--------|
| No `any` types | PASS |
| No `@ts-ignore` / `@ts-expect-error` | PASS |
| No placeholder data or TODO for required functionality | PASS |
| No half-built features | PASS |
| Plan followed exactly (no extra features, no missing features) | PASS |
| TypeScript compiles (`yarn tsc --noEmit`) | PASS |
| Lint passes (`yarn lint`) | FAIL (pre-existing) |
| Changes stay within slice boundary | PASS |

**Lint note:** `yarn lint` fails with `invalid config file .oxlintrc.json: No such file or directory`. This is a **pre-existing environment issue** unrelated to Slice 2 changes. The linter configuration file is missing from the repository. This does not block the slice.

## 2. Definition of Done checklist

| # | Acceptance criterion | Status | Evidence |
|---|---------------------|--------|----------|
| 1 | OIDC plugin (`plugins/oidc/`) removed | DONE | Directory deleted in diff |
| 2 | Google auth plugin (`plugins/google/`) removed | DONE | Directory deleted in diff |
| 3 | Slack auth plugin (`plugins/slack/`) removed | DONE | Directory deleted in diff |
| 4 | Azure auth plugin (`plugins/azure/`) removed | DONE | Directory deleted in diff |
| 5 | Discord auth plugin (`plugins/discord/`) removed | DONE | Directory deleted in diff |
| 6 | Email magic link auth plugin (`plugins/email/`) removed | DONE | Directory deleted in diff |
| 7 | Passport.js packages removed from `package.json` | DONE | 7 packages removed: `@outlinewiki/koa-passport`, `@outlinewiki/passport-azure-ad-oauth2`, `passport`, `passport-google-oauth2`, `passport-oauth2`, `passport-slack-oauth2`, `@types/passport-oauth2` |
| 8 | Passport.js utilities removed | DONE | `server/utils/passport.ts`, `server/middlewares/passport.ts` deleted |
| 9 | Frontend login page only shows Microsoft SSO | DONE | Email form, OTP flow, OIDC auto-redirect all removed from `Login.tsx` and `AuthenticationProvider.tsx` |
| 10 | `/api/auth.config` returns only Microsoft OIDC | DONE | `auth.ts` returns only `betterAuthProviders` array; `AuthenticationHelper.providersForTeam` spreads and `presentProviderConfig` removed |
| 11 | Application starts and runs without errors | PARTIAL | `tsc --noEmit` passes; runtime verification deferred to test-commit |

## 3. Findings

### 3.1 Blockers

**None.**

### 3.2 Important

**F1. Unused `Client` import in Login.tsx**
- **File:** `app/scenes/Login/Login.tsx:9`
- **What:** `import { Client, UserPreference } from "@shared/types"` -- `Client` is no longer used anywhere in this file. It was previously consumed by the removed `clientType` variable (`Desktop.isElectron() ? Client.Desktop : Client.Web`). Only `UserPreference` is still used (line 63).
- **Why it matters:** Unused imports are a code smell and will trigger lint warnings when the linter config is fixed. While TypeScript does not error on unused type-only imports, this should be cleaned up.
- **Suggested fix:** Change the import to `import { UserPreference } from "@shared/types"`.

### 3.3 Nits

**N1. `_authType` destructured but unused in AuthenticationProvider.tsx**
- **File:** `app/scenes/Login/components/AuthenticationProvider.tsx:17`
- **What:** `const { isCreate, id, name, authUrl, authType: _authType, ...rest } = props` -- `_authType` is destructured to exclude it from `...rest` so it doesn't get passed to the `ButtonLarge` DOM component.
- **Why acceptable:** This is a standard React pattern to prevent invalid HTML attributes on DOM elements. The `_` prefix signals intentional non-use. No action needed.

## 4. Summary

This slice is **ready for test-commit** with one minor cleanup recommended. All six phases of the plan were executed correctly:

- **Phase 1:** `getTeamFromContext` and `parseState` extracted to `server/utils/team.ts`; all 5 consumer files updated.
- **Phase 2:** Passport.js initialization and provider router mounting removed from `server/routes/auth/index.ts`; `/auth/redirect` endpoint preserved.
- **Phase 3:** `auth.config` endpoint simplified to only return `betterAuthProviders`; `oauthClient` getter returns `undefined`; `presentProviderConfig` deleted; `GOOGLE_ALLOWED_DOMAINS` alias removed.
- **Phase 4:** Frontend cleaned up -- email sign-in flow, OIDC auto-redirect, and 3 legacy notice cases removed.
- **Phase 5:** All 6 plugin directories, Passport middleware, Passport utilities, OAuth base class, and 4 type definition files deleted.
- **Phase 6:** 7 Passport packages removed from `package.json`; `yarn.lock` regenerated.

TypeScript compiles cleanly. No `any` types, no `@ts-ignore`, no TODO placeholders, no dangling imports to deleted modules. The only finding is an unused `Client` import in Login.tsx (Important, not a blocker). The lint failure is a pre-existing config issue.

**Recommendation:** Fix F1 (unused `Client` import), then proceed to `/test-commit`.
