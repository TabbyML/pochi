# Contributing to Pochi

We welcome and appreciate contributions from the community!

## How to Contribute

### Feature Requests and Bug Reports

To report a bug or request a feature, the preferred method is to use the `/create-issue` command within the Pochi VS Code extension. This command utilizes a workflow defined in this repository to provide richer context, which helps us resolve issues faster.

## What to Work On

We maintain a list of issues that are good starting points for new contributors:

- Look for issues labeled [`good first issue`](https://github.com/TabbyML/pochi/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) on our GitHub repository

Before starting work on an issue, please comment on it to let others know you're interested in working on it. This helps avoid duplicate efforts.

We also welcome contributions to our documentation, which is located in the [`packages/docs/content/docs`](https://github.com/TabbyML/pochi/tree/main/packages/docs/content/docs) directory.

### Development Workflow

1.  **Install dependencies:**
    ```bash
    bun install
    ```
2.  **Launch the development environment:**
    Open the `Run and Debug` panel in VS Code and run the `Run VSCode Extension` task. This will open a new VS Code window with the extension loaded and ready for development.

For local development, Pochi uses `dev-config.jsonc` as its configuration file.
This prevents accidentally overriding your production configuration while developing.

## Agreement

By submitting a pull request, you agree that your contributions will be licensed under the Apache License 2.0. a copy of which is available in the `LICENSE` file in the root of the repository.
