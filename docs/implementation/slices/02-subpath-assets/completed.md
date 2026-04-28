# Slice: 02-subpath-assets

**Date:** 2026-04-28

## What was built

- Server-rendered HTML asset URLs (favicon, Vite entry script, manifest, opensearch, apple-touch-icon, sitemap, dev-mode `@vite/client` and `@react-refresh`) now include `${env.BASE_PATH}` after the optional `${env.CDN_URL}`.
- Inline `@font-face` `src` URLs in `server/static/index.html` pick up the prefix automatically: the `{cdn-url}` template substitution in `app.ts` was expanded to `${env.CDN_URL || ""}${env.BASE_PATH}` rather than introducing a new `{base-path}` token.
- Prefetch link tags (`server/utils/prefetchTags.tsx`) for both `.js` and `.css` variants now embed `BASE_PATH` between the optional CDN host and `/static/`.
- Vite build config:
  - `base` is now `(CDN_URL ?? "") + BASE_PATH + "/static/"` so emitted chunk filenames, dynamic-import URLs, and CSS-relative asset URLs resolve under the prefix.
  - PWA `manifest.start_url`, the three `manifest.icons[].src` entries, and `workbox.modifyURLPrefix` all include `BASE_PATH`.
  - `manifest.scope` falls back to the relative `"."` for path-less deployments and uses absolute `${BASE_PATH}/` only when a sub-path is configured (preserves pre-slice path-less behavior — see review I1).
- Shared `parseBasePath(url)` helper extracted to `shared/utils/basePath.ts` so both `server/env.ts` and `vite.config.ts` derive the prefix from the same single source of truth.
- `server/env.ts` `BASE_PATH` getter now delegates to the shared helper (existing `server/env.test.ts` cases continue to pass).
- `server/routes/app.ts:viteHost` rederived from `URL.origin` so the path component is stripped before the dev-server port swap; consumers append `${env.BASE_PATH}` explicitly at use sites.
- New automated coverage:
  - `shared/utils/basePath.test.ts` — 8 cases (path-less, trailing slash, multi-segment, query/hash edges); runs in both `shared-node` and `shared-jsdom` projects (16 assertions total).
  - `server/routes/app.test.ts` — 9 integration tests covering both layouts: 5 path-less assertions (no `/kms/` substring, root-relative link tags, font URLs, dev-mode script tags, sitemap for shares) and 4 sub-path assertions with the same shape but `/kms` prefix.
- `server/test/support.ts:getSubpathTestServer` now installs a `beforeEach` that re-asserts `env.URL` / `sharedEnv.URL` after the global `setup.ts` reset — without this, the global reset clobbers the sub-path URL before each test and `env.BASE_PATH` evaluates to `""`.

## Key decisions

- **Helper extraction over inline duplication.** `parseBasePath` lives in `shared/utils/` because `vite.config.ts` cannot safely import `server/env.ts` (class-validator side effects). Co-locating in `shared/` matches the rest of the codebase's parser conventions (`parseDocumentSlug`, etc.) and gives slice 03 a callable parser if the client ever needs to handle a `URL` env it didn't construct itself.
- **`{cdn-url}` template expansion.** The `{cdn-url}` substitution in `app.ts` now expands to `(CDN_URL || "") + BASE_PATH` — a single change carries the prefix into every existing inline `@font-face` URL without introducing a separate `{base-path}` token. Trade-off: the template now treats `{cdn-url}` as "CDN host plus sub-path," coupling the two concepts. A multi-line comment in `app.ts` warns future contributors that any future `{cdn-url}/...` reference must live under the sub-path.
- **PWA `scope` fallback.** Per plan risk #4 / review I1, `scope` is conditional: `BASE_PATH ? \`${BASE_PATH}/\` : "."`. The path-less manifest preserves the pre-slice relative `scope: "."` value; sub-path manifests get an absolute scope so the manifest URL (served under `${BASE_PATH}/static/`) doesn't resolve scope outside the mount.
- **`viteHost` IIFE captured at module load.** Same lifetime as the previous string-replace; no per-request derivation. Footgun acknowledged for test fixtures that vary `env.URL` post-startup, but documented in code comment and not exercised by any current consumer.

