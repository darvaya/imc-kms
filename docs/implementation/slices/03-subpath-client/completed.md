# Slice: 03-subpath-client

**Date:** 2026-04-28

## What was built

- **`assetUrl(path)` helper** added to `shared/utils/urls.ts`. Composes `${CDN_URL}${BASE_PATH}${path}` for root-relative paths; pass-through for `https?:`, `data:`, `blob:` URIs; defensively prepends `/` when caller forgets a leading slash.
- **React Router basename** wired via `app/utils/history.ts` — `createBrowserHistory({ basename: env.BASE_PATH ?? "" })`. `<Link>` and history navigation now respect the prefix; deep-link refreshes under `/kms/...` resolve to the correct scene.
- **`ApiClient` default `baseUrl`** changed from `"/api"` to `` `${env.BASE_PATH ?? ""}/api` ``. The `path.match(/^http/)` short-circuit is preserved so absolute-URL callers still bypass prefixing.
- **Service worker** registered at `${env.BASE_PATH ?? ""}/static/sw.js` with `scope: ${env.BASE_PATH ?? ""}/`. Existing `Service-Worker-Allowed: /` header on `server/routes/index.ts:74` continues to permit the new scope (broader scope, same SW URL directory).
- **`<Img>` component (`shared/editor/components/Img.tsx`)** simplified — the old `cdnPath(src)` wrap is dropped. All callers now pre-resolve URLs through `assetUrl` at the call site, so `<Img>` is a pure passthrough.
- **65 image literals + 4 iframe-embed literals migrated** to use `assetUrl`:
  - 54 entries in `shared/editor/embeds/index.tsx`
  - 1 each in `shared/editor/embeds/PlantUml.tsx`, `Diagrams.tsx`
  - iframe sources in `Pinterest.tsx`, `GitLabSnippet.tsx`, `Gist.tsx`, `Dropbox.tsx`
  - `shared/editor/components/Mentions.tsx` (favicon fallback)
  - `app/editor/menus/block.tsx` (2 menu icons)
  - `app/scenes/Settings/Import.tsx` (Confluence icon)
  - `plugins/notion/client/index.tsx` (Notion icon)
- **Tests**: 8-case `assetUrl` describe block in `shared/utils/urls.test.ts`; new `app/utils/history.test.ts` asserts `<Link>` href contract under `/kms` and empty basenames.

## Key decisions

- **`<Router basename>` not modified.** react-router-dom v5's lower-level `<Router history={...}>` (which `app/index.tsx` uses) does not accept a `basename` prop directly — only `<BrowserRouter>` does. Setting basename on `createBrowserHistory` alone is sufficient because `<Link>` calls `history.createHref` internally. Plan §8 risk #2 documents this rationale.
- **Migration ordered: callers first, then `<Img>` cleanup.** Phase B migrated all 65+ callers to `assetUrl(...)` before Phase C dropped the in-component `cdnPath` wrap, so there was never a moment where unprefixed literals were paired with non-cdn-wrapping `<Img>`.
- **`cdnPath` retained.** All four call sites migrated to `assetUrl`, but `cdnPath` is left exported in `shared/utils/urls.ts` per minimal-diff principle. Track for follow-up cleanup PR.
- **`renderToStaticMarkup` over RTL `render` in `history.test.ts`.** Review finding #2 (⚪ nit) suggested RTL would be more discoverable; `renderToStaticMarkup` was kept because it's functionally equivalent for testing a static `href` attribute and faster.
- **Pass-through regex (`^(?:https?:|data:|blob:)`) is loose.** It would match `https:foo` (no slashes) the same as `https://foo`; review #6 noted this. No real callsite passes such URIs, so left as-is.
- **`env.BASE_PATH ?? ""` consistent across all four new call sites.** Review finding #1 caught `app/utils/history.ts` missing the coalesce; fixed during `/test-commit` so all four (`history.ts`, `ApiClient.ts`, `app/index.tsx` SW URL, `app/index.tsx` SW scope) use the same pattern.

## Files changed

**Modified:**
- `app/editor/menus/block.tsx` — `assetUrl` import + 2 wrapped literals
- `app/index.tsx` — SW URL + scope prefixed with `BASE_PATH`
- `app/scenes/Settings/Import.tsx` — `cdnPath` → `assetUrl` (Confluence icon)
- `app/utils/ApiClient.ts` — `env` import + default `baseUrl` prefixed
- `app/utils/history.ts` — `env` import + `basename: env.BASE_PATH ?? ""`
- `plugins/notion/client/index.tsx` — `cdnPath` → `assetUrl` (Notion icon)
- `shared/editor/components/Img.tsx` — drop `cdnPath` wrap; passthrough body
- `shared/editor/components/Mentions.tsx` — `cdnPath` → `assetUrl` (favicon fallback)
- `shared/editor/embeds/Diagrams.tsx` — `assetUrl` import + 1 wrap
- `shared/editor/embeds/Dropbox.tsx` — `assetUrl` import + iframe-src wrap
- `shared/editor/embeds/Gist.tsx` — `assetUrl` import + iframe-src wrap
- `shared/editor/embeds/GitLabSnippet.tsx` — `assetUrl` import + iframe-src wrap
- `shared/editor/embeds/Pinterest.tsx` — `assetUrl` import + iframe-src wrap
- `shared/editor/embeds/PlantUml.tsx` — `assetUrl` import + 1 wrap
- `shared/editor/embeds/index.tsx` — `assetUrl` to existing import + 54 wraps
- `shared/utils/urls.test.ts` — 8-case `describe("assetUrl", ...)` block
- `shared/utils/urls.ts` — `assetUrl(path: string): string` exported

