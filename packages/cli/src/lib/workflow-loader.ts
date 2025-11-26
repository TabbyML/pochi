import * as fs from "node:fs/promises";
import { homedir } from "node:os";
import * as path from "node:path";
import { constants } from "@getpochi/common";
import { isFileExists, parseWorkflow } from "@getpochi/common/tool-utils";
import { uniqueBy } from "remeda";

export interface Workflow {
  id: string;
  pathName: string;
  content: string;
  frontmatter: { model?: string };
}

function getWorkflowPath(id: string) {
  // Construct the workflow file path
  const workflowsDir = path.join(...constants.WorkspaceWorkflowPathSegments);
  return path.join(workflowsDir, `${id}.md`);
}

async function readWorkflowsFromDir(dir: string): Promise<Workflow[]> {
  const workflows: Workflow[] = [];
  try {
    if (!(await isFileExists(dir))) {
      return workflows;
    }

    const files = await fs.readdir(dir);
    for (const fileName of files) {
      if (fileName.endsWith(".md")) {
        const id = fileName.replace(/\.md$/, "");
        const filePath = path.join(dir, fileName);
        try {
          const fileContent = await fs.readFile(filePath, "utf-8");
          const { frontmatter, content } = await parseWorkflow(fileContent);
          workflows.push({
            id,
            pathName: getWorkflowPath(id),
            content,
            frontmatter,
          });
        } catch (e) {
          // ignore file read errors
        }
      }
    }
  } catch (error) {
    // ignore readdir errors
  }
  return workflows;
}

export async function loadWorkflows(
  cwd: string,
  includeGlobalWorkflows = true,
): Promise<Workflow[]> {
  const allWorkflows: Workflow[] = [];

  const projectWorkflowsDir = path.join(
    cwd,
    ...constants.WorkspaceWorkflowPathSegments,
  );
  allWorkflows.push(...(await readWorkflowsFromDir(projectWorkflowsDir)));

  if (includeGlobalWorkflows) {
    const globalWorkflowsDir = path.join(
      homedir(),
      ...constants.WorkspaceWorkflowPathSegments,
    );
    allWorkflows.push(...(await readWorkflowsFromDir(globalWorkflowsDir)));
  }

  return uniqueBy(allWorkflows, (workflow: Workflow) => workflow.id);
}

export function getModelFromWorkflow(workflow: Workflow | undefined) {
  if (!workflow) return undefined;
  return workflow.frontmatter.model;
}
