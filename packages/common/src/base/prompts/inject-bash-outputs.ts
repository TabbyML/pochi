import type { UIMessage } from "ai";
import type { BashOutputs } from "../../vscode-webui-bridge/types/message";

type BashOutputsPart = {
  type: "data-bash-outputs";
  data: { bashOutputs: BashOutputs };
};

export function injectBashOutputs(message: UIMessage, outputs: BashOutputs) {
  const bashOutputsPart = {
    type: "data-bash-outputs" as const,
    data: {
      bashOutputs: outputs,
    },
  } satisfies BashOutputsPart;

  const workflowPartIndex = message.parts.findIndex(isWorkflowTextPart);
  const indexToInsert = workflowPartIndex === -1 ? 0 : workflowPartIndex + 1;
  message.parts = [
    ...message.parts.slice(0, indexToInsert),
    bashOutputsPart,
    ...message.parts.slice(indexToInsert),
  ];
}

function isWorkflowTextPart(part: UIMessage["parts"][number]) {
  return (
    part.type === "text" && /<workflow[^>]*>(.*?)<\/workflow>/gs.test(part.text)
  );
}
