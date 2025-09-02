The purpose of this workflow is to generate a draft of the dev updates for the current week for review.

1. Fetch and summarize the merged PRs since last dev update.
  - The last dev update date is the latest date found in `packages/docs/content/docs/developer-updates.mdx`.
  - Use this command to get the PRs that are merged from the last dev update date to yesterday `gh pr list --search "merged:LAST_DEV_UPDATE_DATE..YESTERDAY"`
  - Go through the list of PRs and categorize them into "Enhancements", "Features", "Bug Fixes" based on the labels, and PR title. If you are unable to categorize a PR, put it in "Triage" category for manual review.
  - The summary of each PR should be in the format of `- **PR summary:** Short explanation [#PR_NUMBER](PR_LINK)`. Please make sure the language you use is concise, clear, and friendly.

2. Generate the dev update content in markdown format
  - It should follow the structure and style of the previous dev updates found in `packages/docs/content/docs/developer-updates.mdx`.
  - It should be appended before the last dev update in `packages/docs/content/docs/developer-updates.mdx` file, and add `---` line seperator at the end of the new content.
  - The title should be the current date in `MM DD, YYYY` format.
  - The TL;DR section should be a concise summary of the key highlights from the enhancements and bug fixes sections. It should be engaging and encourage readers to explore the details below.
  - Ensure that the new content is well-formatted and adheres to markdown standards.
