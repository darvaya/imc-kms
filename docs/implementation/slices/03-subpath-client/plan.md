# Plan: 03-subpath-client

## 1. Goal

With slice 01 (`subpath-foundation`) routing `/kms/*` to the inner Koa app and exposing `env.BASE_PATH` on both server and client, and slice 02 (`subpath-assets`) prefixing every server-rendered HTML asset URL and Vite build URL, this slice gets the SPA itself onto the prefix. We add a single `assetUrl(path)` helper in `shared/utils/urls.ts`, wire `env.BASE_PATH` into React Router (via `createBrowserHistory({ basename })`), the `ApiClient` default `baseUrl`, and the service-worker registration URL + `scope`, then migrate the 61 hard-coded `<img|Img|Image src="/images/...">` literals (plus 4 `<iframe src="/embeds/...">` literals) across `shared/editor/embeds/`, `app/editor/menus/`, `app/scenes/Settings/Import.tsx`, `shared/editor/components/Mentions.tsx`, and `plugins/notion/client/` to use the helper. After this slice an end user can sign in via Microsoft OIDC at `https://appstpcid.imcpelilog.co.id/kms/`, navigate the SPA, view a document, and see editor menu / embed-picker icons render correctly. Real-time presence and collaborative editing remain broken until slice 04 (`subpath-realtime-and-docs`).

## 2. Files to create / modify

