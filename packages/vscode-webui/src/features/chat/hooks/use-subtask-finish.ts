import type { Message } from "@getpochi/livekit";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

export const useSubtaskFinish = (parentUid: string, messages: Message[]) => {
  const [taskFinished, setTaskFinished] = useState(false);
  const navigate = useNavigate();
  useEffect(() => {
    const lastMessage = messages.at(-1);
    if (!lastMessage) return;
    for (const part of lastMessage.parts) {
      if (
        part.type === "tool-attemptCompletion" &&
        part.state === "input-available"
      ) {
        setTaskFinished(true);
      }
    }
  });

  const openParentTask = () => {
    navigate({
      to: "/",
      search: { uid: parentUid },
    });
  };

  return { taskFinished, openParentTask };
};
