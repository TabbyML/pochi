import { useSendMessage } from "@/features/chat";
import { cn } from "@/lib/utils";
import type { ToolProps } from "../types";

export const AskFollowupQuestionTool: React.FC<
  ToolProps<"askFollowupQuestion">
> = ({ tool: toolCall, isLoading }) => {
  const sendMessage = useSendMessage();
  const { question, followUp } = toolCall.input || {};

  return (
    <div className="flex flex-col gap-2">
      <p className="items-center font-medium italic">{question}</p>
      {followUp &&
        Array.isArray(followUp) &&
        followUp.length > 0 && ( // Check if followUp exists and has items
          <ol className="list-decimal space-y-1 pl-8">
            {followUp.map((followUpText, index) => (
              <li
                key={index}
                className={cn("text-muted-foreground hover:text-foreground", {
                  "cursor-pointer": !isLoading,
                  "cursor-wait": isLoading,
                })}
                onClick={() =>
                  !isLoading &&
                  sendMessage({
                    prompt: followUpText || "",
                  })
                }
              >
                {followUpText}
              </li>
            ))}
          </ol>
        )}
    </div>
  );
};