| File path | Action | Purpose |
|-----------|--------|---------|
| `shared/utils/urls.ts` | modify | Add `assetUrl(path: string): string` exported function. Returns `${env.CDN_URL ?? ""}${env.BASE_PATH ?? ""}${path}` for paths starting with `/`; pass-through for absolute URLs (`http://`, `https://`, `data:`, `blob:`); defensively prepends a leading `/` when the input is relative without one (so `assetUrl("images/foo.png")` is treated as `assetUrl("/images/foo.png")`). The implementation reads `env` via the existing `import env from "../env"` (top of file) — no new module-level imports. |
| `shared/utils/urls.test.ts` | modify | Append a new `describe("assetUrl", ...)` block. Cases: (a) empty CDN + empty BASE_PATH → `"/images/foo.png"`; (b) empty CDN + `BASE_PATH=/kms` → `"/kms/images/foo.png"`; (c) `CDN_URL=https://cdn.example.com` + `BASE_PATH=/kms` → `"https://cdn.example.com/kms/images/foo.png"`; (d) absolute `http://` URL passthrough → unchanged; (e) absolute `https://` URL passthrough → unchanged; (f) `data:` URL passthrough → unchanged; (g) `blob:` URL passthrough → unchanged; (h) missing leading slash defensive → `"images/foo.png"` resolves the same as `"/images/foo.png"`. Reset `env.URL`, `env.CDN_URL`, `env.BASE_PATH` in `beforeEach` (matching the pre-existing `isInternalUrl` describe block style — see line 100 of the existing file). |
| `shared/editor/components/Img.tsx` | modify | Drop the `cdnPath(src)` call inside the component body; pass `src` straight to the underlying `<img>` element. Removes the now-redundant `import { cdnPath } from "../../utils/urls";` (the migrated callers will pre-resolve the URL through `assetUrl` at the call site, so wrapping inside `<Img>` would double-prefix). Component shape and all consumer props remain identical. |
| `shared/editor/embeds/index.tsx` | modify | Add `assetUrl` to the existing named import from `"../../utils/urls"` (line 8). Replace the 54 `<Img src="/images/<provider>.png" alt="X" />` JSX literals with `<Img src={assetUrl("/images/<provider>.png")} alt="X" />`. No other changes to the file. |
| `shared/editor/embeds/PlantUml.tsx` | modify | Add `import { assetUrl } from "../../utils/urls";`. Replace the single `<Image src="/images/plantuml.png" ... />` with `<Image src={assetUrl("/images/plantuml.png")} ... />`. |
| `shared/editor/embeds/Diagrams.tsx` | modify | Add `import { assetUrl } from "../../utils/urls";`. Replace the single `<Image src="/images/diagrams.png" ... />` with `<Image src={assetUrl("/images/diagrams.png")} ... />`. |
| `shared/editor/embeds/Pinterest.tsx` | modify | Add `import { assetUrl } from "../../utils/urls";`. Replace the iframe-source template literal `` `/embeds/pinterest?url=${encodeURIComponent(boardUrl)}` `` with `assetUrl(\`/embeds/pinterest?url=${encodeURIComponent(boardUrl)}\`)`. |
| `shared/editor/embeds/GitLabSnippet.tsx` | modify | Same shape as Pinterest: add `assetUrl` import; wrap the `/embeds/gitlab?url=...` template with `assetUrl(...)`. |
| `shared/editor/embeds/Gist.tsx` | modify | Same shape: add `assetUrl` import; wrap the `/embeds/github?url=...` template with `assetUrl(...)`. |
| `shared/editor/embeds/Dropbox.tsx` | modify | Same shape: add `assetUrl` import; wrap the `/embeds/dropbox?url=...` template with `assetUrl(...)`. |
| `shared/editor/components/Mentions.tsx` | modify | Replace the named import `import { toDisplayUrl, cdnPath } from "../../utils/urls";` with `import { toDisplayUrl, assetUrl } from "../../utils/urls";`. At line 221, change `faviconUrl: cdnPath("/images/link.png")` to `faviconUrl: assetUrl("/images/link.png")`. |
| `app/editor/menus/block.tsx` | modify | Add `import { assetUrl } from "@shared/utils/urls";`. Replace the two `<Img src="/images/<file>.png" alt="X" />` literals (lines 235 and 242) with `<Img src={assetUrl("/images/<file>.png")} alt="X" />`. |
| `app/scenes/Settings/Import.tsx` | modify | Replace the named import `import { cdnPath } from "@shared/utils/urls";` (line 8) with `import { assetUrl } from "@shared/utils/urls";`. At line 99, change `cdnPath("/images/confluence.png")` to `assetUrl("/images/confluence.png")`. |
| `plugins/notion/client/index.tsx` | modify | Replace `import { cdnPath } from "@shared/utils/urls";` (line 3) with `import { assetUrl } from "@shared/utils/urls";`. At line 15, change `cdnPath("/images/notion.png")` to `assetUrl("/images/notion.png")`. |
| `app/utils/history.ts` | modify | Read `env.BASE_PATH` from `~/env` and pass it through to `createBrowserHistory({ basename: env.BASE_PATH })`. With path-less `URL`, `env.BASE_PATH === ""` and `history@4.10.1` treats empty-string basename as no prefix — preserving today's behavior. |
| `app/utils/ApiClient.ts` | modify | Replace `this.baseUrl = options.baseUrl || "/api";` (line 47) with `this.baseUrl = options.baseUrl || \`${env.BASE_PATH ?? ""}/api\`;` and add `import env from "~/env";` near the top (the file already imports from `~/...`). The existing `path.match(/^http/)` short-circuit (line 97) continues to bypass prefixing for absolute URLs — verify by inspection during implementation, no code change there. |
| `app/index.tsx` | modify | Lines 107–109: replace `navigator.serviceWorker.register("/static/sw.js", { scope: "/" })` with `navigator.serviceWorker.register(\`${env.BASE_PATH}/static/sw.js\`, { scope: \`${env.BASE_PATH}/\` })`. The existing `import env from "~/env";` at line 18 is sufficient. The `Service-Worker-Allowed: /` response header at `server/routes/index.ts:74` is broader than the new scope and continues to permit it; no server change required. |
| `app/utils/history.test.ts` | create | Jest+jsdom test that imports `createBrowserHistory` directly (not the module under test, which is the `history` singleton — see §8 risk #3) and asserts: with `basename: "/kms"`, `history.createHref({ pathname: "/foo" })` returns `"/kms/foo"`; with `basename: ""`, `history.createHref({ pathname: "/foo" })` returns `"/foo"`. Plus an integration RTL assertion: render `<Router history={createBrowserHistory({ basename: "/kms" })}><Link to="/foo">go</Link></Router>` inside `@testing-library/react`'s `render`, query the anchor, assert `getAttribute("href") === "/kms/foo"`. (Pure RTL test on the `history`+`Link` interface, no MobX store wiring.) |

No other files are touched. Specifically out of scope for this slice (handled elsewhere or unchanged):

- `app/utils/betterAuthClient.ts` — already passes `baseURL: env.URL` (which now includes the path component). better-auth derives endpoint paths from `baseURL`, so `/${BASE_PATH}/api/better-auth/*` resolves correctly without code changes. Verify during smoke; no edit required.
- `shared/utils/urls.ts:cdnPath` — kept defined for backward compatibility but has zero callers after this slice. Removal deferred to a follow-up cleanup (not in scope; spec is silent on removal).
- WebSocket / collaboration handlers, `docs/apache-vhost.conf`, `.env.example` — slice 04.
- `vite.config.ts` PWA manifest icon paths, server `/images/*` route handler — already prefixed in slice 02.
- The single `https://www.getoutline.com/images/screenshot.png` literal at `app/scenes/Developer/components/ExampleData.ts:1355` — absolute external URL, correctly bypassed by `assetUrl`'s pass-through; no edit. (Confirmed by grep: this is the only remaining `/images/` substring in the codebase that should NOT be prefixed.)
- `shared/editor/rules/links.ts`, `shared/editor/nodes/Mention.tsx`, `plugins/{notion,github,linear}/*` OAuth callbacks — these construct `${env.URL}/...` and inherit the path automatically; no edit.

## 3. Schema / data changes

None. No database migrations, no new Sequelize models, no new shared TypeScript types. The `assetUrl` function adds one symbol to the public surface of `shared/utils/urls.ts`. No changes to `PublicEnv` (the existing `Record<string, any>` shape on `window.env` already lets us read `BASE_PATH` typed as `any`, matching the existing pattern for `CDN_URL` and `URL`).

## 4. API endpoints

None. No HTTP routes are added or modified. The shape of network requests issued by the SPA changes (every `ApiClient.fetch(...)` URL gains a `${BASE_PATH}` prefix), but the corresponding server-side handlers were already mounted under `${BASE_PATH}` in slice 01.

For reference, the URLs that change shape on the client:

| Concern | Path-less URL | `URL=http://host/kms` |
|---------|---------------|-----------------------|
| `ApiClient` default base | `/api` | `/kms/api` |
| Service-worker registration | `/static/sw.js` | `/kms/static/sw.js` |
| Service-worker scope | `/` | `/kms/` |
| `<Link to="/home">` resolved href | `/home` | `/kms/home` |
| Editor embed icons (54+ literals) | `/images/<provider>.png` | `/kms/images/<provider>.png` |
| Editor iframe embed renderer (4 literals) | `/embeds/<provider>?url=...` | `/kms/embeds/<provider>?url=...` |
| Confluence import icon | `/images/confluence.png` (or `<CDN>/images/...`) | `/kms/images/confluence.png` (or `<CDN>/kms/images/...`) |
| Notion import icon | `/images/notion.png` | `/kms/images/notion.png` |
| Mention favicon fallback | `/images/link.png` | `/kms/images/link.png` |

## 5. Components & UI

Two component-level changes:

1. **`shared/editor/components/Img.tsx`** — drop the in-component `cdnPath(src)` wrap. New body: `return <img src={src} alt={alt} {...rest} />;`. Props unchanged (`{ alt, src, title?, width?, height? }`). All callers in `shared/editor/embeds/*.tsx` and `app/editor/menus/block.tsx` will be migrated to pass `assetUrl("/images/...")` as `src` in the same commit, so no consumer ever sees an unprefixed `/images/...` URL pass through `<Img>`.

2. **`app/index.tsx`** — service-worker registration (lines 103–129) gains `BASE_PATH` in both the URL and the `scope` option. No JSX or component shape change. The `<Router>` block (lines 56–78) is **not** modified — the basename flows in via `createBrowserHistory({ basename })` in `app/utils/history.ts`, and `<Router history={history}>` reads `history.createHref` (which uses `basename`) automatically. Spec wording "passing it to `<Router>` and to `createBrowserHistory`" is slightly redundant; only the `createBrowserHistory` change is needed because react-router-dom v5's `<Router>` does not accept a `basename` prop directly (only `<BrowserRouter>` does, and we don't use that). See §8 risk #2.

