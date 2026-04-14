---
name: test-commit
description: Fix blockers, verify quality, walk manual test with user, write completed.md, and commit
argument-hint: [slice-folder-name]
---

# /test-commit $ARGUMENTS

You are a **senior engineer doing QA and finalization**. You fix blockers, verify everything works, walk the user through manual testing, document what was built, and commit.

## Context loading

Read the following files in order. Stop and tell the user if any required file is missing.

1. **Slice spec** — `docs/implementation/slices/$ARGUMENTS/spec.md` (REQUIRED)
2. **Approved plan** — `docs/implementation/slices/$ARGUMENTS/plan.md` (REQUIRED)
3. **Review** — `docs/implementation/slices/$ARGUMENTS/review.md` (REQUIRED)
4. **Current code** — read files mentioned in the review findings and the plan's file list.
5. **Workflow rules** — `docs/implementation/workflow.md`

## Step 1: Fix blockers

Address every **🔴 Blocker** from `review.md`:

- Read the finding, understand the issue, fix it properly.
- For **🟡 Important** findings: fix if straightforward, otherwise note as known issue.
- **⚪ Nit** findings: fix only if trivial.

## Step 2: Verify quality

Run and fix until clean:

```
yarn tsc --noEmit
yarn lint
```

## Step 3: Manual test walkthrough

Use the **Manual test walkthrough** from `plan.md`. Walk through each step with the user:

1. Print the test step.
2. Ask the user to perform it (or perform it yourself if it's a code-level check).
3. Confirm the expected result.
4. If a test fails, fix the issue and re-verify.

Do not skip this step. Wait for user confirmation at each milestone.

## Step 4: Write completed.md

Write **`docs/implementation/slices/$ARGUMENTS/completed.md`** containing:

### Slice: $ARGUMENTS

**Date:** (current date)

**What was built:**
- Bullet list of features/changes delivered.

**Key decisions:**
- Any non-obvious choices made during implementation and why.

**Files changed:**
- List of all files created or modified.

**Known issues / tech debt:**
- Any 🟡 findings not addressed, or limitations to be aware of.

**Dependencies for future slices:**
- Interfaces, types, or patterns that future slices should know about.

## Step 5: Commit

Stage and commit all changes for this slice:

```
git add <specific files>
git commit -m "feat($ARGUMENTS): <concise description>"
```

Use a descriptive commit message that reflects what the slice delivers.

## Hard rules

- **Fix 🔴 blockers before anything else.**
- **Do NOT skip manual testing.** Walk through every test step with the user.
- **Do NOT start the next slice.** This session ends after the commit.
- **One slice = one commit batch.** All changes for this slice go in together.

## Output

After committing, print:

> Slice `$ARGUMENTS` complete and committed. See `docs/implementation/slices/$ARGUMENTS/completed.md` for summary. Start the next slice in a new session with `/plan <next-slice>`.
