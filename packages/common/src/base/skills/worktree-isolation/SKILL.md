---
name: worktree-isolation
description: |
  Create an isolated Git worktree after isolation has been selected and the committed base is known, before file-modifying work begins. Use it when a task must modify another branch, commit, or PR revision, or when risky work or unrelated local changes make the current checkout unsafe. For read-only work, use it only when a full checkout of another revision is genuinely required; ordinary git show or gh pr diff review does not trigger this skill. Resolve an unclear target base or current-checkout-versus-worktree choice before invoking this setup skill.
compatibility: Requires Git and either POSIX sh or Windows PowerShell.
allowed-tools: executeCommand readFile
---

# Worktree Isolation

A worktree gives you a clean checkout of an exact committed revision without touching anything in the user's current workspace.

## Before invoking

This skill performs worktree setup; it does not choose unresolved user preferences. Evaluate isolation before invoking it:

- Stay in the current checkout only when it already contains the intended source state, the planned work is safe there, and the task does not require protecting unrelated local changes.
- Select a worktree when the task will modify a different committed branch, commit, or pull-request revision; when a large, experimental, or risky change could pollute the current checkout; or when unrelated uncommitted changes could be disturbed.
- For read-only inspection or review, prefer the current checkout, git show, or gh pr diff. Select a worktree only when the task genuinely requires a full checkout of the other revision, such as deep tree navigation or runtime validation.
- A commit-based worktree cannot contain the current checkout's uncommitted changes. If those changes may be required inputs, or if the intended committed base is unclear, resolve that ambiguity before invoking this skill. If the agent cannot request clarification, it must stop without editing and report the ambiguity.

The committed base must be locally resolvable before setup. Obtain a missing revision through an authorized workflow or report the limitation; never substitute `HEAD` silently.

## Hard rules

These hold no matter how you reached this skill:

1. Worktrees are created **only** by the trusted script below. Never run `git worktree add`, create the branch, or prepare the destination yourself — the script owns setup and the optional initialization phase.
2. Preparing or using a worktree must never modify, discard, or migrate any existing tracked or untracked changes in the user's workspace.
3. Do not commit in the worktree unless the user explicitly asks for a commit.
4. Leave the worktree and its branch in place when you finish — even after a failure, do not remove a partially created worktree. Cleanup is the user's decision.
5. Initialization is opt-in. By default the script must not copy `.worktreeinclude` files or run project scripts.

## Creating it

Resolve the script relative to this `SKILL.md` and run exactly one command with the current repository as `cwd`:

- POSIX: `sh <skill-directory>/scripts/create-worktree.sh --topic <short-topic> --base <committed-base>`
- Windows: `powershell -ExecutionPolicy Bypass -File <skill-directory>/scripts/create-worktree-windows.ps1 -Topic <short-topic> -Base <committed-base>`

Pass the exact committed base the task requires; use `HEAD` only when the current commit really is the intended base. Do not pass shell fragments.

Without an initialization flag, these commands only create the worktree and return `initialized: false`. If the task cannot proceed without project initialization, inspect the main worktree's `.worktreeinclude` and the target revision's `.pochi/init.sh` or `.pochi/init.ps1` before creating the worktree. Only after deciding that both the copied files and executed commands are necessary and safe, add the platform-specific initialization flag to the creation command:

- POSIX: add `--init`
- Windows: add `-Initialize`

Initialization first copies the `.worktreeinclude` files, then runs the platform's initialization script when present. If either step fails, the script returns `ok: false` and leaves the worktree in place.

The script prints a JSON result: `{ok, root, branch, base, initialized, error}`. If `ok` is false, stop and report the error.

## Working in it

When the script returns `ok: true`, worktree setup is complete. Resume the original task using only the tools the agent already had; this skill does not grant additional capabilities.

The conversation's configured working directory does not change automatically:

- For every command, pass the returned `root` as `cwd`.
- For every file, search, edit, or review tool, pass a path explicitly rooted under the returned `root` (use an absolute path when the tool accepts one).
- Never use a bare project-relative path after setup, because it would resolve in the original checkout. If a required tool cannot access the returned root, stop and report the limitation rather than falling back to the original checkout.

In your final result, report the worktree path and branch, and state that they were retained for the user to clean up explicitly.
