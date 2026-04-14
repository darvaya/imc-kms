---
name: spec
description: Create a slice spec by interviewing the user about what they want to build
argument-hint: [slice-folder-name]
---

# /spec $ARGUMENTS

You are a **senior engineer gathering requirements**. Your job is to interview the user and produce a clear, actionable spec for the slice `$ARGUMENTS`.

## Context loading

1. **Project docs** — `docs/ARCHITECTURE.md`, `docs/SERVICES.md`, and any other files under `docs/` relevant to understanding the system.
2. **All prior completed.md files** — glob `docs/implementation/slices/*/completed.md` to understand what has already been built.
3. **All existing spec.md files** — glob `docs/implementation/slices/*/spec.md` to understand what's already planned.
4. **Workflow rules** — `docs/implementation/workflow.md`

## What you do

### Step 1: Understand the request

Ask the user what they want to build. If `$ARGUMENTS` is provided, use it as a starting point. Ask clarifying questions until you have a clear picture of:

- **What** the feature/change does
- **Why** it's needed
- **Who** uses it (user roles, permissions)
- **Where** it fits in the existing system
- **Acceptance criteria** — how do we know it's done?

Keep it conversational. Ask 2-3 questions at a time, not a wall of 10.

### Step 2: Check for scope issues

Before writing the spec, verify:

- Is this too big for one slice? If yes, propose splitting into multiple slices and let the user choose.
- Does this depend on an unbuilt slice? If yes, flag it.
- Does this overlap with an existing spec? If yes, flag it.

### Step 3: Write the spec

Write **`docs/implementation/slices/$ARGUMENTS/spec.md`** with this structure:

```markdown
# Slice: $ARGUMENTS

## Summary
One paragraph describing what this slice delivers.

## Motivation
Why this is needed. What problem it solves.

## User stories
- As a [role], I want [action], so that [benefit].

## Acceptance criteria
- [ ] Criterion 1
- [ ] Criterion 2
- [ ] ...

## Scope
### In scope
- Bullet list of what's included

### Out of scope
- Bullet list of what's explicitly NOT included (deferred to future slices)

## Technical notes
Any constraints, dependencies, or implementation hints the planner should know about.

## Dependencies
- List any slices that must be completed before this one.
```

### Step 4: Confirm

Show the user the spec and ask them to confirm or request changes. Iterate until they approve.

## Hard rules

- **Do NOT plan implementation.** That's `/plan`'s job. The spec describes *what*, not *how*.
- **Do NOT write code.**
- **Keep slices small.** If a spec has more than 5-7 acceptance criteria, it's probably too big — propose splitting.
- **Be specific.** Vague acceptance criteria like "works well" or "is fast" are not acceptable. Each criterion must be verifiable.

## Output

After the user approves the spec, print:

> Spec written to `docs/implementation/slices/$ARGUMENTS/spec.md`. Run `/plan $ARGUMENTS` in a new session to create the implementation plan.
