export function generateWalkthrough() {
  return `Based on the conversation above, create a comprehensive walkthrough document that summarizes the task completion. The walkthrough should include:

1. A clear summary of what was accomplished
2. Key changes made during the task
3. Important decisions or approaches taken
4. Any notable challenges encountered and how they were resolved

The walkthrough should be written in markdown format and be detailed enough for someone to understand what happened during this task. Use clear headings, bullet points, and code blocks where appropriate. Focus on being informative and helpful for future reference.

Return only the markdown content, without any explanations or additional formatting outside of the markdown itself.`;
}
