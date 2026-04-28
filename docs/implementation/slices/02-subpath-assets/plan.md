# Plan: 02-subpath-assets

## 1. Goal

With `subpath-foundation` (slice 01) routing `/kms/*` requests to the inner Koa app and exposing `env.BASE_PATH` on both server and client, this slice gets every server-rendered HTML asset URL and every Vite-build-time URL onto the prefix. After this slice a hard-refresh of `http://host:PORT/kms/` renders HTML whose every `<script>`, `<link rel="manifest|search|sitemap|shortcut icon|apple-touch-icon|prefetch>`, inline-CSS `@font-face` `src`, and PWA-manifest icon URL is reachable under the prefix; `yarn vite:build` emits a manifest whose `base`-resolved chunk and CSS-asset URLs are absolute under `${CDN_URL}${BASE_PATH}/static/`; the service-worker URL prefix matches the deployment layout. The SPA itself is still broken because `ApiClient.baseUrl`, the React Router basename, the SW registration call, and the editor's `/images/...` literals are unchanged — those land in `subpath-client` (slice 03).

## 2. Files to create / modify

| File path | Action | Purpose |
|-----------|--------|---------|
| `shared/utils/basePath.ts` | create | Pure helper `parseBasePath(url: string \| undefined): string` that returns the path component of a URL with the trailing slash stripped (`""` for path-less, `"/kms"` for `https://host/kms` or `https://host/kms/`, multi-segment preserved). Tiny, dependency-free so it can be imported from both `server/env.ts` (Node runtime) and `vite.config.ts` (build context, where importing `class-validator`-using `server/env.ts` is unsafe). |
| `shared/utils/basePath.test.ts` | create | Unit tests covering: empty/undefined input → `""`, `https://host` → `""`, `https://host/` → `""`, `https://host/kms` → `"/kms"`, `https://host/kms/` → `"/kms"`, `http://host:3000/a/b` → `"/a/b"`, `http://host:3000/a/b/` → `"/a/b"`. |
| `server/env.ts` | modify | Replace the inline `URL.pathname` parser inside the `BASE_PATH` getter (lines ~219–225) with a call to `parseBasePath(this.URL)` from `@shared/utils/basePath`. Behavior is preserved; this just removes a duplication. The existing `server/env.test.ts` should continue to pass unchanged. |
| `server/routes/app.ts` | modify | Prefix every literal asset URL with `${env.BASE_PATH}`: shortcutIcon default (line 67), Vite production entry script `src` (line 101), sitemap link in shared-doc head (line 127), manifest link (line 132), apple-touch-icon (line 136), opensearch link (line 142). Refactor `viteHost` (line 21) to derive from `URL.origin` (path stripped) so dev-mode Vite client `<script>` tags (lines 110–111) can prefix BASE_PATH explicitly without doubling. Change the `{cdn-url}` template substitution (line 159) to `${env.CDN_URL || ""}${env.BASE_PATH}` so the inline-CSS `@font-face` `src` URLs in `server/static/index.html` automatically pick up the prefix without an extra template token. |
| `server/utils/prefetchTags.tsx` | modify | Lines 53 and 63: change `${env.CDN_URL || ""}/static/${file}` to `${env.CDN_URL || ""}${env.BASE_PATH}/static/${file}` for both `.js` (script prefetch) and `.css` (style prefetch) variants. |
| `server/routes/app.test.ts` | create | Integration tests using `getTestServer()` and `getSubpathTestServer("/kms")`. Render the home-page HTML for both layouts and assert: (a) under path-less URL, no `/kms/` substring appears anywhere in the body, every literal asset URL begins with `/static/`/`/images/`/`/api/`/`/opensearch.xml`; (b) under `BASE_PATH=/kms`, every literal asset URL begins with `/kms/static/`, `/kms/images/`, `/kms/api/`, `/kms/opensearch.xml`, and the `{cdn-url}` substitution result includes `/kms` so inline `@font-face` `src` resolves to `/kms/fonts/Inter.var.woff2` and `/kms/fonts/Inter-italic.var.woff2`. Use the existing `routes/index.test.ts` style (`server.get("/")` for path-less, `server.get("/kms/")` for sub-path). |
| `vite.config.ts` | modify | (a) Compute `const BASE_PATH = parseBasePath(environment.URL)` at the top, importing from `@shared/utils/basePath` (relative path, since vite.config.ts already imports `./server/utils/environment` directly). (b) Update `base` (line 31) to `(environment.CDN_URL ?? "") + BASE_PATH + "/static/"`. (c) Update `workbox.modifyURLPrefix` (lines 56–58) so the rewritten prefix is `${environment.CDN_URL ?? ""}${BASE_PATH}/static/`. (d) Update `manifest.start_url` (line 99) from `"/"` to `` `${BASE_PATH}/` ``. (e) Update `manifest.scope` (line 100) from `"."` to `` `${BASE_PATH}/` ``. (f) Update each of the three `manifest.icons[i].src` entries (lines 108, 113, 119) from `/images/icon-192.png` / `/images/icon-512.png` to `` `${BASE_PATH}/images/icon-192.png` `` and `` `${BASE_PATH}/images/icon-512.png` ``. |

