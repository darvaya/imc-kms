# Slice: subpath-assets

## Summary
Make the server-rendered HTML and the Vite build emit asset URLs that include `BASE_PATH`. Touches `server/routes/app.ts`, `server/utils/prefetchTags.tsx`, the `server/static/index.html` font URLs, and `vite.config.ts` (Vite `base`, PWA `start_url`/`scope`/icon paths). After this slice (combined with `subpath-foundation`), `curl http://host:PORT/kms/` returns HTML whose every script/style/font/manifest/favicon URL is reachable. The SPA itself is still broken because `ApiClient`, React Router, service worker, and the editor's `/images/...` literals are unchanged — those land in `subpath-client`.

## Motivation
With the Koa mount in place from `subpath-foundation`, the server now correctly *routes* requests under `/kms/*`, but the HTML it renders still embeds root-relative asset URLs (`/static/<bundle>.js`, `/static/manifest.webmanifest`, `/opensearch.xml`, `/images/favicon-32.png`, `{cdn-url}/fonts/Inter.var.woff2`). The Vite build is also pinned to `base: "/static/"`, so emitted bundles reference `/static/*` for dynamic imports and CSS-relative URLs. A browser hitting `/kms/` would fetch every asset from the host root, get either 404s (in the self-mount Apache config) or the wrong app's content (worst case). This slice gets all server-side and build-time asset URLs onto the prefix so the page itself loads — even if interaction doesn't yet work.

## User stories
- **As a devops engineer**, I want to verify a sub-path deployment with `curl` (or a browser hard-refresh) and see every asset return 200 before I worry about whether the SPA is wired correctly, so I can isolate infra problems from app problems.
- **As a developer**, I want a single `yarn vite:build` artifact to work in both layouts, so I don't need separate build pipelines or environment-specific output directories.

