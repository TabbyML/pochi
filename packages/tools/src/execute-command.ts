import { z } from "zod";
import { defineClientTool } from "./types";

const toolDef = {
  description:
    `Executes a given bash command in a persistent shell session with optional timeout, ensuring proper handling and security measures.

Before executing the command, please follow these steps:

1. Directory Verification:
   - If the command will create new directories or files, first use the listFiles tool to verify the parent directory exists and is the correct location
   - For example, before running "mkdir foo/bar", first use listFiles to check that "foo" exists and is the intended parent directory

2. Command Execution:
   - After ensuring proper quoting, execute the command.
   - Capture the output of the command.

Usage notes:
- The command argument is required.
- You can specify an optional timeout in seconds (up to 300s / 5 minutes). If not specified, commands will timeout after 60s (1 minute).
- If the output exceeds 30000 characters, output will be truncated before being returned to you.
- You can use the \`isBackground\` parameter to run the command in the background, which allows you to continue working while the command runs. You can monitor the output using the readCommandOutput tool as it becomes available. Never use \`isBackground\` to run 'sleep' as it will return immediately. You do not need to use '&' at the end of the command when using this parameter.
- When issuing multiple commands, use the ';' or '&&' operator to separate them. DO NOT use newlines (newlines are ok in quoted strings).
- You shall avoid use the markdown code black syntax (backtick, '\`') in your command, as it will be interpreted as a command substitution.

# Committing changes with git

When the user asks you to create a new git commit, follow these steps carefully:

1. You have the capability to call multiple tools in a single response. When multiple independent pieces of information are requested, batch your tool calls together for optimal performance. ALWAYS run the following bash commands in parallel, each using the executeCommand tool:
  - Run a git status command to see all untracked files.
  - Run a git diff command to see both staged and unstaged changes that will be committed.
  - Run a git log command to see recent commit messages, so that you can follow this repository's commit message style.
2. Analyze all staged changes (both previously staged and newly added) and draft a commit message:
  - Summarize the nature of the changes (eg. new feature, enhancement to an existing feature, bug fix, refactoring, test, docs, etc.). Ensure the message accurately reflects the changes and their purpose (i.e. "add" means a wholly new feature, "update" means an enhancement to an existing feature, "fix" means a bug fix, etc.).
  - Check for any sensitive information that shouldn't be committed
  - Draft a concise (1-2 sentences) commit message that focuses on the "why" rather than the "what"
  - Ensure it accurately reflects the changes and their purpose
3. You have the capability to call multiple tools in a single response. When multiple independent pieces of information are requested, batch your tool calls together for optimal performance. ALWAYS run the following commands in parallel:
   - Add relevant untracked files to the staging area.
   - Create the commit with a message ending with:
   🤖 Generated with [Pochi](https://getpochi.com)

   Co-Authored-By: Pochi <noreply@getpochi.com>
   - Run git status to make sure the commit succeeded.
4. If the commit fails due to pre-commit hook changes, retry the commit ONCE to include these automated changes. If it fails again, it usually means a pre-commit hook is preventing the commit. If the commit succeeds but you notice that files were modified by the pre-commit hook, you MUST amend your commit to include them.

Important notes:
- NEVER update the git config
- NEVER run additional commands to read or explore code, besides git bash commands
- DO NOT push to the remote repository unless the user explicitly asks you to do so
- IMPORTANT: Never use git commands with the -i flag (like git rebase -i or git add -i) since they require interactive input which is not supported.
- If there are no changes to commit (i.e., no untracked files and no modifications), do not create an empty commit
- In order to ensure good formatting, ALWAYS pass the commit message via a HEREDOC, a la this example:
<example>
git commit -m "$(cat <<'EOF'
Commit message here.

🤖 Generated with [Pochi](https://getpochi.com)

Co-Authored-By: Pochi <noreply@getpochi.com>
EOF
)"
</example>

# Creating pull requests
Use the gh command via the executeCommand tool for ALL GitHub-related tasks including working with issues, pull requests, checks, and releases. If given a Github URL use the gh command to get the information needed.

IMPORTANT: When the user asks you to create a pull request, follow these steps carefully:

1. Use batchCall to run the following commands in parallel, in order to understand the current state of the branch since it diverged from the main branch:
   - Run a git status command to see all untracked files
   - Run a git diff command to see both staged and unstaged changes that will be committed
   - Check if the current branch tracks a remote branch and is up to date with the remote, so you know if you need to push to the remote
   - Run a git log command and \`git diff main...HEAD\` to understand the full commit history for the current branch (from the time it diverged from the \`main\` branch)

2. Analyze all changes that will be included in the pull request, making sure to look at all relevant commits (NOT just the latest commit, but ALL commits that will be included in the pull request!!!), and draft a pull request summary.

- List the commits since diverging from the main branch
- Summarize the nature of the changes (eg. new feature, enhancement to an existing feature, bug fix, refactoring, test, docs, etc.)
- Brainstorm the purpose or motivation behind these changes
- Assess the impact of these changes on the overall project
- Do not use tools to explore code, beyond what is available in the git context
- Check for any sensitive information that shouldn't be committed
- Draft a concise (1-2 bullet points) pull request summary that focuses on the "why" rather than the "what"
- Ensure the summary accurately reflects all changes since diverging from the main branch
- Ensure your language is clear, concise, and to the point
- Ensure the summary accurately reflects the changes and their purpose (ie. "add" means a wholly new feature, "update" means an enhancement to an existing feature, "fix" means a bug fix, etc.)
- Ensure the summary is not generic (avoid words like "Update" or "Fix" without context)
- Review the draft summary to ensure it accurately reflects the changes and their purpose
- Note unlike creating a git message, you don't need to include the Co-Authored-By line in PR body

3. Use batchCall to run the following commands in parallel:
   - Create new branch if needed
   - Push to remote with -u flag if needed
   - Create PR using gh pr create with the format below. Use a HEREDOC to pass the body to ensure correct formatting.
<example>
gh pr create --title "the pr title" --body "$(cat <<'EOF'
## Summary
<1-3 bullet points>

## Test plan
[Checklist of TODOs for testing the pull request...]

🤖 Generated with [Pochi](https://getpochi.com)
EOF
)"
</example>

Important:
- NEVER update the git config
- Return the PR URL when you're done, so the user can see it

# Other common operations
- View comments on a Github PR: gh api repos/foo/bar/pulls/123/comments
`.trim(),
  inputSchema: z.object({
    command: z
      .string()
      .describe(
        "The CLI command to execute. This should be valid for the current operating system.",
      ),
    cwd: z
      .string()
      .optional()
      .describe("The working directory to execute the command in."),
    isBackground: z
      .boolean()
      .optional()
      .describe(
        "Set to true to run this command in the background. Use readCommandOutput to read the output later.",
      ),
    timeout: z
      .number()
      .min(1)
      .max(60 * 5)
      .optional()
      .describe(
        "Optional timeout in seconds, max 300 seconds. By default the timeout is 120 seconds.",
      ),
  }),
  outputSchema: z.object({
    output: z
      .string()
      .optional()
      .describe("The output of the command (including stdout and stderr)."),
    isTruncated: z
      .boolean()
      .optional()
      .describe("Whether the output was truncated"),
    backgroundCommandId: z
      .string()
      .optional()
      .describe("The ID of the background command if isBackground is true"),
  }),
};

export const executeCommand = defineClientTool(toolDef);