## Files changed

- `shared/utils/basePath.ts` *(new)* — `parseBasePath(url)` helper.
- `shared/utils/basePath.test.ts` *(new)* — unit tests for the helper.
- `server/env.ts` — `BASE_PATH` getter delegates to `parseBasePath`.
- `server/routes/app.ts` — `viteHost` derivation, prefix injection at every literal asset URL, `{cdn-url}` substitution expansion.
- `server/utils/prefetchTags.tsx` — `BASE_PATH` insertion in the two prefetch link tags.
- `server/test/support.ts` — `getSubpathTestServer` re-applies sub-path URL in a `beforeEach` (B2 fix).
- `server/routes/app.test.ts` *(new)* — integration tests for both layouts (9 tests).
- `vite.config.ts` — `base`, PWA `start_url` / `scope` / `icons[].src`, and `workbox.modifyURLPrefix` all updated; `parseBasePath` import; `BASE_PATH` constant.

## Known issues / tech debt

- **Smoke walkthrough not run.** The plan's §7 manual walkthrough (curl + DevTools network/manifest/SW panels in a browser, with `yarn vite:build` rebuild between layouts) was skipped per user direction — automated coverage of both layouts is in `app.test.ts`. Production deployments should still verify `start_url`/`scope`/`icons[*].src` in DevTools Application → Manifest after the first build with `URL=...kms`.
- **No automated coverage for production-mode script tag with `BASE_PATH`** (review I3). Test environment runs with `!env.isProduction`, so the production-branch `<script src="${env.CDN_URL || ""}${env.BASE_PATH}/static/${manifest-file}">` is exercised only via visual code review. Change is mechanical (one `${env.BASE_PATH}` insertion) and low-risk.
- **`viteHost` captured at module load** (review I2). Mostly a test-fixture concern; production `env.URL` doesn't change post-startup. If a future test wants to vary `env.URL` mid-suite and assert dev-server URLs, move the IIFE call inside `renderApp`.
- **`??` vs `||` inconsistency for `env.CDN_URL`** (review N1). Pre-existing in some lines; this slice didn't introduce the inconsistency. Defer to a separate cleanup.
- **Build/runtime drift risk.** Vite's `base` and the PWA manifest are baked at build time from `process.env.URL`. `yarn vite:build` must be re-run whenever `URL` changes between deployments. Slice 04 should add a startup warning in `server/index.ts` that compares `env.BASE_PATH` against the path baked into `manifest.json`'s asset URLs.
- **Slice 01's `env.public.BASE_PATH` caching.** `PublicEnvironmentRegister` snapshots `@Public` values once at first `process.nextTick` after `Environment` construction. Server-side handlers in this slice read the live `env.BASE_PATH` getter, so they're fine. Slice 03 (the first reader of `window.env.BASE_PATH` on the client) needs to address the cache.

## Dependencies for future slices

- **`parseBasePath` (`shared/utils/basePath.ts`)** — single source of truth for derived `BASE_PATH`. Slice 03 (`subpath-client`) should import this helper rather than reimplementing the parser if the client ever needs to derive a sub-path from a URL it didn't construct.
- **`{cdn-url}` template semantics now include `BASE_PATH`.** Any future contributor adding a `{cdn-url}/...` reference to `server/static/index.html` must ensure the resulting URL lives under the sub-path; otherwise the substitution will be wrong. The warning is captured in a comment at `server/routes/app.ts:166-172`.
- **`getSubpathTestServer` `beforeEach` pattern.** Future test suites that exercise the sub-path code path should rely on `getSubpathTestServer` (it now survives `setup.ts`'s global `beforeEach` reset). Don't roll your own `env.URL` mutation in describe-block scope without a per-test re-apply.
- **PWA `scope` is conditional on `BASE_PATH`.** Sub-path deployments use absolute `${BASE_PATH}/`; path-less keeps the relative `"."`. If slice 03 changes the manifest URL location (e.g., serves it from outside `/static/`), revisit the scope decision.
- **`viteHost` derivation is `URL.origin`-based.** Stripped of any path component; consumers append `${env.BASE_PATH}` explicitly. Slice 03 client-side code that wants to assert dev-server URLs should expect the same shape.
