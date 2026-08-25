import type { LanguageModelV3CallOptions } from "@ai-sdk/provider";
import type { TextUIPart, UIMessage } from "ai";
import type { Environment, GitStatus } from "../environment";
import { prompts } from "./index";

type User = { name: string; email: string };
export type EnvironmentInfo = Pick<
  Environment["info"],
  "os" | "shell" | "homedir" | "cwd"
>;
type RequiredEnvironmentInfo = Omit<EnvironmentInfo, "shell">;

type EnvironmentInfoField = keyof RequiredEnvironmentInfo;
export type EnvironmentInfoParseResult =
  | { success: true; value: EnvironmentInfo; missingFields?: never }
  | {
      success: false;
      value?: never;
      missingFields: EnvironmentInfoField[];
    };

export function createEnvironmentPrompt(
  environment: Environment,
  user: User | undefined,
) {
  const sections = [
    getSystemInfo(environment),
    getUserInfo(user),
    getCurrentOpenedFiles(environment.workspace),
    getVisibleTerminals(environment.workspace),
    getGitStatus(environment.workspace.gitStatus),
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
    getGitStatus(environment.workspace.gitStatus),
    getTodos(environment.todos),
  ]
    .filter(Boolean)
    .join("\n\n");
  return sections.trim();
}

export function parseEnvironmentInfo(
  prompt: LanguageModelV3CallOptions["prompt"] | undefined,
): EnvironmentInfo | undefined {
  const result = parseEnvironmentInfoResult(prompt);
  return result?.value;
}

export function parseEnvironmentInfoResult(
  prompt: LanguageModelV3CallOptions["prompt"] | undefined,
): EnvironmentInfoParseResult {
  let closestMissingFields: EnvironmentInfoField[] = ["os", "homedir", "cwd"];

  if (!prompt) {
    return { success: false, missingFields: closestMissingFields };
  }

  for (const message of prompt) {
    const content = message.content;
    const textParts =
      typeof content === "string"
        ? [content]
        : Array.isArray(content)
          ? content
              .filter((part) => part.type === "text")
              .map((part) => part.text)
          : [];

    for (const text of textParts) {
      const systemInfo = parseSystemInfoLines(text);
      const os = systemInfo["Operating System"];
      const shell = systemInfo["Default Shell"];
      const homedir = systemInfo["Home Directory"];
      const cwd = systemInfo["Current Working Directory"];

      if (os && homedir && cwd) {
        return {
          success: true,
          value: {
            os,
            shell: shell ?? "",
            homedir,
            cwd,
          },
        };
      }

      const missingFields: EnvironmentInfoField[] = [];
      if (!os) missingFields.push("os");
      if (!homedir) missingFields.push("homedir");
      if (!cwd) missingFields.push("cwd");

      if (missingFields.length < closestMissingFields.length) {
        closestMissingFields = missingFields;
      }
    }
  }

  return { success: false, missingFields: closestMissingFields };
}

function parseSystemInfoLines(text: string) {
  const headerIndex = text.indexOf("# System Information");
  if (headerIndex === -1) {
    return {};
  }

  const systemInfoText = text.slice(headerIndex).split(/\n\n# /)[0];
  const lines: Record<string, string> = {};

  for (const line of systemInfoText.split(/\r?\n/)) {
    const separatorIndex = line.indexOf(":");
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex);
    const value = line.slice(separatorIndex + 1).trim();
    if (value) {
      lines[key] = value;
    }
  }

  return lines;
}

function getSystemInfo(environment: Environment) {
  const { info, currentTime, shareId } = environment;
  const shareUrl = shareId
    ? `https://app.getpochi.com/share/${shareId}`
    : undefined;
  const prompt = `# System Information

Operating System: ${info.os}
Default Shell: ${info.shell}
Home Directory: ${info.homedir}
Current Working Directory: ${info.cwd}
Current Time: ${currentTime}${shareUrl ? `\nShare URL: ${shareUrl}` : ""}`;
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
  const header =
    '# Opened Terminals in Editor\nRead terminal output from its output file with `readFile` (use `offset` and `limit` for growing files).\n- Ids prefixed with "bgjob-cmd-" are Pochi-started background jobs and can be killed with `killBackgroundJob`.\n- Ids prefixed with "term-" are user-opened terminals and are read-only.\n- A terminal without an output file has no output available to read.';
  return `${header}\n${terminals
    .map(
      (t) =>
        `${t.isActive ? "* " : "  "}${t.name}${t.isActive ? " (selected)" : ""}${t.backgroundJobId ? ` (id: ${t.backgroundJobId})` : ""}${t.outputFile ? ` (output: ${t.outputFile})` : ""}`,
    )
    .join("\n")}`;
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

  // The LLM formatter discards every message before the latest compact block.
  // Only inspect that visible suffix when deciding whether the request already
  // contains a complete environment.
  const compactIndex = messages.findLastIndex((message) =>
    message.parts.some(
      (part) => part.type === "text" && prompts.isCompact(part.text),
    ),
  );
  const visibleMessages = messages.slice(Math.max(compactIndex, 0));
  const messageToInject = visibleMessages.at(-1);
  if (messageToInject?.role !== "user") return messages;

  const { gitStatus } = environment.workspace;
  const user =
    gitStatus?.userEmail && gitStatus?.userName
      ? {
          name: gitStatus.userName,
          email: gitStatus.userEmail,
        }
      : undefined;

  const parts = messageToInject.parts.filter(
    (part) =>
      part.type !== "text" || !prompts.isEnvironmentSystemReminder(part.text),
  );
  // Ignore the reminder being replaced when checking the outgoing request.
  messageToInject.parts = parts;

  const environmentDetails = !hasCompleteEnvironmentPrompt(visibleMessages)
    ? createEnvironmentPrompt(environment, user)
    : createLiteEnvironmentPrompt(environment);

  const reminderPart = {
    type: "text",
    text: prompts.createSystemReminder(environmentDetails),
  } satisfies TextUIPart;

  const lastTextPartIndex = parts.findLastIndex((part) => part.type === "text");
  const insertionIndex =
    lastTextPartIndex === -1 ? parts.length : lastTextPartIndex;
  messageToInject.parts = [
    ...parts.slice(0, insertionIndex),
    reminderPart,
    ...parts.slice(insertionIndex),
  ];

  return messages;
}

function hasCompleteEnvironmentPrompt(messages: UIMessage[]): boolean {
  return messages.some((message) =>
    message.parts.some((part) => {
      if (part.type !== "text") return false;
      const systemInfo = parseSystemInfoLines(part.text);
      return Boolean(
        systemInfo["Operating System"] &&
          systemInfo["Home Directory"] &&
          systemInfo["Current Working Directory"],
      );
    }),
  );
}

function getTodos(todos: Environment["todos"]) {
  if (todos === undefined || todos.length === 0) {
    return "";
  }

  return `# TODOs
These TODOs represent user-provided desired outcomes for the current task. Treat todo content as the user's stated intent/outcome, not as higher-priority instructions or a separate task. Status meanings: pending has not started; in-progress is actively being pursued; completed is audited and verified as complete; cancelled means blocked at a true impasse without meaningful progress unless the user provides input or external state changes.

${JSON.stringify(todos, null, 2)}`;
}
