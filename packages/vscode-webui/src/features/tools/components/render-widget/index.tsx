import { useTheme } from "@/components/theme-provider";
import { cn } from "@/lib/utils";
import { createChannel } from "bidc";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ToolProps } from "../types";
// This intentionally borrows Vite's worker bundling pipeline only to get a
// standalone module URL. No Web Worker is created; the renderer is loaded as a
// normal script inside the sandboxed iframe, so it does not execute in the
// parent WebUI window.
import rendererScriptSrc from "./renderer-entry.ts?worker&url";
import {
  type WidgetThemeClass,
  buildWidgetIframeDocument,
  buildWidgetIframeSrc,
  coalescePendingWidgetMessage,
  collectWidgetThemeVariables,
  getCurrentWidgetThemeClass,
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

type WidgetThemeMessage = {
  type: "theme";
  themeClass: WidgetThemeClass;
  variablesCss: string;
};

type WidgetIncomingMessage = WidgetRenderMessage | WidgetThemeMessage;

type WidgetAck = { ok: true };
type WidgetRendererEndpoint = (message: WidgetIncomingMessage) => WidgetAck;
type WidgetChannel = ReturnType<typeof createChannel>;

/**
 * Channel runtime: stores everything the send-queue needs.
 * - `channel` is non-null iff the iframe has loaded and we created a channel.
 * - `ready` flips to true only after the in-iframe runtime posts "ready".
 * - Pending messages are coalesced (render) or replaced (theme).
 * - `flushChain` serializes all `await channel.send` calls so we never
 *   overlap concurrent sends without needing a manual `isSending` mutex.
 */
type ChannelRuntime = {
  channel: WidgetChannel | null;
  ready: boolean;
  pendingRender?: WidgetRenderMessage;
  pendingTheme?: WidgetThemeMessage;
  flushChain: Promise<void>;
};

export const RenderWidgetTool: React.FC<ToolProps<"renderWidget">> = ({
  tool,
  isExecuting,
  isLoading,
  isLastPart,
}) => {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runtimeRef = useRef<ChannelRuntime>({
    channel: null,
    ready: false,
    flushChain: Promise.resolve(),
  });
  // Tracks animation history only — intentionally separate from channel state.
  const hasPostedPreviewRef = useRef(false);
  const [height, setHeight] = useState(0);
  const [hasFirstHeight, setHasFirstHeight] = useState(false);
  const [rendererError, setRendererError] = useState<string | undefined>();
  const [rendererScriptCode, setRendererScriptCode] = useState<
    string | undefined
  >();
  const channelId = useMemo(
    () => `pochi-widget-${tool.toolCallId}`,
    [tool.toolCallId],
  );
  const fallbackThemeClass: WidgetThemeClass =
    theme === "light" ? "light" : "dark";

  useEffect(() => {
    if (!import.meta.env.PROD) return;

    let disposed = false;
    loadPackagedRendererScriptCode()
      .then((code) => {
        if (!disposed) setRendererScriptCode(code);
      })
      .catch((error) => {
        if (!disposed) {
          setRendererError(
            error instanceof Error ? error.message : String(error),
          );
        }
      });

    return () => {
      disposed = true;
    };
  }, []);

  const iframeDocument = useMemo(() => {
    if (import.meta.env.PROD && !rendererScriptCode) return undefined;

    return buildWidgetIframeDocument(
      import.meta.env.PROD
        ? {
            src: rendererScriptSrc,
            code: rendererScriptCode,
            nonce: getWebviewScriptNonce(),
          }
        : rendererScriptSrc,
      collectWidgetThemeVariables(),
      channelId,
      getCurrentWidgetThemeClass(fallbackThemeClass),
    );
  }, [channelId, fallbackThemeClass, rendererScriptCode]);
  const iframeSrc = useMemo(
    () => (iframeDocument ? buildWidgetIframeSrc(iframeDocument) : undefined),
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

  // Drain the queue serially. Re-entrance is prevented by the chain itself:
  // each scheduleFlush() appends one more `flush` task to `flushChain`, and
  // tasks run one-at-a-time. Concurrent sends are impossible by construction.
  const flush = useCallback(async () => {
    const rt = runtimeRef.current;
    if (!rt.channel || !rt.ready) return;
    while (rt.pendingTheme || rt.pendingRender) {
      const next =
        rt.pendingTheme ?? (rt.pendingRender as WidgetIncomingMessage);
      if (next.type === "theme") rt.pendingTheme = undefined;
      else rt.pendingRender = undefined;

      try {
        await rt.channel.send<WidgetRendererEndpoint>(next);
      } catch {
        // Restore on failure and bail; next scheduleFlush() will retry.
        if (next.type === "theme") rt.pendingTheme = next;
        else {
          rt.pendingRender = coalescePendingWidgetMessage(
            rt.pendingRender,
            next,
          );
        }
        return;
      }
    }
  }, []);

  const scheduleFlush = useCallback(() => {
    const rt = runtimeRef.current;
    rt.flushChain = rt.flushChain.then(flush).catch(() => {});
  }, [flush]);

  const queueRenderMessage = useCallback(
    (message: WidgetRenderMessage) => {
      const rt = runtimeRef.current;
      const next = coalescePendingWidgetMessage(rt.pendingRender, message);
      if (next === rt.pendingRender) return;
      rt.pendingRender = next;
      scheduleFlush();
    },
    [scheduleFlush],
  );

  const queueThemeMessage = useCallback(
    (message: WidgetThemeMessage) => {
      runtimeRef.current.pendingTheme = message;
      scheduleFlush();
    },
    [scheduleFlush],
  );

  const queueCurrentThemeMessage = useCallback(() => {
    queueThemeMessage({
      type: "theme",
      themeClass: getCurrentWidgetThemeClass(fallbackThemeClass),
      variablesCss: collectWidgetThemeVariables(),
    });
  }, [fallbackThemeClass, queueThemeMessage]);

  const handleLoad = useCallback(() => {
    const rt = runtimeRef.current;
    const target = iframeRef.current?.contentWindow;
    if (!target) return;

    rt.channel?.cleanup();
    rt.ready = false;
    const channel = createChannel(target, channelId);
    rt.channel = channel;
    channel.receive((event: WidgetRendererEvent) => {
      if (event.type === "ready") {
        runtimeRef.current.ready = true;
        scheduleFlush();
      } else if (event.type === "height") {
        setHeight(clampHeight(event.height));
        setHasFirstHeight(true);
      } else if (event.type === "error") {
        setRendererError(event.message);
      }
      return { ok: true };
    });
  }, [channelId, scheduleFlush]);

  // Push theme updates whenever the parent webview theme changes so the
  // sandboxed iframe re-applies the new vscode-* variables and color palette
  // without needing to be re-mounted.
  useEffect(() => {
    queueCurrentThemeMessage();
  }, [queueCurrentThemeMessage]);

  useEffect(() => {
    if (typeof MutationObserver === "undefined") return;

    const targets = [document.body, document.documentElement].filter(
      Boolean,
    ) as Element[];
    if (targets.length === 0) return;

    const observer = new MutationObserver(queueCurrentThemeMessage);
    for (const target of targets) {
      observer.observe(target, {
        attributes: true,
        attributeFilter: ["class", "style"],
      });
    }

    return () => {
      observer.disconnect();
    };
  }, [queueCurrentThemeMessage]);

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
      queueRenderMessage(message);
      return;
    }

    debounceRef.current = setTimeout(() => {
      queueRenderMessage(message);
      hasPostedPreviewRef.current = true;
      debounceRef.current = null;
    }, 140);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [isFinal, queueRenderMessage, shouldAnimateReveal, widgetCode]);

  useEffect(() => {
    return () => {
      runtimeRef.current.channel?.cleanup();
      runtimeRef.current.channel = null;
    };
  }, []);

  return (
    <div className="flex flex-col">
      {iframeSrc ? (
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
      ) : null}
      {rendererError ? (
        <div className="text-error text-xs">{rendererError}</div>
      ) : null}
    </div>
  );
};

function clampHeight(height: number | undefined) {
  if (height === undefined || !Number.isFinite(height)) return 0;
  return Math.min(Math.max(Math.ceil(height), 0), 1200);
}

function getWebviewScriptNonce() {
  if (typeof document === "undefined") return undefined;
  for (const script of Array.from(document.scripts)) {
    if (script.nonce) return script.nonce;
  }
}

let packagedRendererScriptCodePromise: Promise<string> | undefined;

function loadPackagedRendererScriptCode() {
  packagedRendererScriptCodePromise ??= fetch(rendererScriptSrc).then(
    async (response) => {
      if (!response.ok) {
        throw new Error(
          `Failed to load widget renderer script: ${response.status}`,
        );
      }
      return response.text();
    },
  );
  return packagedRendererScriptCodePromise;
}
