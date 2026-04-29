# Slice: subpath-client

## Summary
Make the client-side SPA aware of `BASE_PATH`. Wires the prefix into React Router (`basename`), the browser-history instance, the `ApiClient` base URL, and the service-worker registration (URL + scope). Introduces a single `assetUrl(path)` helper in `shared/utils/urls.ts` and migrates the 65 hard-coded `<img src="/images/...">` literals (plus 4 `<iframe src="/embeds/...">` literals) across `shared/editor/embeds/`, `app/editor/menus/`, `app/scenes/Settings/Import.tsx`, `shared/editor/components/Mentions.tsx`, and `plugins/notion/client/` to use it. After this slice (combined with `subpath-foundation` and `subpath-assets`), an end user can log in via Microsoft OIDC, navigate the SPA, view documents, and see editor menu / embed-picker icons render correctly under `/kms/`. Real-time presence and collaborative editing remain broken until `subpath-realtime-and-docs`.

## Motivation
With routing (`subpath-foundation`) and asset URLs (`subpath-assets`) in place, the SPA itself is the next blocker. `ApiClient.baseUrl` is hard-coded `"/api"`, so every API call from the client hits the host root and 404s under `/kms/`. React Router has no `basename`, so `<Link to="/home">` produces `/home` (wrong) and a deep-link refresh of `/kms/doc/foo` lands on a 404 from React Router's perspective. The service worker registers at `/static/sw.js` with `scope: "/"`, neither of which is reachable or correct under the prefix. And 65 places in the editor code render `<img src="/images/foo.png">` directly — these bypass the build-time asset pipeline entirely and would 404 as soon as the editor mounts. Centralizing all of this through a shared helper means future contributors can't accidentally regress the prefix-awareness.

## User stories
- **As an end user**, I want to log in to KMS at `https://appstpcid.imcpelilog.co.id/kms/`, navigate to my docs, view a document with embedded content, and see all editor menus and embed-picker icons render correctly, so the sub-path deployment is functionally indistinguishable from the dedicated-subdomain deployment for everything except real-time features.
- **As a developer adding a new editor embed**, I want a single `assetUrl()` helper to use for icon paths, so I don't have to remember sub-path semantics or accidentally reintroduce a root-relative literal.

## Acceptance criteria
- [ ] React Router uses `env.BASE_PATH` as `basename`: passing it to `<Router>` in `app/index.tsx` and to `createBrowserHistory({ basename: env.BASE_PATH })` in `app/utils/history.ts`. Concretely: `<Link to="/home">` rendered under `/kms/` produces an anchor with href `/kms/home`; refreshing `/kms/doc/foo-abc123` lands on the document scene; client-side back/forward navigation never escapes the prefix.
- [ ] `ApiClient` (`app/utils/ApiClient.ts`) defaults `baseUrl` to `${env.BASE_PATH}/api` (was `"/api"`). Verified by: (a) network requests issued by the client during a login + doc-list flow target `/kms/api/*` and succeed under `URL=http://host/kms`, and (b) the existing `path.match(/^http/)` short-circuit on line 97 still bypasses prefixing for absolute URLs.
- [ ] Service worker registration in `app/index.tsx` uses `${env.BASE_PATH}/static/sw.js` with `scope: \`${env.BASE_PATH}/\`` (root-of-prefix). The `Service-Worker-Allowed` header on `server/routes/index.ts:73-75` continues to permit this scope.
- [ ] A new `assetUrl(path: string): string` helper in `shared/utils/urls.ts` returns `${env.CDN_URL ?? ""}${env.BASE_PATH}${path}` for paths that start with `/`, and is a no-op for absolute URLs (matching `^https?://`). Includes unit tests covering: empty CDN + empty BASE_PATH, empty CDN + `/kms` BASE_PATH, set CDN + `/kms` BASE_PATH, absolute URL passthrough, and missing-leading-slash defensive handling.
- [ ] All 65 client-side `/images/...` literals and 4 `/embeds/...` literals (enumerated in scope below) are replaced with `assetUrl("/images/foo.png")` / `assetUrl(\`/embeds/...?url=...\`)`. A grep for `"/images/"` and `"/embeds/"` in `app/`, `shared/`, and `plugins/*/client/` returns no matches in tsx/ts source (excluding tests, comments, and the `assetUrl` definition itself).
- [ ] End-to-end smoke under `URL=http://host:PORT/kms`: a user can sign in via Microsoft OIDC → land on the home scene → open a document → see the embed-picker icons render in the slash menu → edit the document title (verifies API mutation succeeds + CSRF cookie scoped to `/kms` round-trips) → reload the page and end up at the same document URL. Real-time avatars and live cursor sync are not required to work in this slice.
- [ ] No regression with path-less `URL`: every assertion above behaves identically when `URL=https://kms.imcpelilog.co.id`. `assetUrl("/images/foo.png")` returns `/images/foo.png`. ApiClient hits `/api/*`. React Router emits `/home` not `//home`. The full client-side test suite (`yarn test:app`) passes unchanged.

