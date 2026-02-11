import { browserRecordingManager } from "@/lib/browser-recording-manager";
import { useDefaultStore } from "@/lib/use-default-store";
import { useEffect, useState } from "react";

export function useBrowserFrame(options: {
  toolCallId: string;
  parentTaskId: string;
  completed: boolean;
  streamUrl?: string;
}) {
  const { toolCallId, parentTaskId, completed, streamUrl } = options;
  const [frame, setFrame] = useState<string | null>(null);
  const store = useDefaultStore();

  useEffect(() => {
    if (!streamUrl) return;

    const unsubscribe = browserRecordingManager.startRecording(
      toolCallId,
      parentTaskId,
      store,
      streamUrl,
      setFrame,
    );
    return () => {
      unsubscribe();
    };
  }, [streamUrl, toolCallId, parentTaskId, store]);

  useEffect(() => {
    if (completed) {
      browserRecordingManager.stopRecording(toolCallId);
    }
  }, [completed, toolCallId]);

  return frame;
}
