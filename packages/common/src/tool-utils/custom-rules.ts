import { homedir } from "node:os";
import path from "node:path";
import { isFileExists } from "./fs";

export const WorkspaceRulesFilePaths = ["README.pochi.md", "AGENTS.md"];

function makeGlobalRule(filePath: string) {
  return {
    filePath,
    label: filePath.replace(homedir(), "~"),
  };
}

export const GlobalRules = [
  makeGlobalRule(path.join(homedir(), ".pochi", "README.pochi.md")),
];

export async function collectAllRuleFiles(
  cwd: string,
  readFileContent: (filePath: string) => Promise<string | null>,
  options: {
    customRuleFiles?: string[];
    includeDefaultRules?: boolean;
    includeGlobalRules?: boolean;
  } = {},
): Promise<{ filePath: string; label: string }[]> {
  const {
    includeDefaultRules = true,
    includeGlobalRules = true,
    customRuleFiles = [],
  } = options;

  const allRuleFiles = new Map<string, { filePath: string; label: string }>();
  const visited = new Set<string>();

  const processFile = async (filePath: string, isGlobal: boolean) => {
    if (visited.has(filePath)) {
      return;
    }

    if (!filePath.endsWith(".md") || !(await isFileExists(filePath))) {
      return;
    }

    visited.add(filePath);

    let content = "";
    try {
      content = (await readFileContent(filePath)) ?? "";
      // Only add the file to the list after it has been successfully read.
      if (!allRuleFiles.has(filePath)) {
        const label = isGlobal
          ? filePath.replace(homedir(), "~")
          : path.relative(cwd, filePath);
        allRuleFiles.set(filePath, { filePath, label });
      }
    } catch {
      // If we can't read the file, it's not a valid rule file, so we return and don't process its imports.
      return;
    }

    const dir = path.dirname(filePath);
    const importRegex = /@([./\\\w-]+.md)/gm;
    for (const match of content.matchAll(importRegex)) {
      const importPath = path.resolve(dir, match[1]);
      await processFile(importPath, isGlobal);
    }
  };

  // 1. Process global rules
  if (includeGlobalRules) {
    for (const rule of GlobalRules) {
      await processFile(rule.filePath, true);
    }
  }

  // 2. Process default workspace rules
  if (includeDefaultRules) {
    for (const fileName of WorkspaceRulesFilePaths) {
      const filePath = path.join(cwd, fileName);
      await processFile(filePath, false);
    }
  }

  // 3. Process custom rule files
  for (const rulePath of customRuleFiles) {
    await processFile(rulePath, false);
  }

  return Array.from(allRuleFiles.values());
} /**
 * Collects custom rules from README.pochi.md and specified custom rule files.
 *
 * @param cwd Current working directory
 * @param customRuleFiles Array of paths to custom rule files (optional)
 * @param includeDefaultRules Whether to include the default README.pochi.md file (default: true)
 * @returns A string containing all collected rules, or empty string if no rules found
 */
export async function collectCustomRules(
  cwd: string,
  readFileContent: (filePath: string) => Promise<string | null>,
  customRuleFiles: string[] = [],
  includeDefaultRules = true,
  includeGlobalRules = true,
): Promise<string> {
  let rules = "";

  const allRules = await collectAllRuleFiles(cwd, readFileContent, {
    customRuleFiles,
    includeDefaultRules,
    includeGlobalRules,
  });

  // Read all rule files
  for (const rule of allRules) {
    try {
      const content = (await readFileContent(rule.filePath)) ?? "";
      if (content.trim().length > 0) {
        rules += `# Rules from ${rule.label}\n${content}\n`;
      }
    } catch {
      // Ignore files that can't be read
    }
  }

  // Add custom rules from POCHI_CUSTOM_RULES environment variable
  const envCustomInstructions = process.env.POCHI_CUSTOM_INSTRUCTIONS;
  if (envCustomInstructions && envCustomInstructions.trim().length > 0) {
    rules += `# Rules from POCHI_CUSTOM_INSTRUCTIONS environment variable\n${envCustomInstructions}\n`;
  }

  return rules;
}
