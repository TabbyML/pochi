import { MessageMarkdown } from "@/components/message";
import { useReplaceJobIdsInContent, useSendMessage } from "@/features/chat";
import { cn } from "@/lib/utils";
import type { ToolProps } from "./types";

export const AskFollowupQuestionTool: React.FC<
  ToolProps<"askFollowupQuestion">
> = ({ tool: toolCall, isLoading, isLastPart }) => {
  const sendMessage = useSendMessage();
  const replaceJobIdsInContent = useReplaceJobIdsInContent();
  const { question, followUp } = toolCall.input || {};

  const isClickable = !isLoading && isLastPart;

  return (
    <div className="flex flex-col gap-2">
      <MessageMarkdown className="font-medium italic">
        {question || ""}
      </MessageMarkdown>
      {followUp &&
        Array.isArray(followUp) &&
        followUp.length > 0 && ( // Check if followUp exists and has items
          <ol className="list-decimal space-y-1 pl-8">
            {followUp.map((followUpText, index) => (
              <li
                key={index}
                className={cn("text-muted-foreground", {
                  "cursor-pointer hover:text-foreground": isClickable,
                  "cursor-wait": isLoading,
                  "cursor-not-allowed opacity-50": !isLastPart && !isLoading,
                })}
                onClick={() =>
                  isClickable &&
                  sendMessage({
                    prompt: followUpText || "",
                  })
                }
              >
                {followUpText
                  ? replaceJobIdsInContent(followUpText)
                  : followUpText}
              </li>
            ))}
          </ol>
        )}
    </div>
  );
};
