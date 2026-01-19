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

function makeSkillToolDescription(skills?: Skill[]) {
  if (!skills || skills.length === 0)
    return "No skills are available in the workspace.";

  return `Available skills:

${skills
  .map((skill) => `- **${skill.name}**: ${skill.description.trim()}`)
  .join("\n")}`;
}

export const inputSchema = z.object({
  skill: z.string().describe("The name of the skill to use."),
});

export const createSkillTool = (skills?: Skill[]) => {
  return defineClientTool({
    description: `Execute a skill within the main conversation

When users ask you to perform tasks, check if any of the available skills below can help complete the task more effectively. Skills provide specialized capabilities and domain knowledge.

This tool returns the skill's detailed instructions which you must then follow to complete the task. The instructions contain step-by-step guidance on how to perform the specific task or workflow.

How to invoke:
- Use this tool with the skill name
- Example: \`skill: "pdf-processing"\` - invoke the pdf-processing skill
- The tool will return the skill's instructions
- Follow the returned instructions carefully to complete the task

Important:
- When a skill is relevant, you must invoke this tool IMMEDIATELY as your first action
- NEVER just announce or mention a skill in your text response without actually calling this tool
- This is a BLOCKING REQUIREMENT: invoke the relevant Skill tool BEFORE generating any other response about the task
- Only use skills listed in "Available skills" below
- After calling this tool, follow the returned instructions step by step

${makeSkillToolDescription(skills)}
`.trim(),
    inputSchema,
    outputSchema: z.object({
      result: z
        .string()
        .describe("The result of getting the skill instructions."),
    }),
  });
};
