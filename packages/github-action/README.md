# Pochi GitHub Action

AI-powered GitHub Action that responds to PR comments with intelligent code analysis and suggestions.

## Documentation

For complete setup and configuration instructions, see: https://docs.getpochi.com/github

## Usage

### Quick Start

Add this workflow to `.github/workflows/pochi.yml`:

```yaml
name: pochi

on:
  issue_comment:
    types: [created]

jobs:
  pochi:
    if: startsWith(github.event.comment.body, '/pochi')
    runs-on: ubuntu-latest
    permissions:
      contents: write
      issues: write
      pull-requests: write
    steps:
      - uses: actions/checkout@v4
      - uses: tabbyml/pochi/packages/github-action@main
        env:
          POCHI_API_KEY: ${{ secrets.POCHI_API_KEY }}
```

Set up your `POCHI_API_KEY` secret and you're ready to go!

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
| `pochi_api_key` | pochi API key | Yes      | -       |

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
        uses: tabbyml/pochi/packages/github-action@main
        env:
          POCHI_API_KEY: ${{ secrets.POCHI_API_KEY }}
```

### Custom Token

If you need to use a custom GitHub token (for cross-repo operations):

```yaml
- name: pochi AI Assistant
  uses: tabbyml/pochi/packages/github-action@main
  env:
    POCHI_API_KEY: ${{ secrets.POCHI_API_KEY }}
    GITHUB_TOKEN: ${{ secrets.CUSTOM_GITHUB_TOKEN }}
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

1. Check that the PR comment starts with `/pochi`
2. Verify `POCHI_API_KEY` is set in repository secrets
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