## Scope
### In scope
- **React Router & history**: `app/index.tsx` (`<Router>` basename prop), `app/utils/history.ts` (`createBrowserHistory({ basename })`).
- **ApiClient**: `app/utils/ApiClient.ts:47` default `baseUrl` becomes `${env.BASE_PATH}/api`.
- **Service worker**: `app/index.tsx:107-109` — registration URL and `scope` both include `BASE_PATH`. Revisit `Service-Worker-Allowed` header to confirm scope is permitted.
- **better-auth client**: `app/utils/betterAuthClient.ts:5` already uses `env.URL` (which now includes the path) — verify no edits needed; if a separate `basePath` option is necessary it goes here.
- **`assetUrl()` helper**: new function in `shared/utils/urls.ts` with co-located unit tests.
- **Image-literal migration** (65 occurrences across 9 files):
  - `shared/editor/embeds/index.tsx` — 54 embed icon `<Img src="/images/<provider>.png">` calls.
  - `shared/editor/embeds/{PlantUml,Diagrams}.tsx` — 1 each.
  - `shared/editor/components/Mentions.tsx` — 1.
  - `app/editor/menus/block.tsx` — 2.
  - `app/scenes/Settings/Import.tsx` — 1.
  - `plugins/notion/client/index.tsx` — 1.
  - `server/routes/index.ts:1` and `vite.config.ts:108-119` are server/build occurrences and *not* in scope here (vite icons handled in slice 2; server route handler stays as-is — it serves the files, not references them).
- **Embed-iframe-literal migration** (4 occurrences): `shared/editor/embeds/{Pinterest,GitLabSnippet,Gist,Dropbox}.tsx` each render `<iframe src="/embeds/<provider>?url=...">` — these need `assetUrl()` so the iframe loads the embed-renderer at `/kms/embeds/...`.
- **Tests**: unit tests for `assetUrl`, plus at least one integration / RTL test that asserts `<Link>` produces prefixed hrefs under `BASE_PATH=/kms`.

### Out of scope
- Anything WebSocket-related (`WebsocketProvider.tsx`, the Hocuspocus collaboration provider) — that's `subpath-realtime-and-docs`.
- The `/images/...` literals inside `vite.config.ts` (PWA manifest icons) — handled in `subpath-assets`.
- Server-side `/images/*`, `/email/*`, `/fonts/*` route handlers — they continue to serve files relative to the mount and need no changes after `subpath-foundation`.
- `env.URL`-prefixed absolute URLs in shared/editor (e.g. `${env.URL}/api/files.get` in `shared/editor/rules/links.ts`, `${env.URL}/doc/${id}` in `shared/editor/nodes/Mention.tsx`) — these already inherit the path from `env.URL` so they're correct without change.
- Plugin-specific OAuth callback URLs (`plugins/{notion,github,linear}/...`) — they construct `${env.URL}/api/<plugin>.callback` which already inherits the path; no edits needed.
- Documentation updates (`.env.example`, `docs/apache-vhost.conf`) — bundled into `subpath-realtime-and-docs`.

## Technical notes
- **Where `env.BASE_PATH` lives on the client**: it's exposed via `presentEnv` (introduced in `subpath-foundation`) and reaches `window.env`. The client reads it through `app/env.ts` (or `~/env`), so `import env from "~/env"` and reference `env.BASE_PATH`. In `shared/utils/urls.ts` the import is `from "@shared/env"` (which proxies the same source).
- **Service-worker scope edge case**: registering with a `scope` more specific than the SW URL's directory normally requires the `Service-Worker-Allowed` response header. The current header (`server/routes/index.ts:73-75`) is `Service-Worker-Allowed: /` — broader than necessary, but valid. After this slice the SW URL is `/kms/static/sw.js` and the scope is `/kms/`; this is *less specific* than the SW URL's directory, so `Service-Worker-Allowed: /kms/` (or the existing `/`) suffices. Either keep the existing broad header or narrow it; both work.
- **`assetUrl` for relative paths only**: the helper should *not* prefix paths that start with `http://`, `https://`, `data:`, or `blob:`. Use a leading-`/` check + protocol check; otherwise data-URI inline icons (used in some embeds) would be corrupted.
- **Mechanical migration discipline**: the 65-file change is largely sed-able (`<Img src="/images/X.png" .../>` → `<Img src={assetUrl("/images/X.png")} .../>`), but each file needs an `import { assetUrl } from "@shared/utils/urls"` (or `from "~/utils/urls"` for client-only files; `shared/utils/urls.ts` is used by both). Consider whether these imports introduce circular-dependency risk — `shared/utils/urls.ts` already exists and depends on `@shared/env` and `@shared/utils/domains`, so adding a function there should be safe.
- **Tests for the React Router basename**: a simple RTL test rendering a `<Router basename="/kms">` with a `<Link to="/foo">` and asserting the rendered `href` is `/kms/foo` is sufficient. Don't try to mount the full app in a test — too slow and tightly couples to MobX/store wiring.
- **`betterAuthClient.ts`**: better-auth derives the cookie `Path` attribute from `baseURL`. With `URL=http://host/kms`, the session cookie's `Path` becomes `/kms`, which is what we want (cookies don't leak to other apps on the shared subdomain). No client-side `basePath` override should be needed; if integration testing reveals one is required, add it here.
- **Sign-out redirect**: better-auth's sign-out flow may redirect to `/`. Verify in smoke testing that it resolves to `/kms/` (the React Router basename should handle this when the redirect goes through the SPA, but a hard browser redirect to `/` would escape the prefix). If broken, the fix is in this slice.

## Dependencies
- `subpath-foundation` (provides `env.BASE_PATH` on both server and client).
- `subpath-assets` (provides the loading HTML/Vite assets that this slice's React app actually executes inside; without it, the smoke-test acceptance criteria fail because the bundle never loads).
