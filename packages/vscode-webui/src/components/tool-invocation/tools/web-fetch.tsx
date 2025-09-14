import { addLineBreak } from "@/lib/utils/file";
import { StatusIcon } from "../status-icon";
import { ExpandableToolContainer } from "../tool-container";
import type { ToolProps } from "../types";
import { useTranslation } from "react-i18next";

// biome-ignore lint/suspicious/noExplicitAny: webFetch is no longered defined, just make type safe happy for now.
export const webFetchTool: React.FC<ToolProps<any>> = ({
  tool,
  isExecuting,
}) => {
  const { t } = useTranslation();
  const url =
    typeof tool.input === "object" &&
    "url" in tool.input &&
    typeof tool.input.url === "string"
      ? tool.input.url
      : undefined;

  const title = (
    <>
      <StatusIcon isExecuting={isExecuting} tool={tool} />
      <span className="ml-2" />
      {t('toolInvocation.reading')}
      {url && (
        <a href={url} target="_blank" className="ml-1" rel="noreferrer">
          {addLineBreak(url)}
        </a>
      )}
    </>
  );
  return <ExpandableToolContainer title={title} />;
};
