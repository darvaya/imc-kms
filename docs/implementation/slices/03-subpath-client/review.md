# Review: 03-subpath-client

## 1. Hard-rule audit

| Rule | Status |
|------|--------|
| No `any` types | ✅ Pass — no new `any` introduced; `env.BASE_PATH` is `any` only via the pre-existing `Record<string, any>` shape on `window.env` (out of scope for this slice). |
| No `@ts-ignore` / `@ts-expect-error` | ✅ Pass |
| No placeholder data or TODO for required functionality | ✅ Pass |
| No half-built features | ✅ Pass |
| Plan followed exactly (no extra features, no missing features) | 🟡 Mostly — two minor deviations (see Findings #1 and #2). |
| TypeScript compiles (`yarn tsc --noEmit`) | ✅ Pass — verified (exit 0). |
| Lint passes (`yarn lint`) | ✅ Pass — 0 errors, 328 pre-existing warnings (none introduced by this slice). |
| Changes stay within slice boundary | ✅ Pass — only the 17 files listed in plan §2 plus the new test file are touched. No server, build-config, or out-of-scope plugin changes. |

## 2. Definition of Done checklist

Acceptance criteria from `spec.md`:

- ✅ **React Router uses `env.BASE_PATH` as `basename`.** `app/utils/history.ts:4` passes `{ basename: env.BASE_PATH }` to `createBrowserHistory`. The plan §8 risk #2 correctly notes that react-router-dom v5's `<Router>` does not accept a `basename` prop directly, and the basename flows through `history.createHref`. `app/utils/history.test.ts` proves `<Link to="/foo">` renders `href="/kms/foo"` under basename `/kms` and `href="/foo"` under empty basename. (See finding #1 about the missing `?? ""` here.)
- ✅ **`ApiClient` defaults `baseUrl` to `${env.BASE_PATH}/api`.** `app/utils/ApiClient.ts:48` uses `${env.BASE_PATH ?? ""}/api`. The `path.match(/^http/)` short-circuit at line 98 is preserved unchanged.
- ✅ **Service worker registration uses prefixed URL + scope.** `app/index.tsx:107-112` passes `${env.BASE_PATH ?? ""}/static/sw.js` and `scope: ${env.BASE_PATH ?? ""}/`. `Service-Worker-Allowed: /` header on `server/routes/index.ts:74` continues to permit the new scope.
- ✅ **`assetUrl(path)` helper exists with full unit-test coverage.** `shared/utils/urls.ts:27-33` implements pass-through for `^(?:https?:|data:|blob:)`, defensive leading-slash, and `${CDN}${BASE_PATH}${path}` composition. `shared/utils/urls.test.ts:193-261` covers the 8 cases enumerated in plan §2.
- ✅ **All `/images/` and `/embeds/` literals migrated.** Grep over `app/`, `shared/`, `plugins/*/client/` for `"/images/` and `"/embeds/`/`` `/embeds/`` `` shows zero unwrapped literals (excluding the `urls.ts` doc-comment, the test file, the absolute external URL `https://www.getoutline.com/images/screenshot.png` in `app/scenes/Developer/components/ExampleData.ts:1355`, and server-side handlers). `Img.tsx` is correctly converted to a passthrough so callers pre-resolve via `assetUrl`. `cdnPath` is now unreferenced outside its own definition (plan §8 risk #7 documents the deliberate retention).
- ⚠️ **End-to-end smoke under `URL=http://host:PORT/kms`.** Out of scope for `/review` — verified by `/test-commit`. No code-level reason this should fail; all the wiring is in place.
- ✅ **No regression with path-less `URL`.** `urls.test.ts` covers empty BASE_PATH; `history.test.ts` covers empty basename (asserting both `href="/foo"` and the absence of a double-slashed `href="//foo"`); `ApiClient.ts:48` collapses to `"/api"` when BASE_PATH is empty/undefined; service worker collapses to `/static/sw.js` and scope `/`.

## 3. Findings

### 🟡 Important

**#1 — `app/utils/history.ts:4` passes `env.BASE_PATH` without `?? ""`** (single occurrence)
- *What is wrong:* The other three callsites added in this slice (`ApiClient.ts:48`, `app/index.tsx:108`, `app/index.tsx:110`) all use `${env.BASE_PATH ?? ""}` to coerce `undefined` to empty string. `history.ts` passes the raw `env.BASE_PATH` instead.
- *Why it matters:* In jest tests `window.env = {}` (per `__mocks__/window.js`), so `env.BASE_PATH` is `undefined` and the constructed singleton becomes `createBrowserHistory({ basename: undefined })`. history@4.10.1 happens to treat `undefined` as no-basename via destructuring defaults (`const { basename = '' } = props`), so the runtime is correct, but this is an implicit dependency on a library detail. Future contributors may not notice the asymmetry, and a library upgrade that tightens the typing could break it. Inconsistency also makes grep audits less reliable.
- *Suggested fix:* Change line 4 to `createBrowserHistory({ basename: env.BASE_PATH ?? "" })` to match the rest of the slice.

### ⚪ Nit

**#2 — `app/utils/history.test.ts` uses `renderToStaticMarkup` instead of `@testing-library/react`'s `render`**
- *What is wrong:* Plan §2 row "create `app/utils/history.test.ts`" prescribed: "render `<Router history={...}><Link to="/foo">go</Link></Router>` inside `@testing-library/react`'s `render`, query the anchor, assert `getAttribute("href") === "/kms/foo"`." The implementation uses `react-dom/server.renderToStaticMarkup` and asserts `markup.toContain('href="/kms/foo"')` instead.
- *Why it matters:* Functionally equivalent for testing the rendered href. RTL is the codebase's standard for component testing and would be more discoverable to contributors. `renderToStaticMarkup` could miss client-only effects (irrelevant for a static `<Link>` href, but the convention exists for a reason).
- *Suggested fix:* Migrate to `@testing-library/react`'s `render` + `screen.getByRole("link")` query. Or, if the SSR approach is preferred for speed, leave a one-line comment explaining why. Optional.

**#3 — `shared/utils/urls.test.ts:202` sets unused `env.URL`**
- *What is wrong:* The new `assetUrl` describe block does `env.URL = "https://example.com"` in `beforeEach`, but `assetUrl` reads only `env.CDN_URL` and `env.BASE_PATH`. The URL save/restore is dead weight.
- *Why it matters:* Marginal noise; could mislead a reader into thinking URL affects the helper.
- *Suggested fix:* Drop the `originalUrl` save/restore and the `env.URL = "..."` assignment. Optional.

**#4 — Missing-leading-slash test only covers the `BASE_PATH=/kms` branch**
- *What is wrong:* The `"treats a missing leading slash the same as a leading slash"` case sets `env.BASE_PATH = "/kms"` and asserts `assetUrl("images/foo.png") === "/kms/images/foo.png"`. There is no companion case asserting empty-`BASE_PATH` behavior (`assetUrl("images/foo.png") === "/images/foo.png"`).
- *Why it matters:* Mostly belt-and-braces; the prefix logic is decoupled from the leading-slash logic so a single happy-path is sufficient. But the spec's enumeration in §2 implied both paths were worth covering.
- *Suggested fix:* Add a one-line `expect(...).toBe("/images/foo.png")` case under empty BASE_PATH. Optional.

**#5 — `cdnPath` retained without callers**
- *What is wrong:* `shared/utils/urls.ts:12` still exports `cdnPath`, but a grep shows zero remaining callers anywhere in the repo.
- *Why it matters:* Plan §8 risk #7 documents this as intentional ("minimal-diff principle"). Acceptance grep allows the definition itself. Just confirms the residual surface should get a follow-up cleanup PR.
- *Suggested fix:* No change for this slice. Track for follow-up. Optional.

**#6 — `assetUrl` regex does not anchor to `://` for http/https**
- *What is wrong:* The regex is `^(?:https?:|data:|blob:)` — matches strings like `https:foo` (no slashes) the same as `https://foo`. Spec wording "matching `^https?://`" is stricter.
- *Why it matters:* No real callsite passes `https:foo`-style URIs, so this is theoretical. The looser match also correctly handles edge cases like `data:` and `blob:` per the spec's technical notes, so any tightening here would have to retain those branches.
- *Suggested fix:* No change required. Optional.

**#7 — Migrated `<Img>` lines in `shared/editor/embeds/index.tsx` lengthen past ~80 cols on some entries**
- *What is wrong:* Lines like 234 (`codepen`), 308 (`github-gist`), 344 (`google-drawings`), 391 (`google-calendar`), 415 (`google-lookerstudio`), 469 (`jsfiddle`), 614 (`tldraw`), 632 (`typeform`) exceed ~85 cols after the `assetUrl(...)` wrap. There's no prettier config in the repo, so no auto-formatting enforces the convention.
- *Why it matters:* Cosmetic; matches the surrounding file style which already had long regex lines (#1 in the codebase: line 494 at 198 cols).
- *Suggested fix:* Leave as-is. Optional.

## 4. Summary

The slice delivers exactly what the spec and plan call for: an `assetUrl(path)` helper with thorough unit coverage, a router/history singleton honoring `BASE_PATH`, an `ApiClient` default that respects the prefix, a service-worker registration on the prefix, all 65 image-literal and 4 iframe-literal migrations, and a focused `history.test.ts` proving the `<Link>`/`href` contract. TypeScript and lint are clean. The only **🟡 important** finding is the inconsistent `env.BASE_PATH ?? ""` pattern in `app/utils/history.ts:4` — non-blocking under current library behavior but worth tightening before merge for robustness and pattern consistency. All other findings are nits. **The slice is ready for `/test-commit` once finding #1 is addressed (a one-character change).**
