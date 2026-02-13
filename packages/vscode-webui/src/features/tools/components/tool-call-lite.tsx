import { cn } from "@/lib/utils";
import type { UITools } from "@getpochi/livekit";
import type { ToolName } from "@getpochi/tools";
import { type ToolUIPart, getToolName } from "ai";
import { Loader2, Pause } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

interface Props {
  tools: Array<ToolUIPart<UITools>> | undefined;
  requiresApproval?: boolean;
  showApprove?: boolean;
  showCommandDetails?: boolean;
}

export function ToolCallLite({
  tools,
  requiresApproval,
  showApprove = true,
  showCommandDetails,
}: Props) {
  const { t } = useTranslation();

  if (!tools?.length) return null;

  const tool = tools[0];
  let detail: ReactNode = null;

  switch (tool.type) {
    case "tool-readFile":
    case "tool-writeToFile":
    case "tool-applyDiff":
    case "tool-multiApplyDiff":
    case "tool-createReview":
      detail = (
        <LabelAndFilePathView
          tool={tool}
          label={getLabelFromTool(tool.type, t)}
        />
      );
      break;
    case "tool-executeCommand":
      detail = (
        <ExecuteCommandTool
          tool={tool}
          showCommandDetails={showCommandDetails}
        />
      );
      break;
    case "tool-startBackgroundJob":
      detail = <StartBackgroundJobTool tool={tool} />;
      break;
    case "tool-readBackgroundJobOutput":
      detail = <ReadBackgroundJobTool tool={tool} />;
      break;
    case "tool-killBackgroundJob":
      detail = <KillBackgroundJobTool />;
      break;
    case "tool-searchFiles":
      detail = <SearchFilesTool tool={tool} />;
      break;
    case "tool-listFiles":
      detail = <ListFilesTool tool={tool} />;
      break;
    case "tool-globFiles":
      detail = <GlobFilesTool tool={tool} />;
      break;
    case "tool-todoWrite":
      detail = <TodoWriteTool />;
      break;
    case "tool-editNotebook":
      detail = <EditNotebookTool tool={tool} />;
      break;
    case "tool-newTask":
      detail = <NewTaskTool tool={tool} />;
      break;
    case "tool-askFollowupQuestion":
    case "tool-attemptCompletion":
      detail = null;
      break;
    default:
      detail = <McpTool tool={tool} />;
      break;
  }

  if (requiresApproval) {
    detail = (
      <span className="ml-2">{t("tasksPage.taskStatus.requiresApproval")}</span>
    );
  }

  return detail ? (
    <div className="flex flex-nowrap items-center overflow-x-hidden whitespace-nowrap">
      {showApprove &&
        (requiresApproval ? (
          <Pause className="size-3.5 shrink-0" />
        ) : (
          <Loader2 className="size-3.5 shrink-0 animate-spin" />
        ))}
      <div className="flex flex-nowrap items-center truncate">{detail}</div>
      {!requiresApproval && tools.length > 1 && (
        <span>
          {t("toolInvocation.moreTools", { count: tools.length - 1 })}
        </span>
      )}
    </div>
  ) : null;
}

function getLabelFromTool(
  type: ToolUIPart<UITools>["type"],
  t: ReturnType<typeof useTranslation>["t"],
): string {
  switch (type) {
    case "tool-readFile":
      return t("toolInvocation.reading") as string;
    case "tool-writeToFile":
      return t("toolInvocation.writing") as string;
    case "tool-applyDiff":
      return t("toolInvocation.applyingDiffTo") as string;
    case "tool-multiApplyDiff":
      return t("toolInvocation.applyingDiffsTo") as string;
    case "tool-createReview":
      return t("toolInvocation.addingReviewComment") as string;
    default:
      return "";
  }
}

interface LabelAndFilePathViewProps<T extends ToolName> {
  tool: Extract<ToolUIPart<UITools>, { type: `tool-${T}` }>;
  label: string;
}

interface ToolCallLiteViewProps<T extends ToolName> {
  tool: Extract<ToolUIPart<UITools>, { type: `tool-${T}` }>;
  showCommandDetails?: boolean;
}

const LabelAndFilePathView = ({
  tool,
  label,
}: LabelAndFilePathViewProps<
  "readFile" | "applyDiff" | "writeToFile" | "multiApplyDiff" | "createReview"
>) => {
  const { path } = tool.input || {};

  return (
    <>
      <span className="ml-2" />
      <span className="truncate whitespace-nowrap">{label}</span>
      {path && <FileBadge className="ml-1" path={path} />}
    </>
  );
};

const ExecuteCommandTool = ({
  tool,
  showCommandDetails,
}: ToolCallLiteViewProps<"executeCommand">) => {
  const { t } = useTranslation();

  const { cwd, command } = tool.input || {};
  const cwdNode = cwd ? (
    <span>
      {" "}
      {t("toolInvocation.in")} <HighlightedText>{cwd}</HighlightedText>
    </span>
  ) : null;

  const text = t("toolInvocation.executingCommand");
  return (
    <>
      <span className="ml-2">
        {text}
        {cwdNode}
        {showCommandDetails ? ` ${command}` : ""}
      </span>
    </>
  );
};

