import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { constants, prompts } from "@getpochi/common";

function getLocalWorkflowPath(id: string) {
  // Construct the workflow file path
  const workflowsDir = path.join(...constants.WorkspaceWorkflowPathSegments);
  return path.join(workflowsDir, `${id}.md`);
}

function getGlobalWorkflowPath(id: string) {
  // Construct the workflow file path
  const workflowsDir = path.join(
    os.homedir(),
    ...constants.WorkspaceWorkflowPathSegments,
  );
  return path.join(workflowsDir, `${id}.md`);
}

/**
 * Loads workflow content from a workflow file, prioritizing local over global.
 * @param id The name of the workflow (without .md extension)
 * @param cwd The current working directory
 * @returns An object containing the content and the path, or null if not found
 */
async function loadWorkflow(
  id: string,
  cwd: string,
): Promise<{ content: string; path: string } | null> {
  // 1. Try to load the local workflow first
  const localPath = path.join(cwd, getLocalWorkflowPath(id));
  try {
    const localContent = await fs.readFile(localPath, "utf-8");
    return { content: localContent, path: localPath };
  } catch (error) {
    // Local file doesn't exist, proceed to check global path
  }

  // 2. If local workflow is not found, try to load the global workflow
  const globalPath = getGlobalWorkflowPath(id);
  try {
    const globalContent = await fs.readFile(globalPath, "utf-8");
    return { content: globalContent, path: globalPath };
  } catch (error) {
    // Neither local nor global workflow found
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
      // Replace only the workflow reference, preserving surrounding text so this way if its a local workflow it will just take wrt the cwd
      // if its a global workflow it will take the entire global path
      result = result.replace(
        `/${id}`,
        prompts.workflow(id, path.relative(cwd, content.path), content.content),
      );
    } else {
      missingWorkflows.push(id);
    }
  }

  return { prompt: result, missingWorkflows };
}