No new components are created. No styled-components, no MobX stores, no new hooks.

## 6. Implementation order

Each phase is a small, independently-verifiable unit. Recommended order:

### Phase A — `assetUrl` helper (foundation for all migrations)

1. **Add `assetUrl` to `shared/utils/urls.ts`.** Single function, ~10 lines. Place after `cdnPath` (which it effectively supersedes). Reads `env.CDN_URL` and `env.BASE_PATH`. Pass-through for absolute URLs and data/blob URIs (`if (path.match(/^(?:https?:|data:|blob:)/)) return path;`). Defensive leading-slash: `path = path.startsWith("/") ? path : "/" + path;`. Return `(env.CDN_URL ?? "") + (env.BASE_PATH ?? "") + path`.
2. **Append `describe("assetUrl", ...)` to `shared/utils/urls.test.ts`.** Eight cases enumerated in §2. Mutate the imported `env` directly in `beforeEach`/test bodies (matching the existing `isInternalUrl` block style at line 100). Reset to a known state in `afterEach` (or set absolute values per-test).

### Phase B — Editor & UI literal migration (all callers must precede `Img.tsx` cleanup so the build never has a window where the old `Img` semantics produce wrong URLs)

3. **Migrate `shared/editor/embeds/index.tsx`.** Add `assetUrl` to the existing `from "../../utils/urls"` named import (already imports `urlRegex`). Run a find-replace to convert all 54 `<Img src="/images/X.png"` patterns to `<Img src={assetUrl("/images/X.png")}`. Verify count: `grep -c '/images/' shared/editor/embeds/index.tsx` should drop to 0 after this step.
4. **Migrate `shared/editor/embeds/PlantUml.tsx` and `Diagrams.tsx`** (one literal each). Add `assetUrl` import, wrap the `<Image src="...">` literal.
5. **Migrate the 4 `/embeds/` iframe files** (`Pinterest.tsx`, `GitLabSnippet.tsx`, `Gist.tsx`, `Dropbox.tsx`). Add `assetUrl` import, wrap the iframe-src template literal in `assetUrl(...)`. The template literal's interpolation (`encodeURIComponent(boardUrl)` etc.) stays inside the original backticks; `assetUrl` wraps the whole thing.
6. **Migrate `shared/editor/components/Mentions.tsx`.** Update the named import (`cdnPath` → `assetUrl`). Update line 221.
7. **Migrate `app/editor/menus/block.tsx`.** Add `assetUrl` import (top of file). Wrap both literal `<Img src="/images/...">` (lines 235, 242).
8. **Migrate `app/scenes/Settings/Import.tsx`.** Replace `cdnPath` import with `assetUrl`; update line 99.
9. **Migrate `plugins/notion/client/index.tsx`.** Same shape as Import.tsx; update line 15.