**Created:**
- `app/utils/history.test.ts` — basename + `<Link>` href contract test
- `docs/implementation/slices/03-subpath-client/completed.md` — this file

## Known issues / tech debt

- **Manual smoke walkthrough not run.** The plan's §7 walkthrough (two Vite rebuilds, OIDC sign-in, DevTools network/SW/cookie inspection in both path-less and `/kms` layouts) was skipped per user direction — same approach as slice 02. Code-level acceptance criteria are all met:
  - `assetUrl` covered by 8 unit cases in `urls.test.ts`
  - `<Link>` href contract covered by `history.test.ts` for both empty and `/kms` basenames
  - Acceptance grep over `app/`, `shared/`, `plugins/*/client/` for unwrapped `"/images/`/`"/embeds/` literals returns zero matches (excluding tests, comments, and the absolute external URL `https://www.getoutline.com/images/screenshot.png` in `ExampleData.ts:1355`)
  - TSC clean, lint clean (0 errors; 328 pre-existing warnings unchanged)
  - Production deployments should still verify in DevTools: (a) every `/kms/api/*` request returns 200, (b) SW URL `/kms/static/sw.js` and scope `/kms/`, (c) better-auth session cookie `Path=/kms`, (d) sign-out redirect lands on `/kms/` not `/`. If sign-out redirects to `/`, fix is in `app/utils/betterAuthClient.ts` — pass explicit `redirectTo: env.URL` to `signOut()` (plan §8 risk #5).
- **Pre-existing test infrastructure gap.** `app/models/User.test.ts` and `app/models/Collection.test.ts` fail with `TypeError: Reflect.metadata is not a function` because `reflect-metadata` is only imported in server tests (`server/test/setup.ts`), not in the app jest project. Pre-existing — not introduced by this slice. Slice 01's `completed.md` flagged that the test infra was unstable; slice 02 partially restored `.jestconfig.json` but the `reflect-metadata` polyfill for the app project is a separate concern. Recommend a follow-up `chore: import reflect-metadata in app jest setup` PR.
- **`cdnPath` exported but unreferenced.** Zero callers anywhere in the repo after this slice. Plan §8 risk #7 documents the deliberate retention. Track for a separate cleanup PR; do not remove without first confirming no plugin/external consumer depends on the export.
- **Service-Worker-Allowed header is broader than necessary.** Currently `/` (broader than the new `/kms/` scope). Spec confirms either works; narrowing is out of scope for this slice. Future security review can tighten to `${env.BASE_PATH ?? "/"}` via a one-line edit at `server/routes/index.ts:74`.
- **`assetUrl` regex doesn't strictly anchor `://`.** Matches `https:foo` (no slashes) the same as `https://foo`. No real callsite passes such URIs; review #6 (⚪ nit) confirms this is theoretical.
- **`history.test.ts` uses `renderToStaticMarkup` instead of RTL `render`.** Review #2 (⚪ nit) noted RTL is more discoverable; functionally equivalent for testing a static `href` attribute. Optional follow-up.
- **`urls.test.ts` `beforeEach` save/restores `env.URL`** which `assetUrl` does not read. Dead weight; review #3 (⚪ nit). Optional follow-up.

## Dependencies for future slices

- **`assetUrl(path: string): string`** in `shared/utils/urls.ts` is the canonical helper for static-asset URLs that must respect both CDN and sub-path. New editor embeds, settings icons, or anywhere else that previously hard-coded `<img src="/images/...">` MUST use `assetUrl` instead. The acceptance grep is the canonical guard — adding a raw `/images/` literal will be caught by future slice acceptance reviews.
- **`<Img>` (`shared/editor/components/Img.tsx`) is now a passthrough.** Callers MUST pre-resolve their `src` through `assetUrl(...)`. The component does NOT prefix CDN/BASE_PATH automatically anymore. (Defense-in-depth was traded for explicit-at-call-site clarity; see "Key decisions".)
- **`history` singleton's basename is captured at module-load time** (`createBrowserHistory({ basename: env.BASE_PATH ?? "" })`). `app/env.ts` validates `window.env` synchronously at module load, before any consumer runs, so `env.BASE_PATH` is reliably present. Tests that need to vary basename should construct fresh `createBrowserHistory({ basename: ... })` instances inline rather than mocking the singleton.
- **`ApiClient.baseUrl` default is now sub-path-aware.** Callers that explicitly pass `baseUrl: "/api"` (none today) would bypass the prefix. Slice 04 should not need to revisit this — WebSocket URLs are constructed separately in `WebsocketProvider.tsx`.
- **Slice 04 (`subpath-realtime-and-docs`) outstanding work:**
  - WebSocket URLs in `app/components/WebsocketProvider.tsx` and the Hocuspocus collaboration provider need the prefix.
  - `docs/apache-vhost.conf` reverse-proxy rules for the deployment.
  - `.env.example` documentation update for `URL=https://host/kms`.
  - Sign-out redirect verification (plan §8 risk #5) — fold into slice 04 smoke walkthrough.
  - Optional: startup warning in `server/index.ts` that compares `env.BASE_PATH` against the path baked into Vite's `manifest.json` to catch build/runtime drift (slice 02 surfaced this risk).
