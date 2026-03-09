---
name: create-skill
description: Helps users create new custom agent skills. Use when the user wants to create a new skill, automate a workflow, or package specialized knowledge for reuse.
---

# Create Skill

This skill guides you through creating a new custom agent skill stored in `.pochi/skills/`.

## What is a Skill?

A skill is a SKILL.md file placed in `.pochi/skills/<skill-name>/SKILL.md`. It contains:
- A YAML frontmatter block with `name` and `description`
- Markdown instructions that guide the agent when the skill is invoked

Skills can be:
- **Project-level**: `.pochi/skills/<skill-name>/SKILL.md` — available only in this project
- **User-level**: `~/.pochi/skills/<skill-name>/SKILL.md` — available globally across all projects

## Workflow

### Step 1: Understand the Skill's Purpose

Ask the user (or infer from context):
1. What task should this skill automate or assist with?
2. What domain does it cover? (e.g., testing, documentation, deployment)
3. Should it be project-level or user-level?
4. What steps should the agent follow when executing this skill?

### Step 2: Choose a Skill Name

- Use kebab-case (e.g., `create-changelog`, `review-pr`, `deploy-staging`)
- Should be short, descriptive, and unique
- Avoid generic names like `helper` or `utils`

### Step 3: Create the Skill File

Create the skill file at the appropriate location:

**Project-level skill:**
```bash
mkdir -p .pochi/skills/<skill-name>
```

**User-level skill:**
```bash
mkdir -p ~/.pochi/skills/<skill-name>
```

### Step 4: Write the SKILL.md

Use this template as a starting point:

```markdown
---
name: <skill-name>
description: <One sentence description of what this skill does and when to use it>
---

# <Skill Title>

<Brief overview of what this skill does>

## When to Use This Skill

Use this skill when:
- <trigger condition 1>
- <trigger condition 2>

## Workflow

### Step 1: <First step>

<Instructions for the agent>

### Step 2: <Second step>

<Instructions for the agent>

## Notes

- <Any important caveats or tips>
```

### Step 5: Verify the Skill

After creating the skill, confirm:
1. The file is at the correct path
2. The YAML frontmatter is valid (name and description fields present)
3. The instructions are clear and actionable for an agent

```bash
# Verify the file exists and is readable
cat .pochi/skills/<skill-name>/SKILL.md
```

## Example Skills

### Example: `create-changelog` skill

```markdown
---
name: create-changelog
description: Generates a CHANGELOG.md entry from recent git commits. Use when releasing a new version.
---

# Create Changelog

Generates a formatted CHANGELOG.md entry from recent git commits.

## Workflow

### Step 1: Get recent commits

Run:
\`\`\`bash
git log --oneline --since="last week"
\`\`\`

### Step 2: Group by type

Categorize commits into: Features, Bug Fixes, Breaking Changes.

### Step 3: Write the entry

Append to CHANGELOG.md with the version and date header.
```

## Tips for Writing Good Skills

1. **Be specific**: Vague instructions lead to inconsistent behavior
2. **Include examples**: Show the agent what good output looks like
3. **Add error handling**: Document what to do when steps fail
4. **Keep it focused**: One skill, one purpose — avoid Swiss Army knife skills
5. **Use code blocks**: Format commands and file content in fenced code blocks
6. **Reference tools**: Mention specific tools (git, gh, curl, etc.) the agent should use
