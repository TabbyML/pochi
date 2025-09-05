# Pochi GitHub Action

AI-powered GitHub Action that responds to PR comments with intelligent code analysis and suggestions.

## 🚀 Quick Start

Install Pochi GitHub Action to your repository instantly:

```bash
# Run this command in your repository root directory
curl -sSL https://raw.githubusercontent.com/tabbyml/pochi/main/packages/github-action/scripts/install | bash
```

This command will:
- Auto-detect your repository owner and name
- Create `.github/workflows/pochi.yml` workflow file
- Provide setup instructions for required secrets

## 📋 Prerequisites

Before using the Pochi GitHub Action, you need:

1. **A Pochi account**: Visit [getpochi.com](https://getpochi.com) to create an account
2. **A Pochi session token**: Obtain this from your Pochi dashboard
3. **Write permissions** to the repository where you want to install the action

## ⚙️ Setup Instructions

### 1. Get Your Pochi Token

1. Visit [getpochi.com](https://getpochi.com)
2. Sign in to your account
3. Navigate to the settings or token management page
4. Copy your session token

### 2. Add Token to GitHub Secrets

1. Go to your repository **Settings**
2. Click **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Name it `POCHI_TOKEN`
5. Paste your Pochi session token as the value
6. Click **Add secret**

### 3. Configure Workflow Permissions

The action requires these permissions to function properly:

```yaml
permissions:
  contents: read    # Read repository contents
  issues: write     # Comment on issues/PRs
  pull-requests: write  # Access PR information
```

## 🛠️ Usage

### Basic Setup

Add this workflow file to your repository at `.github/workflows/pochi.yml`:

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

### How to Use

1. **Create a Pull Request** in your repository
2. **Comment on the PR** with `/pochi` followed by your request:
   - `/pochi review this code`
   - `/pochi explain the changes in this PR`
   - `/pochi suggest improvements`
   - `/pochi check for security issues`
   - `/pochi help` - Get usage instructions

The action will respond with AI-generated analysis and suggestions!

## ⚙️ Configuration

### Action Inputs

| Input         | Description               | Required | Default |
|---------------|---------------------------|----------|---------|
| `pochi_token` | Your Pochi session token  | Yes      | -       |
| `model`       | AI model to use for tasks | No       | Default model |

### Environment Variables

The action also respects these environment variables:

| Variable        | Description              | Default |
|-----------------|--------------------------|---------|
| `POCHI_MODEL`   | Override default model   | -       |

### Advanced Workflow Configuration

For more control over when the action runs:

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
    # Only run when comment contains '/pochi'
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
          model: gpt-4 # Specify a custom model
```

### Custom GitHub Token

If you need to use a custom GitHub token (for cross-repo operations):

```yaml
- name: pochi AI Assistant
  uses: tabbyml/pochi/packages/github-action@action@latest
  with:
    pochi_token: ${{ secrets.POCHI_TOKEN }}
  env:
    GITHUB_TOKEN: ${{ secrets.CUSTOM_GITHUB_TOKEN }}
```

## 🎯 Features

- 🤖 **AI-powered code analysis** using advanced language models
- 💬 **PR comment integration** - responds naturally to comment requests
- 🔍 **Context-aware** - understands full PR context including files, changes, and previous comments
- 🚀 **Easy setup** - minimal configuration required
- 🔒 **Secure** - uses GitHub's built-in token system
- 🔄 **Real-time updates** - shows progress during execution
- 📊 **Detailed output** - provides comprehensive analysis results

## 📝 Supported Commands

- `/pochi` - Basic command trigger (summarizes the PR)
- `/pochi review` - Code review of changes
- `/pochi explain` - Explanation of the code changes
- `/pochi suggest` - Suggestions for improvements
- `/pochi check` - Security and best practice checks
- `/pochi help` - Show help information

## 📸 Example Workflow

Here's what using Pochi looks like in practice:

1. **Comment on a PR**: 
   ![Commenting on a PR with /pochi review](https://raw.githubusercontent.com/tabbyml/pochi/main/packages/docs/content/assets/images/github-comment-example.png)

2. **Pochi starts working**: 
   ![Pochi working indicator](https://raw.githubusercontent.com/tabbyml/pochi/main/packages/docs/content/assets/images/github-working-example.png)

3. **Receive detailed feedback**: 
   ![Pochi detailed feedback](https://raw.githubusercontent.com/tabbyml/pochi/main/packages/docs/content/assets/images/github-feedback-example.png)

## � troubleshoot Troubleshooting

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

### Token issues

1. Ensure your `POCHI_TOKEN` is valid and not expired
2. Check that the token has been correctly added to GitHub Secrets
3. Verify the token has necessary permissions for your repository

### Model errors

If specifying a custom model:
1. Ensure the model name is correct
2. Verify your Pochi account has access to that model
3. Check that the model supports the requested operations

## 🔧 Development

To develop and test the GitHub Action locally:

1. Clone the repository
2. Install dependencies with `bun install`
3. Run tests with `bun run test`

## 📄 License

MIT License - see [LICENSE](LICENSE) file.