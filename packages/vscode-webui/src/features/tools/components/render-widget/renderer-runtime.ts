import { createChannel } from "bidc";
import morphdom from "morphdom";
import {
  type WidgetScript,
  type WidgetThemeClass,
  WidgetThemeStyleId,
  collectWidgetRevealElements,
  extractWidgetScripts,
  measureWidgetContentHeight,
  sanitizeWidgetFragment,
} from "./utils";

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

type WidgetEvent =
  | { type: "ready" }
  | { type: "height"; height: number }
  | { type: "error"; message: string; stack?: string };
type WidgetParentEndpoint = (event: WidgetEvent) => { ok: true };

const RevealDelayStepMs = 220;
const MaxRevealDelayMs = 6000;

export function startWidgetRenderer() {
  disableHostAndNetworkApis();

  const root = document.getElementById("root");
  let lastVisualHtml = "";
  let lastExecutedFinalHtml = "";
  let lastVisualRevealAnimated = false;
  const externalScriptLoadPromises = new Map<string, Promise<void>>();
  const channel = createChannel(root?.dataset.channelId || "pochi-widget");

  const reportError = (message: string, stack?: string) => {
    channel.send<WidgetParentEndpoint>({ type: "error", message, stack });
  };

  const reportHeight = () => {
    const height = root
      ? measureWidgetContentHeight(root)
      : Math.max(120, Math.ceil(document.documentElement.scrollHeight));
    channel.send<WidgetParentEndpoint>({ type: "height", height });
  };

  const applyRevealAnimation = (elements: Element[]) => {
    const revealElements = collectWidgetRevealElements(elements);

    for (const [index, element] of revealElements.entries()) {
      const delay = Math.min(index * RevealDelayStepMs, MaxRevealDelayMs);
      element.classList.add("__pochi_widget_appear");
      (element as HTMLElement | SVGElement).style.setProperty(
        "--pochi-widget-appear-delay",
        `${delay}ms`,
      );
    }
  };

  const renderVisual = (html: string, options: { animateReveal: boolean }) => {
    if (!root) return;

    const sanitized = sanitizeWidgetFragment(html);
    if (sanitized === lastVisualHtml) {
      if (options.animateReveal && !lastVisualRevealAnimated) {
        applyRevealAnimation(Array.from(root.children));
        lastVisualRevealAnimated = true;
      }
      return;
    }

    const target = document.createElement("div");
    target.id = "root";
    target.innerHTML = sanitized;
    const addedElements: Element[] = [];
    morphdom(root, target, {
      onBeforeElUpdated(fromEl, toEl) {
        return !fromEl.isEqualNode(toEl);
      },
      onNodeAdded(node) {
        if (
          options.animateReveal &&
          node.nodeType === Node.ELEMENT_NODE &&
          !["STYLE", "SCRIPT"].includes((node as Element).tagName)
        ) {
          addedElements.push(node as Element);
        }
        return node;
      },
    });
    if (options.animateReveal) {
      applyRevealAnimation(addedElements);
    }
    lastVisualRevealAnimated = options.animateReveal;
    lastVisualHtml = sanitized;
    reportHeight();
  };

  const loadExternalScript = (src: string) => {
    let promise = externalScriptLoadPromises.get(src);
    if (!promise) {
      promise = new Promise<void>((resolve, reject) => {
        const existing = Array.from(document.scripts).find(
          (script) => script.src === src,
        );
        if (existing) {
          resolve();
          return;
        }

        const script = document.createElement("script");
        script.src = src;
        script.onload = () => {
          resolve();
        };
        script.onerror = () => {
          reject(new Error(`Failed to load external widget script: ${src}`));
        };
        document.head.appendChild(script);
      });
      externalScriptLoadPromises.set(src, promise);
    }
    return promise;
  };

  const runScripts = async (scripts: WidgetScript[]) => {
    for (const script of scripts) {
      if (script.type === "external") {
        await loadExternalScript(script.src);
        continue;
      }
      new Function(script.code)();
    }
    reportHeight();
  };

  const applyTheme = (message: WidgetThemeMessage) => {
    const root = document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(message.themeClass);

    const styleEl = document.getElementById(
      WidgetThemeStyleId,
    ) as HTMLStyleElement | null;
    if (styleEl) {
      styleEl.textContent = message.variablesCss;
    }
    reportHeight();
  };

  const handle = async (data: WidgetIncomingMessage) => {
    try {
      if (data.type === "theme") {
        applyTheme(data);
        return;
      }

      if (data.type !== "preview" && data.type !== "finalize") return;

      const html = String(data.html || "");
      if (data.type === "preview") {
        renderVisual(stripScripts(html), { animateReveal: true });
        return;
      }

      renderVisual(stripScripts(html), {
        animateReveal: Boolean(data.animateReveal),
      });
      if (html === lastExecutedFinalHtml) {
        reportHeight();
        return;
      }
      lastExecutedFinalHtml = html;
      await runScripts(extractWidgetScripts(html));
    } catch (error) {
      reportError(
        error instanceof Error ? error.message : String(error),
        error instanceof Error ? error.stack : undefined,
      );
    }
  };

  addEventListener("error", (event) => {
    reportError(event.message, event.error?.stack);
  });

  addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    reportError(
      reason instanceof Error ? reason.message : String(reason),
      reason instanceof Error ? reason.stack : undefined,
    );
  });

  if (typeof ResizeObserver === "function") {
    new ResizeObserver(reportHeight).observe(root ?? document.documentElement);
  } else {
    addEventListener("load", reportHeight, { once: true });
  }

  channel.receive(async (data: WidgetIncomingMessage) => {
    await handle(data);
    return { ok: true };
  });
  setTimeout(() => {
    channel.send<WidgetParentEndpoint>({ type: "ready" });
    reportHeight();
  }, 0);
}

function disableHostAndNetworkApis() {
  const blocked = () => {
    throw new Error("Network and host APIs are disabled inside Pochi widgets.");
  };

  window.fetch = blocked;
  window.XMLHttpRequest = blocked as unknown as typeof XMLHttpRequest;
  window.WebSocket = blocked as unknown as typeof WebSocket;
  window.EventSource = blocked as unknown as typeof EventSource;
  navigator.sendBeacon = () => false;
}

function stripScripts(html: string) {
  return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
}
