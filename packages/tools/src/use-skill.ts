import { z } from "zod";
import { defineClientTool } from "./types";

export const Skill = z.object({
  name: z.string().describe("The name of the skill."),
  description: z
    .string()
    .describe("Description of what the skill does and when to use it"),
  filePath: z
    .string()
    .describe("The file system path where this skill is defined"),
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
  .map((skill) => {
    const compatibilityInfo = skill.compatibility
      ? ` [Compatibility: ${skill.compatibility}]`
      : "";
    const locationInfo = ` [Location: ${skill.filePath}]`;
    return `- **${skill.name}**: ${skill.description.trim()}${compatibilityInfo}${locationInfo}`;
  })
  .join("\n")}`;
}

export const inputSchema = z.object({
  skill: z.string().describe("The name of the skill to use."),
});

export const createSkillTool = (skills?: Skill[]) => {
  return defineClientTool({
    description: `Execute a skill within the main conversation

When users ask you to perform tasks, check if any of the available skills below can help complete the task more effectively. Skills provide specialized capabilities and domain knowledge.

When users ask about a SPECIFIC skill (e.g., "How does the pdf skill work?", "What does the commit skill do?"), you must call this tool to get detailed information about that skill.

When users ask general questions like "What skills are available?" or "List all skills", simply refer to the "Available skills" section below - do NOT call this tool.

This tool returns the skill's detailed instructions which you must then follow to complete the task. The instructions contain step-by-step guidance on how to perform the specific task or workflow.

How to invoke:
- Use this tool with the skill name
- Example: \`skill: "pdf-processing"\` - invoke the pdf-processing skill
- The tool will return the skill's instructions
- Follow the returned instructions carefully to complete the task

Important:
- When a skill is relevant for a task OR when users ask about a SPECIFIC skill, you must invoke this tool IMMEDIATELY as your first action
- For general questions about available skills, simply refer to the "Available skills" list below without calling this tool
- NEVER just announce or mention a skill in your text response without actually calling this tool (except for general skill listing requests)
- This is a BLOCKING REQUIREMENT: invoke the relevant Skill tool BEFORE generating any other response about a specific skill or task
- Only use skills listed in "Available skills" below
- Check compatibility requirements before using a skill - ensure the skill is compatible with the current OS/environment
- After calling this tool, follow the returned instructions step by step
- The skill file location is shown in the [Location: filepath] section of each skill listing below - use this information to understand where the skill is defined
- Use the directory containing the skill's source file as the base directory for resolving any resource files mentioned in the instructions
- Proactively explore the skill directory for optional resources that enhance task completion:
  * scripts/ - executable code that agents can run (Python, Bash, JavaScript, etc.)
  * references/ - on-demand documentation (REFERENCE.md, FORMS.md, domain-specific files)
  * assets/ - static resources (templates, images, data files, schemas)
  Use these resources when they exist and are relevant to the current task

${makeSkillToolDescription(skills)}
`.trim(),
    inputSchema,
    outputSchema: z.object({
      result: z
        .string()
        .describe("The result of getting the skill instructions."),
      filePath: z
        .string()
        .optional()
        .describe("The file path of the resolved SKILL.md"),
    }),
  });
};
