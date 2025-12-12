# Pochi

<p align="center">
  <img src="https://github.com/TabbyML/pochi/blob/main/packages/vscode/assets/icons/logo128.png?raw=true" alt="Pochi Logo" width="128"/>
</p>

<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=TabbyML.pochi"><img alt="Visual Studio Marketplace Version" src="https://img.shields.io/visual-studio-marketplace/v/tabbyml.pochi"></a>
  <a href="https://codecov.io/github/TabbyML/pochi"><img src="https://codecov.io/github/TabbyML/pochi/graph/badge.svg?token=VV9JGSXAWI" alt="Codecov" /></a>
</p>

<p align="center">
  Install from <a href="https://marketplace.visualstudio.com/items?itemName=TabbyML.pochi"><strong>VS Code Marketplace</strong></a> or <a href="https://open-vsx.org/extension/TabbyML/pochi"><strong>Open VSX Registry</strong></a>
</p>

## Pochi: Open-Source AI Code Agent as Your Full-Stack Teammate

**[Pochi](https://www.tabbyml.com/agent)** is an AI agent designed for software development. It operates within your IDE, using a toolkit of commands to execute complex tasks, from code generation to project-wide refactoring.

<img width="4320" height="2694" alt="readme-pochi" src="https://github.com/user-attachments/assets/d67f52ea-b9fd-40a6-b04b-2619ce1aa102" />


## How it works?

Pochi's workflow is built on these principles:

- **Agent-Based Workflow**: You assign a task, and Pochi works autonomously to complete it. It can read files, execute commands, and apply changes to your codebase.

- **Flexible & Extensible**: Pochi's functionality is centered around a **Bring Your Own Key (BYOK)** model. This allows you to connect any supported LLM provider, giving you full control over the agent's "brain," your data privacy, and operational costs. No account is required to use the BYOK model.

- **Cloud Services**: For teams that need collaborative features, we offer account-based services like shared task list, group billing. These services are optional and build upon the core functionality.

## Features

- **Tab Completion**: Get intelligent, context-aware completions powered by Pochi’s internal trained model. It adapts to your coding patterns in real-time, using recent edits, diagnostics, and surrounding context to generate accurate, relevant suggestions as you type.

- **Bring Your Own Model**: Pochi supports custom AI models, including your own fine-tuned or self-hosted models. Fully control the model, the data, and the compute costs.

- **Tool Usage**: Pochi has access to a set of tools that allow it to interact with your development environment, such as reading and writing files, executing commands, and searching your codebase.

- **Parallel Agents:** Keep tasks fully isolated by running each one in its own Git worktree. You can keep multiple tasks active at once and switch between them without stashing or losing context.

- **Deep GitHub Integration**: Get your GitHub issues implemented by connecting them to Pochi tasks and create PRs directly from the sidebar with a breakdown of CI/Lint/Test results. Also, use Pochi directly in your GitHub repository by commenting on pull requests to perform code reviews, explain changes, and suggest improvements.

- **Auto Compact**:  Keep long conversations efficient by compacting in the current task or start a new task with the summary when your token usage grows large

## Documentation

For full documentation, visit **[docs.getpochi.com](https://docs.getpochi.com/)**

To keep up with the latest updates, visit our **[changelog](https://docs.getpochi.com/developer-updates/)**

## Getting Started

- **Install the Extension**: Install the Pochi extension from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=TabbyML.pochi).

- **Open the Pochi Sidebar**: Click on the Pochi icon in the activity bar to open the chat interface.

-  **Start Chatting**: Start a conversation with Pochi to ask questions, get code suggestions, or give it a task to work on.

## Community & Support

Interested in contributing or just engaging with the team? We welcome your inputs:

- [Slack Community](http://links.tabbyml.com/join-slack): Ideal if you need help with building customizations or infrastructure.

- [GitHub Issues](https://github.com/TabbyML/pochi/issues): To report bugs and errors you encounter using Pochi.

- [Discord](https://getpochi.com/discord): Share your applications and hanging out with the community.

- [Twitter](https://x.com/getpochi): To engage with others in the space.

## License

This project is licensed under the terms of the [Apache 2.0 License](./LICENSE).
