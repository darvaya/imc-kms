# Review: 02-subpath-assets

## 1. Hard-rule audit

| Rule | Status |
|------|--------|
| No `any` types | ✅ Pass |
| No `@ts-ignore` / `@ts-expect-error` | ✅ Pass |
| No placeholder data or TODO for required functionality | ✅ Pass |
| No half-built features | ✅ Pass |
| Plan followed exactly (no extra features, no missing features) | ❌ **Fail** — `.env.example` modified (out of scope per spec; deferred to slice 04) |
| TypeScript compiles (`yarn tsc --noEmit`) | ✅ Pass (exit 0) |
| Lint passes (`yarn lint`) | ✅ Pass (0 errors, 328 pre-existing warnings) |
| Changes stay within slice boundary | ❌ **Fail** — `.env.example` is the slice-04 deliverable |

## 2. Definition of Done checklist (from spec)

- [x] Every asset URL injected into HTML by `server/routes/app.ts` includes `${env.BASE_PATH}` after `${env.CDN_URL ?? ""}` — verified in `app.ts:74,109,111,117,118,134,139,143,149,173`.
- [x] Prefetch tags in `server/utils/prefetchTags.tsx` include `BASE_PATH` for `/static/*` URLs — verified at lines 53, 63.
- [x] Font URLs in `server/static/index.html` are templated to include `BASE_PATH` after the optional CDN host — done by expanding the `{cdn-url}` substitution in `app.ts:173` to `(env.CDN_URL || "") + env.BASE_PATH`. `index.html` itself is unchanged, as the plan called for.
- [x] `vite.config.ts` `base` is `(CDN_URL ?? "") + BASE_PATH + "/static/"` — verified at line 37.
- [x] PWA `start_url`, `scope`, and three `icons[].src` entries include `BASE_PATH` — verified at lines 105, 106, 114, 119, 125.
- [x] `workbox.modifyURLPrefix` rewrites to `${CDN_URL ?? ""}${BASE_PATH}/static/` — verified at line 63.
- [⚠] Smoke verification with `URL=http://host:PORT/kms` — manual test, **NOT verified by review** (no completed.md, no smoke run captured).
- [⚠] Smoke verification with path-less `URL` — manual test, **NOT verified by review**.

The mechanical changes all match the plan and spec. What's missing is automated coverage that proves the sub-path code path actually works (see findings).

## 3. Findings

### 🔴 Blockers

#### B1. `.env.example` modified — explicitly out of scope
- **File:** `.env.example` (whole-file)
- **What's wrong:** The diff changes `NODE_ENV` (development → production), `URL` (`http://localhost:3100` → `http://kms.imcpelilog.co.id`), and `DATABASE_URL` (template → real-looking credentials with placeholder password).
- **Why it matters:** The slice spec's "Out of scope" section explicitly says: *"`docs/apache-vhost.conf` and `.env.example` updates. They ship with the WebSocket slice as a single ops-facing deliverable."* This belongs in slice 04. Beyond the scope violation, switching the example default `NODE_ENV` from `development` to `production` is a behavior change that affects every developer who copies the file going forward — that decision deserves its own review, not a quiet drive-by here. Also: `kms.imcpelilog.co.id` looks like a typo for `kms.imcpelitalog.co.id` (matches the user's `@imcpelitalog.com` email; "imcpelilog" appears nowhere else in the codebase).
- **Suggested fix:** Revert `.env.example` entirely (`git checkout .env.example`). The file's existing footer still states *"The app has NO subpath support"*, which is false after slice 01 — but updating it is also slice 04's job.

