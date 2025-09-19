import { useAutoApprove } from "@/features/settings";
import { type Message, type UITools, catalog } from "@getpochi/livekit";
import { useStore } from "@livestore/react";
import type { ToolUIPart } from "ai";

export interface SubtaskInfo {
  uid: string;
  parentUid: string;
  manualRun: boolean;
  agent?: string;
  description?: string;
}

export type NewTaskTool = Extract<
  ToolUIPart<UITools>,
  { type: "tool-newTask" }
>;

export function useSubtaskInfo(
  uid: string,
  parentUid?: string | null,
): SubtaskInfo | undefined {
  const { store } = useStore();
  if (!parentUid) return undefined;
  const parentTaskMessages = store.useQuery(
    catalog.queries.makeMessagesQuery(parentUid),
  );
  const newtaskTool = parentTaskMessages
    .flatMap((m) => (m.data as Message).parts)
    .find((p) => p.type === "tool-newTask" && p.input?._meta?.uid === uid) as
    | NewTaskTool
    | undefined;
  if (!newtaskTool) return undefined;
  const agent = newtaskTool.input?.agentType;
  const description = newtaskTool.input?.description;
  const isSubTask = !!parentUid;
  // get parent task auto-approve settings
  const { autoApproveSettings } = useAutoApprove({
    autoApproveGuard: true,
    isSubTask: false,
  });

  return {
    uid,
    parentUid: parentUid,
    manualRun: isSubTask && autoApproveSettings.autoRunSubtask === false,
    agent,
    description,
  };
}
