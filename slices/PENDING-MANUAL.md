# Pending manual tests

Tests that require a running stack (Postgres + Redis + the built app) and so could
not be executed in the automated sandbox. Run these on a machine with the local
`/kms` stack up.

## slice-01-credentials-login — live login smoke test

Why manual: this sandbox has no running Postgres (`:55432` down) and no `redis-server`
binary, so the app cannot be booted here. Static verification (tsc, lint, production
build, `server/env.test.ts`) passed, and the review's verifier reproduced the credential
sign-in end-to-end against the installed better-auth 1.2.8 in-memory adapter — but the
following must still be run against a real DB before shipping.

Prereqvisites: `.env` with `BETTER_AUTH_SECRET`, `DATABASE_URL`, `REDIS_URL`, `URL` set and
`MICROSOFT_CLIENT_ID`/`MICROSOFT_CLIENT_SECRET` **empty**. `yarn build && yarn db:migrate`.

1. **Boots without Entra (AC1):** `yarn start` → server comes up, no "MICROSOFT_CLIENT_ID … required" error; log says "email/password credentials (Microsoft Entra not configured)".
2. **Login box shown (AC2):** open the app → email + password form, no Microsoft button.
3. **Seed + sign in (AC4/AC6):** `yarn seed:test-admin` → sign in with the printed email/password → land in the authenticated app; a `users.signin` event + an admin Outline user exist; `ba_session.outlineUserId` is set.
4. **No public sign-up (AC5):** `curl -X POST "$URL/api/better-auth/sign-up/email" -H 'content-type: application/json' -d '{"email":"x@y.z","password":"Passw0rd!","name":"x"}'` → refused (sign-up disabled).
5. **Wrong password:** submit a bad password → inline "Incorrect email or password" (announced via `role="alert"`).
6. **Microsoft-only when Entra on (AC3):** set `MICROSOFT_CLIENT_ID`/`SECRET`, `yarn build`, restart → login shows only "Continue with Microsoft"; `curl -X POST "$URL/api/better-auth/sign-in/email" …` → refused (endpoint not registered).
7. **Partial config fails closed:** set only `MICROSOFT_CLIENT_ID` (empty secret) → server refuses to boot (`@CannotUseWithout` validation).
8. **Server jest auth suite:** `yarn test:server` (needs the DB) — run the full server suite green, especially `server/routes/api/auth/auth.test.ts`.