#### B2. New sub-path tests do not actually exercise the sub-path code path
- **File:** `server/routes/app.test.ts:63-116` (the `URL with /kms prefix` describe block)
- **What's wrong:** Running `yarn test server/routes/app.test.ts` produces **4 failing assertions out of 9** — every test in the sub-path block fails. Inspecting the rendered HTML in the failure output shows `"BASE_PATH":""` and asset URLs like `http://localhost:3001/static/@vite/client` (no `/kms`).

  Root cause: `server/test/setup.ts:44-46` runs a global `beforeEach` that resets `env.URL = sharedEnv.URL = "https://app.outline.dev"` before *every* test in the suite. `getSubpathTestServer("/kms")` (called at describe-block evaluation time) sets `env.URL = "https://app.outline.dev/kms"` and registers an `afterAll` cleanup, but **does not** install a `beforeEach` to re-apply the sub-path URL. Order of execution per test:
  1. `getSubpathTestServer` already mutated `env.URL` to include `/kms` (during describe-block setup)
  2. `setup.ts` `beforeEach` runs and overwrites `env.URL` back to path-less
  3. Test runs against the mounted-at-`/kms` server, but `renderApp` reads `env.BASE_PATH` (live getter → `""`) and emits root-relative URLs
  4. Assertion looking for `/kms/...` fails

  The path-less describe block passes only because its expected URLs already match the path-less default that `setup.ts` re-applies — i.e. the path-less tests aren't really proving the new code; they'd pass on `main` too.
