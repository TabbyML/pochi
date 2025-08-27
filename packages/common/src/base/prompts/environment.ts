import type { TextUIPart, UIMessage } from "ai";
import type { Environment, GitStatus } from "../environment";
import { prompts } from "./index";

type User = { name: string; email: string };

export function createEnvironmentPrompt(
  environment: Environment,
  user: User | undefined,
) {
  const sections = [
    getSystemInfo(environment),
    getUserInfo(user),
    getWorkspaceFiles(environment.workspace, environment.info),
    getCurrentOpenedFiles(environment.workspace),
    getVisibleTerminals(environment.workspace),
    getCurrentWorkingFile(environment.workspace),
    getGitStatus(environment.workspace.gitStatus),
    getUserEdits(environment.userEdits),
    getTodos(environment.todos),
  ]
    .filter(Boolean)
    .join("\n\n");
  return sections.trim();
}

export function createLiteEnvironmentPrompt(environment: Environment) {
  const sections = [
    getCurrentOpenedFiles(environment.workspace),
    getVisibleTerminals(environment.workspace),
    getCurrentWorkingFile(environment.workspace),
    getGitStatus(environment.workspace.gitStatus),
    getUserEdits(environment.userEdits),
    getTodos(environment.todos),
  ]
    .filter(Boolean)
    .join("\n\n");
  return sections.trim();
}

function getSystemInfo(environment: Environment) {
  const { info, currentTime } = environment;
  const prompt = `# System Information

Operating System: ${info.os}
Default Shell: ${info.shell}
Home Directory: ${info.homedir}
Current Working Directory: ${info.cwd}
Current Time: ${currentTime}`;
  return prompt;
}

function getUserInfo(user: User | undefined) {
  if (!user) {
    return "";
  }

  const userInfo = [];
  if (user.name) {
    userInfo.push(`- Name: ${user.name}`);
  }

  if (user.email) {
    userInfo.push(`- Email: ${user.email}`);
  }

  if (userInfo.length > 0) {
    return `# User Information\n${userInfo.join("\n")}`;
  }

  return "";
}

function getWorkspaceFiles(
  workspace: Environment["workspace"],
  info: Environment["info"],
) {
  const { files, isTruncated } = workspace;
  const filesList = files.join("\n");
  const truncatedMessage = isTruncated
    ? "\n(Note: The list of files is truncated. Use listFiles tool to explore if needed)"
    : "";
  return `# Current Working Directory (${info.cwd}) Files\n${filesList}${truncatedMessage}`;
}

function getCurrentOpenedFiles(workspace: Environment["workspace"]) {
  const openFiles = workspace.activeTabs ?? [];
  if (openFiles.length === 0) {
    return "";
  }
  const header = `# Active File Tabs in Editor\nHere are the open file tabs in the editor. If a user mentions "this" or "that" without an active selection, they are likely referring active tab (if exists) below:`;
  return `${header}\n${openFiles
    .map((tab) => {
      if (typeof tab === "string") {
        return tab;
      }
      return tab.isActive ? `${tab.filepath} (active)` : tab.filepath;
    })
    .join("\n")}`;
}

function getVisibleTerminals(workspace: Environment["workspace"]) {
  const terminals = workspace.terminals ?? [];
  if (terminals.length === 0) {
    return "";
  }
  return `# Active Terminals in Editor\n${terminals
    .map(
      (t) =>
        `${t.isActive ? "* " : "  "}${t.name}${t.isActive ? " (active)" : ""}${t.backgroundCommandId ? ` (background command: ${t.backgroundCommandId})` : ""}`,
    )
    .join("\n")}`;
}

function getCurrentWorkingFile(workspace: Environment["workspace"]) {
  const selection = workspace.activeSelection;
  if (!selection) {
    return "";
  }
  const { filepath, range, content } = selection;
  if (!content || content.trim() === "") {
    return "";
  }
  return `# Active Selection (${filepath}:${range.start.line + 1}-${range.end.line + 1})\n\n\`\`\`\n${content}\n\`\`\`\n`;
}

function getGitStatus(gitStatus: GitStatus | undefined) {
  if (!gitStatus) return "# GIT STATUS\nThis workspace is not managed by git";

  const { currentBranch, mainBranch, status, recentCommits } = gitStatus;

  let result = "# GIT STATUS\n";

  if (gitStatus.origin) {
    result += `Origin: ${gitStatus.origin}\n`;
  }
  result += `Current branch: ${currentBranch}\n`;
  result += `Main branch (you will usually use this for PRs): ${mainBranch}\n\n`;

  if (status) {
    result += `Status:\n${status}\n\n`;
  }

  if (recentCommits.length > 0) {
    result += `Recent commits:\n${recentCommits.join("\n")}`;
  }

  return result;
}

export function injectEnvironment(
  messages: UIMessage[],
  environment: Environment | undefined,
): UIMessage[] {
  if (environment === undefined) return messages;
  const messageToInject = messages.at(-1);
  if (!messageToInject) return messages;
  if (messageToInject.role !== "user") return messages;

  const { gitStatus } = environment.workspace;
  const user =
    gitStatus?.userEmail && gitStatus?.userName
      ? {
          name: gitStatus.userName,
          email: gitStatus.userEmail,
        }
      : undefined;

  const environmentDetails =
    messages.length === 1
      ? createEnvironmentPrompt(environment, user)
      : createLiteEnvironmentPrompt(environment);

  const reminderPart = {
    type: "text",
    text: prompts.createSystemReminder(environmentDetails),
  } satisfies TextUIPart;

  const parts =
    // Remove existing system reminders.
    messageToInject.parts.filter(
      (x) => x.type !== "text" || !prompts.isSystemReminder(x.text),
    ) || [];
  const lastTextPartIndex = parts.findLastIndex(
    (parts) => parts.type === "text",
  );
  // Insert remainderPart before lastTextPartIndex
  messageToInject.parts = [
    ...parts.slice(0, lastTextPartIndex),
    reminderPart,
    ...parts.slice(lastTextPartIndex),
  ];

  return messages;
}

function getTodos(todos: Environment["todos"]) {
  if (todos === undefined || todos.length === 0) {
    return "# TODOs\nNo TODOs yet, if you are working on tasks that would benefit from a todo list please use the todoWrite tool to create one.";
  }

  return `# TODOs
Here's todo list for current task. If a task is marked as cancelled or completed, it no longer needs your attention, NEVER ATTEMPT TO COMPLETE IT AGAIN, this is SUPER IMPORTANT!!!.
Otherwise, please follow the todo list to complete the task.

${JSON.stringify(todos, null, 2)}`;
}

function getUserEdits(userEdits: Environment["userEdits"]) {
  if (!userEdits || userEdits.length === 0) {
    return "";
  }

  // Format structured user edits data
  const formattedFiles = userEdits
    .map((edit) => {
      return `**${edit.filepath}** (modified)
\`\`\`diff
${edit.diff}
\`\`\``;
    })
    .join("\n\n");

  return `# User Edits
The user has made the following edits to the workspace. Please take these changes into account when proceeding with the task.

${formattedFiles}`;
}
