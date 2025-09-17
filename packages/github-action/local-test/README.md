# Pochi GitHub Action Local Testing

This directory contains tools and scripts for testing the Pochi GitHub Action locally using [act](https://github.com/nektos/act).

## Prerequisites

1. Install `act`:

   - macOS: `brew install act`
   - Linux: `curl https://raw.githubusercontent.com/nektos/act/master/install.sh | sudo bash`
   - Windows: Download from [GitHub releases](https://github.com/nektos/act/releases)

2. Install Docker (required by act)

3. Set up your API keys:

   ```bash
   cp act-secrets.env.example act-secrets.env
   # Edit act-secrets.env and add your keys
   ```

   **API Keys needed:**

   - **POCHI_API_KEY**: Get from [getpochi.com](https://getpochi.com) → Profile → API Keys
   - **GITHUB_TOKEN**: Run `gh auth token` (requires GitHub CLI) or create a [personal access token](https://github.com/settings/tokens)

   **Quick setup with GitHub CLI:**

   ```bash
   cp act-secrets.env.example act-secrets.env
   echo "GITHUB_TOKEN=$(gh auth token)" >> act-secrets.env
   # Then manually add your POCHI_API_KEY to the file
   ```

## Quick Start

### Basic usage

```bash
./run-local-test.sh "your instruction here"
```

### With debug output

```bash
./run-local-test.sh "your instruction here" --debug
```

## File Structure

- `act-event.json` - Mock GitHub issue_comment event
- `act-secrets.env.example` - Template for environment variables
- `run-local-test.sh` - Main test script
- `fetch-pr-event.sh` - Script to fetch real PR event data for testing
- `test-workflows/` - Custom workflow files for testing
  - `test-pochi-dev.yml` - Workflow that uses local code for development

## How It Works

1. The script creates a mock GitHub event with your custom instruction
2. It runs `act` with the appropriate workflow file
3. Act simulates the GitHub Actions environment locally
4. The Pochi action processes your instruction

## Options

- `--debug` - Enable verbose output from act
- `--workflow FILE` - Use a custom workflow file

## Advanced Usage

### Fetch Real PR Event Data

You can fetch real PR event data from GitHub to test with actual PR information. This is useful for testing GitHub-related operations locally:

```bash
# Fetch PR event data using a PR comment URL
./fetch-pr-event.sh https://github.com/Sma1lboy/pochi/pull/34#issuecomment-3301070409

# Then run the local test
./run-local-test.sh "your instruction here"
```

This script helps you:
- Fetch real PR data to enable local testing of `gh` commands
- Test with actual repository and PR information
- Simulate real GitHub Actions environment locally

### Custom Event JSON

You can also manually modify `act-event.json` to simulate different GitHub events:

- Different issue numbers
- Different repository names
- Pull request comments (change event type)

### Custom Workflows

Create new workflow files in `test-workflows/` to test different configurations:

- Different runners (ubuntu, macos, windows)
- Different permissions
- Multiple jobs
- Conditional steps
