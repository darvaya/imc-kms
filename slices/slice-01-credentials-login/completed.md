# Completed: slice-01-credentials-login

**Status:** Done (static verification green; live smoke queued — see below) · **Spec:** [spec.md](./spec.md) · **Plan:** [plan.md](./plan.md) · **Review:** [review.md](./review.md)

## What shipped

A fallback **email/password ("credential") login** for KMS, keyed on a single toggle
`env.MICROSOFT_SSO_ENABLED = !!(MICROSOFT_CLIENT_ID && MICROSOFT_CLIENT_SECRET)`:

- **Entra configured** → Microsoft-only (unchanged production behavior); credentials fully off (endpoints not registered, form not advertised).
- **Entra absent** → email/password login box; a dev seed mints a test account. Public self-sign-up stays disabled.

Better Auth no longer throws at init when Entra is missing — only `BETTER_AUTH_SECRET` + a database are required.

## Acceptance criteria

| AC | Status | Evidence |
|---|---|---|
| AC1 boots without Entra | ✅ code | throw removed (`betterAuth.ts`); init log distinguishes mode |
| AC2 login box when Entra off | ✅ code | `auth.config` advertises `email-better-auth`; UI renders the form |
| AC3 Microsoft-only when Entra on | ✅ code + unit | `emailAndPassword: undefined` + gate `MICROSOFT_SSO_ENABLED`; `env.test.ts` |
| AC4 credential login → app | ⏳ manual | hook provisions/links Outline user; verified in-memory by review; live smoke queued |
| AC5 no public sign-up | ✅ code | `disableSignUp: true` (verified refused in better-auth 1.2.8) |
| AC6 session resolves without Microsoft | ✅ code | `betterAuthSession.ts` guard relaxed to `!BETTER_AUTH_SECRET` |

## Review resolution

The hostile review ([review.md](./review.md)) returned **block** with 2 blockers, 2 important, 5 nits. All addressed:

- **Blocker 1 — `afterSignInHook` read `baUser.user.*` but better-auth 1.2.8's `findUserById` returns the user FLAT** (a latent bug that also broke the Microsoft path). Fixed: read `baUser.*` directly (`betterAuthHooks.ts`), and corrected the `BetterAuthInstance.findUserById` type in `betterAuth.ts` to the flat shape so TypeScript now catches this class of error.
- **Blocker 2 / Important 1 — gate drift (`CLIENT_ID && SECRET` vs `CLIENT_ID` alone) could leave `/sign-in/email` live under a Microsoft-only page.** Fixed: introduced one source of truth `env.MICROSOFT_SSO_ENABLED`, consumed by `betterAuth.ts`, `auth.ts`, and the seed; added `@CannotUseWithout` on both Microsoft vars so a partial config **fails closed at boot**.
- **Important 2 — seed prod-safety.** Refuses when Entra is configured **and** refuses in production unless `SEED_TEST_ADMIN_CONFIRM=yes`; no longer prints a supplied (non-default) password.
- **Nit 1 — half-seeded idempotency no-op.** Seed now SELECT-then-INSERT/UPDATE, robust when a `ba_user` exists without its credential account.
- **Nit 2 — error not announced.** `role="alert"` on the error message.
- **Nit 4 — form under `/create`.** Credential provider suppressed when `isCreate`.
- **Nit 3 — 200-treated-as-auth dead-end.** Root cause was Blocker 1; fixing the hook removes it.
- **Nit 5 — version doc.** Reconciled to the installed better-auth **1.2.8** in plan.md.

## Verification

- **Typecheck** `yarn tsc --noEmit` → **0 errors**
- **Lint** `yarn lint` → **0 errors**
- **Production build** `yarn build` → **passes** (assets baked `/kms`; seed compiled to `build/server/scripts/seed-test-admin.js`)
- **Unit tests** `yarn test server/env.test.ts` → **13/13 pass** (incl. 4 new `MICROSOFT_SSO_ENABLED` gate-drift regression tests)
- **Review** end-to-end reproduction of the credential sign-in against the installed better-auth 1.2.8 in-memory adapter (confirms the hook fix)
- **Queued (needs a running Postgres + Redis, absent in this sandbox — no `redis-server` binary, DB down):** the live login smoke test (AC4 end-to-end) and the DB-backed `yarn test:server` suite — see [`../PENDING-MANUAL.md`](../PENDING-MANUAL.md).

## Files changed

Implementation (tracked): `server/auth/betterAuth.ts`, `server/auth/betterAuthHooks.ts`,
`server/auth/betterAuthSession.ts`, `server/env.ts`, `server/env.test.ts`,
`server/routes/api/auth/auth.ts`, `app/scenes/Login/components/AuthenticationProvider.tsx`,
`package.json`, `.env.example`. New: `server/scripts/seed-test-admin.ts`.
Workflow scaffold: `CLAUDE.md`, `slices/slice-01-credentials-login/*`, `slices/PENDING-MANUAL.md`.

## Follow-ups

- Run the queued live smoke + `yarn test:server` on a machine with the `/kms` stack.
- Consider an integration test asserting `ba_session.outlineUserId` is set after a credential sign-in (needs a DB fixture).
