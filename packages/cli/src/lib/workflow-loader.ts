import * as fs from "node:fs/promises";
import * as path from "node:path";

/**
 * Loads workflow content from a workflow file
 * @param workflowName The name of the workflow (without .md extension)
 * @param cwd The current working directory
 * @returns The content of the workflow file, or null if not found
 */
export async function loadWorkflow(
  workflowName: string,
  cwd: string,
): Promise<string | null> {
  // Construct the workflow file path
  const workflowsDir = path.join(cwd, ".pochi", "workflows");
  const workflowFilePath = path.join(workflowsDir, `${workflowName}.md`);

  try {
    // Check if the file exists and read its content
    const content = await fs.readFile(workflowFilePath, "utf-8");
    return content;
  } catch (error) {
    // File doesn't exist or cannot be read
    return null;
  }
}

/**
 * Checks if a prompt is a workflow reference (starts with /)
 * @param prompt The prompt to check
 * @returns True if the prompt is a workflow reference, false otherwise
 */
export function isWorkflowReference(prompt: string): boolean {
  return prompt.startsWith("/");
}

/**
 * Extracts the workflow name from a workflow reference
 * @param prompt The workflow reference (e.g., "/create-pr")
 * @returns The workflow name (e.g., "create-pr")
 */
export function extractWorkflowName(prompt: string): string {
  return prompt.substring(1); // Remove the leading "/"
}
