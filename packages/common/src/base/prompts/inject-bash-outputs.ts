import type { UIMessage } from "ai";

type BashOutputsPart = {
  type: "data-bash-outputs";
  data: { bashOutputs: { outputs: string[] } };
};

export function injectBashOutputs(
  message: UIMessage,
  outputs: {
    command: string;
    output: string;
    error?: string | undefined;
  }[],
) {
  const bashCommandOutputs = outputs.map(({ command, output, error }) => {
    let result = `$ ${command}`;
    if (output) {
      result += `\n${output}`;
    }
    if (error) {
      result += `\nERROR: ${error}`;
    }
    return result;
  });

  const bashOutputsPart = {
    type: "data-bash-outputs" as const,
    data: {
      bashOutputs: { outputs: bashCommandOutputs },
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
