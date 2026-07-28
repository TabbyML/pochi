import { getLogger } from "@getpochi/common";
import { ShareEvent } from "@getpochi/common/share-utils";
import type { createChannel } from "bidc";
import { useCallback, useEffect, useRef, useState } from "react";

const logger = getLogger("useShareData");

type BIDCChannel = ReturnType<typeof createChannel>;

export function useShareData({
  isStorePathname,
  channel,
}: { channel?: BIDCChannel; isStorePathname: boolean }) {
  const [data, setData] = useState<ShareEvent>();
  const shareDataRequestId = useRef(0);

  const fetchCfShareData = useCallback(async (signal: AbortSignal) => {
    const api = location.pathname.replace("/html", "/json");
    const token = getTokenFromHash();
    const requestId = ++shareDataRequestId.current;

    try {
      const response = await fetch(api, makeFetchOptions(token, signal));
      if (!response.ok) {
        throw new Error(`Share data request failed with ${response.status}`);
      }
      const nextData = ShareEvent.parse(await response.json());
      if (!signal.aborted && requestId === shareDataRequestId.current) {
        setData(nextData);
      }
    } catch (error) {
      if (!signal.aborted) {
        logger.error("Failed to fetch share data", error);
      }
    }
  }, []);

  useEffect(() => {
    if (!isStorePathname) return;

    const abortController = new AbortController();
    const token = getTokenFromHash();
    const eventsApi = location.pathname.replace("/html", "/events");

    void fetchCfShareData(abortController.signal);
    void subscribeCfShareData({
      api: eventsApi,
      token,
      signal: abortController.signal,
      onEvent: () => fetchCfShareData(abortController.signal),
    });

    return () => abortController.abort();
  }, [isStorePathname, fetchCfShareData]);

  useEffect(() => {
    if (isStorePathname || !channel) return;

    channel.receive((nextData) => {
      setData(ShareEvent.parse(nextData));
    });
  }, [isStorePathname, channel]);

  return data;
}

async function subscribeCfShareData({
  api,
  token,
  signal,
  onEvent,
}: {
  api: string;
  token: string | null;
  signal: AbortSignal;
  onEvent: () => Promise<void>;
}) {
  while (!signal.aborted) {
    try {
      const response = await fetch(api, makeFetchOptions(token, signal));
      if (!response.ok) {
        throw new Error(`Share events request failed with ${response.status}`);
      }
      if (!response.body) {
        throw new Error("Share events response has no body");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (!signal.aborted) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split(/\r?\n\r?\n/);
        buffer = events.pop() ?? "";

        for (const event of events) {
          if (event.split(/\r?\n/).some((line) => line.startsWith("data:"))) {
            await onEvent();
          }
        }
      }
    } catch (error) {
      if (signal.aborted) return;
      logger.error("Failed to subscribe to share events", error);
      await waitForRetry(signal);
    }
  }
}

function makeFetchOptions(token: string | null, signal: AbortSignal) {
  return {
    signal,
    headers: token
      ? {
          Authorization: `Bearer ${token}`,
        }
      : undefined,
  };
}

function waitForRetry(signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    const timeoutId = setTimeout(resolve, 1000);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timeoutId);
        resolve();
      },
      { once: true },
    );
  });
}

function getTokenFromHash() {
  const hash = window.location.hash.substring(1);
  if (hash) {
    const hashParams = new URLSearchParams(hash);
    return hashParams.get("token");
  }
  return null;
}
