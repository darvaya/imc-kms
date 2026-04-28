# Review: 01-subpath-foundation

Reviewer mode: hostile, code-only verification against `spec.md` and `plan.md`. No source files modified.

## 1. Hard-rule audit

| Rule | Status |
|------|--------|
| No `any` types | ✅ Pass — no new `any` introduced in modified files |
| No `@ts-ignore` / `@ts-expect-error` | ✅ Pass — none in the diff |
| No placeholder data or TODO for required functionality | ✅ Pass — no TODOs in changed code |
| No half-built features | ✅ Pass — every advertised piece (BASE_PATH getter, mount, CSRF fix, test helper) is wired through |
| Plan followed exactly (no extra features, no missing features) | ⚠️ Partial — see Findings 🟡 #3 (`onerror` placement divergence), 🟡 #1 (CSRF guard removal based on false plan premise) |
| TypeScript compiles (`yarn tsc --noEmit`) | ✅ Pass — exit 0, ran in this review |
| Lint passes (`yarn lint`) | ✅ Pass — exit 0, 328 warnings / 0 errors (warnings are all pre-existing in unmodified files) |
| Changes stay within slice boundary | ⚠️ Mostly — `.env.example` is modified in the working tree but spec §Out of scope explicitly excludes it. Inspecting `git diff .env.example` shows the changes are unrelated to this slice (they swap localhost defaults for `kms.imcpelilog.co.id` / production credentials and were already present before this slice per the initial git status snapshot). The slice itself didn't add to the file, but a contributor will still want to confirm those changes belong on this branch before merge. |

## 2. Definition of Done checklist (spec acceptance criteria)

