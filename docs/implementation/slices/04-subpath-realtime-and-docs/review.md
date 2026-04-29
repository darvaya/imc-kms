# Review: 04-subpath-realtime-and-docs

Hostile review against `spec.md` and `plan.md`. Source files read directly: `server/services/websockets.ts`, `server/services/collaboration.ts`, `app/components/WebsocketProvider.tsx`, `.env.example`, `docs/apache-vhost.conf`, `server/env.ts`, `server/test/setup.ts`, `.jestconfig.json`, plus the three new test files. `docs/implementation/workflow.md` does not exist (plan acknowledged).

## 1. Hard-rule audit

| Rule | Status | Notes |
|------|--------|-------|
| No `any` types | ✅ Pass | The remaining `as (...args: any[]) => void` on `server/services/websockets.ts:58` is pre-existing (outside the diff). |
| No `@ts-ignore` / `@ts-expect-error` | ✅ Pass | The lone `@ts-expect-error` on `websockets.ts:123` is pre-existing. |
| No placeholder data or TODO for required functionality | ✅ Pass | No new TODOs added. |
| No half-built features | ⚠️ Mixed | Production code is complete. The three new test files are *written but do not run* — see Findings §3.1, §3.2, §3.3. |
| Plan followed exactly (no extra features, no missing features) | ⚠️ Mixed | Production-code edits match plan §2 exactly. Tests deviate in correctness, not in scope. |
| TypeScript compiles (`yarn tsc --noEmit`) | ✅ Pass | Verified — exit 0, zero output. |
| Lint passes (`yarn lint`) | ✅ Pass | Verified — exit 0, 328 warnings (all pre-existing), 0 errors. The single lint warning that touches a slice file (`websockets.ts:58`) is on a pre-existing line. |
| Changes stay within slice boundary | ✅ Pass | The five files in plan §2 are the only files modified; the three test files are the only files added. No collateral edits. |

## 2. Definition of Done checklist (from spec acceptance criteria)

- ✅ **Socket.IO server `path`** derived from `env.BASE_PATH` — `server/services/websockets.ts:33` reads `\`${env.BASE_PATH}/realtime\``. Origin check on line 70 unchanged (still `env.URL.startsWith(req.headers.origin)`), startsWith semantics with a path-bearing URL verified to behave correctly.
- ✅ **Hocuspocus server `path`** derived from `env.BASE_PATH` — `server/services/collaboration.ts:28`. The `req.url?.startsWith(path)` check on line 70 reads from the same constant. The document-ID extraction on lines 72–76 uses `path` as the strip prefix. The cross-service fallback on line 113 was updated to `req.url?.startsWith(\`${env.BASE_PATH}/realtime\`)` and a 2-line "must mirror" comment was added on lines 110–111.
- ⚠️ **Client Socket.IO `path` uses `env.BASE_PATH`** — `app/components/WebsocketProvider.tsx:91` calls a new `getRealtimePath()` helper (lines 54–56) that returns `\`${env.BASE_PATH ?? ""}/realtime\``. ✅ for the production change. **The promised "test or assertion"** for the `MultiplayerEditor` / `COLLABORATION_URL` round-trip is written but does not currently pass — see Findings §3.3.
- ❓ **End-to-end real-time check** under sub-path layout — not verifiable from the diff. Manual smoke per spec walkthrough §11 is the only evidence; no smoke result is recorded yet (will be exercised in `/test-commit`).
- ✅ **`docs/apache-vhost.conf`** primary shared-subdomain section — `<VirtualHost *:80>` and `<VirtualHost *:443>` for `appstpcid.imcpelilog.co.id`, `ProxyPreserveHost On`, WebSocket `RewriteRule /kms/(.*) ws://127.0.0.1:3100/kms/$1 [P,L]` scoped to the prefix, `ProxyPass /kms http://127.0.0.1:3100/kms` and `ProxyPassReverse` with no trailing slashes, `LimitRequestBody`, `ProxyTimeout`. The dedicated-subdomain example is preserved as a fully-commented-out alternative section at the end of the file. Multi-tenant safety comment correctly emphasizes the `/kms/` scoping requirement.
- ✅ **`.env.example`** — line 12–15 carries the canonical sub-path example as a comment immediately above `URL=`. Lines 73–77 add the Microsoft Entra redirect-URI requirement under the existing OAuth block. The deployment-notes block has been rewritten: the "no subpath support" claim is removed, replaced with bullets covering both layouts, the build/runtime parity rule, the Azure redirect URI prerequisite, and a pointer back to `docs/apache-vhost.conf`.

## 3. Findings

### 🔴 Blocker 3.1 — `server/services/websockets.test.ts` does not load (jest mock-factory hoisting)

`server/services/websockets.test.ts:7-29`

