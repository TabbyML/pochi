import type { BashOutputs } from "../../vscode-webui-bridge/types/message";
/**
 * Render bash outputs captured from workflows into a prompt-friendly format.
 */
export function renderBashOutputs(bashOutputs: BashOutputs): string {
  if (!bashOutputs?.outputs?.length) {
    return "";
  }

  const header =
    "The following bash command outputs were captured from the workflow. Use them as context for your next steps.";

  const formatted = bashOutputs.outputs
    .map((output: string, index: number) => {
      return `<bash-output index="${index + 1}">\n${output}\n</bash-output>`;
    })
    .join("\n\n");

  return `${header}\n\n${formatted}`;
}
