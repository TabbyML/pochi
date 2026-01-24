import { OutputManager } from "@/integrations/terminal/output";
import { PochiWebviewPanel } from "@/integrations/webview/webview-panel";
import type { ExecuteCommandResult } from "@getpochi/common/vscode-webui-bridge";
import type { ClientTools, ToolFunctionType } from "@getpochi/tools";

export const readBackgroundJobOutput: ToolFunctionType<
  ClientTools["readBackgroundJobOutput"]
> = async ({ backgroundJobId, regex }) => {
  const outputManager = OutputManager.get(backgroundJobId);
  if (outputManager) {
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

  if (backgroundJobId.startsWith("bgjob-")) {
    throw new Error(`Background job with ID "${backgroundJobId}" not found.`);
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
