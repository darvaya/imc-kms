@AGENTS.md

## Identity

**IMC Pelita Logistik KMS** — an internal knowledge base for PT IMC Pelita Logistik, built as a fork of **Outline** (React SPA + Node/Koa server, real-time collaborative editing). Single-organization, deployed under the **`/kms` sub-path** of a shared corporate host (`https://appstpcid.imcpelilog.co.id/kms`) alongside sibling apps (notably **imc-clocka**), behind **Apache 2.4 + systemd/PM2** — the same deploy pattern as clocka. Authentication is **Microsoft Entra ID via Better Auth**. Not a general SaaS; cloud-hosting/multi-tenant Outline features are effectively off (`isCloudHosted` is false in this deployment).

## Tech Stack

- **Frontend**: React 18 + TypeScript 5 (strict), MobX, styled-components, Vite build (assets baked under `${BASE_PATH}/static/`)
- **Server**: Node ≥20.12, Koa + koa-router, mounted under `BASE_PATH` via `koa-mount`
- **Database**: PostgreSQL + Sequelize (migrations in `server/migrations/`, sequelize-cli)
- **Cache / realtime**: Redis (Bull queues, websockets, collaboration via Hocuspocus/Yjs)
- **Auth**: **Better Auth** (`server/auth/`) — Microsoft Entra OIDC social provider; Better Auth tables are `ba_user` / `ba_session` / `ba_account` / `ba_verification`; mounted at `/api/better-auth`. Outline users are provisioned/linked via `accountProvisioner` in `afterSignInHook`.
- **File storage**: local disk (`FILE_STORAGE=local`) or S3-compatible
- **Process**: PM2 (`ecosystem.config.cjs`, app `kms`, port 4800) or systemd (`deploy/systemd/kms.service`)
- **Package manager**: Yarn 4

## Commands

| Purpose | Command |
|---|---|
| Dev server | `yarn dev:watch` (backend + Vite) |
| Production build | `yarn build` (`vite:build` + i18n + `build:server`). `URL` is baked → `BASE_PATH`; it MUST match at build and start (see `## Architecture`). |
| Production start | `yarn start` (`node ./build/server/index.js`) or `make start` (PM2) |
| Lint | `yarn lint` (`oxlint --type-aware app server shared plugins`) |
| Typecheck | `yarn tsc --noEmit` |
| Run migrations | `yarn db:migrate` |
| Tests | `yarn test` (jest). Server only: `yarn test:server`. Single file: `yarn test <path>`. |
| Seed (dev fixture) | `yarn seed:test-admin` — creates a Better Auth **credential** test account for the email/password login box (only meaningful when Microsoft Entra is NOT configured). Requires a prior `yarn build`. Dev/test only. |

## Paths

| Purpose | Path |
|---|---|
| Epic breakdowns | `slices/<epic-name>/breakdown.md` |
| Slice specs | `slices/<slice-name>/spec.md` |
| Slice plans | `slices/<slice-name>/plan.md` |
| Slice reviews | `slices/<slice-name>/review.md` |
| Slice completions | `slices/<slice-name>/completed.md` |
| Pending manual tests | `slices/PENDING-MANUAL.md` |
| Workflow doc | `.claude/commands/` (00-init … 06-auto-commit) |
| Additional context | `docs/DEPLOYMENT-GUIDE.md` (deploy runbook), `deploy/apache/kms.conf`, `.env.example`, `README.md` |

## Data Rules

- **Real data only.** No fabricated users, teams, or documents in code, migrations, or seeds beyond clearly-labelled dev fixtures (`yarn seed:test-admin`), which use obvious non-production identifiers and are documented as dev/test only.
- **Secrets never committed.** `.env` is gitignored. `.env.example` carries placeholder keys only. Any credential appearing in a diff is a blocker.
- Auth identities are owned by Better Auth (`ba_*` tables); Outline `users`/`teams` are provisioned from them. A session is only "authenticated" once `ba_session.outlineUserId` is set.

## Hard Rules

1. **Sub-path safety.** Every browser-facing URL (assets, redirects, fetches, cookies, service worker, websocket) must carry `BASE_PATH`. Never emit a bare root-relative URL that would 404 under `/kms`. Never double-prefix (`/kms/kms/...`).
2. **`URL` build/runtime parity.** `URL` (hence `BASE_PATH`) baked at `yarn build` must equal the runtime `URL`; a mismatch is fatal by design (`checkBasePathParity`).
3. **CSP origin = `URL` origin.** The CSP `script-src` is derived from `new URL(env.URL).origin`; the browser must reach the app at that exact origin.
4. **Auth is Entra-first.** Microsoft Entra SSO is the production login. Any alternative (credential/password) login must be **off whenever Entra is configured**, never allow public self-sign-up, and be clearly scoped to environments where Entra is absent (local/testing).
5. **No secret material in logs or committed files.** Password hashes and tokens are never logged.

## Methodology

- **Module map** — Auth lives in `server/auth/` (Better Auth config, hooks, session bridge) + `server/routes/api/auth/` (Outline auth API) + `app/scenes/Login/` (login UI). Keep changes within the module a slice owns.
- **Test discipline** — pragmatic: add/adjust jest tests where they add value (server auth logic, route responses). Not strict TDD. Existing tests must stay green.
- **Domain modeling** — none/simple (no DDD aggregates); state changes to the `ba_*` tables go through Better Auth or explicit, documented SQL in the auth module.
- **Discovery** — specs use Given/When/Then acceptance criteria mapping 1:1 to a verification step.

## Architecture

- `URL` → `BASE_PATH` derived in `server/env.ts` (path component of `URL`). The inner Koa app is mounted under `BASE_PATH` via `koa-mount`; `/_health` stays at the origin root.
- **Better Auth** initializes lazily (`getBetterAuth()`), Microsoft OIDC social provider, tables `ba_*`, base path `/api/better-auth`, `baseURL = env.URL`, session/CSRF/OAuth cookies scoped to `BASE_PATH`. `afterSignInHook` provisions/links the Outline user and stores `outlineUserId` on the ba_user + ba_session. `betterAuthSession.ts` bridges a ba_session back to an Outline `User` for Koa/websocket auth.
- The login page fetches `auth.config` (`server/routes/api/auth/auth.ts`) for the provider list and renders each via `app/scenes/Login/components/AuthenticationProvider.tsx`.
- Deploy: Apache reverse-proxies `/kms` → `127.0.0.1:4800/kms` (`deploy/apache/kms.conf`); WebSocket upgrade scoped to `/kms/`.
