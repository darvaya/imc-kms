# Slice: subpath-foundation

## Summary
Add the server-side primitives for sub-path-aware deployment: derive a `BASE_PATH` value from `URL.pathname`, expose it to the client via the existing public-env mechanism, wrap the inner Koa app under `mount(BASE_PATH, ...)` so every existing route literal continues to work mount-relative, and fix the two server-side code paths that aren't koa-mount-compatible (a CSRF check that uses `ctx.originalUrl`, and the better-auth handler that runs on the outer app). After this slice the *server* can route requests under `/kms/*` correctly; HTML, assets, client, and WebSockets are out of scope and remain hard-coded at root (handled in slices 2–4).

## Motivation
The first cross-cutting blocker for shared-subdomain deployment (`appstpcid/kms/`) is that nothing in the server knows about a sub-path. Every route is registered at root, every middleware assumes root paths, and there's no single value other code can prefix with. Establishing the env value, mount, and middleware fixes is foundational — every later slice (assets, client, WebSockets) will read `env.BASE_PATH` and assume the mount is in place. Doing it as a standalone slice keeps the change reviewable (no client or build edits mixed in) and produces a verifiable end state via unit/integration tests, even though no user-facing behaviour changes yet.

## User stories
- **As a backend developer**, I want a single derived `BASE_PATH` value driven by the existing `URL` env var, so all server code (and downstream slices) prefix URLs from one source of truth instead of inventing parallel configuration.
- **As a developer running locally or in CI**, I want `URL=https://kms.imcpelilog.co.id` (no path component) to behave exactly as it does on `main`, so my dev environment, the test suite, and the existing dedicated-subdomain deployment are unaffected.

## Acceptance criteria
- [ ] `env.BASE_PATH` is a derived string equal to the path component of `URL` with the trailing slash stripped: `URL=https://host` → `""`, `URL=http://host:3000/kms` → `"/kms"`, `URL=http://host:3000/kms/` → `"/kms"`. Covered by unit tests in `server/env.test.ts` (or equivalent).
- [ ] `BASE_PATH` is included in the object returned by `presentEnv` and reaches `window.env` on the client (verifiable by inspecting the env script tag emitted by `server/routes/app.ts`).
- [ ] When `URL=http://host:PORT/kms` is set and the server boots, requests to `GET /kms/api/*`, `GET /kms/auth/*`, `GET /kms/oauth/*`, and the SPA catch-all `GET /kms/<anything>` reach the same handlers that `/api/*`, `/auth/*`, `/oauth/*`, and `/<anything>` reach today; requests to root paths (e.g. `GET /api/foo` without the prefix) return 404.
- [ ] `GET /_health` returns 200 at the outer host root regardless of `BASE_PATH`, so process-level / load-balancer health probes do not depend on the deployment layout.
- [ ] CSRF-protected mutating API requests succeed under both layouts. Specifically, an integration test that issues `POST /api/<endpoint>` with a valid CSRF cookie+header passes, and the same test with `URL=http://host/kms` and `POST /kms/api/<endpoint>` also passes. (Verifies the `csrf.ts` `ctx.originalUrl` → `ctx.path` fix.)
- [ ] better-auth handler intercepts requests to better-auth endpoints under both `/api/better-auth/*` (path-less `URL`) and `/kms/api/better-auth/*` (path-bearing `URL`). The handler placement is such that its existing `ctx.path.startsWith("/api/better-auth")` check works without modification. (Verifies the handler is moved inside the mount.)
- [ ] The full pre-existing test suite (`yarn test`) passes unchanged with `URL` set to a path-less domain in `server/test/setup.ts` / `server/test/support.ts`.

## Scope
### In scope
- Add a `BASE_PATH` getter (or property) to the `Environment` class in `server/env.ts`. It must handle URLs with no path (`""`), URLs with a single-segment path (`"/kms"`), URLs with a trailing slash (normalize to no trailing slash), and URLs with multi-segment paths (preserve all segments).
- Annotate `BASE_PATH` with `@Public` so it's exposed via `PublicEnvironmentRegister` and reaches `window.env`.
- Refactor `server/index.ts` so the existing outer Koa app retains the `/_health` router, but every service that previously attached to the outer app now attaches to a new inner Koa app, and the outer app finishes with `outerApp.use(mount(env.BASE_PATH || "/", innerApp))`. (koa-mount short-circuits when prefix is `/`, so the path-less code path is a no-op.)
- Move the `betterAuthHandler()` registration from the top of `server/services/web.ts` to a position where it runs *inside* the mount (so its `ctx.path.startsWith("/api/better-auth")` check sees mount-relative paths).
- Change `server/middlewares/csrf.ts` to use `ctx.path.startsWith("/api/")` instead of `ctx.originalUrl.startsWith("/api/")`. (koa-mount rewrites `ctx.path` but not `ctx.originalUrl`, so the original code would mis-detect API requests under `/kms/api/`.)
- Add tests for the `BASE_PATH` derivation and for the mounted-vs-unmounted route behaviour. Where helpful, parameterize an existing integration test to run under both layouts.

### Out of scope
- Any change to the HTML template, Vite config, PWA manifest, or server-rendered asset URLs. The page will appear broken in a browser when actually deployed under `/kms/` after this slice — that's fixed in `subpath-assets`.
- Any client-side change (React Router, ApiClient, service worker, image literals). Handled in `subpath-client`.
- Any WebSocket or collaboration handler change. Handled in `subpath-realtime-and-docs`.
- Updating `docs/apache-vhost.conf` or `.env.example`. The deployment-doc updates ship with the WebSocket slice so ops gets a single coherent change.
- Removing, renaming, or repurposing existing env vars. `URL` semantics are preserved (we just start reading the path component).

## Technical notes
- **koa-mount semantics**: `mount(prefix, app)` rewrites `ctx.path` to be mount-relative for the lifetime of the request and restores it afterwards. It does *not* touch `ctx.originalUrl` or `ctx.url`. It also short-circuits when `prefix === "/"` and returns the inner middleware unchanged — so passing `BASE_PATH || "/"` is the empty-path no-op pattern.
- **Mount placement**: every existing `app.use(...)` in `server/services/web.ts` keeps its current ordering inside the inner app. The only middleware that should remain on the *outer* app is the `/_health` router (so health probes don't depend on the prefix). Helmet, CSP, CSRF token attachment, body parsing, etc. all belong on the inner app so they apply to mounted routes consistently.
- **`URL` validation already permits paths**: `server/env.ts:206-211` validates `URL` with `@IsUrl({ require_tld: false })` and only strips a trailing slash. `URL=http://host/kms` already passes today; we just don't read the path component. Verify the trim regex doesn't strip an intermediate `/` (it shouldn't — the regex is `/\/$/`).
- **Test-suite implication**: `server/test/setup.ts` and `server/test/support.ts` set `env.URL` to path-less domains for every test run, so the `BASE_PATH=""` code path is exercised by the entire existing suite. New tests must explicitly set `env.URL = "https://host/kms"` and tear down afterwards to cover the path-bearing branch.
- **`env.URL` users elsewhere are unaffected**: code that does `${env.URL}/api/foo` will start producing `http://host/kms/api/foo` automatically when `URL` includes the path — this is intentional and correct. No call sites need changing in this slice.
- **Process-isolation**: `server/index.ts` may run under `throng` cluster mode. The mount must be set up inside `start()` (the per-worker function), not `master()`, so each worker registers it. The current service init loop already runs in `start()`, so wrapping `innerApp` there is the right place.

## Dependencies
- None. This is the entry slice for the sub-path workstream.
