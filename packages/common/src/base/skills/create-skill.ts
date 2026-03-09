import type { Skill } from "@getpochi/tools";

export const createSkill: Skill = {
  name: "create-skill",
  description:
    "Helps users create new custom agent skills. Use when the user wants to create a new skill, automate a workflow, or package specialized knowledge for reuse.",
  filePath: "_builtIn_",
  instructions: `# Create Skill

This skill guides you through authoring a new Pochi skill from scratch and saving it to the project or user-level skills directory.

## When to Use This Skill

Invoke this skill when the user:

- Says "create a skill", "make a skill", or "add a skill"
- Wants to package a recurring workflow into a reusable skill
- Says "turn this into a skill" after completing a task
- Wants to automate something they do repeatedly

## Anatomy of a Skill

Every skill lives in its own directory and requires at minimum a \`SKILL.md\` file:

\`\`\`
<skill-name>/
├── SKILL.md          (required)
└── references/       (optional) - on-demand documentation loaded into context
    └── REFERENCE.md
\`\`\`

The \`SKILL.md\` file has two parts:

1. **YAML frontmatter** (between \`---\` delimiters): metadata fields
2. **Markdown body**: the instructions the agent follows when the skill is invoked

### Frontmatter Fields

\`\`\`yaml
---
name: my-skill           # required: kebab-case identifier
description: |           # required: when to trigger and what it does
  One or two sentences. Include specific trigger phrases.
compatibility: node      # optional: runtime requirements (node, python, bun, etc.)
---
\`\`\`

**Description writing tips:**
- Include both what the skill does AND when to use it
- List concrete trigger phrases (e.g. "Use when the user says 'deploy to staging'")
- Be slightly "pushy" — err on the side of triggering when in doubt, rather than missing opportunities

### Body Structure

The body is markdown that the agent reads and follows when the skill triggers. Keep it:
- Under 500 lines for fast loading
- Action-oriented (use imperative form: "Run X", "Ask the user Y")
- Focused on the workflow, not explanations of why

## Skill Creation Workflow

### Step 1: Gather Requirements

Ask the user:
1. What should the skill enable the agent to do?
2. When should the skill trigger? (What phrases/contexts?)
3. What tools does the skill need? (file access, shell commands, etc.)
4. Project-level (\`.pochi/skills/\`) or user-level (\`~/.pochi/skills/\`)? Default to project-level.

If the user says "turn this into a skill" after a task, extract the workflow from the conversation history first — tools used, sequence of steps, any corrections — then confirm with the user before writing.

### Step 2: Draft the SKILL.md

Based on the gathered requirements, write the complete \`SKILL.md\`:

\`\`\`markdown
---
name: <kebab-case-name>
description: |
  <What it does and when to trigger. Include specific user phrases.>
allowed-tools: <space-separated tool names if restricted>
---

# <Skill Title>

<Brief intro: what this skill does and the outcome it produces>

## Workflow

### Step 1: <First action>
<Instructions...>

### Step 2: <Second action>
<Instructions...>

## Notes
<Edge cases, tips, or important constraints>
\`\`\`

### Step 3: Review with the User

Show the draft to the user and ask:
- Does this capture the workflow correctly?
- Are there edge cases to handle?
- Any tool restrictions to add?

Revise based on feedback.

### Step 4: Write the Files

Determine the target directory:
- **Project-level**: \`.pochi/skills/<skill-name>/SKILL.md\` (relative to workspace root)
- **User-level**: \`~/.pochi/skills/<skill-name>/SKILL.md\`

Write the \`SKILL.md\` using the \`writeToFile\` tool.

If the user mentioned reference docs or templates, create them in subdirectories:
- \`references/\` for documentation loaded on demand
- \`assets/\` for static files (templates, schemas)

### Step 5: Confirm

Tell the user:
- Where the skill was saved
- How to trigger it (the description/trigger phrases)
- That Pochi will automatically pick it up without restarting

## Skill Writing Patterns

### Output Format Pattern
\`\`\`markdown
## Output format
ALWAYS use this exact structure:
# [Title]
## Summary
## Details
\`\`\`

### Example Pattern
\`\`\`markdown
## Examples
**Input**: User asks "deploy to staging"
**Output**: Runs \`./deploy.sh staging\` and reports the result
\`\`\`

## Skill Locations

| Scope   | Path                              | Visible to          |
|---------|-----------------------------------|---------------------|
| Project | \`.pochi/skills/<name>/SKILL.md\`  | This workspace only |
| User    | \`~/.pochi/skills/<name>/SKILL.md\`| All workspaces      |

## Reserved Skill Names

The following names are reserved for built-in Pochi skills and cannot be used for custom skills:

- \`find-skills\`
- \`create-skill\`
- \`validator\`
- \`create-issue\``,
};
