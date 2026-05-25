import { cn } from "@/lib/utils";
import { createChannel } from "bidc";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { StatusIcon } from "../status-icon";
import type { ToolProps } from "../types";
// This intentionally borrows Vite's worker bundling pipeline only to get a
// standalone module URL. No Web Worker is created; the URL is loaded as a
// normal module script inside the sandboxed iframe, so it does not execute in
// the parent WebUI window.
import rendererScriptSrc from "./renderer-entry.ts?worker&url";
import {
  buildWidgetIframeDocument,
  buildWidgetIframeSrc,
  coalescePendingWidgetMessage,
  collectWidgetThemeVariables,
  prepareWidgetHtml,
  shouldAnimateWidgetReveal,
} from "./utils";

type WidgetRendererEvent =
  | { type: "ready" }
  | { type: "height"; height: number }
  | { type: "error"; message: string; stack?: string };

type WidgetRenderMessage = {
  type: "preview" | "finalize";
  html: string;
  animateReveal?: boolean;
};

type WidgetAck = { ok: true };
type WidgetRendererEndpoint = (message: WidgetRenderMessage) => WidgetAck;
type WidgetChannel = ReturnType<typeof createChannel>;

export const RenderWidgetTool: React.FC<ToolProps<"renderWidget">> = ({
  tool,
  isExecuting,
  isLoading,
  isLastPart,
}) => {
  const { t } = useTranslation();
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const channelRef = useRef<WidgetChannel | null>(null);
  const pendingMessageRef = useRef<WidgetRenderMessage | undefined>(undefined);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const iframeLoadedRef = useRef(false);
  const channelReadyRef = useRef(false);
  const isSendingRef = useRef(false);
  const hasPostedPreviewRef = useRef(false);
  const [height, setHeight] = useState<number | undefined>();
  const [hasFirstHeight, setHasFirstHeight] = useState(false);
  const [rendererError, setRendererError] = useState<string | undefined>();
  const channelId = useMemo(
    () => `pochi-widget-${tool.toolCallId}`,
    [tool.toolCallId],
  );
  const iframeDocument = useMemo(
    () =>
      buildWidgetIframeDocument(
        rendererScriptSrc,
        collectWidgetThemeVariables(),
        channelId,
      ),
    [channelId],
  );
  const iframeSrc = useMemo(
    () => buildWidgetIframeSrc(iframeDocument),
    [iframeDocument],
  );

  const input = tool.input;
  const title =
    input && "title" in input && input.title
      ? input.title
      : t("toolInvocation.renderingWidget");
  const widgetCode =
    input && "widgetCode" in input && input.widgetCode ? input.widgetCode : "";
  const isFinal =
    tool.state === "input-available" || tool.state === "output-available";
  const shouldAnimateReveal = shouldAnimateWidgetReveal({
    isExecuting,
    isLoading,
    isLastPart,
  });

  const drainPending = useCallback(async () => {
    const channel = channelRef.current;
    if (
      !channel ||
      !channelReadyRef.current ||
      isSendingRef.current ||
      !pendingMessageRef.current
    ) {
      return;
    }

    const message = pendingMessageRef.current;
    pendingMessageRef.current = undefined;
    isSendingRef.current = true;

    try {
      await channel.send<WidgetRendererEndpoint>(message);
    } catch (error) {
      pendingMessageRef.current = coalescePendingWidgetMessage(
        pendingMessageRef.current,
        message,
      );
    } finally {
      isSendingRef.current = false;
    }

    if (pendingMessageRef.current) {
      drainPending();
    }
  }, []);

  const initChannel = useCallback(() => {
    if (channelRef.current) return channelRef.current;
    const target = iframeRef.current?.contentWindow;
    if (!target || !iframeLoadedRef.current) return null;

    const channel = createChannel(target, channelId);
    channelRef.current = channel;
    channel.receive((event: WidgetRendererEvent) => {
      if (event.type === "ready") {
        channelReadyRef.current = true;
        drainPending();
        return { ok: true };
      }

      if (event.type === "height") {
        setHeight(clampHeight(event.height));
        setHasFirstHeight(true);
        return { ok: true };
      }

      if (event.type === "error") {
        setRendererError(event.message);
        return { ok: true };
      }

      return { ok: true };
    });

    return channel;
  }, [channelId, drainPending]);

  const queueWidgetMessage = useCallback(
    (message: WidgetRenderMessage) => {
      const nextPending = coalescePendingWidgetMessage(
        pendingMessageRef.current,
        message,
      );
      if (nextPending === pendingMessageRef.current) {
        return;
      }

      pendingMessageRef.current = nextPending;
      initChannel();
      drainPending();
    },
    [drainPending, initChannel],
  );

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }

    if (!widgetCode) return;

    setRendererError(undefined);
    const mode = isFinal ? "finalize" : "preview";
    const html = prepareWidgetHtml(widgetCode, mode);
    const message: WidgetRenderMessage = {
      type: mode,
      html,
      animateReveal:
        mode === "preview" ||
        (shouldAnimateReveal && !hasPostedPreviewRef.current),
    };
    if (isFinal) {
      queueWidgetMessage(message);
      return;
    }

    debounceRef.current = setTimeout(() => {
      queueWidgetMessage(message);
      hasPostedPreviewRef.current = true;
      debounceRef.current = null;
    }, 140);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [isFinal, queueWidgetMessage, shouldAnimateReveal, widgetCode]);

  const handleLoad = useCallback(() => {
    channelReadyRef.current = false;
    isSendingRef.current = false;
    iframeLoadedRef.current = true;
    initChannel();
  }, [initChannel]);

  useEffect(() => {
    return () => {
      channelRef.current?.cleanup();
      channelRef.current = null;
    };
  }, []);

  const headerLabel = t("toolInvocation.renderingWidget");

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center text-muted-foreground text-sm">
        <StatusIcon isExecuting={isExecuting} tool={tool} />
        <span className="ml-2">{headerLabel}</span>
        <span>{title}</span>
      </div>
      <iframe
        ref={iframeRef}
        title={title}
        src={iframeSrc}
        sandbox="allow-scripts"
        onLoad={handleLoad}
        className={cn(
          "w-full bg-transparent",
          hasFirstHeight && "transition-[height] duration-150 ease-out",
        )}
        style={{ height }}
      />
      {rendererError ? (
        <div className="text-error text-xs">{rendererError}</div>
      ) : null}
    </div>
  );
};

function clampHeight(height: number | undefined) {
  if (!height || !Number.isFinite(height)) return 160;
  return Math.min(Math.max(Math.ceil(height), 120), 1200);
}