### Phase C — `Img.tsx` cleanup (must come AFTER all callers are migrated, so we never have a window where unprefixed literals + non-cdn-wrapping `<Img>` ship together)

10. **Update `shared/editor/components/Img.tsx`.** Drop the `cdnPath(src)` call; remove the `cdnPath` import. Body becomes `return <img src={src} alt={alt} {...rest} />;`. Run `grep -rn 'from.*utils/urls' shared/editor/components/Img.tsx` — should match nothing after this step. Also confirm `grep -rn 'cdnPath(' shared app plugins | grep -v test` returns zero matches (all callers migrated).

### Phase D — Client-side routing & API plumbing

11. **Update `app/utils/history.ts`.** Add `import env from "~/env";`, pass `{ basename: env.BASE_PATH }` to `createBrowserHistory`. Empty string is the no-prefix sentinel — verified to work in `history@4.10.1`.
12. **Update `app/utils/ApiClient.ts`.** Add `import env from "~/env";`. Change line 47 default from `"/api"` to `\`${env.BASE_PATH ?? ""}/api\``.

### Phase E — Service worker

13. **Update `app/index.tsx` lines 107–109.** Both arguments to `navigator.serviceWorker.register` use `${env.BASE_PATH}` — the URL becomes `${env.BASE_PATH}/static/sw.js` and the `scope` option becomes `\`${env.BASE_PATH}/\``. For path-less, both collapse to `/static/sw.js` and `/` — preserving today's behavior. The Service-Worker-Allowed response header on `server/routes/index.ts:73-75` is `/` (already broader than `/kms/`); no server change required.

### Phase F — Tests

14. **Create `app/utils/history.test.ts`.** Two assertion blocks: a unit test on `createBrowserHistory({ basename })` directly (verifies `history.createHref({ pathname: "/foo" })` returns the prefixed string), and an RTL test that mounts a minimal `<Router history={...}><Link to="/foo">go</Link></Router>` and asserts the rendered anchor's `href`. Imports: `createBrowserHistory` from `history`, `Router`, `Link` from `react-router-dom`, `render` from `@testing-library/react`. Skip mounting the full `<App>` — too slow, and a pre-rendered anchor's `href` is sufficient evidence.
15. **Run the targeted test files**: `yarn test shared/utils/urls.test.ts` (covers `assetUrl`), `yarn test app/utils/history.test.ts` (covers Router basename). If green, run the full app project: `yarn test:app`. Then full suite `yarn test`.

   **NOTE:** slice 01's `completed.md` (Known issues) flagged that `.jestconfig.json` was missing from the working tree, which broke `yarn test`. Slice 02's `completed.md` indicates the file was restored and the test infrastructure runs in slice 02. **Re-verify on entry** that `yarn test --listTests` succeeds; if the test infra is broken at implementation time, fall back to manual `yarn vite:build` + browser smoke verification per §7 and flag in `completed.md`.