No other files are touched. Specifically: `server/static/index.html` is **not** modified — the `{cdn-url}` substitution change in `app.ts` carries the BASE_PATH into the inline-CSS font URLs without a new template token. `app/index.tsx`, `app/utils/ApiClient.ts`, `app/utils/history.ts`, the editor `/images/...` literals, `docs/apache-vhost.conf`, and `.env.example` are deferred to slices 03 and 04.

## 3. Schema / data changes

None. No database migrations, no new Sequelize models, no shared TypeScript type additions. The new `shared/utils/basePath.ts` exports a single function — no type surface beyond the function signature.

## 4. API endpoints

None. No HTTP routes are added or modified. The asset URLs emitted by the existing routes change shape (gain a `${BASE_PATH}` prefix), but no handler logic, request shape, or response shape changes.

For reference, the asset URLs that change shape are all served by handlers established earlier:

| Concern | Path-less URL | `URL=http://host/kms` |
|---------|--------------|-----------------------|
| Vite chunk script (production) | `/static/<hashed>.js` | `/kms/static/<hashed>.js` |
| Vite dev-mode `@vite/client` | `http://host:3001/static/@vite/client` | `http://host:3001/kms/static/@vite/client` |
| Vite dev-mode entry | `http://host:3001/static/app/index.tsx` | `http://host:3001/kms/static/app/index.tsx` |
| `<link rel="manifest">` | `/static/manifest.webmanifest` | `/kms/static/manifest.webmanifest` |
| `<link rel="sitemap">` (shares) | `/api/shares.sitemap?id=<id>` | `/kms/api/shares.sitemap?id=<id>` |
| `<link rel="search">` opensearch | `/opensearch.xml` | `/kms/opensearch.xml` |
| `<link rel="shortcut icon">` | `/images/favicon-32.png` (or CDN) | `/kms/images/favicon-32.png` (or `<CDN>/kms/images/favicon-32.png`) |
| `<link rel="apple-touch-icon">` | `/images/apple-touch-icon.png` | `/kms/images/apple-touch-icon.png` |
| `<link rel="prefetch">` JS/CSS | `/static/<hashed>.<ext>` | `/kms/static/<hashed>.<ext>` |
| Inline `@font-face` `src` | `/fonts/Inter.var.woff2` | `/kms/fonts/Inter.var.woff2` |
| PWA manifest `start_url` | `/` | `/kms/` |
| PWA manifest `scope` | `/` | `/kms/` |
| PWA manifest `icons[*].src` | `/images/icon-{192,512}.png` | `/kms/images/icon-{192,512}.png` |
| Workbox cached-asset URL prefix | `/static/` | `/kms/static/` |

## 5. Components & UI

None. No React components are added or modified. The Vite PWA manifest changes are JSON-config edits in `vite.config.ts`; they affect the emitted `manifest.webmanifest` file but no React tree.

## 6. Implementation order

### Phase A — Shared `parseBasePath` helper

