# Pochi GitHub Action

AI-powered GitHub Action that responds to PR comments with intelligent code analysis and suggestions.

## 🚀 One-Line Installation

Install Pochi GitHub Action to your repository instantly:

```bash
# Run this command in your repository root directory
curl -sSL https://raw.githubusercontent.com/tabbyml/pochi/main/packages/github-action/scripts/install | bash
```

This command will:
- Auto-detect your repository owner and name
- Create `.github/workflows/pochi.yml` workflow file
- Provide setup instructions for required secrets

## Usage

### Basic Setup

1. **Add to your workflow** (`.github/workflows/pochi.yml`):

```yaml
name: pochi AI Assistant

on:
  issue_comment:
    types: [created]

permissions:
  contents: read
  issues: write
  pull-requests: write

jobs:
  pochi:
    if: github.event.issue.pull_request
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Run pochi
        uses: tabbyml/pochi/packages/github-action@action@latest
        with:
          pochi_token: ${{ secrets.POCHI_TOKEN }}
```

### Required Setup

1. **Get your pochi token**:
   - Visit [getpochi.com](https://getpochi.com)
   - Sign in and get your session token
2. **Add to GitHub Secrets**:
   - Go to your repository Settings → Secrets and variables → Actions
   - Add `POCHI_TOKEN` with your pochi session token

### How to Use

1. **Create a Pull Request** in your repository
2. **Comment on the PR** with `/pochi` followed by your request:
   - `/pochi review this code`
   - `/pochi explain the changes in this PR`
   - `/pochi suggest improvements`

The action will respond with AI-generated analysis and suggestions!

## Configuration

### Inputs

| Input         | Description         | Required | Default |
| ------------- | ------------------- | -------- | ------- |
| `pochi_token` | pochi session token | Yes      | -       |

### Permissions Required

The action needs these permissions to function:

```yaml
permissions:
  contents: read # Read repository contents
  issues: write # Comment on issues/PRs
  pull-requests: write # Access PR information
```

## Examples

### Advanced Workflow

```yaml
name: pochi AI Code Review

on:
  issue_comment:
    types: [created]

permissions:
  contents: read
  issues: write
  pull-requests: write

jobs:
  pochi-review:
    if: |
      github.event.issue.pull_request && 
      contains(github.event.comment.body, '/pochi')
    runs-on: ubuntu-latest
    steps:
      - name: Checkout PR
        uses: actions/checkout@v4
        with:
          token: ${{ secrets.GITHUB_TOKEN }}

      - name: pochi AI Assistant
        uses: tabbyml/pochi/packages/github-action@action@latest
        with:
          pochi_token: ${{ secrets.POCHI_TOKEN }}
```

### Custom Token

If you need to use a custom GitHub token (for cross-repo operations):

```yaml
- name: pochi AI Assistant
  uses: tabbyml/pochi/packages/github-action@action@latest
  with:
    pochi_token: ${{ secrets.POCHI_TOKEN }}
    token: ${{ secrets.CUSTOM_GITHUB_TOKEN }}
```

## Features

- 🤖 **AI-powered code analysis** using advanced language models
- 💬 **PR comment integration** - responds naturally to comment requests
- 🔍 **Context-aware** - understands full PR context including files, changes, and previous comments
- 🚀 **Easy setup** - minimal configuration required
- 🔒 **Secure** - uses GitHub's built-in token system

## Supported Commands

- `/pochi` - Basic command trigger (summarizes the PR)

## Troubleshooting

### Action doesn't respond

1. Check that the PR comment contains `/pochi`
2. Verify `POCHI_TOKEN` is set in repository secrets
3. Ensure workflow has correct permissions
4. Check workflow runs in Actions tab

### Permission errors

Make sure your workflow includes:

```yaml
permissions:
  contents: read
  issues: write
  pull-requests: write
```

## License

MIT License - see [LICENSE](LICENSE) file.