| # | Criterion | Status |
|---|-----------|--------|
| 1 | `env.BASE_PATH` derives the path component of `URL` per the table (no path → `""`, `/kms` → `/kms`, `/kms/` → `/kms`, multi-segment preserved) | ✅ Implemented in `server/env.ts:218-225`. Unit tests in `server/env.test.ts:14-52` cover all six cases plus the empty-URL case. |
| 2 | `BASE_PATH` is in `presentEnv` → `window.env` | ✅ `@Public` decorator on getter (`server/env.ts:218`) places it in `env.public`. `presentEnv` spreads `env.public`. **Caveat:** `PublicEnvironmentRegister` caches the value at startup (see Finding 🟡 #4) — fine for production, irrelevant to this slice. |
| 3 | Routes resolve under `/kms/*` when `URL=http://host/kms`; root paths return 404 | ✅ Mount installed at `server/index.ts:201` after service init. `subpath.test.ts:79-90` covers both halves. |
| 4 | `GET /_health` returns 200 at outer root regardless of BASE_PATH | ✅ Health router registered on outer app at `server/index.ts:185` BEFORE the mount. Tested in `subpath.test.ts:21-23` and `:74-77`. |
| 5 | CSRF round-trip succeeds under both layouts | ✅ Tested in `subpath.test.ts:44-68` and `:101-125`. **But** the implementation went beyond the spec's literal change — see Finding 🟡 #1. |
| 6 | better-auth handler intercepts `/api/better-auth/*` and `/kms/api/better-auth/*` | ✅ Handler stays in `server/services/web.ts:72`, which now runs inside the mount (inner app). Tested in `subpath.test.ts:34-42` and `:92-99`. |
| 7 | Pre-existing test suite passes unchanged | ❓ **Unverifiable** in this environment — see Finding 🟡 #5 (jest config missing). |

## 3. Findings

### 🔴 Blockers

**None.** The implementation produces the routing behavior the spec requires for the four spec-named layouts, types compile, lint is clean, and the new test cases match the plan's Phase D §12 enumeration. No bugs that block merge were identified by static review.

### 🟡 Important

#### 🟡 #1 — CSRF guard removal is premised on a false claim about where `verifyCSRFToken` is attached

**File / lines:** `server/middlewares/csrf.ts:57-69` (and plan §8 risk #1, which the implementation followed).

**What is wrong:** The new comment says *"verifyCSRFToken is only attached via api.use(...), so we are always on an API route."* That is **factually incorrect**. `verifyCSRFToken()` is attached in three places, not one:

- `server/routes/api/index.ts:75` — `api.use(verifyCSRFToken())`
- `server/routes/auth/index.ts:13` — `app.use(verifyCSRFToken())`
- `server/routes/oauth/index.ts:164` — `app.use(verifyCSRFToken())`

Before this change, the `if (ctx.originalUrl.startsWith("/api/"))` guard meant the read-scope shortcut **only ran for `/api/*` requests**. Auth and OAuth mutating requests with cookie-transport auth went straight to "Protect all other mutating requests" (always required CSRF). After the change, the shortcut runs unconditionally for all three apps.

For current OAuth route paths (`/authorize`, `/token`, `/revoke`) the shortcut returns false because `methodToScope[undefined] === Scope.Read` is false. So today's behavior is preserved by accident. But this is now a latent CSRF-bypass surface: any future auth/oauth endpoint named `.list`, `.info`, `.search`, `.config`, `.documents`, or `.export` would silently skip CSRF protection. The plan's risk-#1 reasoning ("Since the middleware only runs on API routes, the guard is redundant") was wrong, and the implementation inherited the error.

**Why it matters:** Latent security regression. CSRF protection is a defense-in-depth control; expanding the read-only-scope shortcut to routes that previously had no shortcut is a behavior change that should be evaluated against the auth/oauth surface, not assumed away.

**Suggested fix:** Either (a) restore the API-route check using a sub-path-aware predicate — e.g., capture the mount prefix at registration time and compare against `ctx.path` of the inner mount, or use a flag passed to `verifyCSRFToken({ apiOnly: true })` from `api/index.ts` only — or (b) explicitly justify in `completed.md` why expanding the shortcut to auth/oauth is acceptable, and ideally add an assertion test that confirms current auth/oauth route paths don't hit the read-scope shortcut. Approach (a) is closer to the spec's literal scope; approach (b) preserves current implementation but documents the risk.

#### 🟡 #2 — Misleading explanation of `koa-mount` semantics in csrf.ts

**File / lines:** `server/middlewares/csrf.ts:57-61` (the new comment).

**What is wrong:** The comment claims *"koa-mount strips `/api` from ctx.path **and rewrites the host segment of ctx.originalUrl**"*. The bolded claim is false. `koa-mount` rewrites `ctx.path` and `ctx.url` for the lifetime of the request and restores them afterward; **it does not touch `ctx.originalUrl`**. (Spec technical notes line 41: *"It does not touch ctx.originalUrl or ctx.url"* — wait, the spec also incorrectly mentions ctx.url; what the koa-mount source actually does is rewrite ctx.path and ctx.url and restore them, while ctx.originalUrl is captured by Koa once and never touched by koa-mount.)

The **actual** reason the original `ctx.originalUrl.startsWith("/api/")` guard breaks under sub-path deployment is: `ctx.originalUrl` is the unrewritten request line, which under `URL=http://host/kms` looks like `/kms/api/foo`. `startsWith("/api/")` therefore returns false even on legitimate API requests, and the read-scope shortcut would never apply.

**Why it matters:** Comments encode the maintainer's mental model. A reader debugging CSRF-related issues in slices 02–04 will be misled about what koa-mount does. Cheap to fix.

**Suggested fix:** Replace the second sentence of the comment with: *"…and ctx.originalUrl includes the BASE_PATH prefix (e.g., `/kms/api/...`), so the original `startsWith('/api/')` guard would mis-detect API requests under sub-path deployment."*

#### 🟡 #3 — `onerror` placement diverges from plan §8.3 without an entry in completed.md

**File / lines:** `server/index.ts:104-106`, `server/test/support.ts:19`.

**What is wrong:** Plan §8 risk #3 stated the explicit decision: *"keep onerror on the inner only, matching current behavior for /api etc. Open to user override."* The implementation does the opposite — `onerror(outerApp)` on both production and test. The implementation's inline comment justifies this correctly (*"The custom ctx.onerror is read off the prototype chain rooted at outerApp.context (where the request ctx is created), so install it on the outer app"*), and that justification is technically correct: Koa's request ctx is created from `outerApp.context`, so a custom `ctx.onerror` must be installed there to take effect.

So the implementation is **right** and the plan was **wrong**. But the plan's instruction in §9 ("Acknowledge the trade-off (see §8): … flag the choice in the slice's completed.md") was specifically about the CSRF guard; nothing similar exists for onerror, and there's no completed.md yet to read. The divergence is silent.

**Why it matters:** The next reviewer / future debugger will read the plan, see "decision: keep onerror on inner only", look at the code, and be confused. The `/test-commit` step writes completed.md — that step needs to capture this deviation explicitly.

**Suggested fix:** No code change required. When `/test-commit` produces `completed.md`, include a "Plan deviations" section noting that `onerror` is installed on the outer app (correctly) rather than the inner, with the rationale already in the inline comment. Same applies to the CSRF guard removal (Finding 🟡 #1).

#### 🟡 #4 — `env.public.BASE_PATH` is captured once and never updated

**File / lines:** `server/utils/decorators/Public.ts:27` (`if (isUndefined(this.publicEnv[k])) { this.publicEnv[k] = env[k]; }`); test impact in `server/test/support.ts:48` and `server/env.test.ts:55-58`.

**What is wrong:** `PublicEnvironmentRegister.registerEnv` caches each `@Public` value at construction time and skips subsequent assignments via the `isUndefined` guard. The `BASE_PATH` getter is invoked exactly once (in the `process.nextTick` after the first `Environment` construction). Two consequences:

1. `env.test.ts` only asserts `expect(env.public).toHaveProperty("BASE_PATH")`. Because the property is locked in at first construction, this passes regardless of subsequent `env.URL` mutations — but it doesn't actually verify that the *value* propagates. A test that mutates `env.URL` and then reads `env.public.BASE_PATH` would see the stale cached value, masking real bugs in slices 02–03.
2. `getSubpathTestServer("/kms")` sets `env.URL = "https://app.outline.dev/kms"` at module load, but `server/test/setup.ts:45` runs `beforeEach(() => { env.URL = sharedEnv.URL = "https://app.outline.dev"; })` for **every** test. So during request execution in subpath.test.ts, `env.URL` is path-less and `env.BASE_PATH` (the getter) returns `""`. The mount path captured at app construction is still `/kms` (so routing works), but any handler that reads `env.URL` or `env.BASE_PATH` at request time would see the path-less value.

For this slice, no handler reads either at request time, so the tests pass. But the simulation of "production under `/kms`" is incomplete in a way that will bite slice 02 (assets) and slice 03 (client) tests if they assume `env.URL` reflects the sub-path during requests.

**Why it matters:** False sense of security. The subpath test suite advertises coverage of "URL with /kms prefix" but actually only covers the mount-path half of the configuration. Anything in slice 02–04 that depends on `env.URL`-derived URLs at request time will need its own URL fix-up at the support layer.

**Suggested fix:** In `getSubpathTestServer`, register a `beforeEach` (in addition to the module-load assignment) that re-applies the path-bearing URL — overriding `setup.ts`'s reset for tests inside that describe block. And add a value-asserting test in `env.test.ts` that mutates `env.URL` and checks both `env.BASE_PATH` (getter) **and** the registration semantics of `env.public.BASE_PATH` so the caching behavior is documented as intended. Neither change is strictly required for this slice's acceptance criteria, but both prevent silent failures downstream.

#### 🟡 #5 — Test infrastructure cannot be exercised in this repo state

**File / lines:** `package.json` test scripts reference `.jestconfig.json`; the file exists in **no commit** (`git ls-tree -r HEAD --name-only | grep -i jest` is empty) and is not in the working tree.

**What is wrong:** Running `yarn test --testPathPatterns "env.test|subpath.test"` fails immediately with:
```
Error: Can't find a root directory while resolving a config file path.
Provided path to resolve: .jestconfig.json
```
The new tests in `server/env.test.ts` and `server/routes/subpath.test.ts` therefore cannot be verified as actually passing. Plan §6 phases A and D explicitly call for `yarn test server/env.test.ts` / `yarn test server/routes/subpath.test.ts` and a full-suite regression run; none of these can be executed.

**Why it matters:** Pre-existing repo-state issue (not introduced by this slice), but it nullifies a major verification step the plan depended on. Spec acceptance criterion #7 (full pre-existing suite passes) is unverifiable; the new tests' green status is also unverifiable.

**Suggested fix:** Outside this slice's scope — restore `.jestconfig.json` (likely missing from the IMC fork) before merging. As a stop-gap for this slice, perform the manual cURL walkthrough in plan §7 against a path-bearing local boot to prove acceptance criteria 3, 4, 5, 6 by observation. Note the limitation in completed.md.

### ⚪ Nits

#### ⚪ #1 — Hardcoded test domain

`server/test/support.ts:48` uses `https://app.outline.dev${basePath}`. The neighboring `setSelfHosted` (line 67-69) uses `faker.internet.domainName()`. Cosmetic; consistency would be nicer.

#### ⚪ #2 — `env.test.ts` could be tighter

The getter is asserted via the value, but the public-env hookup is asserted only by property existence (`env.test.ts:55-58`). Adding `expect(env.public.BASE_PATH).toBe("")` (or whichever value `setup.ts` causes) would lock in the caching behavior explicitly.

#### ⚪ #3 — Inner-app middleware comments could mention spec criterion #4

`server/index.ts:79`, `:90`, `:96` say things like *"health probes intentionally bypass"*. Worth saying once that this satisfies spec acceptance criterion #4 (health probes don't depend on prefix), so future readers don't second-guess the asymmetry.

#### ⚪ #4 — `getSubpathTestServer` uses `afterAll(disconnect)` but does not close `sequelize`

`getTestServer` (line 28-30) calls `sequelize.close()` in disconnect; `getSubpathTestServer` (line 53-57) does not. If a single test file uses both helpers (which `subpath.test.ts` does), `afterAll` ordering means the `getTestServer` block closes the connection first, then the `getSubpathTestServer` block tries to use it — but actually here the subpath block runs in a separate `describe` so this is fine. Marginal — flag only because the asymmetry is easy to miss.

## 4. Summary

This slice is **substantively correct** and ready for `/test-commit` with caveats. TypeScript compiles, lint is clean, the mount/health/better-auth/CSRF wiring matches the spec's behavioral requirements, and the new tests enumerate every acceptance criterion. **No blockers.**

However, three items must be addressed in `completed.md` (which is the test-commit step's responsibility, not implementation's):

1. The **CSRF guard removal** (Finding 🟡 #1) was based on a false premise in the plan — `verifyCSRFToken` is attached to `/auth` and `/oauth` routes too. Today's behavior is preserved, but the latent risk needs explicit acknowledgment, and ideally a follow-up ticket to either restrict the shortcut to `/api` only or add an assertion test against the auth/oauth surface.
2. The **`onerror` placement divergence** from plan §8.3 (Finding 🟡 #3) — implementation's call is correct, but the plan's stated decision was opposite. Document the swap.
3. The **inability to run the test suite** (Finding 🟡 #5) is a repo-state issue that pre-dates this slice but blocks automated verification. Compensate with a manual cURL walkthrough per plan §7 and note the gap.

The misleading koa-mount comment (Finding 🟡 #2) is a one-line fix that could be done as part of `/test-commit` while the implementer is in-context. The four nits are optional polish.

After completed.md addresses (1)–(3) and the optional comment fix in (#2), this slice is good to merge.

---

> Review written to `docs/implementation/slices/01-subpath-foundation/review.md`. Address any 🔴 blockers, then run `/test-commit 01-subpath-foundation` in a new session.
