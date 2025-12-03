import { createWorkflowPrompt } from "./workflow";

export function createPr(isDraft?: boolean) {
  const workflowId = isDraft ? "create-draft-pr" : "create-pr";
  return createWorkflowPrompt(workflowId, "", createPrTemplate(isDraft));
}

const createPrTemplate = (isDraft?: boolean) => `
Please help create a ${isDraft ? "draft" : ""} PR for the current changes, following these guidelines:

## Branch Management
1. **Check if new branch is needed:**
   - If the current branch name is unrelated to the changes (e.g., working on new changes in a pre-existing feature branch), check if a PR already exists for this branch using \`gh pr list --head <branch-name>\`
   - If a PR exists on the current branch, use \`askFollowupQuestion\` to confirm with the user whether to:
     - Create a new branch for these changes, OR
     - Add commits to the existing PR
   - If creating a new branch, generate a descriptive branch name based on the git diff/changes
   - Create the new branch from the current state before committing

2. **If no PR exists on current branch:**
   - Proceed with committing on the current branch
   - If the branch name is generic (like \`main\` or \`master\`), create a new feature branch first

## Staging and Committing
- If there are no staged changes but there are uncommitted changes, stage them first using \`git add\`
- Write a meaningful commit message that describes the changes
- Commit the staged changes

## Creating the PR
- Generate a descriptive PR title and description based on all commits in the branch (not just the latest commit)
- Set the base branch to \`origin/main\`
- Push the branch to the remote repository first with \`git push -u origin <branch-name>\`
- Use \`gh pr create\` to create the PR with proper title and body
- Return the PR URL to the user

## Handling Pre-Push Hooks
- The pre-push hook can take up to 180 seconds, so set timeout appropriately for \`executeCommand\`
- If the push is aborted due to pre-push hook failures:
  - For formatting issues: amend the formatted files and push again
  - For other issues: attempt to resolve them, or inform the user if manual intervention is needed

## Important Notes
- When creating PR descriptions with markdown, escape backticks properly to avoid command substitution in shell
- Always ensure the branch is pushed before attempting to create the PR
- Use HEREDOC syntax when passing multi-line content to git/gh commands to ensure proper formatting
`;