### Phase G — Smoke verification

16. **Path-less smoke (regression).** In `.env.local`, set `URL=http://localhost:3100`. Run `yarn vite:build` (slice 02 baked the prefix at build time, so we need a fresh build for this `URL`), then `yarn dev`. Hard-refresh `http://localhost:3100/`. In DevTools network tab, confirm: every `/api/*` request returns 200 (no 404s); the SW registers at `/static/sw.js` with scope `/`; `<Link>` clicks navigate within the app; editor embed icons render; the document list loads. Sign in, open a doc, edit the title, reload. Behavior should be identical to `main`.
17. **Sub-path smoke (new behavior).** Stop the server. Set `URL=http://localhost:3100/kms` in `.env.local`. Run `yarn vite:build` again (mandatory rebuild — Vite `base` is baked at build time). Restart `yarn dev`. Hard-refresh `http://localhost:3100/kms/`. Sign in via Microsoft OIDC (or the local-dev provider), confirm landing page is `/kms/home`. Open a document. DevTools network tab → every `/kms/api/*` request returns 200; embed icons in the slash menu have `src="/kms/images/<provider>.png"`. Edit the document title; confirm the PUT request goes to `/kms/api/documents.update` (or similar) and succeeds. Reload — page resolves to the same `/kms/doc/foo-abc123` URL. DevTools Application → Service Workers → confirm SW registered at `/kms/static/sw.js` with scope `/kms/`. Note: real-time avatars and live cursor sync will NOT work (slice 04).
18. **Restore developer's normal `URL`** when smoke verification is complete; rebuild Vite once more.

## 7. Manual test walkthrough

End-to-end verification a human runs after `/implement` completes. Total time ≈15 min.

### Pre-build for path-less layout

1. In `.env.local`, set `URL=http://localhost:3100`.
2. `yarn vite:build`. Confirm `build/app/.vite/manifest.json` is regenerated.
3. `yarn dev`. Confirm server logs `App listening on port 3100` (or similar).

### Path-less regression check (must behave identically to `main`)

4. Browser: open `http://localhost:3100/`. Sign in via the configured OIDC. Land on the home scene.
5. DevTools → Network → filter "Fetch/XHR". Click around (open a doc, change collections). Every request URL begins with `/api/`. Zero 404s.
6. DevTools → Application → Service Workers. Status: activated and running. SW URL: `/static/sw.js`. Scope: `/`.
7. DevTools → Elements → inspect any editor slash-menu icon (open the editor, type `/`). The `<img>` `src` attribute is `/images/<provider>.png` (no `/kms/` prefix). For an existing iframe embed (e.g. paste a Pinterest URL into a doc), inspect the iframe's `src` — should be `/embeds/pinterest?url=...`.
8. Click any `<Link>` (e.g. sidebar collection). URL bar updates to `/<route>` — no `/kms/` prefix. Hit browser refresh; same URL resolves to the same scene.
9. Edit a document title. Confirm save persists across reload.

### Re-build for sub-path layout

10. Stop the server. Set `URL=http://localhost:3100/kms` in `.env.local`. Run `yarn vite:build` (mandatory — `base` is baked at build time). Restart `yarn dev`.

### Sub-path acceptance

