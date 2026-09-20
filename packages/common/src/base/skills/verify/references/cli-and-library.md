# Verify a CLI or library

## CLI

Invoke the real executable with arguments that reach the changed branch.

Capture:

- the exact command;
- stdout and stderr;
- exit status when meaningful;
- output files after inspecting their contents.

Include a nearby probe such as an omitted value, malformed input, repeated flag, stdin edge case, or invocation without the new option. Use a temporary directory or dry-run mode for commands with side effects.

## Library

Exercise the package through its public consumer import, not an internal source file. Build or install it as a consumer would, then run a small temporary program that performs the changed operation.

Capture the input and observable result. If the change concerns serialization or generated output, parse or inspect that output rather than relying only on process success.
