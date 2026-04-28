# Slice: 01-subpath-foundation

**Date:** 2026-04-28

## What was built

- Added `env.BASE_PATH` getter on the `Environment` class in `server/env.ts`. Derives the value from the path component of `URL` (e.g. `https://host` → `""`, `http://host:3000/kms` → `/kms`, `http://host:3000/kms/` → `/kms`, multi-segment preserved). Annotated with `@Public` so it flows through `PublicEnvironmentRegister` to `window.env`.
- Refactored `server/index.ts` to split the single Koa app into an outer app and an inner app. The outer app retains only the `/_health` router (so process-level / load-balancer health probes don't depend on the prefix); helmet, the default rate limiter, optional `koa-logger`, and `redirectOnClient` all moved onto the inner app. After service init, the outer app wraps the inner with `mount(env.BASE_PATH || "/", innerApp)` (koa-mount short-circuits on `/`, preserving the path-less code path as a no-op).
- `app.proxy = true` was removed from `server/services/web.ts` and re-applied to `outerApp` in `server/index.ts` (the outer app owns the request `ctx`, so proxy trust must live there to drive `ctx.protocol` / `ctx.ips` correctly).
- `server/middlewares/csrf.ts` was changed: the previous `ctx.originalUrl.startsWith("/api/")` guard around the read-scope shortcut was dropped, and `AuthenticationHelper.canAccess(ctx.path, [Scope.Read])` now runs unconditionally. Comment block rewritten to accurately describe koa-mount semantics (does not touch `ctx.originalUrl`) and to flag the cross-app attachment caveat (see "Plan deviations" below).
- `server/test/support.ts` now builds an outer Koa wrapping `webService()` via `mount(env.BASE_PATH || "/", innerApp)`, so the integration suite mirrors the production outer/inner topology. Added `getSubpathTestServer(basePath)` that snapshots and restores `env.URL` / `sharedEnv.URL` and constructs a fresh server with the supplied mount prefix.
- `server/env.test.ts` (new): unit tests for `BASE_PATH` derivation across `URL` shapes, plus an existence assertion against `env.public`.
- `server/routes/subpath.test.ts` (new): integration tests covering mount routing under both layouts, `/_health` parity, CSRF round-trip, and better-auth handler interception under both `/api/better-auth/*` and `/kms/api/better-auth/*`.

## Key decisions

- **`onerror(outerApp)` instead of `onerror(innerApp)`** — Plan §8 risk #3 stated the intended decision was to keep `onerror` on the inner app, but Koa's request `ctx` is created from the outer app's prototype chain (`outerApp.context`), so a custom `ctx.onerror` must be installed on the outer app to take effect on requests served by the mount. Implementation diverged from the plan and is correct; the plan's stated decision was wrong.
- **Health router on the outer app, before the mount** — `/_health` returns 200 at the outer root regardless of `BASE_PATH`, satisfying spec acceptance criterion #4. Side effect: helmet and the default rate limiter (registered on the inner app) do not apply to `/_health`. Spec accepted this trade-off.
- **CSRF read-scope shortcut now runs unconditionally** — chosen for sub-path correctness (see "Plan deviations" for the latent risk this introduces and the recommended follow-up).
- **No client / HTML / Vite changes in this slice** — `window.env.BASE_PATH` is observable but no consumer reads it yet. Slice 03 (`subpath-client`) is the first consumer.

## Files changed

**Modified:**
- `server/env.ts` — added `BASE_PATH` getter with `@Public`.
- `server/index.ts` — outer/inner Koa split, mount, proxy/onerror placement.
- `server/services/web.ts` — removed `app.proxy = true` (moved to outer app).
- `server/middlewares/csrf.ts` — replaced `ctx.originalUrl` guard; rewrote explanatory comment.
- `server/test/support.ts` — `getTestServer()` now mirrors outer/inner topology; added `getSubpathTestServer(basePath)`.

**Created:**
- `server/env.test.ts` — `BASE_PATH` derivation and `env.public` exposure tests.
- `server/routes/subpath.test.ts` — mount routing, health-probe, CSRF, better-auth integration tests.

**Deliberately NOT modified (out of scope per spec):**
- `.env.example` (working-tree changes from prior, unrelated work — left untouched in this commit; ops doc updates ship with slice 04 per spec).
- HTML template, Vite config, PWA manifest, server-rendered asset URLs (slice 02 — `subpath-assets`).
- React Router, ApiClient, service worker, image literals (slice 03 — `subpath-client`).
- WebSocket / collaboration handlers, `docs/apache-vhost.conf` (slice 04 — `subpath-realtime-and-docs`).

## Plan deviations

1. **`onerror` placement** — Implementation calls `onerror(outerApp)` (production and test). Plan §8 risk #3 stated the decision was to keep `onerror` on the inner only. The implementation is correct (Koa's `ctx` is rooted at `outerApp.context`); the plan's premise was wrong. Inline comment in `server/index.ts:94-97` documents the rationale. No code action required.
2. **CSRF guard removal premise** — Plan §8 risk #1 / §9 step 9 stated the rationale "verifyCSRFToken is only attached via `api.use(...)`, so the guard is redundant." This is **factually incorrect**: `verifyCSRFToken()` is attached on three apps — `server/routes/api/index.ts:75`, `server/routes/auth/index.ts:13`, `server/routes/oauth/index.ts:164`. Dropping the guard expands the read-scope shortcut from API-only to all three surfaces. Today's runtime behavior is preserved by accident: current `/auth/*` and `/oauth/*` route paths (`/microsoft`, `/authorize`, `/token`, `/revoke`, …) do not match any read-scope policy, so the shortcut returns false. **Latent risk:** any future auth/oauth endpoint named like `.list`, `.info`, `.search`, `.config`, `.documents`, `.export` would now silently bypass CSRF protection. The csrf.ts comment was updated to flag this. **Follow-up ticket needed** to either (a) restore an API-route check using a sub-path-aware predicate (e.g. an explicit `verifyCSRFToken({ apiOnly: true })` flag passed only from `api/index.ts`), or (b) add an assertion test that confirms current auth/oauth paths don't hit the read-scope shortcut. Approach (a) is preferred.

## Known issues / tech debt

- **🟡 Jest test infrastructure non-functional in this repo state.** `package.json` test scripts reference `.jestconfig.json` which is not present in any commit nor in the working tree. Running `yarn test` fails immediately with `Error: Can't find a root directory while resolving a config file path`. This is pre-existing (predates this slice). The new `server/env.test.ts` and `server/routes/subpath.test.ts` are therefore unverifiable via `yarn test`. **Compensation in this slice:** manual cURL walkthrough per plan §7 was performed; user confirmed all path-less and path-bearing checks pass (`/_health` at root with both layouts, `/api/*` 404 under sub-path, `/kms/api/*` reaches handlers, better-auth interception, CSRF round-trip, `window.env.BASE_PATH` observable in DevTools). Recommend a `chore: restore jest config` slice as a separate, near-term workstream so slices 02–04 (and the rest of the suite) can be verified automatically.
- **🟡 `env.public.BASE_PATH` is captured once at construction.** `PublicEnvironmentRegister` caches `@Public` values via an `isUndefined` guard, so the value snapshotted at the first `process.nextTick` after Environment construction never refreshes when `env.URL` is mutated at runtime. The mount path captured at app construction in `getSubpathTestServer` is correct (so routing works), but request-time reads of `env.URL` / `env.BASE_PATH` see the path-less default that `server/test/setup.ts` re-applies in `beforeEach`. No handler reads either at request time today, so this slice's tests still pass. Slices 02–03 will need to override the test setup's URL reset for sub-path scenarios — most cleanly by registering a `beforeEach` inside `getSubpathTestServer` (or moving the URL reset from `setup.ts` into a per-test helper). Flagged for follow-up.
- **🟡 CSRF read-scope shortcut now spans `/api`, `/auth`, `/oauth`** — see "Plan deviations" #2. Latent expansion of CSRF-bypass surface; current behavior preserved by accident. Follow-up ticket required.
- **⚪ `server/test/support.ts:48` hardcodes `https://app.outline.dev` as the test domain** while `setSelfHosted()` uses `faker.internet.domainName()` for similar purposes. Cosmetic inconsistency; safe to leave.
- **⚪ `getSubpathTestServer` does not call `sequelize.close()` on disconnect** while `getTestServer()` does. In `subpath.test.ts` the two helpers are used in separate `describe` blocks so ordering is fine, but the asymmetry would bite if both helpers are ever used inside the same `describe`.

## Dependencies for future slices

- **`env.BASE_PATH: string`** is the single source of truth for the deployment sub-path. Always read this; never re-parse `env.URL`. It is `""` for path-less deployments and `/kms` (or similar) for sub-path deployments. Available on the server (via `import env from "@server/env"`) and on the client (via `window.env.BASE_PATH` once slice 03 wires up the client).
- **The mount is set up once in `server/index.ts:202`** via `outerApp.use(mount(env.BASE_PATH || "/", innerApp))`. Slices 02–04 should not add additional mounts at this layer; they should instead read `env.BASE_PATH` to prefix asset URLs (slice 02), client-side router base / API client base (slice 03), and WebSocket paths (slice 04).
- **`/_health` is the only route on the outer app.** Anything that needs to bypass the BASE_PATH (e.g. additional health/metrics endpoints) goes on the outer app, registered before the mount. Everything else stays inside the mount.
- **The CSRF middleware now runs the read-scope check unconditionally.** Future endpoints (especially under `/auth` and `/oauth`) should not be added with `Scope.Read` policies unless they are genuinely safe to call cross-origin without CSRF protection.
- **`getSubpathTestServer(basePath)` is available** for tests that need to exercise sub-path-aware behaviour. It builds the outer-app + mount topology and snapshots/restores `env.URL`. Subsequent slices should reuse this rather than open-coding mount setup.
- **`window.env.BASE_PATH` is exposed but not yet consumed.** Slice 03 should be the first reader. Until then it's dead data, which is fine — the spec required it now so slice 03 doesn't have to revisit `env.ts` / `presenters/env.ts`.
