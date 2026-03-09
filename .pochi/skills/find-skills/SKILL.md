---
name: find-skills
description: Helps users discover and install agent skills when they ask questions like "how do I do X", "find a skill for X", "is there a skill that can...", or express interest in extending capabilities. This skill should be used when the user is looking for functionality that might exist as an installable skill.
---

# Find Skills

This skill helps you discover and install skills from the open agent skills ecosystem.

## When to Use This Skill

Use this skill when the user:

- Asks "how do I do X" where X might be a common task with an existing skill
- Says "find a skill for X" or "is there a skill for X"
- Asks "can you do X" where X is a specialized capability
- Expresses interest in extending agent capabilities
- Wants to search for tools, templates, or workflows
- Mentions they wish they had help with a specific domain (design, testing, deployment, etc.)

## What are Skills?

Skills are modular instruction files (SKILL.md) stored in `.pochi/skills/<skill-name>/SKILL.md` that extend agent capabilities with specialized knowledge, workflows, and tools. They are plain Markdown files with YAML frontmatter.

**Skills are stored in:**
- Project-level: `.pochi/skills/<skill-name>/SKILL.md` (current working directory)
- User-level: `~/.pochi/skills/<skill-name>/SKILL.md` (global, available in all projects)

**Browse community skills at:** https://skills.sh/

## How to Help Users Find Skills

### Step 1: Understand What They Need

When a user asks for help with something, identify:

1. The domain (e.g., React, testing, design, deployment)
2. The specific task (e.g., writing tests, creating animations, reviewing PRs)
3. Whether this is a common enough task that a skill likely exists

### Step 2: Search for Skills

Search for community skills using the GitHub API or by browsing https://skills.sh/. You can use `curl` to query the GitHub API:

```bash
# Search for skills repositories
curl -s "https://api.github.com/search/repositories?q=agent-skills+topic:pochi-skill&sort=stars" | jq '.items[] | {name: .full_name, description: .description, stars: .stargazers_count}'

# Or browse known community skill repositories
curl -s "https://api.github.com/repos/vercel-labs/agent-skills/contents/" | jq '.[].name'
```

Alternatively, guide the user to browse https://skills.sh/ for available skills.

### Step 3: Install Skills

To install a skill from a GitHub repository, use the `install-skill` skill or follow these steps manually:

1. Find the raw SKILL.md URL from the repository (e.g., `https://raw.githubusercontent.com/<owner>/<repo>/main/<path>/SKILL.md`)
2. Download and save it to the appropriate skills directory:

```bash
# Install to project-level (current project only)
mkdir -p .pochi/skills/<skill-name>
curl -s "<raw-skill-url>" -o .pochi/skills/<skill-name>/SKILL.md

# Install to user-level (available globally)
mkdir -p ~/.pochi/skills/<skill-name>
curl -s "<raw-skill-url>" -o ~/.pochi/skills/<skill-name>/SKILL.md
```

### Step 4: Present Options to the User

When you find relevant skills, present them to the user with:

1. The skill name and what it does
2. The install command (using `curl` or the `install-skill` skill)
3. A link to learn more at skills.sh

Example response:

```
I found a skill that might help! The "vercel-react-best-practices" skill provides
React and Next.js performance optimization guidelines from Vercel Engineering.

To install it at the project level:
mkdir -p .pochi/skills/vercel-react-best-practices
curl -s "https://raw.githubusercontent.com/vercel-labs/agent-skills/main/vercel-react-best-practices/SKILL.md" \
  -o .pochi/skills/vercel-react-best-practices/SKILL.md

Learn more: https://skills.sh/vercel-labs/agent-skills/vercel-react-best-practices
```

## Common Skill Categories

When searching, consider these common categories:

| Category        | Example Queries                          |
| --------------- | ---------------------------------------- |
| Web Development | react, nextjs, typescript, css, tailwind |
| Testing         | testing, jest, playwright, e2e           |
| DevOps          | deploy, docker, kubernetes, ci-cd        |
| Documentation   | docs, readme, changelog, api-docs        |
| Code Quality    | review, lint, refactor, best-practices   |
| Design          | ui, ux, design-system, accessibility     |
| Productivity    | workflow, automation, git                |

## Tips for Effective Searches

1. **Use specific keywords**: "react testing" is better than just "testing"
2. **Try alternative terms**: If "deploy" doesn't work, try "deployment" or "ci-cd"
3. **Check popular sources**: Many skills come from `vercel-labs/agent-skills` or `ComposioHQ/awesome-claude-skills`

## When No Skills Are Found

If no relevant skills exist:

1. Acknowledge that no existing skill was found
2. Offer to help with the task directly using your general capabilities
3. Suggest the user could create their own skill using the `create-skill` built-in skill

Example:

```
I searched for skills related to "xyz" but didn't find any matches.
I can still help you with this task directly! Would you like me to proceed?

If this is something you do often, you could create your own custom skill.
Ask me to use the "create-skill" skill to help you build one.
```