11. Browser: open `http://localhost:3100/kms/`. The login screen renders; static assets load (no 404s in DevTools network tab).
12. Sign in via Microsoft OIDC. Better-auth's redirect dance ends at `/kms/home` (or `/kms/auth/callback?...` then SPA-redirected to `/kms/home`).
13. DevTools → Network → filter "Fetch/XHR". Every API request URL begins with `/kms/api/` (e.g. `/kms/api/auth.info`, `/kms/api/documents.list`). All return 200.
14. Open any document. Document content loads. Editor icons render — inspect the slash menu (type `/`) and confirm `<img>` `src="/kms/images/<provider>.png"`.
15. For each of the 4 iframe embeds (Pinterest, GitLab snippet, Gist, Dropbox): paste a relevant URL into a doc, confirm the iframe loads and its `src` contains `/kms/embeds/`.
16. Edit the document title. Confirm the PUT/POST goes to `/kms/api/documents.update` (DevTools network), returns 200, and the title persists across reload.
17. Hit browser refresh on `/kms/doc/foo-abc123`. Page lands on the same document scene (does not 404, does not redirect to `/kms/`).
18. DevTools → Application → Service Workers. Status: activated. SW URL: `/kms/static/sw.js`. Scope: `/kms/`.
19. DevTools → Application → Cookies. Confirm the better-auth session cookie's `Path` attribute is `/kms` (better-auth derives this from `baseURL`). Confirm the CSRF cookie similarly scoped.
20. Click any sidebar `<Link>`. URL bar updates to `/kms/<route>`. Hit refresh — still on the same route.
21. Sign out. Better-auth signs out and redirects. Confirm the resolved URL after sign-out is `/kms/` (not `/`). If a hard browser redirect to `/` occurs, see §8 risk #5 — fix is in `app/utils/betterAuthClient.ts`.

### Cleanup

22. Restore `URL` to your normal value. Rebuild Vite, restart.

## 8. Risks & open questions

1. **`<Img>` cleanup ordering.** `Img.tsx`'s `cdnPath(src)` wrap currently provides defense-in-depth: even if a caller forgets `cdnPath`, the rendered URL is still `${CDN_URL}/images/...`. After this slice, callers MUST use `assetUrl(...)` explicitly because `<Img>` becomes a pure passthrough. **Mitigation:** Phase B migrates ALL existing callers in the same commit; Phase C drops the wrap only after callers are converted; the spec's acceptance grep (`"/images/"` returns zero matches in `app/`, `shared/`, `plugins/*/client/`) catches any caller a future contributor adds without `assetUrl`. **Residual risk:** a future contributor unaware of the convention could add `<Img src="/images/foo.png">` and have it ship to a sub-path deployment broken. A unit test that asserts `<Img>` does NOT prefix (i.e. that `<Img src="/foo">` renders `<img src="/foo">`) makes the convention explicit but verbose. Defer; the spec's CI-grep is the canonical guard.

2. **`<Router basename>` vs `createBrowserHistory({ basename })`.** Spec says "passing it to `<Router>` in `app/index.tsx` and to `createBrowserHistory({ basename: env.BASE_PATH })` in `app/utils/history.ts`." In react-router-dom v5, only `<BrowserRouter>` accepts `basename` directly; the lower-level `<Router history={...}>` (which `app/index.tsx` uses) reads basename from `history.createHref`. **Decision:** set basename on `createBrowserHistory` only. Do not modify `app/index.tsx`'s `<Router>` element. The behavior matches the spec's acceptance criterion (`<Link to="/home">` produces `/kms/home`) because `<Link>` calls `history.createHref` internally. Verify in Phase F's RTL test.

3. **`history` singleton vs test instance.** `app/utils/history.ts` exports a singleton `history` constructed at module load with `env.BASE_PATH` snapshotted at that moment. In tests, `window.env` is `{}` (per `__mocks__/window.js`), so the singleton's basename would be `undefined`/`""`. **Test approach:** the new `app/utils/history.test.ts` does NOT exercise the singleton — it constructs fresh `createBrowserHistory({ basename: "/kms" })` instances inline, isolating the test from module-load-time state. The singleton's behavior is then implicitly tested at smoke-time (Phase G). If a test ever needs to exercise the singleton, add a setter or move construction into a factory function — but that's tooling overkill for this slice.

4. **`window.env.BASE_PATH` availability at module load.** `app/utils/history.ts` reads `env.BASE_PATH` synchronously at module-load time. `app/env.ts` validates that `window.env` is set (throws if missing) and constructs the env object before any consumer runs (because the env script tag is inlined in the HTML head, before the bundle). So `env.BASE_PATH` is reliably present before `history.ts` runs. **Caveat from slice 01 known issues:** `PublicEnvironmentRegister` snapshots `@Public` values once at the first `process.nextTick` after server `Environment` construction. In production this happens at server boot, well before any HTML response — so `env.public.BASE_PATH` is always populated when the response is served. No client-side observable issue.

