# Plan: 01-subpath-foundation

## 1. Goal

Establish server-side primitives for sub-path-aware deployment so the application can be served at e.g. `https://appstpcid/kms/` instead of (or in addition to) a dedicated subdomain. Concretely: derive `BASE_PATH` from the path component of `URL`, expose it on the `Environment` class with `@Public` so it reaches `window.env`, split the existing single Koa app into an outer app (carrying only `/_health`) and an inner app (carrying every existing route and middleware), and wrap the inner app in `koa-mount(env.BASE_PATH || "/")` so existing route literals (`/api/*`, `/auth/*`, `/oauth/*`, the SPA catch-all) keep working mount-relative. Fix the two server-side code paths that aren't koa-mount-compatible — the `ctx.originalUrl` guard in `csrf.ts` and the placement of `betterAuthHandler` (it must execute inside the inner mount). After this slice the server routes correctly under `/kms/*`; HTML/asset URLs, the client, and WebSockets still hard-code root and will be addressed in slices 02–04.

## 2. Files to create / modify

| File path | Action | Purpose |
|-----------|--------|---------|
| `server/env.ts` | modify | Add `BASE_PATH` getter that parses the path component of `this.URL` (no trailing slash, `""` for path-less URLs) and annotate it with `@Public` so it flows through `PublicEnvironmentRegister` to `window.env`. |
| `server/env.test.ts` | create | Unit tests for `BASE_PATH` derivation across `URL` shapes (empty path, single segment, trailing slash, multi-segment, port + path). |
| `server/index.ts` | modify | Refactor `start()`: keep the outer Koa app but limit its middleware to `/_health` plus things that must see the unmodified URL (proxy flag in production); construct an `innerApp = new Koa()`; pass `innerApp` to each service init function instead of the outer app; finish with `outerApp.use(mount(env.BASE_PATH || "/", innerApp))`. Move `helmet()`, `defaultRateLimiter()`, the optional `koa-logger`, `onerror(...)`, and the `redirectOnClient` context method onto the inner app. Set `outerApp.proxy = true` (production) so X-Forwarded-* headers are trusted regardless of which app reads them. |
| `server/services/web.ts` | modify | Remove the `app.proxy = true` line (the outer app now owns proxy trust). No other changes — `betterAuthHandler()` registration stays where it is; running inside the new inner app (and therefore inside the BASE_PATH mount) is what satisfies the spec's "runs inside the mount" requirement. |
| `server/middlewares/csrf.ts` | modify | Replace `ctx.originalUrl.startsWith("/api/")` (line 58) with `ctx.path.startsWith("/api/")`. The middleware is registered via `api.use(verifyCSRFToken())` inside the `/api` mount, so `ctx.path` has already had `/api` stripped here — see Risks §8 for the trade-off this introduces and the recommended adjustment. |
| `server/test/support.ts` | modify | `getTestServer()` builds an outer Koa wrapping the existing `webService()` inner app via `mount(env.BASE_PATH || "/", innerApp)`, so the integration suite exercises the same outer/inner topology as production. Add an exported helper (e.g. `getSubpathTestServer(basePath: string)`) that snapshots and restores `env.URL`/`sharedEnv.URL` and constructs a server whose mount uses the supplied path. |
| `server/routes/subpath.test.ts` | create | New integration test file covering: (a) `GET /kms/api/auth.info` reaches the same handler as `GET /api/auth.info` under path-less URL; (b) `GET /api/...` returns 404 when `BASE_PATH=/kms`; (c) `GET /_health` returns 200 at the outer root with both `BASE_PATH=""` and `BASE_PATH="/kms"`; (d) `POST /kms/api/<mutating endpoint>` succeeds with valid CSRF cookie+header (mirrors an existing path-less CSRF-success test); (e) better-auth handler intercepts `/api/better-auth/*` AND `/kms/api/better-auth/*` (verified via a spy on `getBetterAuth` or a recognizable handler response). |

No other files are modified. Specifically, no client code, no HTML template, no Vite config, no `apache-vhost.conf`, no `.env.example` — those belong to later slices.

## 3. Schema / data changes

None. No database migrations, no model changes, no shared type additions beyond what flows naturally from the new `BASE_PATH` public env var (which surfaces on `window.env` as `BASE_PATH: string`; the `PublicEnv` shared type already accepts string-valued additions through `env.public` spread in `server/presenters/env.ts`).

