import * as path from "node:path";
import {
  createGitRepoWorkspace,
  createGitWorktreesWorkspace,
  createPlainWorkspace,
  openWorkspace,
} from "./workspace-setup.js";

/**
 * Workspace types supported by the test system
 */
export enum WorkspaceType {
  PLAIN = "plain",
  GIT_REPO = "git-repo",
  GIT_WORKTREES = "git-worktrees",
  NONE = "none",
}

/**
 * Mapping of workspace types to folder path fragments
 * Tests in folders containing these fragments will automatically use the corresponding workspace type
 */
const WORKSPACE_FOLDER_PATTERNS: Record<WorkspaceType, string[]> = {
  [WorkspaceType.PLAIN]: ["plain-workspace"],
  [WorkspaceType.GIT_REPO]: ["git-workspace"],
  [WorkspaceType.GIT_WORKTREES]: ["git-worktrees-workspace"],
  [WorkspaceType.NONE]: ["no-workspace"],
};

/**
 * Detect the workspace type based on the test file path
 * @param specPath - Absolute path to the test spec file
 * @returns The detected workspace type
 */
export function detectWorkspaceType(specPath: string): WorkspaceType {
  // Normalize the path for consistent matching
  const normalizedPath = path.normalize(specPath);
  const normalizedPathSeparators = normalizedPath.replace(/\\/g, "/");

  // Check each workspace type's folder patterns
  for (const [workspaceType, folderPatterns] of Object.entries(
    WORKSPACE_FOLDER_PATTERNS,
  )) {
    for (const folderPattern of folderPatterns) {
      if (normalizedPathSeparators.includes(`/${folderPattern}/`)) {
        console.log(
          `[Workspace Registry] Detected workspace type '${workspaceType}' for: ${normalizedPath}`,
        );
        return workspaceType as WorkspaceType;
      }
    }
  }

  // Default to no workspace if no pattern matches
  console.log(
    `[Workspace Registry] No workspace pattern matched for: ${normalizedPath}, using WorkspaceType.NONE`,
  );
  return WorkspaceType.NONE;
}

/**
 * Setup a workspace by type
 * Creates the appropriate workspace and returns its path
 * @param type - The workspace type to create
 * @returns The path to the created workspace
 */
export async function setupWorkspaceByType(
  type: WorkspaceType,
): Promise<string> {
  console.log(`[Workspace Registry] Setting up workspace type: ${type}`);

  let workspacePath: string;

  switch (type) {
    case WorkspaceType.PLAIN:
      workspacePath = await createPlainWorkspace();
      break;

    case WorkspaceType.GIT_REPO:
      workspacePath = await createGitRepoWorkspace();
      break;

    case WorkspaceType.GIT_WORKTREES:
      workspacePath = await createGitWorktreesWorkspace();
      break;

    case WorkspaceType.NONE:
      // No workspace setup needed
      return "";

    default:
      throw new Error(`Unknown workspace type: ${type}`);
  }

  console.log(`[Workspace Registry] Workspace created at: ${workspacePath}`);
  return workspacePath;
}

/**
 * Setup and open a workspace by type
 * This is a convenience function that combines setup and opening
 * @param type - The workspace type to create and open
 * @returns The path to the created and opened workspace
 */
export async function setupAndOpenWorkspace(
  type: WorkspaceType,
): Promise<string> {
  if (type === WorkspaceType.NONE) {
    return "";
  }

  const workspacePath = await setupWorkspaceByType(type);
  await openWorkspace(workspacePath);

  return workspacePath;
}
