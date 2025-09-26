---
model: qwen/qwen3-coder
---

Please help create a PR for the current staging changes, following these guidelines:
- If there are no staging changes but there are uncommitted changes, please stage them first.
- Create a branch name based on the current git diff status.
- Write a meaningful commit message/PR title.
- Use the gh CLI to create a PR.
- When running the push operation, it might be aborted due to a husky pre-push hook. For formatting issues, amend the files and try again. For other issues, try to resolve them as much as possible.
- The base branch for the PR should always be `origin/main`.
- Always push the branch to the remote repository before creating the PR.

When creating PR with markdown description, pay attention to escape backticks, otherwise it will be executed as command substitution in the shell.

Usually pre-push can take as long as 180 seconds, so please set proper timeout for executeCommand.
