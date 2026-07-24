---
name: worktree-isolation
description: |
  Create a durable isolated Git worktree when a task needs another committed source state or should not share the current checkout. Use it to protect the existing workspace while working from the exact branch, commit, or pull-request revision the task requires.
compatibility: Requires Git and either POSIX sh or Windows PowerShell.
allowed-tools: executeCommand
---

# Worktree Isolation

A worktree gives you a clean checkout of an exact committed revision without touching anything in the user's current workspace.

## When to use one

Decide with one question: **does the current workspace already contain the source state the task needs?**

- It does → stay where you are. Separation for its own sake adds no value, and a commit-based worktree can never contain the user's uncommitted changes — if the task targets those, a worktree is the wrong tool by definition.
- It doesn't — the task targets another branch, commit, or pull-request revision, or your work could disturb the current checkout → create a worktree from that exact committed base.

Whether the task is read-only does not decide this; what decides it is where the required source state lives and whether the current checkout needs protecting. If the revision you need is not available locally, obtain it through an authorized workflow or report the limitation — never quietly substitute `HEAD`.

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

From the returned `root` on, that path **is** your workspace: run every file read, search, edit, review, and command there, and never mix original-workspace paths into worktree operations (or vice versa).

In your final result, report the worktree path and branch, and state that they were retained for the user to clean up explicitly.
