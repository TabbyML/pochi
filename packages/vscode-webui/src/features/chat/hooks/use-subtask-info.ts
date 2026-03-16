import { useSubtaskOffhand } from "@/features/settings";
import { useDefaultStore } from "@/lib/use-default-store";
import { type Message, type UITools, catalog } from "@getpochi/livekit";
import type { ToolUIPart } from "ai";

export interface SubtaskInfo {
  uid: string;
  parentUid: string;
  manualRun: boolean;
  agent?: string;
  description?: string;
  isNested: boolean;
}

export type NewTaskTool = Extract<
  ToolUIPart<UITools>,
  { type: "tool-newTask" }
>;

export function useSubtaskInfo(
  uid: string,
  parentUid?: string | null,
): SubtaskInfo | undefined {
  const store = useDefaultStore();
  const parentTaskMessages = store.useQuery(
    catalog.queries.makeMessagesQuery(parentUid ?? ""),
  );
  const parentTask = store.useQuery(
    catalog.queries.makeTaskQuery(parentUid ?? ""),
  );
  const newtaskTool = parentTaskMessages
    .flatMap((m) => (m.data as Message).parts)
    .find((p) => p.type === "tool-newTask" && p.input?._meta?.uid === uid) as
    | NewTaskTool
    | undefined;
  const agent = newtaskTool?.input?.agentType;
  const description = newtaskTool?.input?.description;
  const isSubTask = !!parentUid;
  const { subtaskOffhand } = useSubtaskOffhand();

  if (!parentUid) return undefined;
  if (!newtaskTool) return undefined;

  const isNested = !!parentTask?.parentId;

  return {
    uid,
    parentUid: parentUid,
    manualRun: isSubTask && !isNested && subtaskOffhand === false,
    agent,
    description,
    isNested,
  };
}