`jest.mock("socket.io", () => { ... server.on("upgrade", ioHandleUpgrade); ... ioServerCtorArgs.push(...); ... })` references the module-level `ioHandleUpgrade` and `ioServerCtorArgs` constants from inside the factory. Jest hoists `jest.mock(...)` calls to the top of the file, above the variable declarations, so those references throw `ReferenceError: Invalid variable access` at compile time. The test suite **fails to run** — 0 tests executed, 1 suite failed.

Verified by running `yarn test server/services/websockets.test.ts`. Jest's diagnostic explicitly says "variable names prefixed with `mock` (case insensitive) are permitted."

**Why it matters:** plan §2 explicitly required this test file. Plan §6 step 5 calls it out as a primary deliverable for Phase C. The current state means there is no automated coverage for the slice's central behavioural change — that the realtime upgrade-handler path is correctly prefixed with `BASE_PATH`. Spec acceptance criterion #1 is verifiable only by reading source.

**Suggested fix:** rename `ioHandleUpgrade` → `mockIoHandleUpgrade` and `ioServerCtorArgs` → `mockIoServerCtorArgs` (or any `mock*`-prefixed names), and update all internal references. No semantic change.

### 🔴 Blocker 3.2 — `server/services/collaboration.test.ts` does not load (same root cause)

`server/services/collaboration.test.ts:7,12`

`jest.mock("ws", () => { class MockServer { handleUpgrade = handleUpgradeMock; } ... })` references module-level `handleUpgradeMock`. Suffix-`Mock` is **not** treated the same as prefix-`mock` by jest's allowlist — the rule is "prefixed with `mock` (case insensitive)", so `mockHandleUpgrade` works and `handleUpgradeMock` does not. Suite fails to load with the same `ReferenceError`.

Verified by running `yarn test server/services/collaboration.test.ts`.

**Why it matters:** same severity as §3.1. Spec acceptance criterion #2 (Hocuspocus path-prefix) and #3 (COLLABORATION_URL round-trip) lose their automated evidence.

**Suggested fix:** rename `handleUpgradeMock` → `mockHandleUpgrade` at every reference.

### 🔴 Blocker 3.3 — `env.COLLABORATION_URL` round-trip assertion will fail even after §3.2 is fixed

`server/services/collaboration.test.ts:199-208` and the trailing-slash describe block at lines 211-228

`env.COLLABORATION_URL` is declared in `server/env.ts:252-254` as a class **field** (one-shot initializer), not a getter:

```
public COLLABORATION_URL = (environment.COLLABORATION_URL || this.URL)
  .replace(/\/$/, "")
  .replace(/^http/, "ws");
```

That field is computed exactly once when `new Environment()` runs at module-import time. After construction, mutating `env.URL = "https://app.outline.dev/kms"` does **not** recompute `env.COLLABORATION_URL` — confirmed empirically by running `node -e` against the compiled module. With `URL=http://localhost:3000` from `.env`, `env.COLLABORATION_URL` equals `ws://localhost:3000` for the entire test run, regardless of what the test sets `env.URL` to.

Therefore:
- `expect(env.COLLABORATION_URL).toBe("wss://app.outline.dev/kms")` (line 202) will fail.
- The trailing-slash test at lines 220-223 will likewise fail (it asserts `wss://app.outline.dev/kms` but the field is frozen at `ws://localhost:3000`).

**Why it matters:** spec acceptance criterion #3 explicitly requires "a test or assertion" that the `MultiplayerEditor` URL round-trips correctly under the sub-path layout. This test is the in-repo evidence that no client-side change is needed for Hocuspocus — and it will not pass.

**Suggested fix (one of):**
1. In each test, after mutating `env.URL`, also mutate `env.COLLABORATION_URL` directly to the expected derived value — but that defeats the assertion.
2. Move the round-trip assertion into a separate test that constructs a fresh `Environment` instance after setting `process.env.URL`. Requires importing the `Environment` class (not the singleton).
3. Convert `COLLABORATION_URL` in `server/env.ts` to a `get` accessor the way `BASE_PATH` is. This is the cleanest fix but expands the slice diff. The plan's risk #4 acknowledges the snapshot issue at a different level (`@Public` cache), but did not flag this concrete instance — choose this fix only if the implementer is willing to extend scope.
4. Replace the assertion with one that verifies the *derivation logic* directly: e.g., assert `"https://app.outline.dev/kms".replace(/\/$/, "").replace(/^http/, "ws") === "wss://app.outline.dev/kms"`. Lower fidelity but exercises only what the slice is responsible for.

### 🟡 Important 3.4 — `app/components/WebsocketProvider.test.tsx` does not load (`reflect-metadata` polyfill missing)

`app/components/WebsocketProvider.test.tsx:2`

The test imports `getRealtimePath` from `./WebsocketProvider`, but that import side-effect-loads the entire file — including the `@observer` decorator on the `WebsocketProvider` class (line 60). The `app` jest project lacks a `reflect-metadata` polyfill in `setupFilesAfterEnv`, so the decorator throws `TypeError: Reflect.metadata is not a function`. Suite fails to load.

