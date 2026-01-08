import type { BashOutputs } from "../../vscode-webui-bridge/types/message";

export function renderBashOutputs(bashOutputs: BashOutputs): string {
  if (!bashOutputs?.length) {
    return "";
  }

  const header =
    "The following bash command outputs were captured from the workflow. Use them as context for your next steps.";

  const formatted = bashOutputs
    .map((entry, index) => {
      const parts = [`$ ${entry.command}`];
      if (entry.output) parts.push(entry.output);
      if (entry.error) parts.push(`ERROR: ${entry.error}`);
      return `<bash-output index="${index + 1}">\n${parts.join("\n")}\n</bash-output>`;
    })
    .join("\n\n");

  return `${header}\n\n${formatted}`;
}