## 4. API endpoints

No new endpoints. Existing endpoints behave as follows after this slice:

| Method | Path under path-less URL | Path under URL=`http://host/kms` | Notes |
|--------|--------------------------|----------------------------------|-------|
| any    | `/api/*`                 | `/kms/api/*`                     | Routed via `mount(BASE_PATH, innerApp)` then inner `mount("/api", api)`. |
| any    | `/auth/*`                | `/kms/auth/*`                    | Same mount mechanism. |
| any    | `/oauth/*`               | `/kms/oauth/*`                   | Same mount mechanism. |
| GET    | `/<anything>`            | `/kms/<anything>`                | SPA catch-all in `routes/index.ts`. |
| GET    | `/_health`               | `/_health` (root, **not** `/kms/_health`) | Stays on outer app so process-level / load-balancer health probes don't depend on the prefix. |
| any    | `/api/better-auth/*`     | `/kms/api/better-auth/*`         | Handler intercepts via `ctx.path.startsWith("/api/better-auth")` against mount-relative path. |

Auth requirements and request/response shapes are unchanged — this slice does not modify any handler.

## 5. Components & UI

None. No React components are added or modified. The new `BASE_PATH` value reaches `window.env` (via `presentEnv` → `env.public`) and is observable in DevTools, but no client code reads it yet. Slice 03 (`subpath-client`) will consume it.

## 6. Implementation order

### Phase A — Environment (verifiable independently)

1. **Add `BASE_PATH` getter to `Environment`.** In `server/env.ts`, declare a class-level getter (or computed property) immediately after the `URL` definition. Logic: parse `this.URL` with the WHATWG `URL` constructor, take `pathname`, strip a trailing `/` if present, and return the result (which is `""` for path-less URLs because `pathname` of `https://host` is `/`). Annotate with `@Public`. Verify by running the new `env.test.ts` (Phase A).
2. **Write `server/env.test.ts`.** Cover at minimum: `URL=https://host` → `""`, `URL=https://host/` → `""`, `URL=https://host/kms` → `"/kms"`, `URL=https://host/kms/` → `"/kms"`, `URL=http://host:3000/kms/nested` → `"/kms/nested"`, `URL=http://host:3000/kms/nested/` → `"/kms/nested"`. Also assert `BASE_PATH` shows up in `env.public`. The test must not rely on a fresh `Environment` instance per case if instantiation has global side-effects — instead, mutate `env.URL` in `beforeEach`/`afterEach` and read `env.BASE_PATH` (the getter recomputes each call).
3. **Run `yarn test server/env.test.ts`** to confirm green before proceeding.

### Phase B — Mount refactor (server boots, existing tests still pass)

4. **Construct `innerApp` in `server/index.ts`.** Inside `start()`, after the existing `app = new Koa()` line, add `const innerApp = new Koa()`. Set `outerApp.proxy = env.isProduction ? true : false` (or just `true` when production). Move `app.use(helmet())`, `app.use(defaultRateLimiter())`, the optional `app.use(logger(...))`, the `app.context.redirectOnClient = ...` assignment, and `onerror(app)` to operate on `innerApp` instead. Keep the `/_health` Router on the outer app unchanged.
5. **Pass `innerApp` to service init.** Change the service-init loop from `await init(app, server, env.SERVICES)` to `await init(innerApp, server, env.SERVICES)`. (`websockets`, `collaboration`, `worker`, `cron` ignore the `app` argument — only `web` and `admin` use it, and both should attach to the inner app.)
6. **Wrap with `mount` once services are initialized.** After the service init loop, before `server.listen(...)`, call `outerApp.use(mount(env.BASE_PATH || "/", innerApp))`. Order matters: the outer `/_health` Router and any other outer-app middleware must be registered before the mount, so health probes are answered without entering the inner app. Import `mount` from `koa-mount` at the top of the file.
7. **Remove `app.proxy = true` from `server/services/web.ts`.** The setting now lives on the outer app in `server/index.ts`. Keep the rest of `web.ts` byte-for-byte identical — `betterAuthHandler()` stays at its current line number and runs on whatever app the caller passes (now the inner app, which is exactly what the spec requires).
8. **Run the full pre-existing test suite** (`yarn test`) to confirm green. Tests use path-less URLs so `BASE_PATH=""` and `mount("/", innerApp)` is a no-op.