5. **Sign-out redirect.** Better-auth's sign-out flow (`signOutBetterAuth` in `app/utils/betterAuthClient.ts`) may issue a server-side redirect to `/` after clearing the session. With `baseURL: env.URL` (which now includes `/kms`), the redirect should resolve relative to `${env.URL}/` = `/kms/`. If smoke testing reveals the redirect lands on `/` (escaping the prefix), the fix is to pass an explicit `redirectTo: env.URL` (or `/kms/`) to `betterAuthClient.signOut()`. **Out of scope unless smoke fails.** Flag in `completed.md` if the symptom appears.

6. **`ApiClient` short-circuit at line 97.** `urlToFetch = path.match(/^http/) ? path : this.baseUrl + path;` — when callers pass a fully-qualified URL (e.g. for cross-domain requests), the prefix logic is bypassed correctly. Existing callers that do this are presumed to know what they're doing (the spec confirms this). Verify by `grep -rn 'this.fetch\|client.fetch' app shared` for callers passing absolute URLs; we don't expect any to break.

7. **`cdnPath` retention.** All four call sites (`Img.tsx`, `Mentions.tsx`, `Import.tsx`, `notion/client/index.tsx`) migrate to `assetUrl` in this slice. After the slice, `cdnPath` has zero callers but remains exported from `shared/utils/urls.ts`. **Decision:** leave it defined (no spec direction to remove; minimal-diff principle). Future cleanup: a separate "remove `cdnPath`" PR can drop it once we confirm no plugin or external integration depends on the export. Acceptance grep in spec excludes `cdnPath` definition itself, so this is safe.

8. **Test infrastructure availability.** Slice 01's `completed.md` flagged `.jestconfig.json` missing from the working tree. Slice 02 worked around this and the file is now restored (verified at planning time: file exists at `/Users/rihanrauf/.../KMS/.jestconfig.json`, dated 2026-04-28). Plan assumes `yarn test` is functional. **If the file goes missing again** at implementation time (e.g. due to a checkout state shift), fall back to running individual test files with `yarn jest --config <inline-config>` or postpone test verification to manual smoke per Phase G — flag in `completed.md`.

9. **Defensive leading-slash handling for `assetUrl`.** Spec says: "missing-leading-slash defensive handling." Two interpretations: (a) silently prepend `/` (so `assetUrl("images/foo")` works), or (b) throw / log a warning. **Decision:** silently prepend `/`. Rationale: it's lenient toward callers, matches the intent of the existing `cdnPath` (which doesn't validate either), and avoids a runtime error that would crash editor rendering if a future contributor passes a relative path. The unit test in §2 covers this case.

10. **Pass-through schemes.** `assetUrl` should NOT prefix `http://`, `https://`, `data:`, `blob:`. **Implementation:** `if (path.match(/^(?:https?:|data:|blob:)/)) return path;`. Matches the spec's "absolute URL passthrough" requirement and its technical-notes guidance "should *not* prefix paths that start with `http://`, `https://`, `data:`, or `blob:`." `mailto:`, `tel:`, `sms:`, `fax:` are not asset-relevant for this helper (they wouldn't be passed through `assetUrl` in practice), so the regex covers exactly what's needed.

11. **Service-Worker-Allowed header narrowing.** Currently `Service-Worker-Allowed: /` (broader than the new scope). Could narrow to `${env.BASE_PATH}/` for tighter security. **Decision:** leave as `/`. The spec says "Either keep the existing broad header or narrow it; both work." Narrowing changes server behavior and is out of scope unless smoke testing reveals an issue. If a future security review requires tightening, a one-line edit to `server/routes/index.ts:74` suffices.

12. **`workflow.md` not present.** `/plan` skill instructions reference `docs/implementation/workflow.md`, which does not exist in the repo (confirmed at planning time). This plan was written using the slice 03 spec, slice 01 + 02 completed.md / plan.md / review.md, and reading the source files directly. If a `workflow.md` is added later, re-validate this plan against it.

13. **Slice 04 dependencies.** This slice intentionally leaves WebSocket / Hocuspocus paths alone. The acceptance criterion explicitly excludes real-time presence and live cursor sync from the smoke walkthrough. If during smoke testing the editor shows a "disconnected" indicator or the document fails to load entirely (rather than just lacking real-time avatars), the issue may have spilled past the slice boundary — investigate before declaring success.

---

Plan written to `docs/implementation/slices/03-subpath-client/plan.md`. Please review and approve before running `/implement 03-subpath-client` in a new session.