1. **Create `shared/utils/basePath.ts`** exporting `parseBasePath(url: string | undefined): string`. Logic: if `url` is empty/undefined, return `""`; otherwise construct `new URL(url)`, take `pathname`, return `""` if the pathname is `"/"` else strip a trailing `/` if present. Pure function, no other imports.
2. **Create `shared/utils/basePath.test.ts`** with the cases listed in §2. Co-located with the helper, matching the project convention (`shared/utils/parseDocumentSlug.test.ts` etc.).
3. **Refactor `server/env.ts`** `BASE_PATH` getter to delegate to `parseBasePath(this.URL)`. The existing test cases in `server/env.test.ts` (created in slice 01) continue to assert the same behavior, so green status confirms behavioral equivalence.

### Phase B — Server-rendered HTML asset URLs

4. **Update `server/routes/app.ts` line 21 (`viteHost`)** to derive from `URL.origin` so the path component is stripped before the dev-server port swap. Concretely: `const viteHost = (() => { const u = new URL(env.URL); u.port = "3001"; return u.origin; })();` (or equivalent — implementation detail, but the result must be `protocol://host:3001` with no path). This unblocks adding `${env.BASE_PATH}` explicitly at the use sites in step 5 without producing a doubled prefix like `/kms/kms/static/...`.
5. **Update `server/routes/app.ts`** to inject `${env.BASE_PATH}` at every literal asset URL (lines listed in §2 row 4). For the three `<script>` tags in dev/prod (lines 100–111), the prefix goes immediately before `/static/`. For the icon and `<link>` tags (lines 67, 127, 132, 136, 142), the prefix is the leading segment of the URL (after CDN, where present). For line 159, change `.replace(/\{cdn-url\}/g, env.CDN_URL || "")` to `.replace(/\{cdn-url\}/g, (env.CDN_URL || "") + env.BASE_PATH)`. This last change is what carries the prefix into `server/static/index.html`'s inline `@font-face` URLs.
6. **Update `server/utils/prefetchTags.tsx`** lines 53 and 63 to insert `${env.BASE_PATH}` between `${env.CDN_URL || ""}` and `/static/${file}`.

### Phase C — Vite build configuration

7. **Update `vite.config.ts`**: import `parseBasePath` from `./shared/utils/basePath` (or appropriate relative path — `vite.config.ts` is at the repo root and already imports `./server/utils/environment`). At the top of the file, after the existing `let host: string | undefined` block, derive `const BASE_PATH = parseBasePath(environment.URL)`.
8. **Update Vite `base` (line 31)** from `(environment.CDN_URL ?? "") + "/static/"` to `(environment.CDN_URL ?? "") + BASE_PATH + "/static/"`. This sets the prefix that emitted chunk filenames, dynamic-import URLs, and CSS-relative asset URLs are resolved against.
9. **Update `workbox.modifyURLPrefix` (lines 56–58)** so the rewritten value is `${environment.CDN_URL ?? ""}${BASE_PATH}/static/`. The empty-string key matches all paths; this rewrites the SW-cached asset URLs to live under the prefix.
10. **Update PWA manifest fields**: `manifest.start_url` (line 99) from `"/"` to `` `${BASE_PATH}/` ``; `manifest.scope` (line 100) from `"."` to `` `${BASE_PATH}/` ``; the three `manifest.icons[i].src` entries (lines 108, 113, 119) to include the prefix. With path-less `URL`, `BASE_PATH = ""` so `start_url` and `scope` collapse to `"/"` and the icon paths to `/images/icon-{192,512}.png` — preserving today's behavior.

### Phase D — Tests

11. **Create `server/routes/app.test.ts`**. Two `describe` blocks mirroring `server/routes/subpath.test.ts`'s topology:
    - Block 1 (`getTestServer()`, path-less URL): `GET /` returns 200 with HTML body. Assert the body **does not contain** `/kms/`. Assert the body contains expected literal asset patterns: `<link rel="manifest" href="/static/manifest.webmanifest"`, `<link rel="search" type="application/opensearchdescription+xml" href="/opensearch.xml"`, `<link rel="apple-touch-icon" type="image/png" href="/images/apple-touch-icon.png"`, `<link rel="shortcut icon" type="image/png" href="/images/favicon-32.png"`. For shared documents (`GET /s/<published-share-id>`), assert `<link rel="sitemap" type="application/xml" href="/api/shares.sitemap?id=<id>"`. Inline CSS contains `src: url("/fonts/Inter.var.woff2")`.
    - Block 2 (`getSubpathTestServer("/kms")`, `URL` includes `/kms`): `GET /kms/` returns 200. Same assertions but with `/kms` prefix in front of every asset URL. For shared docs, `GET /kms/s/<id>` similarly.
    - For Vite-production-mode script-tag assertions, set `env.isProduction = true` (or use the existing test layout where `readManifestFile` returns the test fixture / empty manifest) inside the test and assert the script `src` is `/kms/static/<file>`. If toggling `env.isProduction` is brittle, gate the production-script assertion behind a conditional and assert the dev-mode `<script>` tag pattern (`http://*:3001/kms/static/@vite/client`) instead — pick whichever matches the test environment's `env.isProduction` value.