### Phase C — CSRF guard fix

9. **Replace the `ctx.originalUrl` guard in `server/middlewares/csrf.ts`** with `ctx.path.startsWith("/api/")` per the spec's literal scope. Acknowledge the trade-off (see §8): inside the `/api` mount `ctx.path` no longer includes `/api`, so this guard never matches and the read-only-scope shortcut is effectively disabled. Recommend instead removing the guard outright and unconditionally running `AuthenticationHelper.canAccess(ctx.path, [Scope.Read])` — `verifyCSRFToken` is only ever attached via `api.use(...)` so we already know we're on an API route. Pick one approach in implementation; flag the choice in the slice's `completed.md`.

### Phase D — Test-server mount + new integration tests

10. **Update `getTestServer()` in `server/test/support.ts`** to construct an outer Koa, apply `onerror(outerApp)`, and `outerApp.use(mount(env.BASE_PATH || "/", innerApp))`, where `innerApp = webService()`. The TestServer wraps the outer. With path-less URL (which `setup.ts` enforces per `beforeEach`), the mount is a no-op so no existing test changes behavior.
11. **Export `getSubpathTestServer(basePath: string)` in `server/test/support.ts`.** It snapshots `env.URL` / `sharedEnv.URL`, sets them to a path-bearing value matching `basePath`, builds a fresh server with `mount(basePath, webService())`, and registers `afterAll` to restore the snapshots.
12. **Write `server/routes/subpath.test.ts`** with the cases listed in §2. Reuse existing factories (`buildUser`, etc.) where helpful and pattern-match against existing route tests in `server/routes/index.test.ts`. For the better-auth interception test, mock `getBetterAuth` (via `jest.mock("@server/auth/betterAuth")`) so the handler short-circuits with a recognizable status/body and does not require a live OIDC config.
13. **Run `yarn test server/routes/subpath.test.ts` and `yarn test server/env.test.ts`** to confirm green, then `yarn test` to confirm no regressions across the rest of the suite.

## 7. Manual test walkthrough

Each block is intended to be runnable in one terminal session against a local checkout.

**Path-less URL (regression check — must behave identically to `main`):**

1. In `.env.local`, set `URL=http://localhost:3100` (no trailing path).
2. `yarn dev` (or whichever script the project uses for the web service).
3. `curl -i http://localhost:3100/_health` → expect `HTTP/1.1 200 OK` with body `OK`.
4. `curl -i http://localhost:3100/api/auth.info` → expect a normal API response (likely 401 because no auth, but **not** 404).
5. Open `http://localhost:3100` in a browser, sign in, watch DevTools → `window.env.BASE_PATH` should be `""`.

**Path-bearing URL (new behavior under this slice):**

