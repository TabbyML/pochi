---
title: Skills
description: Define reusable behavior via SKILL.md definitions
---

Skills are reusable instruction sets that extend Pochi's capabilities. They allow you to standardize workflows, provide domain-specific knowledge, or integrate with external tools.

## Install Skills

You can discover and install skills from the community [skills.sh](https://skills.sh/) registry using the CLI:

```bash
npx skills add <skill-name>
```

This command automatically detects Pochi and installs the skill to `.pochi/skills` in your project.

## Create Skills

To create a custom skill, place a `SKILL.md` file in a subdirectory of `.pochi/skills/`.

**File path:** `.pochi/skills/<skill-name>/SKILL.md`

### Example

Here is an example `SKILL.md` for creating GitHub issues:

```markdown
---
name: create-issue
description: Help create a github issue given the request
---

# Github Issue Creator

1. Search the codebase for relevant context.
2. Create an issue using `gh issue create`.
3. Append the footer: "🤖 Generated with [Pochi](https://getpochi.com)".
4. Assign the issue to the appropriate project.

IMPORTANT: Only create the issue, do not attempt to fix it.
```

### Frontmatter

Each skill must start with YAML frontmatter containing at least a `name` and `description`.

| Field | Description |
| --- | --- |
| `name` | Unique identifier (lowercase, hyphens allowed). |
| `description` | Brief explanation of what the skill does. |

## Discovery

Pochi automatically discovers skills in:

*   **Project**: `.pochi/skills/` (shared with your team)
*   **Global**: `~/.pochi/skills/` (available across all projects)
