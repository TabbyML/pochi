import { MessageMarkdown } from "@/components/message/markdown";
import { Badge } from "@/components/ui/badge";
import { vscodeHost } from "@/lib/vscode";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { StatusIcon } from "./status-icon";
import { ExpandableToolContainer } from "./tool-container";
import type { ToolProps } from "./types";

export const UseSkillTool: React.FC<ToolProps<"useSkill">> = ({
  tool,
  isExecuting,
}) => {
  const { t } = useTranslation();
  const { skill } = tool.input || {};
  const { result, _meta } = tool.output || {};

  const onClick = useCallback(() => {
    if (_meta?.filePath) {
      vscodeHost.openFile(_meta.filePath);
    }
  }, [_meta?.filePath]);

  return (
    <ExpandableToolContainer
      title={
        <div className="flex items-center gap-2">
          <StatusIcon isExecuting={isExecuting} tool={tool} />
          {t("toolInvocation.usingSkill")}
          <Badge
            onClick={onClick}
            className="my-0.5 cursor-pointer py-0"
            variant="secondary"
          >
            {skill}
          </Badge>
        </div>
      }
      expandableDetail={
        result ? (
          <div className="pl-6">
            <MessageMarkdown>{result}</MessageMarkdown>
          </div>
        ) : null
      }
    />
  );
};