6. Stop the server. Set `URL=http://localhost:3100/kms` in `.env.local`. Restart `yarn dev`.
7. `curl -i http://localhost:3100/_health` → still `HTTP/1.1 200 OK`. (Health probes don't move.)
8. `curl -i http://localhost:3100/api/auth.info` → expect `HTTP/1.1 404 Not Found` because routes are now under `/kms/`.
9. `curl -i http://localhost:3100/kms/api/auth.info` → expect a normal API response (401 without auth). This proves the mount routes correctly.
10. `curl -i http://localhost:3100/kms/auth/microsoft` → expect a normal auth handler response (probably a redirect to Microsoft) — proves auth routes also work mount-relative.
11. `curl -X POST -i http://localhost:3100/kms/api/better-auth/sign-in/social -H "Content-Type: application/json" -d '{"provider":"microsoft"}'` (or whichever payload better-auth expects) → expect a better-auth response, **not** a 404 from the inner SPA catch-all. Confirms the better-auth handler is now inside the mount.
12. CSRF round-trip: open `http://localhost:3100/kms/` in a browser and sign in. In DevTools, copy the CSRF cookie value. From a separate terminal, issue `POST /kms/api/<a mutating endpoint>` with `Cookie: <session+csrf>` and `X-CSRF-Token: <cookie value>` headers. Expect 2xx (or normal 4xx for business reasons), **not** a CSRF error. Repeat with the cookie+header values intentionally mismatched and confirm a CSRF error.
13. Browser DevTools console: `window.env.BASE_PATH` should now report `"/kms"`. (HTML/asset URLs will still be broken — that's slice 02's job. Verifying just the env var here.)

**Cleanup:**

14. Restore `URL` to whatever value the developer normally uses; restart the server.

## 8. Risks & open questions

1. **CSRF guard semantics post-fix.** `verifyCSRFToken` is registered via `api.use(verifyCSRFToken())` (`server/routes/api/index.ts:75`), so by the time it runs, koa-mount has already stripped `/api` from `ctx.path`. The spec's literal change `ctx.path.startsWith("/api/")` will therefore never match, and the read-only-scope shortcut for write-method-but-read-scope endpoints (e.g. `documents.search` is `POST` but scoped `Read`) is silently disabled — every mutating request gets full CSRF protection, which is *more* protective but a behavior change. **Recommended adjustment:** drop the guard entirely and call `AuthenticationHelper.canAccess(ctx.path, [Scope.Read])` unconditionally. Since the middleware only runs on API routes, the guard is redundant. Confirm with the user before implementing.
2. **`app.proxy` placement.** Today `app.proxy = true` is set on the (single) Koa app inside `server/services/web.ts`. After the refactor, that line would set `proxy` on the *inner* app, but `ctx` is created from the outer app, so the inner setting has no effect on `ctx.protocol` / `ctx.ips`. The plan moves the assignment to the outer app inside `server/index.ts`. This is a correctness fix that arguably belongs in the spec but isn't called out — flagging here so the reviewer can confirm.
3. **`onerror` placement.** `onerror(app)` currently runs on the (single) outer app in `server/index.ts:87`. The plan keeps the call site but the argument switches to the inner app (so `ctx.onerror` is set on the inner Koa context, which is what processes most requests). A second `onerror` on the outer app is harmless if needed; but errors from inner middleware bubble through the mount middleware and reach the outer app's default error handler, which is acceptable. Decision: keep onerror on the inner only, matching current behavior for /api etc. Open to user override.
4. **`window.env.BASE_PATH` consumers.** No one reads `window.env.BASE_PATH` yet. Slice 03 is the first consumer. Until then it's dead data, but we still need to ship it now so slice 03 doesn't have to revisit `env.ts` / `presenters/env.ts`.
5. **`docs/implementation/workflow.md` is missing.** The plan-skill instructions say to read it, but it does not exist in the repo. There are also no prior `completed.md` files (this is the entry slice). The plan was written using only the slice spec and the docs in `docs/`. If the user expects a workflow doc, surface this and pause before `/implement`.
6. **`PublicEnvironmentRegister` and getters.** The decorator stores property keys on the prototype and `registerEnv` reads `env[k]`, which invokes a getter. Because `registerEnv` is scheduled with `process.nextTick(...)` inside the constructor, by the time it runs `this.URL` has been assigned and the `BASE_PATH` getter returns the correct value. Verified by reading `server/utils/decorators/Public.ts`. Low risk, but the unit test in step 2 asserts `BASE_PATH` is in `env.public` to lock this in.
7. **Test-server topology divergence.** `getTestServer()` previously instantiated `webService()` directly; tests historically did not exercise an outer/inner split. The refactor in step 10 wraps it in an outer + mount so the test topology mirrors production. With path-less URLs the mount is a no-op, so behavioral equivalence holds — but any test that asserts on `ctx.app === <specific instance>` or relies on the absence of an outer wrapper will need a one-line update. None expected, but worth a `git grep ctx.app` pass during implementation.
8. **Rate limiter and helmet on inner means /_health is unprotected by them.** Spec accepts this trade-off ("health probes don't depend on the prefix"). The default rate limiter currently runs on every request including `/_health`; after the refactor, `/_health` bypasses it. If the deployment relies on rate-limiting health probes (unlikely), call this out. Recommended: leave as-is.
9. **Multi-segment / nested base paths.** Spec says preserve all segments (`URL=http://host/a/b` → `BASE_PATH="/a/b"`). koa-mount handles nested prefixes natively. Tests in step 2 cover this; runtime is unchanged because the mount string is just passed through.
10. **No dependency on later slices.** Slice 02 (assets) is the next consumer and depends only on `env.BASE_PATH` being set on the server and exposed via `window.env`. Both are delivered by this slice. No forward references in code.

---

Plan written to `docs/implementation/slices/01-subpath-foundation/plan.md`. Please review and approve before running `/implement 01-subpath-foundation` in a new session.