- **Why it matters:** The test file claims to verify sub-path asset URLs but verifies nothing of the sort. Whoever runs `/test-commit` on this slice will hit a red suite. More important: the production code change is **completely unverified by automated tests** for the sub-path case. The production-script-tag branch (`env.isProduction`) is also unexercised.
- **Suggested fix:** Either (a) add a `beforeEach` inside `getSubpathTestServer` that re-asserts `env.URL = sharedEnv.URL = \`https://app.outline.dev${basePath}\`` so it survives `setup.ts`'s reset, or (b) inside `app.test.ts`'s sub-path describe block, add a `beforeEach` that sets `env.URL` to the sub-path value. Then re-run and confirm all 9 assertions pass. (Option (a) is the right home for the fix because `subpath.test.ts` happens to work without it only by luck — its assertions don't read `env.BASE_PATH` at request time.)

### 🟡 Important

#### I1. PWA `scope` for path-less changes from `"."` to `"/"`
- **File:** `vite.config.ts:106`
- **What's wrong:** Plan-section-8 risk #4 explicitly recommended a fallback (`scope: BASE_PATH ? \`${BASE_PATH}/\` : "."`) to preserve the existing path-less behavior. The implementation chose unconditional `\`${BASE_PATH}/\``, which collapses to `"/"` when `BASE_PATH=""` — a value-shape change for the path-less deployment that this slice is supposed to leave behavior-equivalent.
- **Why it matters:** `scope: "."` is a *relative* reference resolved against the manifest URL; `scope: "/"` is *absolute*. They behave the same in the common case but diverge at the edges (e.g., manifest fetched from a non-root path). This slice's stated regression criterion is *"hard-refresh of `http://host:PORT/` shows the same zero-404 behaviour as `main` does today."* For PWA-installed users this is silent — but the plan flagged the risk and the implementer didn't apply the recommended mitigation.
- **Suggested fix:** Change to `scope: BASE_PATH ? \`${BASE_PATH}/\` : "."` (and likewise consider `start_url: BASE_PATH ? \`${BASE_PATH}/\` : "/"` if you want to preserve the path-less `start_url: "/"` from before — though `"/"` was already what the previous config emitted, so `start_url` is fine as-is).

#### I2. `viteHost` is captured at module load, not per request
- **File:** `server/routes/app.ts:21-28`
- **What's wrong:** The new `viteHost` IIFE runs once at module load time (same as the previous `.replace` did). If `env.URL` ever changes after module load (test fixtures, hot config reload), `viteHost` does not update. Combined with B2's `setup.ts` issue, a sub-path test that *did* manage to hold `env.URL` constant would still see `viteHost = origin(URL_at_module_load)` — which in test-runtime is the path-less default. The `${env.BASE_PATH}` appended at use sites is read live, so the prefix would still appear; but if a user ever sets `env.URL` to a different *origin* mid-process, `viteHost` is stale.
- **Why it matters:** This is mostly a test-fixture concern (production `env.URL` doesn't change post-startup), but it's a footgun for slice 03's tests if they want to assert dev-server URLs. The plan's risk #2 acknowledged the derivation change but only in terms of path-stripping, not module-load capture.
- **Suggested fix:** Either accept the footgun (it's no worse than `main`) and document it with a one-line comment, or move the IIFE call inside `renderApp` so it's recomputed per request. The latter is a small perf hit but is the only correct option if test fixtures want to vary `env.URL`.

#### I3. No automated coverage for production-mode script tag with BASE_PATH
- **File:** `server/routes/app.ts:106-109` (production branch); `server/routes/app.test.ts`
- **What's wrong:** Test environment runs with `!env.isProduction`, so the production branch (`<script src="${env.CDN_URL || ""}${env.BASE_PATH}/static/${manifest-file}">`) has zero test coverage. The plan's risk #8 acknowledged this and proposed mocking `@server/env` or temporarily flipping `env.ENVIRONMENT`. The implementer chose the alternative (assert dev-mode tags only) — fine in principle, but combined with B2 (sub-path tests broken), the entire sub-path scenario is now uncovered by tests.
- **Why it matters:** This is the most critical asset URL — the main JS bundle. A regression here breaks the entire app. With B2 fixed, dev-mode coverage is acceptable (the production branch is one literal-string substitution and visually obvious in code review). Without B2 fixed, there is no coverage at all.
- **Suggested fix:** Once B2 is resolved, add at least one test that mocks `env.isProduction = true` and asserts the production script-tag URL contains the BASE_PATH prefix. Alternatively, leave it but be explicit in `completed.md`'s "tech debt" section.

### ⚪ Nits

#### N1. Operator inconsistency: `??` vs `||` for `env.CDN_URL`
- **File:** `server/routes/app.ts:74,109,143,173`; `server/utils/prefetchTags.tsx:53,63`; `vite.config.ts:37,63`
- **What:** Mixed usage — sometimes `env.CDN_URL || ""`, sometimes `env.CDN_URL ?? ""`. Both work because `CDN_URL` is `undefined` when unset (via `toOptionalString`), so the operators are functionally equivalent.
- **Why it matters:** Pre-existing in some lines; this slice didn't introduce the inconsistency, just propagated it. Worth a one-time normalization in a separate cleanup commit.
- **Suggested fix:** Out of scope; defer.

#### N2. Comment in `app.ts:166-172` is verbose for the substitution it documents
- **File:** `server/routes/app.ts:166-172`
- **What:** A 7-line block comment for one `String.replace()` call. The comment is informative — it captures the CDN+BASE_PATH coupling risk from the plan — but is heavier than typical in this file. A 2–3 line summary would carry the same warning.
- **Why it matters:** Style only.
- **Suggested fix:** Trim the comment to the warning ("`{cdn-url}` now expands to CDN_URL + BASE_PATH; future `{cdn-url}/...` references must live under the sub-path") if it bothers you. Not a blocker.

#### N3. Test for `parseBasePath` doesn't cover hash/query edge cases
- **File:** `shared/utils/basePath.test.ts`
- **What:** No tests for `https://host/kms?foo=bar` or `https://host/kms#frag`. `new URL().pathname` strips both, so behavior is correct, but it's not asserted.
- **Why it matters:** These inputs aren't expected in `URL` env (it's a server URL), but cheap to add for completeness.
- **Suggested fix:** Add two cases. Optional.

## 4. Summary

The production code changes mechanically match the plan and the spec acceptance criteria — `app.ts`, `prefetchTags.tsx`, `vite.config.ts`, and the new `parseBasePath` helper all do the right thing on inspection, and `env.test.ts` continues to pass. **However, this slice is not ready for `/test-commit`** for two reasons: (1) the new `app.test.ts`'s entire sub-path block fails (4/9 tests red) because `getSubpathTestServer` doesn't survive `setup.ts`'s `beforeEach`, leaving the sub-path code path completely unverified by automation, and (2) `.env.example` was modified despite being explicitly out of scope, with one of the changes flipping the example `NODE_ENV` default and another containing a likely domain typo. Fix both blockers, address the PWA `scope` regression-risk fallback (I1), and re-run the suite green before proceeding.

---

Review written to `docs/implementation/slices/02-subpath-assets/review.md`. Address any 🔴 blockers, then run `/test-commit 02-subpath-assets` in a new session.
