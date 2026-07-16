# Slice: slice-01-credentials-login

**Status:** Approved
**Epic:** none (stand-alone)
**Module:** auth (`server/auth/` + `server/routes/api/auth/` + `app/scenes/Login/`)
**Layer:** n/a
**Siblings (parallel):** none

## Summary

Give KMS a **fallback email/password ("credentials") login** so the app can be signed into for local/testing use **when Microsoft Entra is not configured**, mirroring the sibling imc-clocka's Better Auth pattern. The behavior is a hard toggle keyed on Entra presence in `.env`: **Entra creds absent → the email/password login box is shown; Entra creds present → only the Microsoft button is shown** (credentials login is fully off in that case). Today KMS instead *throws at Better Auth init* when Entra is missing, so it cannot start or be tested without a live tenant.

## Assumptions

| # | Assumption | Type | Consequence | Default chosen | Source | Surfaced? | Resolution |
|---|---|---|---|---|---|---|---|
| 1 | When Entra IS configured, credentials login is fully OFF (mutually exclusive — only Microsoft), not offered alongside it | ground-truth | high | mutual exclusivity | user directive (2026-07-16 goal) | yes | Confirmed by user: "if the entra id is not available in .env then the login box will be shown, otherwise only microsoft login" |
| 2 | Credential login uses **email + password** (not clocka's username plugin), since Outline models real emails | preference | low | email+password | Outline user model has real emails | no | — |
| 3 | No public self-sign-up — credential accounts are minted only server-side (`disableSignUp: true`); a dev seed script is the bootstrap | preference | high | disableSignUp:true + seed | CLAUDE.md Hard Rule 4; clocka parity | no | — |
| 4 | The seed creates a Better Auth credential account and lets the **first login provision + link** the Outline admin via `afterSignInHook` (fresh-DB fixture) | preference | low | provision-on-first-login | reuses existing hook path | no | — |
| 5 | Behavior is gated purely on `MICROSOFT_CLIENT_ID`/`MICROSOFT_CLIENT_SECRET` presence, not on `NODE_ENV` | preference | low | env-presence gate | clocka parity (`microsoftSsoEnabled`) | no | — |

None blocking (`Surfaced? = yes` rows all have a Resolution).

## Motivation

KMS's Better Auth is Microsoft-Entra-only and **throws at init** when `MICROSOFT_CLIENT_ID`/`MICROSOFT_CLIENT_SECRET` are unset (`server/auth/betterAuth.ts`). A teammate pulling the repo cannot log in — or even exercise the app — without registering an Entra app, and Entra rejects plain-HTTP/IP redirect URIs, making quick local/LAN testing impractical. imc-clocka (same Better Auth library) solves this by keeping a credentials login available. This slice ports that capability with a stricter, KMS-appropriate toggle: credentials appear **only** when Entra is absent, so production (Entra-configured) stays Entra-only.

## User stories

- As a **developer/tester**, I want to log in with a seeded email + password when Entra isn't set up, so I can run and verify the app locally without a live tenant.
- As a **security owner**, I want the credential login to disappear entirely once Entra is configured, so production has a single, SSO-only front door.

## Acceptance criteria

- [ ] **AC1** — Given `MICROSOFT_CLIENT_ID`/`MICROSOFT_CLIENT_SECRET` are unset, When the server boots, Then Better Auth initializes without throwing and the login page renders (no crash on first auth request).
- [ ] **AC2** — Given Entra is unset, When the login page loads, Then an email + password form is shown and no "Continue with Microsoft" button is present.
- [ ] **AC3** — Given Entra IS set (both client id and secret), When the login page loads, Then only the "Continue with Microsoft" button is shown and no email/password form or credential endpoint is exposed.
- [ ] **AC4** — Given Entra is unset and a seeded credential account exists, When the user submits the correct email + password, Then a Better Auth session is created, an Outline user is provisioned/linked, and the user reaches the authenticated app.
- [ ] **AC5** — Given Entra is unset, When any unauthenticated client calls the Better Auth sign-up endpoint, Then public self-sign-up is refused (accounts come only from the seed/admin path).
- [ ] **AC6** — Given a credential session exists, When Koa or the websocket service validates it, Then it resolves to the linked Outline user (session validation no longer requires `MICROSOFT_CLIENT_ID`).

## Scope

### In scope
- Conditional Better Auth config: Microsoft social provider only when Entra present; `emailAndPassword` (with `disableSignUp`) only when Entra absent.
- Remove the hard init throw on missing Entra; keep `BETTER_AUTH_SECRET`/DB as the real requirements.
- Fix `betterAuthSession.ts` so session→Outline-user resolution doesn't require `MICROSOFT_CLIENT_ID`.
- Generalize `afterSignInHook` to provision/link an Outline user for `providerId === "credential"` (not just `microsoft`).
- Advertise a credential provider from `auth.config` when Entra is absent; render an email/password form in the login UI.
- A dev-only seed script (`yarn seed:test-admin`) that mints a credential account.
- `.env.example` documentation of the toggle.

### Out of scope
- Password reset / "forgot password" / email verification flows (no SMTP dependency).
- Username-based login, credential-sheet/Excel generation, throttle/lockout tuning beyond Better Auth defaults.
- Any change to the Microsoft/Entra login path itself.
- Enabling credentials **alongside** Microsoft (explicitly excluded by AC3).

## Domain invariants

- A session is authenticated **only** when `ba_session.outlineUserId` is set; a credential login that fails to provision an Outline user must not present as authenticated.
- Credentials login and Microsoft SSO are **never both active** in the same running instance.
- No public self-sign-up path may create a usable account while `disableSignUp` is in force.

## Technical notes

- Follow clocka's `microsoftSsoEnabled = !!(clientId && clientSecret)` pattern (`imc-clocka/lib/auth.ts`).
- `ba_account.password` (TEXT, nullable) already exists (`server/migrations/20260410000000-create-better-auth-tables.js:155`) — **no migration needed**.
- Password hashing must use Better Auth's own `hashPassword` (`better-auth/crypto`) so seeded hashes verify against the sign-in endpoint.
- Better Auth mounts at `/api/better-auth`; credential sign-in endpoint is `POST /api/better-auth/sign-in/email` (auto-registered when `emailAndPassword.enabled`).
- `accountProvisioner` creates the `AuthenticationProvider` on demand, so `providerId: "credential"` is accepted.
- Respect CLAUDE.md `## Hard Rules`: all login UI fetches/redirects carry `BASE_PATH` (`urlWithBasePath`).

## Dependencies

- **Requires:** none
- **Required by:** none
- **Files likely touched:** `server/auth/betterAuth.ts`, `server/auth/betterAuthSession.ts`, `server/auth/betterAuthHooks.ts`, `server/routes/api/auth/auth.ts`, `app/scenes/Login/components/AuthenticationProvider.tsx`, `server/scripts/seed-test-admin.ts` (new), `package.json` (seed script), `.env.example`

## Manual test script

1. In `.env`, leave `MICROSOFT_CLIENT_ID`/`MICROSOFT_CLIENT_SECRET` **empty**; ensure `BETTER_AUTH_SECRET`, `DATABASE_URL`, `URL` are set. `yarn build && yarn db:migrate`.
2. Start the server (`yarn start`). Confirm it boots without the "MICROSOFT_CLIENT_ID … required" error. → AC1
3. Open the app URL. Confirm the login screen shows an **email + password form** and no Microsoft button. → AC2
4. Run `yarn seed:test-admin`; note the printed test email + password.
5. Submit those credentials. Confirm you land in the authenticated app (a workspace/document view), and a `users.signin` event / Outline user exists. → AC4, AC6
6. `curl -X POST <URL>/api/better-auth/sign-up/email -d '{...}'` → confirm it is refused (sign-up disabled). → AC5
7. Now set `MICROSOFT_CLIENT_ID`/`MICROSOFT_CLIENT_SECRET`, `yarn build`, restart. Confirm the login screen shows **only** "Continue with Microsoft" and the email/password form is gone; `POST /api/better-auth/sign-in/email` is not accepted. → AC3

## Definition of Done

- [ ] All acceptance criteria met
- [ ] Typecheck passes (`yarn tsc --noEmit`)
- [ ] Lint passes (`yarn lint`)
- [ ] Unit tests pass (`yarn test:server`; add/adjust auth tests where valuable)
- [ ] Production build passes (`yarn build`)
- [ ] Manual test script passes
- [ ] Compliant with CLAUDE.md `## Hard Rules` and `## Data Rules` (no secrets committed, sub-path safe, credentials off when Entra on)