This matches the pre-existing test-infra gap that slice 03's `completed.md` flagged. The plan's risk #2 explicitly anticipated this fallback case ("if test infrastructure for the `app/` jest project is still broken… document as written-but-unverified… do NOT block the slice on the pre-existing test-infra gap"). I am downgrading this to 🟡 because of that prior agreement, but the architectural choice that produced the import side effect is fixable in this slice without touching the `app/` jest setup:

**Suggested fix (preferred):** extract `getRealtimePath` into its own module (e.g., `app/components/getRealtimePath.ts`), have `WebsocketProvider.tsx` import from there, and have the test import from there too. The test will then never load `WebsocketProvider.tsx`, sidestepping the decorator issue entirely. This is consistent with plan §8 risk #2's intent (a "5-line helper, a 10-line test, no HoC shenanigans") — it just takes one more file.

**Suggested fix (lighter):** add `import "reflect-metadata";` at the top of the test file. Untested whether the `app` project has the dep available in jsdom; would need verification.

If neither is applied, the implementation is acceptable per the plan's pre-agreed fallback, but `completed.md` must explicitly call out the test as written-but-unverified before merge.

### 🟡 Important 3.5 — Cross-service `/realtime` fallback duplicates the realtime path string instead of importing it

`server/services/collaboration.ts:113`

The fallback `req.url?.startsWith(\`${env.BASE_PATH}/realtime\`)` re-derives the same string that `server/services/websockets.ts:33` already constructs. The plan's risk #1 acknowledged this with explicit reasoning: option (a) was a comment, option (b) was a shared constant; the plan picked (a) for "minimal diff." The implementer correctly added the comment on lines 110-111, satisfying the plan's mitigation.

This is **not** a blocker — the plan made the call, and the comment is in place. I'm flagging it because the comment is the kind of warning that's easy to overlook in the future, and a `server/services/realtimePath.ts` exporting `getRealtimePath = () => \`${env.BASE_PATH}/realtime\`` would cost ~6 lines and eliminate the failure mode. Worth doing as a follow-up.

### ⚪ Nit 3.6 — Helper signature `getRealtimePath()` could take `BASE_PATH` as an argument

`app/components/WebsocketProvider.tsx:54-56`

The helper reads `env.BASE_PATH ?? ""` directly. Passing it as an argument would let unit tests cover the helper without touching `env`, and matches the "5-line pure helper" shape described in plan §8 risk #2. Optional polish; harmless as-is.

### ⚪ Nit 3.7 — `.env.example` line 13 places the sub-path example *above* the active `URL=` line

`.env.example:12-16`

Plan §2 row 5 said "trailing comment" (i.e., after the `URL=` line). The implementation puts the canonical example as a leading comment block. Functionally identical and arguably more readable; the plan's wording was non-binding. Mention only because a strict reading of the plan would show drift.

### ⚪ Nit 3.8 — Origin restoration in test `afterEach` may leak when describes are interleaved

`server/services/collaboration.test.ts:151-152, 162-164`, `server/services/websockets.test.ts:140-141, 152-154`

The sub-path describe captures `originalEnvUrl = env.URL` before any test runs (during describe-block evaluation). Because `server/test/setup.ts:46-48` sets `env.URL = "https://app.outline.dev"` in the global `beforeEach`, the captured "original" is whatever value was present at *describe declaration time*, not at test entry — typically the value from `.env`. If two test files run in parallel and share the singleton, restoration could be wrong. In practice the global `beforeEach` runs before every test and overwrites whatever the previous test left, so the leak is masked. Still, the canonical pattern is `let originalEnvUrl: string;` declared in the `beforeEach`. Optional cleanup.

## 4. Summary

The production-code surface is clean: the five files in the plan are edited exactly as specified, TypeScript compiles, lint passes, the diff stays within the slice boundary, and the `apache-vhost.conf` and `.env.example` rewrites match the spec's structural and content requirements (including the multi-tenant `/kms/`-scoped WebSocket rewrite, no-trailing-slash `ProxyPass`, and the Microsoft Entra deploy-prerequisite call-out). Were it not for the tests, this slice would be ready.

But the tests are the slice's automated proof of correctness, and **none of the three test files currently run**: two server tests fail at jest module-factory variable hoisting (a 1-line rename per file), and the client test fails on the pre-existing `reflect-metadata` polyfill gap (anticipated by the plan, but cleanly fixable via a tiny refactor to extract the helper into its own file). On top of that, even after the rename, the `COLLABORATION_URL` round-trip assertion that backs spec acceptance criterion #3 will not pass, because `env.COLLABORATION_URL` is a one-shot class-field initializer rather than a getter — the test design needs a different shape.

**Verdict: not ready for `/test-commit`.** Requires rework on §3.1, §3.2, and §3.3 before the slice can be considered to have working automated coverage. §3.4 is downgrade-acceptable per the plan's pre-agreed fallback, but the cleanest path is the helper-extraction in the suggested fix. After the three blockers are addressed, the manual smoke walkthrough in spec §17–18 still needs to be executed in a fresh session.
