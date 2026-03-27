---
name: create-issue
description: Help create a github issue given the request
---

# Github Issue Creator

1. Please conduct a thorough search of the codebase on relevant code snippets to help implement the feature / debug the issue.
2. Create an issue in the TabbyML/pochi repository. Select the appropriate template from `.github/ISSUE_TEMPLATE`. and use `gh` cli to to create the issue.
3. When creating issue, attach following information in footer of issue.
    🤖 Generated with [Pochi](https://getpochi.com)
4. Please include as much as possible information about the issues, especially link to existing code (make sure you make the link clickable by prefixing them with github link)
5. Be respectful and considerate in your issue description and comments, make it concise and clear.
6. After creating the issue, please assign it to project "Pochi Tasks" and add appropriate labels (see existing issues for reference)
    Example commands:
    ```bash
    gh issue edit <issue-number> --add-project "Pochi Tasks"
    ```
7. If the user specifies an Assignee, Priority (e.g., P1, P2), or Release (e.g., v0.42), update those as well:
    - Add Assignee: `gh issue edit <issue-number> --add-assignee <username>`
    - To update project fields (Priority, Release), you must find the relevant IDs and update the project item:
      1. Get Project Number/ID: `gh project list --owner TabbyML`
      2. Get Field and Option IDs: `gh project field-list <project-number> --owner TabbyML --format json`
      3. Get Project Item ID for the issue:
         ```bash
         gh project item-list <project-number> --owner TabbyML --format json | jq -r '.items[] | select(.content.number == <issue-number>) | .id'
         ```
      4. Update the field: `gh project item-edit --id <item-id> --field-id <field-id> --project-id <project-id> --single-select-option-id <option-id>`
8. If `gh issue edit` failed to add project, should ask user to refresh their gh token to authorize it with the project scope (`gh auth refresh -s project`).

IMPORTANT: You only need to create the issue, DO NOT attempt to fix the issue or implement the feature.