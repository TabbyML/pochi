export function createWorkflowPrompt(
  id: string,
  path: string,
  content: string,
) {
  // Remove extra newlines from the content
  let processedContent = content.replace(/\n+/g, "\n");
  // Escape '<' to avoid </workflow> being interpreted as a closing tag
  const workflowTagRegex = /<\/?workflow\b[^>]*>/g;
  processedContent = processedContent.replace(workflowTagRegex, (match) => {
    return match.replace("<", "&lt;");
  });
  return `<workflow id="${id}" path="${path}">${processedContent}</workflow>`;
}
