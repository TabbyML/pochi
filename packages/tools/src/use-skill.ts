import { z } from "zod";
import { defineClientTool } from "./types";

export const Skill = z.object({
  name: z.string().describe("The name of the skill."),
  description: z
    .string()
    .describe("Description of what the skill does and when to use it"),
  license: z
    .string()
    .optional()
    .describe("License name or reference to a bundled license file"),
  compatibility: z.string().optional().describe("Environment requirements"),
  metadata: z
    .record(z.string(), z.string())
    .optional()
    .describe("Arbitrary key-value mapping for additional metadata"),
  allowedTools: z
    .string()
    .optional()
    .describe("Space-delimited list of pre-approved tools"),
  instructions: z.string().describe("The skill's instructions."),
});

export type Skill = z.infer<typeof Skill>;

function makeUseSkillToolDescription(skills?: Skill[]) {
  if (!skills || skills.length === 0)
    return "No skills are available in the workspace.";

  return `Available skills in the workspace:
${skills
  .map((skill) => `### ${skill.name}\n${skill.description.trim()}`)
  .join("\n")}
Use this tool to get the instructions for a specific skill.`;
}

export const inputSchema = z.object({
  skill: z.string().describe("The name of the skill to use."),
});

export const createUseSkillTool = (skills?: Skill[]) => {
  return defineClientTool({
    description: `Access skill instructions from the workspace.
${makeUseSkillToolDescription(skills)}
This tool returns the skill's instructions which can then be used to perform the skill's task.
`.trim(),
    inputSchema,
    outputSchema: z.object({
      instructions: z.string().describe("The skill's instructions."),
    }),
  });
};
