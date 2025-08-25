# Pochi Cli

## Development Setup

To use the `pochi` command to run the local development version of the script in `packages/cli`, run the following command:

```bash
bun link --cwd packages/cli
```

**Note:** Ensure that `~/.bun/bin` is in your system's `PATH`.

```bash
export PATH="${HOME}/.bun/bin:$PATH"
```

After setup, you can use the `pochi` command from any directory.

## Dependencies

- **ripgrep**:
  - Install it globally: `brew install ripgrep`
  - Alternatively, you can provide the path to the `ripgrep` binary using the `--rg` option.

## Authentication

You can provide your authentication token in one of the following ways, listed in order of priority:

1.  **CLI Option:** Use the `--token` flag.
2.  **Environment Variable:** Set the `POCHI_SESSION_TOKEN` environment variable.
3.  **Credential File:** A `credentials.json` file at `~/.pochi/credentials.json`. This file is automatically created when you log in through the Pochi VSCode extension.

## Usage

### Creating a New Task

You can create a new task by providing a prompt directly from the command line:

```bash
pochi -p "Explain this project."
# or
pochi --prompt "Review the changes in this branch."
```

### Creating a New Task by Piping a Prompt

You can also pipe the content of a file to create a new task:

```bash
cat .pochi/workflows/create-pr.md | pochi
```

### Running an Existing Task

To run a previously created task, use its task uid:

```bash
pochi --task <task_uid>
# or
POCHI_TASK_ID=<task_uid> pochi
```

### Logging

You can set the log level for debugging. All logs are written to `stderr`, so you can redirect the output to a file:

```bash
POCHI_LOG=debug pochi -p "Update the README file with recent changes." 2>pochi.log
```

### Using a Local Development Server

For development, you can point the runner to a local server:

```bash
POCHI_LOG=debug pochi --url http://localhost:4113 -p "Explain this project." 2>pochi.log
```

## Other Options

### Specifying Maximum Steps

Limit the number of steps a task can execute:

```bash
pochi --max-rounds 20 --max-retries 5 -p "Explain this project."
```

### Getting Help

For a full list of available options, use the `--help` command:

```bash
pochi --help
```
