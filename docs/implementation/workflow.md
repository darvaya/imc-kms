# Why 4 Separate Sessions?

This workflow splits implementation into 4 distinct phases, each in a fresh Claude Code session (`/clear` between phases). This is not ceremony — it solves real problems.

## Problem 1: Context exhaustion

LLM context windows are finite. A complex slice can easily consume the full context during implementation alone. If you also plan, review, and fix in the same session, the model loses track of early decisions and starts contradicting itself.

**Solution:** Each phase gets a fresh context window focused on one job.

## Problem 2: Confirmation bias

When the same session plans and implements, the implementation inherits the planner's blind spots. When the same session implements and reviews, the reviewer already "knows" the code works because it wrote it.

**Solution:** The reviewer reads the diff and spec — not the implementer's reasoning. Fresh context means fresh eyes.

## Problem 3: No checkpoint / rollback

Without structured phases, there's no natural point to stop and verify. Bugs compound. A wrong assumption in minute 5 becomes 200 lines of code by minute 30.

**Solution:** Each phase produces a checkpoint artifact (`plan.md`, code on disk, `review.md`, `completed.md`). You can catch problems early and course-correct cheaply.

## Problem 4: Scope creep

Without boundaries, it's tempting to "just quickly add" the next feature. This leads to massive, unreviewable changesets.

**Solution:** Each slice has a spec. The plan follows the spec. The implementation follows the plan. The review checks against both. One slice = one commit batch.

## The 4 phases

| Phase | Command | Persona | Input | Output | Hard rule |
|-------|---------|---------|-------|--------|-----------|
| Plan | `/plan <slice>` | Senior engineer (planning only) | Spec, context docs, prior completed.md | `plan.md` | No code |
| Implement | `/implement <slice>` | Senior engineer (following plan) | Spec, plan, context docs | Code on disk | No commit |
| Review | `/review <slice>` | Hostile reviewer | Spec, plan, git diff | `review.md` | No code changes |
| Test & Commit | `/test-commit <slice>` | QA engineer | Spec, plan, review, code | `completed.md` + commit | No next slice |

## Key principles

1. **Fresh session between phases** — `/clear` resets context and prevents bias carryover.
2. **$ARGUMENTS is the slice folder name** — e.g., `slice-00-foundation`.
3. **No placeholder data, no half-built features, no `any`, no `@ts-ignore`** — quality is non-negotiable.
4. **One slice = one commit batch** — atomic, reviewable, revertable.
5. **Stop at the slice boundary** — discipline prevents scope creep.
