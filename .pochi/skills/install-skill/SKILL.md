---
name: install-skill
description: Installs an agent skill from a GitHub repository or URL into the project or user-level skills directory. Use when the user wants to add a community skill or a skill from an external source.
---

# Install Skill

This skill installs a community or external skill into the `.pochi/skills/` directory without requiring any external CLI tools.

## What is a Skill?

A skill is a SKILL.md file in `.pochi/skills/<skill-name>/SKILL.md` that guides agent behavior for a specific domain or task. Community skills are hosted on GitHub and browsable at https://skills.sh/.

## Workflow

### Step 1: Identify the Skill to Install

Gather from the user:
1. The skill name or GitHub repo reference (e.g., `vercel-labs/agent-skills@vercel-react-best-practices`)
2. A direct URL to the SKILL.md file (if known)
3. Whether to install project-level (`.pochi/skills/`) or user-level (`~/.pochi/skills/`)

If no URL is provided, search for the skill on GitHub:

```bash
# Search for skills matching a query
curl -s "https://api.github.com/search/code?q=<query>+filename:SKILL.md" \
  -H "Accept: application/vnd.github.v3+json" | jq '.items[] | {path: .path, repo: .repository.full_name, url: .html_url}'
```

### Step 2: Resolve the Raw URL

Convert the GitHub URL to a raw content URL:

- GitHub URL: `https://github.com/<owner>/<repo>/blob/<branch>/<path>/SKILL.md`
- Raw URL: `https://raw.githubusercontent.com/<owner>/<repo>/<branch>/<path>/SKILL.md`

For `@`-style references (e.g., `owner/repo@skill-name`):
```
https://raw.githubusercontent.com/<owner>/<repo>/main/<skill-name>/SKILL.md
```

### Step 3: Download and Install

**Project-level installation** (recommended — scoped to this project):

```bash
SKILL_NAME="<skill-name>"
RAW_URL="<raw-github-url>"

mkdir -p ".pochi/skills/${SKILL_NAME}"
curl -fsSL "${RAW_URL}" -o ".pochi/skills/${SKILL_NAME}/SKILL.md"
echo "Installed skill '${SKILL_NAME}' to .pochi/skills/${SKILL_NAME}/SKILL.md"
```

**User-level installation** (available across all projects):

```bash
SKILL_NAME="<skill-name>"
RAW_URL="<raw-github-url>"

mkdir -p "${HOME}/.pochi/skills/${SKILL_NAME}"
curl -fsSL "${RAW_URL}" -o "${HOME}/.pochi/skills/${SKILL_NAME}/SKILL.md"
echo "Installed skill '${SKILL_NAME}' to ~/.pochi/skills/${SKILL_NAME}/SKILL.md"
```

### Step 4: Install Supporting Files (if any)

Some skills include additional assets (scripts, references, templates). Check if the skill has a directory structure:

```bash
# List files in the skill's GitHub directory
curl -s "https://api.github.com/repos/<owner>/<repo>/contents/<path>" \
  -H "Accept: application/vnd.github.v3+json" | jq '.[].name'
```

Download additional files as needed into the skill directory.

### Step 5: Verify Installation

```bash
# Confirm the skill is installed and readable
cat ".pochi/skills/${SKILL_NAME}/SKILL.md"
```

Check:
- The file has valid YAML frontmatter (`name` and `description` fields)
- The instructions are complete and not truncated

## Example: Installing a Community Skill

To install `vercel-labs/agent-skills@vercel-react-best-practices`:

```bash
mkdir -p .pochi/skills/vercel-react-best-practices
curl -fsSL "https://raw.githubusercontent.com/vercel-labs/agent-skills/main/vercel-react-best-practices/SKILL.md" \
  -o .pochi/skills/vercel-react-best-practices/SKILL.md
```

## Skill Directory Layout

```
.pochi/
  skills/
    <skill-name>/
      SKILL.md          # Required: main skill instructions
      scripts/          # Optional: executable scripts
      references/       # Optional: reference documentation
      assets/           # Optional: templates, schemas, data files
```

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `curl` returns 404 | Check the raw URL path and branch name (try `main` vs `master`) |
| Frontmatter missing | Edit the SKILL.md to add `name` and `description` fields |
| Skill not discovered | Ensure the file is at `.pochi/skills/<name>/SKILL.md` exactly |
| Permission denied | Check directory permissions with `ls -la .pochi/skills/` |
