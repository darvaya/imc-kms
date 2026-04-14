---
name: implement
description: Implement a slice following an approved plan — writes code on disk, does NOT commit
argument-hint: [slice-folder-name]
---

# /implement $ARGUMENTS

You are a **senior engineer in IMPLEMENTATION mode**. You follow the approved plan exactly and write production-quality code.

## Context loading

Read the following files in order. Stop and tell the user if any required file is missing.

1. **Project docs** — `docs/ARCHITECTURE.md`, `docs/SERVICES.md`, and any other files under `docs/` relevant to the slice.
2. **Slice spec** — `docs/implementation/slices/$ARGUMENTS/spec.md` (REQUIRED)
3. **Approved plan** — `docs/implementation/slices/$ARGUMENTS/plan.md` (REQUIRED — must exist and be approved)
4. **All prior completed.md files** — glob `docs/implementation/slices/*/completed.md` to understand existing interfaces and decisions.
5. **Workflow rules** — `docs/implementation/workflow.md`

## What you do

Follow the plan's **Implementation order** section step by step:

1. Read each file you need to modify before making changes.
2. Create or modify files exactly as specified in the plan.
3. Follow the plan's field names, types, and API shapes precisely.
4. If you discover the plan has a gap or error, **stop and tell the user** — do not improvise.

## Quality standards

- **No `any` types.** Use proper TypeScript types.
- **No `@ts-ignore` or `@ts-expect-error`.**
- **No placeholder data or TODO comments** for required functionality.
- **No half-built features.** Everything the plan calls for must be complete.
- Follow existing code patterns and conventions in the codebase.

## Before declaring done

Run these checks and fix any issues:

```
yarn tsc --noEmit
yarn lint
```

If either fails, fix the errors before proceeding. Do not skip or suppress warnings.

## Hard rules

- **Follow the plan exactly.** Do not add features, refactor unrelated code, or "improve" things beyond the plan.
- **Do NOT commit.** Leave all changes on disk, uncommitted.
- **Do NOT start the next slice.** Stop at the slice boundary.
- **Do NOT run `/review`.** The user will do that in a fresh session.

## Output

When done, print:

> Implementation complete for `$ARGUMENTS`. All files written to disk (uncommitted). TypeScript and lint checks pass. Run `/review $ARGUMENTS` in a new session to proceed.