## Acceptance criteria
- [ ] Every asset URL injected into the HTML by `server/routes/app.ts` (Vite entry script `src`, PWA manifest `<link rel="manifest">` href, opensearch `<link rel="search">` href, favicon, apple-touch-icon, dev-mode Vite client script, sitemap link for shared docs) includes `${env.BASE_PATH}` immediately after `${env.CDN_URL ?? ""}` (or as the leading prefix when `CDN_URL` is empty).
- [ ] Prefetch tags emitted by `server/utils/prefetchTags.tsx` include `BASE_PATH` for `/static/*` URLs (lines 53, 63 today).
- [ ] Font URLs in `server/static/index.html` (`Inter.var.woff2`, `Inter-italic.var.woff2`, currently rendered as `{cdn-url}/fonts/...`) are templated such that they include `BASE_PATH` after the optional CDN host. A new `{base-path}` template token (or equivalent expansion in `app.ts`) is acceptable.
- [ ] Vite build (`vite.config.ts`) sets `base` to `(CDN_URL ?? "") + BASE_PATH + "/static/"`, so dynamic-import chunk URLs and CSS asset URLs in the emitted bundles are absolute under the prefix.
- [ ] Vite PWA plugin manifest sets `start_url` to `${BASE_PATH}/`, `scope` to `${BASE_PATH}/`, and the three `icons[].src` entries to `${BASE_PATH}/images/icon-192.png` and `${BASE_PATH}/images/icon-512.png` respectively.
- [ ] Smoke verification with `URL=http://host:PORT/kms`: hard-refresh of `http://host:PORT/kms/` in a browser shows zero asset 404s in devtools network tab — every script, stylesheet, font, image referenced by the initial HTML returns 200. (Some app behaviour will still be broken; that's expected — this criterion is asset-URL-only.)
- [ ] Smoke verification with path-less `URL`: hard-refresh of `http://host:PORT/` shows the same zero-404 behaviour as `main` does today; HTML diff vs. pre-slice contains no `/kms/` strings.

## Scope
### In scope
- Edit `server/routes/app.ts` to prefix every literal asset URL it injects with `env.BASE_PATH` (favicon line 67, Vite entry script line 101, dev-mode Vite client lines 110–111, sitemap link for shared docs line 127, manifest link line 132, apple-touch-icon line 136, opensearch link line 142, and the `{cdn-url}` template substitution on line 159 — the substitution should expand `{cdn-url}{base-path}` so the inline-CSS font URLs in `server/static/index.html` get prefixed correctly).
- Add a `{base-path}` template token to `server/static/index.html` (or, if cleaner, fold the prefix into the `{cdn-url}` substitution upstream in `app.ts`).
- Update `server/utils/prefetchTags.tsx` so the two prefetch link tags include `BASE_PATH`.
- Update `vite.config.ts`:
  - `base: (environment.CDN_URL ?? "") + BASE_PATH + "/static/"`. `BASE_PATH` here is read at build time from `process.env.URL` (parsed to a pathname) since `server/utils/environment.ts` is the env source the file already imports.
  - PWA `manifest.start_url`, `manifest.scope`, and each `manifest.icons[i].src` include `BASE_PATH`.
  - PWA `workbox.modifyURLPrefix` (line 56–58) updated so the registered URL prefix is `BASE_PATH + "/static/"`.
- Add tests:
  - `server/routes/app.test.ts` (new or extended) renders the HTML for both layouts and asserts the relevant URLs include/exclude the prefix.
  - A small unit on the Vite-config-derived value if extracted into a helper.

### Out of scope
- Any client-side runtime change. The SPA itself (React Router basename, ApiClient base, service worker registration, editor `/images/...` literals) is left untouched — those land in `subpath-client`.
- Anything WebSocket-related. `path: "/realtime"` and `path: "/collaboration"` stay hard-coded for now; that's `subpath-realtime-and-docs`.
- `docs/apache-vhost.conf` and `.env.example` updates. They ship with the WebSocket slice as a single ops-facing deliverable.
- Changing the existing `CDN_URL` semantics. `BASE_PATH` is composed *after* `CDN_URL` in the URL, preserving current CDN behaviour.

## Technical notes
- **CDN + sub-path composition order**: `${CDN_URL ?? ""}${BASE_PATH}${"/static/" or "/images/foo.png"}`. When CDN is unset and BASE_PATH is `/kms`, that yields `/kms/static/foo.js`. When CDN is `https://cdn.example.com` and BASE_PATH is `/kms`, that yields `https://cdn.example.com/kms/static/foo.js` — i.e. the CDN origin is expected to mirror the sub-path. This matches the existing `CDN_URL` documentation that says the CDN must front the same content as the app.
- **Vite reads env at build time**: `vite.config.ts` already imports `server/utils/environment.ts` which reads `process.env`. The `BASE_PATH` derivation in `vite.config.ts` cannot import from `server/env.ts` (that file uses class-validator and is not safe to import in the build context); derive the path component directly from `URL`'s `URL.pathname` in vite.config.ts, mirroring the logic from `subpath-foundation`. Consider extracting the parser into a shared helper (`shared/utils/basePath.ts` or similar) used by both `server/env.ts` and `vite.config.ts`.
- **Build/runtime drift risk**: if ops builds the app with one `URL` and runs it with a different one, asset URLs in the bundle won't match the runtime mount. Document this constraint in the deployment doc updates (slice 4) and consider adding a runtime warning in `server/index.ts` startup if `process.env.URL`'s pathname differs from what's baked into the manifest. Out of scope for this slice but worth flagging in the technical notes.
- **PWA `scope` rules**: a service worker's `scope` must be a sub-path of the SW URL. With SW at `/kms/static/sw.js` and the existing `Service-Worker-Allowed: /` header (`server/routes/index.ts:73-75`), `scope: "/kms/"` is permitted. The SW *registration* (in client code) is moved in slice 3, but the manifest `scope` here should match what the client will register.
- **HTML template token**: introducing a `{base-path}` token in `server/static/index.html` requires an additional `.replace(/\{base-path\}/g, env.BASE_PATH)` in `app.ts`. Alternative: expand the existing `{cdn-url}` substitution to `${env.CDN_URL || ""}${env.BASE_PATH}` so the existing `{cdn-url}/fonts/...` lines automatically pick up the prefix. The latter is fewer edits but couples CDN and BASE_PATH at the template level — caller's choice during planning.

## Dependencies
- `subpath-foundation` (provides `env.BASE_PATH` and the Koa mount that this slice's URLs presume).
