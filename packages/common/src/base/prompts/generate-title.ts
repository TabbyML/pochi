export function generateTitle() {
  return `Based on the conversation above, create a concise and descriptive title for the task. The title should be a short sentence that summarizes the user's request and should NOT end with any punctuation marks (e.g., periods, question marks). Do NOT use markdown formatting, bullet points, or numbered lists. Avoid creating complex structured templates. Return only the title itself, without any explanations, comments, headings, or special formatting.

<good-example>
Create a new React component for user profile
</good-example>

<good-example>
Fix broken links in the documentation
</good-example>

<good-example>
Add authentication to the API endpoints
</good-example>

<bad-example>
- Create a new React component for user profile
</bad-example>

<bad-example>
"Fix broken links in the documentation."
</bad-example>

<bad-example>
Add authentication to the API endpoints and implement JWT token refresh functionality
</bad-example>

<bad-example>
Create a user profile component. This should include fields for name, email, and avatar upload functionality.
</bad-example>`;
}
