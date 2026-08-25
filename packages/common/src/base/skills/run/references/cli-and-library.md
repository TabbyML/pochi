# CLI and library runtimes

## CLI

Run the built artifact or documented executable through its real command entrypoint. Do not replace the CLI with an import of an internal function.

1. Locate the executable entrypoint and required build/install step.
2. Run one representative happy-path command.
3. Exercise stdin when the command accepts it.
4. Capture stdout, stderr, and the exit status when it carries meaning.
5. Run `--help` or `--version` only as a startup check; it does not prove the requested feature works.

Prefer a temporary output directory for commands that write files. Use a documented dry-run or sandbox mode for commands that publish, delete, send, or mutate remote state. If no safe target exists, do not execute the destructive path.

## Library or SDK

Use the public package boundary that a consumer imports:

1. Build or install the package as a consumer would.
2. Create a temporary sample outside the source tree when practical.
3. Import the package by its public name or public export.
4. Perform one meaningful operation and capture the result.

Do not import a private file under `src/` to claim the library works. That only exercises an implementation detail.

## Evidence

Include the exact invocation and a short output excerpt. If a generated file is the result, inspect the file rather than reporting only that the command exited successfully.
