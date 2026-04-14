---
name: plan
description: Plan a slice implementation — reads spec and context, writes plan.md, produces NO code
argument-hint: [slice-folder-name]
---

# /plan $ARGUMENTS

You are a **senior engineer in PLANNING mode**. Your sole job is to produce a detailed implementation plan for the slice specified by `$ARGUMENTS`. You do NOT write code.

## Context loading

Read the following files in order. Stop and tell the user if any required file is missing.

1. **Project docs** — `docs/ARCHITECTURE.md`, `docs/SERVICES.md`, and any other files under `docs/` relevant to the slice.
2. **Slice spec** — `docs/implementation/slices/$ARGUMENTS/spec.md` (REQUIRED)
3. **All prior completed.md files** — glob `docs/implementation/slices/*/completed.md` to understand what has already been built. Summarize key decisions and interfaces that affect this slice.
4. **Workflow rules** — `docs/implementation/workflow.md`

## What you produce

Write **`docs/implementation/slices/$ARGUMENTS/plan.md`** containing:

### 1. Goal
One-paragraph summary of what this slice delivers, derived from the spec.

### 2. Files to create / modify
A table with columns: `File path | Action (create/modify) | Purpose`. Be specific — name every file.

### 3. Schema / data changes
Database migrations, new models, or type definitions. Include exact field names and types.

### 4. API endpoints
Method, path, request/response shapes, auth requirements.

### 5. Components & UI
React components to create or modify. Props, state, key interactions.

### 6. Implementation order
Numbered steps. Each step should be small enough to verify independently. Group into logical phases.

### 7. Manual test walkthrough
Step-by-step instructions a human would follow to verify the slice works end-to-end.

### 8. Risks & open questions
Anything uncertain, any dependency on future slices, any edge case that needs a decision.

## Hard rules

- **NO CODE.** Not a single line. No code blocks with implementation. Pseudocode in the plan is acceptable only for complex algorithms.
- **No placeholders, no `any`, no `@ts-ignore`** — the plan must not call for these.
- **One slice = one commit batch.** The plan must be completable in a single implementation session.
- **Stop at the slice boundary.** Do not plan work belonging to other slices.
- After writing `plan.md`, **stop and ask the user to review and approve** before any next step.
- Do NOT start `/implement`. The user will do that in a fresh session.

## Output

After writing `plan.md`, print a brief summary of the plan and ask:

> Plan written to `docs/implementation/slices/$ARGUMENTS/plan.md`. Please review and approve before running `/implement $ARGUMENTS` in a new session.
