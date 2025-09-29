import * as fs from "node:fs/promises";
import * as path from "node:path";
import { constants, prompts } from "@getpochi/common";
import { parseWorkflowFrontmatter as commonParseWorkflowFrontmatter } from "@getpochi/common/tool-utils";

function getWorkflowPath(id: string) {
  // Construct the workflow file path
  const workflowsDir = path.join(...constants.WorkspaceWorkflowPathSegments);
  return path.join(workflowsDir, `${id}.md`);
}

/**
 * Loads workflow content from a workflow file
 * @param id The name of the workflow (without .md extension)
 * @param cwd The current working directory
 * @returns The content of the workflow file, or null if not found
 */
async function loadWorkflow(id: string, cwd: string): Promise<string | null> {
  try {
    // Check if the file exists and read its content
    const content = await fs.readFile(
      path.join(cwd, getWorkflowPath(id)),
      "utf-8",
    );
    return content;
  } catch (error) {
    // File doesn't exist or cannot be read
    return null;
  }
}

/**
 * Checks if a prompt contains a workflow reference (starts with /)
 * @param prompt The prompt to check
 * @returns True if the prompt contains a workflow reference, false otherwise
 */
export function containsWorkflowReference(prompt: string): boolean {
  return /\/\w+[\w-]*/.test(prompt);
}

/**
 * Extracts all workflow names from a prompt
 * @param prompt The prompt to extract workflow names from
 * @returns Array of workflow names found in the prompt
 */
export function extractWorkflowNames(prompt: string): string[] {
  const workflowRegex = /(\/\w+[\w-]*)/g;
  const matches = prompt.match(workflowRegex);
  if (!matches) return [];

  return matches.map((match) => match.substring(1)); // Remove the leading "/"
}
/**
 * Replaces workflow references in a prompt with their content
 * @param prompt The prompt containing workflow references
 * @param cwd The current working directory
 * @returns The prompt with workflow references replaced by their content
 */
export async function replaceWorkflowReferences(
  prompt: string,
  cwd: string,
): Promise<{ prompt: string; missingWorkflows: string[] }> {
  const workflowNames = extractWorkflowNames(prompt);

  if (workflowNames.length === 0) {
    return { prompt, missingWorkflows: [] };
  }

  let result = prompt;
  const missingWorkflows: string[] = [];

  // Process each workflow reference
  for (const id of workflowNames) {
    const content = await loadWorkflow(id, cwd);
    if (content !== null) {
      // Replace only the workflow reference, preserving surrounding text
      result = result.replace(
        `/${id}`,
        prompts.workflow(id, getWorkflowPath(id), content),
      );
    } else {
      missingWorkflows.push(id);
    }
  }

  return { prompt: result, missingWorkflows };
}

export async function parseWorkflowFrontmatter(id: string) {
  const content = await loadWorkflow(id, process.cwd());
  if (content === null) {
    return { model: undefined };
  }
  return commonParseWorkflowFrontmatter(content);
}
