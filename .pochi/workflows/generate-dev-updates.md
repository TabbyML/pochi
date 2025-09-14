The purpose of this workflow is to generate a draft of the dev updates. The generated content is a draft for review. The top priority is to make sure the content is as accurate and comprehensive as the original source. That being said: please make sure all the PRs are included; do not make judgement on which ones need to be discarded; do not categorize them.

1. Fetch and summarize the merged PRs since last dev update.
  - If a date range is provided in the workflow input by the user, use that date range. Othersie use the last dev update date to yesterday as the date range. The last dev update date is the latest date found in `packages/docs/content/docs/developer-updates.mdx`.
  - Find the PRs that are merged during this date range(inclusive). Make sure every single one is included.
  - The summary of each PR should be in the format of `- **PR summary:** Short explanation [#PR_NUMBER](PR_LINK)`. Please make sure the language you use is concise, clear, and friendly.
  - Put all the PRs under `Triage` section, and grouped them by the merge date in the current user's timezone. Meanwhile, add `Features`, `Enhancements`, `Bug fixes`, and `New Contributors` section titles, and leave the body blank.

2. Generate the dev update content in markdown format
  - It should follow the structure and style of the previous dev updates found in `packages/docs/content/docs/developer-updates.mdx`.
  - It should be appended before the last dev update in `packages/docs/content/docs/developer-updates.mdx` file, and add `---` line seperator at the end of the new content.
  - No previous content should be changed.
  - The title should be the current date in `MM DD, YYYY` format.
  - The TL;DR section should be a concise summary of the key highlights from the enhancements and bug fixes sections. It should be engaging and encourage readers to explore the details below.
  - Ensure that the new content is well-formatted and adheres to markdown standards.