const StartBackgroundJobTool = ({
  tool,
}: ToolCallLiteViewProps<"startBackgroundJob">) => {
  const { t } = useTranslation();
  const { cwd } = tool.input || {};

  const cwdNode = cwd ? (
    <span>
      {" "}
      {t("toolInvocation.in")} <HighlightedText>{cwd}</HighlightedText>
    </span>
  ) : null;
  const text = t("toolInvocation.backgroundExecuting");
  return (
    <>
      <span className="ml-2 truncate">
        {text}
        {cwdNode}
      </span>
    </>
  );
};

const ReadBackgroundJobTool = ({
  tool,
}: ToolCallLiteViewProps<"readBackgroundJobOutput">) => {
  const { t } = useTranslation();
  const { regex } = tool.input || {};
  return (
    <>
      <span className="ml-2">{t("toolInvocation.readBackground")}</span>
      {regex && (
        <>
          {" "}
          {t("toolInvocation.withRegexFilter")}:{" "}
          <HighlightedText>{regex}</HighlightedText>
        </>
      )}
    </>
  );
};

const KillBackgroundJobTool = () => {
  const { t } = useTranslation();
  return (
    <span className="ml-2">{t("toolInvocation.stoppingBackgroundJob")}</span>
  );
};

const SearchFilesTool = ({ tool }: ToolCallLiteViewProps<"searchFiles">) => {
  const { t } = useTranslation();
  const { path, regex, filePattern } = tool.input || {};

  const searchCondition = (
    <>
      <HighlightedText>{regex}</HighlightedText> {t("toolInvocation.in")}{" "}
      <HighlightedText>{path}</HighlightedText>
      {filePattern && <HighlightedText>{filePattern}</HighlightedText>}
    </>
  );

  return (
    <>
      <span className="ml-2" />
      <span>
        {t("toolInvocation.searchingFor")} {searchCondition}
      </span>
    </>
  );
};

const ListFilesTool = ({ tool }: ToolCallLiteViewProps<"listFiles">) => {
  const { t } = useTranslation();
  const { path } = tool.input || {};

  return (
    <>
      <span className="ml-2" />
      {t("toolInvocation.reading")}
      <FileBadge className="ml-1" path={path ?? ""} />
    </>
  );
};

const GlobFilesTool = ({ tool }: ToolCallLiteViewProps<"globFiles">) => {
  const { t } = useTranslation();
  const { path, globPattern } = tool.input || {};

  const searchCondition = (
    <>
      {t("toolInvocation.in")} <HighlightedText>{path}</HighlightedText>
      {globPattern && (
        <>
          {t("toolInvocation.for")}{" "}
          <HighlightedText>{globPattern}</HighlightedText>
        </>
      )}
    </>
  );

  return (
    <>
      <span className="ml-2" />
      <span>
        {t("toolInvocation.searching")} {searchCondition}
      </span>
    </>
  );
};

const TodoWriteTool = () => {
  const { t } = useTranslation();

  return (
    <>
      <span className="ml-2" />
      {t("toolInvocation.updatingToDos")}
    </>
  );
};

const EditNotebookTool = ({ tool }: ToolCallLiteViewProps<"editNotebook">) => {
  const { t } = useTranslation();
  const { path, cellId } = tool.input || {};

  // Parse cellId to determine if it's an index or actual ID
  const cellIndex = Number.parseInt(cellId || "", 10);
  const cellLabel = !Number.isNaN(cellIndex)
    ? `Cell ${cellIndex + 1}`
    : `Cell ID: ${cellId}`;

  return (
    <>
      <span className="ml-2" />
      {t("toolInvocation.editing")}
      {path && (
        <>
          <FileBadge className="ml-1" path={path} />
          <span className="ml-1 text-muted-foreground">({cellLabel})</span>
        </>
      )}
    </>
  );
};

const NewTaskTool = ({ tool }: ToolCallLiteViewProps<"newTask">) => {
  const description = tool.input?.description ?? "";

  const agentType = tool.input?.agentType;
  const toolTitle = agentType ?? "Subtask";

  return (
    <div>
      <span className={cn("flex items-center gap-2")}>
        <div>
          <span className="ml-2 font-semibold italic">{toolTitle}</span>
          <span className="ml-2">{description}</span>
        </div>
      </span>
    </div>
  );
};

// biome-ignore lint/suspicious/noExplicitAny: MCP matches any.
const McpTool = ({ tool }: ToolCallLiteViewProps<any>) => {
  const { t } = useTranslation();
  const toolName = getToolName(tool);

  return (
    <>
      <span className="ml-2">
        {t("toolInvocation.calling")}
        <HighlightedText>{toolName}</HighlightedText>
      </span>
    </>
  );
};

function FileBadge({ path, className }: { path: string; className?: string }) {
  return <span className={cn("truncate", className)}>{path}</span>;
}

function HighlightedText({
  children,
  className,
}: {
  children?: string;
  className?: string;
}) {
  if (!children) {
    return null;
  }
  return (
    <span
      className={cn(
        "mx-1 break-words rounded font-semibold text-foreground",
        className,
      )}
    >
      {children}
    </span>
  );
}