12. **Run the relevant test files** (`yarn test shared/utils/basePath.test.ts`, `yarn test server/env.test.ts`, `yarn test server/routes/app.test.ts`, `yarn test server/routes/subpath.test.ts`) to confirm green. Then `yarn test` to confirm no regressions across the full suite. **NOTE:** per slice 01's `completed.md` "Known issues / tech debt", the jest config (`.jestconfig.json`) is missing from the working tree, so `yarn test` currently fails at config resolution and the new tests are unverifiable via the existing harness. If this is still the case at implementation time, fall back to manual verification per §7 and flag in `completed.md`.

### Phase E — Smoke verification

13. **Build & run with path-less URL.** Set `URL=http://localhost:3100` in `.env.local`. Run `yarn vite:build` then `yarn dev`. Hard-refresh `http://localhost:3100/`. In DevTools network tab, confirm zero asset 404s. View source / DevTools "view rendered HTML": grep for `/kms/` should return zero matches.
14. **Build & run with sub-path URL.** Set `URL=http://localhost:3100/kms` in `.env.local`. Run `yarn vite:build` (rebuild — the manifest is baked at build time), then `yarn dev`. Hard-refresh `http://localhost:3100/kms/`. In DevTools network tab, confirm zero asset 404s — every `<script>`, `<link>`, font, image referenced by the initial HTML returns 200. Open DevTools → Application → Manifest, confirm `start_url`/`scope`/`icons[*].src` all show `/kms/...`. The SPA itself will not be interactive (React Router basename, ApiClient base, SW registration are all still root-relative — slice 03's job).
15. **Restore developer's normal `URL`** when smoke verification is complete.

## 7. Manual test walkthrough

Each block is one terminal session against a local checkout. Total time ≈10 min.

### Pre-build for path-less layout

1. In `.env.local`, set `URL=http://localhost:3100` (no path component).
2. Run `yarn vite:build`. Confirm `build/app/.vite/manifest.json` is regenerated.
3. Run `yarn dev` (or `yarn start` for production-mode).

### Path-less URL — regression check (must behave identically to `main`)

4. `curl -s http://localhost:3100/ | head -100` → confirm HTML body. Grep the response for `/kms/` — expect zero matches.
5. Open `http://localhost:3100/` in a browser, sign in. DevTools network tab → confirm every asset request (scripts, stylesheets, fonts, images, manifest) returns 200. No URL contains `/kms/`.
6. DevTools Application → Manifest panel → confirm `start_url: /`, `scope: /`, `icons[*].src: /images/icon-{192,512}.png`.

### Re-build for sub-path layout

7. Stop the server. Set `URL=http://localhost:3100/kms` in `.env.local`. Run `yarn vite:build` (manifest must be rebuilt — `base` is baked in at build time). Restart `yarn dev`.

### Path-bearing URL — new behavior under this slice

8. `curl -i http://localhost:3100/_health` → expect `HTTP/1.1 200 OK` (foundation slice — should already work).
9. `curl -s http://localhost:3100/kms/ | grep -E '(href|src)='` → expect every `href`/`src` value to start with `/kms/` (or with `https://<cdn-host>/kms/` if `CDN_URL` is set), or be a fully-qualified URL pointing at the dev server with `/kms/` in the path. Spot-check the `<link rel="manifest">` href is `/kms/static/manifest.webmanifest`, the `<script>` `src` is `http://localhost:3001/kms/static/@vite/client` (dev) or `/kms/static/<hashed>.js` (prod).
10. Inline CSS check: `curl -s http://localhost:3100/kms/ | grep 'Inter.var.woff2'` → expect `src: url("/kms/fonts/Inter.var.woff2")`.
11. Browser hard-refresh `http://localhost:3100/kms/`. DevTools network tab → every request returns 200 (no 404s on assets). Note: SPA still won't be interactive (React Router/ApiClient/SW are root-relative — that's slice 03).
12. DevTools Application → Manifest → confirm `start_url: /kms/`, `scope: /kms/`, `icons[*].src: /kms/images/icon-{192,512}.png`.
13. DevTools Application → Service Workers → if SW is registered (it won't be, since SW registration code is in slice 03), check the URL.
14. **Shared-document path:** publish a share for any document (via the API or UI). `curl -s http://localhost:3100/kms/s/<share-id> | grep sitemap` → expect `<link rel="sitemap" ... href="/kms/api/shares.sitemap?id=<share-id>">`.

### Cleanup

15. Restore `URL` to your normal value, rebuild Vite, restart.

## 8. Risks & open questions

1. **Build/runtime drift.** Vite's `base` and the PWA manifest are computed at build time from `process.env.URL`. If ops builds the app with one `URL` and runs it with a different one, the asset URLs in the bundle won't match the runtime mount and the page will break. The spec explicitly leaves a runtime drift warning out of scope (slice 04 ops-doc work), but it's worth flagging that **`yarn vite:build` must be re-run whenever `URL` changes between deployments**. Recommend a startup warning in `server/index.ts` (slice 04) that compares `env.BASE_PATH` against the path baked into `manifest.json`'s asset URLs and logs if they diverge.

2. **`viteHost` derivation change.** Today `viteHost = env.URL.replace(\`:${env.PORT}\`, ":3001")` is a string-replace that happens to work because the path component, if any, comes after the port. The proposed `new URL(env.URL).origin` derivation is cleaner but produces a different value when `env.URL` contains a path (drops the path). Step 5 then explicitly adds `${env.BASE_PATH}` at use sites, so the net result is identical for both layouts. Confirm during implementation that no other code reads `viteHost` (it's a module-local `const`, so it shouldn't, but worth a `grep` for `viteHost`).

3. **`{cdn-url}` substitution coupling.** Approach chosen: expand `{cdn-url}` to `${env.CDN_URL || ""}${env.BASE_PATH}` rather than introducing a new `{base-path}` token. Trade-off (acknowledged in spec): the template now treats `{cdn-url}` as "CDN host plus sub-path," coupling the two concepts. Acceptable because the spec's documented CDN semantics already require the CDN to mirror the same sub-path content. **If a future contributor adds a `{cdn-url}/something-not-under-base-path` line to `index.html`, it would incorrectly receive the prefix.** Mitigation: a comment in `app.ts` near line 159 explains the substitution semantics, and the new `app.test.ts` asserts `<style>` block contains the prefixed font URLs, which would catch a regression that drops the prefix.

4. **PWA `scope: "."` → `${BASE_PATH}/`.** The current `scope: "."` is a relative reference that the browser resolves against the manifest URL. Switching to absolute `/` (path-less) or `/kms/` (sub-path) is technically a change for the path-less layout too — the resolved scope might differ in edge cases (e.g. when the manifest is loaded from a different path than `/`). Verification: after step 13, browser DevTools Application → Manifest panel should report `Scope: /` for path-less; check that PWA install behavior is unchanged. If a regression appears, fall back to the relative `"."` for path-less and only switch to `/kms/` under sub-path: `scope: BASE_PATH ? \`${BASE_PATH}/\` : "."`.

5. **`workbox.modifyURLPrefix` empty-string key semantics.** The current `modifyURLPrefix: { "": \`${CDN_URL ?? ""}/static/\` }` uses an empty-string key which workbox treats as "rewrite paths whose prefix is empty" — i.e. all paths. Adding BASE_PATH to the rewritten value should preserve this behavior. Verify by inspecting the generated `sw.js` after `yarn vite:build` and confirming cached URLs are prefixed. **Edge case:** if the generated SW has any pre-existing absolute URLs (e.g. for runtime caching of CDN assets), the rewrite might double-prefix. Spot-check by `grep -E 'precacheAndRoute|/static/'` in `build/app/sw.js` after build.

6. **Vite reads `URL` via `server/utils/environment.ts`, not `server/env.ts`.** `server/env.ts` performs class-validator setup at module-load time, which is unsafe to import from `vite.config.ts`. The chosen approach — derive `BASE_PATH` in `vite.config.ts` from `parseBasePath(environment.URL)` — uses `server/utils/environment.ts`'s `process.env` snapshot, which is the same source of truth `server/env.ts` reads. Drift between server runtime BASE_PATH and build-time BASE_PATH cannot occur unless `URL` changes between build and runtime (see risk #1).

7. **`server/static/index.html` left unmodified.** Decision: don't introduce a `{base-path}` token; instead expand `{cdn-url}`. This keeps the HTML template stable. Future slices that need a `{base-path}` token (e.g. slice 03 if the SPA needs a build-time base reference in the HTML — unlikely) can introduce it then.

8. **Tests for production-mode `<script>` tag.** The asset script tag uses different code paths for production (`readManifestFile()`) vs dev (`viteHost + entry`). The existing test setup runs in `env.isTest === true`, which short-circuits `readIndexFile` to read `server/static/index.html` directly (line 32–34) and the script-tags branch is the dev branch (because `!env.isProduction`). So the production-mode `${env.CDN_URL || ""}${env.BASE_PATH}/static/${manifest-file}` line is exercised only via mocking. Plan: in `server/routes/app.test.ts`, jest-mock `@server/env` (or temporarily flip `env.ENVIRONMENT`) for the production-script-tag assertion. Alternative: assert only the dev-mode tags and rely on visual code review for the production branch — the change is mechanical (one `${env.BASE_PATH}` insertion) and low-risk.

9. **No client-side regression from manifest changes.** The PWA manifest only takes effect after the user clicks "install app" — for typical web users it's invisible. So the PWA manifest changes can't regress the path-less browser experience. The asset-URL changes (script/link tags) do affect every request, and are covered by the test in step 11 + the smoke verification in §7.

10. **Helper extraction is light refactoring.** Slice 01 already shipped an inline parser in `server/env.ts`. Replacing it with `parseBasePath` from `@shared/utils/basePath` is a low-risk lift; the existing `server/env.test.ts` covers the same cases the new helper test does, so a green run on both files confirms the behavior is preserved end-to-end. If the user prefers, the helper extraction can be deferred and `vite.config.ts` can inline the same `new URL(...).pathname` logic — at the cost of a small duplicate. Recommend extracting now for slice 03 (which will read BASE_PATH on the client and may want the same parser if it ever needs to handle a `URL` env it didn't construct itself).

11. **Slice 01's known issue: `env.public.BASE_PATH` cached at construction.** `PublicEnvironmentRegister` snapshots `@Public` values once at the first `process.nextTick` after `Environment` construction, then never refreshes. In tests, `env.URL` is reset per `beforeEach` in `server/test/setup.ts`, but `env.public.BASE_PATH` retains the value from when the suite first instantiated `Environment`. **Implication for this slice's tests**: HTML assertions that depend on `env.BASE_PATH` (which is a getter and reads live) will be correct, but any assertion that reads `env.public.BASE_PATH` at request time will see the stale value. The `app.ts` code under modification reads `env.BASE_PATH` directly (the getter), not `env.public.BASE_PATH`, so this caching does not affect server-rendered HTML. The client-side `window.env.BASE_PATH` is hydrated from `presentEnv` which spreads `env.public` — and slice 03 is the first reader. Slice 03 will need to address the caching issue; it does not affect this slice.

12. **`workflow.md` not present.** The `/plan` skill's instructions reference `docs/implementation/workflow.md` which does not exist in the repo. Plan was written using the slice spec, slice 01's plan/completed, and reading the source files. If a workflow doc is added later, re-validate this plan against it.

---

Plan written to `docs/implementation/slices/02-subpath-assets/plan.md`. Please review and approve before running `/implement 02-subpath-assets` in a new session.
