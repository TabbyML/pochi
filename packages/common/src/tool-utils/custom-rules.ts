import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

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

/**
 * Collects custom rules from README.pochi.md and specified custom rule files.
 *
 * @param cwd Current working directory
 * @param customRuleFiles Array of paths to custom rule files (optional)
 * @param includeDefaultRules Whether to include the default README.pochi.md file (default: true)
 * @returns A string containing all collected rules, or empty string if no rules found
 */
export async function collectCustomRules(
  cwd: string,
  customRuleFiles: string[] = [],
  includeDefaultRules = true,
  includeGlobalRules = true,
): Promise<string> {
  let rules = "";

  const allRules: { filePath: string; label: string }[] = [];
  if (includeGlobalRules) {
    allRules.push(...GlobalRules);
  }

  // Add workspace rules files if requested
  if (includeDefaultRules) {
    for (const fileName of WorkspaceRulesFilePaths) {
      const defaultRulesPath = path.join(cwd, fileName);
      allRules.push({
        filePath: defaultRulesPath,
        label: fileName,
      });
    }
  }

  allRules.push(
    ...customRuleFiles.map((rulePath) => {
      const relativePath = path.relative(cwd, rulePath);
      return {
        filePath: rulePath,
        label: relativePath,
      };
    }),
  );

  // Read all rule files
  for (const rule of allRules) {
    try {
      const content = await readFile(rule.filePath, "utf-8");
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
