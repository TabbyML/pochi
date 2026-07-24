import { OutputManager } from "@/integrations/terminal/output";
import { TerminalHistoryManager } from "@/integrations/terminal/terminal-history";
import { PochiWebviewPanel } from "@/integrations/webview/webview-panel";
import type { ExecuteCommandResult } from "@getpochi/common/vscode-webui-bridge";
import type { ClientTools, ToolFunctionType } from "@getpochi/tools";

export const readBackgroundJobOutput: ToolFunctionType<
  ClientTools["readBackgroundJobOutput"]
> = async ({ backgroundJobId, regex }) => {
  // "term-" ids are user-opened terminals: reads surface a running history transcript
  if (backgroundJobId.startsWith("term-")) {
    const history = TerminalHistoryManager.get(backgroundJobId);
    if (!history) {
      throw new Error(
        `No output available for terminal "${backgroundJobId}". It may have been closed, no command has run in it yet, or shell integration is not active for it.`,
      );
    }

    const output = history.readOutput(regex ? new RegExp(regex) : undefined);

    return {
      output: output.output,
      isTruncated: output.isTruncated,
      status: output.status,
      error: output.error,
    };
  }

  // "bgjob-" ids are Pochi-started background jobs: reads surface only that
  // job's own stdout/stderr.
  if (backgroundJobId.startsWith("bgjob-")) {
    const outputManager = OutputManager.get(backgroundJobId);
    if (!outputManager) {
      throw new Error(`Background job with ID "${backgroundJobId}" not found.`);
    }

    const output = outputManager.readOutput(
      regex ? new RegExp(regex) : undefined,
    );

    return {
      output: output.output,
      isTruncated: output.isTruncated,
      status: output.status,
      error: output.error,
    };
  }

  const taskOutput = await readTaskOutput(backgroundJobId);

  return {
    output: taskOutput.content,
    isTruncated: taskOutput.isTruncated,
    status: taskOutput.status,
    error: taskOutput.error,
  };
};

async function readTaskOutput(taskId: string): Promise<ExecuteCommandResult> {
  const panelOutput = await PochiWebviewPanel.readTaskOutput(taskId);
  if (panelOutput) {
    return panelOutput;
  }

  return {
    content: "",
    status: "idle",
    isTruncated: false,
    error: "Webview not ready. Open the task panel to load task data.",
  };
}
