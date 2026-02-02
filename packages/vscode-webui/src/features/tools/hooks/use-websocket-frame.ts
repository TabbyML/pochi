import { getLogger } from "@getpochi/common";
import { useEffect, useState } from "react";

const logger = getLogger("useWebsocketFrame");

export function useWebsocketFrame(streamUrl: string | undefined | null) {
  const [frame, setFrame] = useState<string | null>(null);

  useEffect(() => {
    if (!streamUrl) return;

    let ws: WebSocket | null = null;
    let retryTimeout: NodeJS.Timeout;
    const retryInterval = 2500;

    const connect = () => {
      if (ws) {
        ws.onclose = null;
        ws.close();
        ws = null;
      }

      try {
        ws = new WebSocket(streamUrl);

        ws.onclose = () => {
          // Always retry
          retryTimeout = setTimeout(connect, retryInterval);
        };

        ws.onerror = (event) => {
          logger.error("Browser stream error", event);
          // Force close to trigger onclose and retry
          ws?.close();
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === "frame") {
              setFrame(data.data); // base64 image
            }
          } catch (e) {
            logger.error("Failed to parse browser frame", e);
          }
        };
      } catch (e) {
        logger.error("Failed to connect to browser stream", e);
        retryTimeout = setTimeout(connect, retryInterval);
      }
    };

    connect();

    return () => {
      clearTimeout(retryTimeout);
      if (ws) {
        ws.onopen = null;
        ws.onclose = null;
        ws.onerror = null;
        ws.onmessage = null;
        ws.close();
        ws = null;
      }
    };
  }, [streamUrl]);

  return frame;
}
