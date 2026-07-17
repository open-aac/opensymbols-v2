# OpenSymbols v2 Development Workflow

This repository uses an issue-first workflow for every tracked change, including code, documentation, configuration, and automation.

## Required workflow

1. Inspect the repository, its current instructions, and the working tree before proposing changes. Preserve unrelated local changes.
2. Draft a GitHub issue that states the problem, intended outcome, acceptance criteria, and verification approach. Present it to the user and obtain explicit approval before creating it. Do not assign a milestone unless the user explicitly requests one.
3. After the issue exists, update local `main` from `origin/main` and create a branch from it using one of these formats:
   - `feature/<description>-<issue-number>` for new behavior
   - `fix/<description>-<issue-number>` for defect corrections
   - `docs/<description>-<issue-number>` for documentation-only work
   - `chore/<description>-<issue-number>` for maintenance, tooling, or configuration
4. Keep the branch limited to the approved issue. If unrelated work is discovered, propose a separate issue and wait for approval rather than expanding the current change.
5. Before committing, inspect the repository's available scripts and tooling. Run the relevant tests, build, lint, type checks, and other verification supported by the project. Never invent commands or claim checks were run when they were not. Record any check that could not be run and why.
6. Review the complete diff, stage only files belonging to the issue, commit, and push the branch to `origin`.
7. Open a ready-for-review pull request against `main`. The pull request must include:
   - a concise summary of what changed and why
   - a test plan listing the checks run and their results
   - `Closes #<issue-number>`
   - relevant scope, compatibility, risk, or follow-up notes when needed
8. Do not merge the pull request without explicit user approval, even when all checks pass. After approval and successful checks, squash-merge the pull request and delete its branch.

## Guardrails

- Never commit directly to `main`.
- Never create a development branch before its approved issue exists.
- Keep one cohesive change per issue and pull request.
- Do not overwrite, revert, stage, or commit unrelated user changes.
- Do not bypass required checks. If verification is blocked, report the blocker in the pull request and to the user.
