import { createChannel } from "bidc";
import morphdom from "morphdom";
import {
  InvalidWidgetStateError,
  MissingWidgetStateError,
  type RenderWidgetErrorKind,
} from "../../../chat/lib/render-widget-error";
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
  | {
      type: "error";
      message: string;
      kind: RenderWidgetErrorKind;
      stack?: string;
    }
  | { type: "state"; state: unknown };
type WidgetParentEndpoint = (event: WidgetEvent) => { ok: true };

const RevealDelayStepMs = 80;
const MaxRevealDelayMs = 6000;

export interface PochiWidgetApi {
  readonly state: unknown;
  setState(nextState: unknown): void;
}

declare global {
  interface Window {
    pochi: PochiWidgetApi;
  }
}

export function getWidgetRevealDelayMs(index: number) {
  return Math.min(index * RevealDelayStepMs, MaxRevealDelayMs);
}

interface PochiWidgetStateRuntimeOptions {
  root: Element;
  reportState: (state: unknown) => void;
  reportError: (message: string, stack?: string) => void;
}

export function installPochiWidgetStateRuntime({
  root,
  reportState,
  reportError,
}: PochiWidgetStateRuntimeOptions) {
  ensurePochiWidgetElementDefined();

  const widgetElement = findTopLevelPochiWidget(root);
  if (!widgetElement) {
    reportError(MissingWidgetStateError);
  }
  let currentState = widgetElement
    ? readWidgetState(widgetElement, reportError)
    : {};
  let currentStateJson = stringifyWidgetState(currentState);
  reportState(currentState);

  const syncState = (nextState: unknown) => {
    try {
      const jsonState = cloneJsonSerializableState(nextState);
      currentState = jsonState;
      currentStateJson = stringifyWidgetState(jsonState);
      if (widgetElement) {
        widgetElement.setAttribute("state", currentStateJson);
        widgetElement.dispatchEvent(
          new CustomEvent("pochi-state-change", {
            detail: { state: jsonState },
          }),
        );
      } else {
        reportError(MissingWidgetStateError);
      }
      reportState(jsonState);
    } catch (error) {
      reportError(error instanceof Error ? error.message : String(error));
    }
  };

  const api: PochiWidgetApi = {
    get state() {
      return cloneJsonSerializableState(currentState);
    },
    setState: syncState,
  };
  window.pochi = api;

  const syncFromWidgetElement = () => {
    if (!widgetElement) return;
    const nextState = readWidgetState(widgetElement, reportError);
    const nextStateJson = stringifyWidgetState(nextState);
    if (nextStateJson === currentStateJson) return;
    currentState = nextState;
    currentStateJson = nextStateJson;
    reportState(nextState);
  };

  widgetElement?.addEventListener("pochi-state-change", syncFromWidgetElement);

  const observer =
    widgetElement && typeof MutationObserver === "function"
      ? new MutationObserver(syncFromWidgetElement)
      : undefined;
  observer?.observe(widgetElement as Element, {
    attributes: true,
    attributeFilter: ["state"],
  });

  return () => {
    observer?.disconnect();
    widgetElement?.removeEventListener(
      "pochi-state-change",
      syncFromWidgetElement,
    );
    if (window.pochi === api) {
      // @ts-expect-error removing iframe-local injected API during teardown
      window.pochi = undefined;
    }
  };
}

export function startWidgetRenderer() {
  disableHostAndNetworkApis();

  const root = document.getElementById("root");
  let lastVisualHtml = "";
  let lastExecutedFinalHtml = "";
  let lastVisualRevealAnimated = false;
  let cleanupStateRuntime: (() => void) | undefined;
  const externalScriptLoadPromises = new Map<string, Promise<void>>();
  const channel = createChannel(root?.dataset.channelId || "pochi-widget");

  const reportError = (message: string, stack?: string) => {
    channel.send<WidgetParentEndpoint>({
      type: "error",
      message,
      kind: "runtime",
      stack,
    });
  };
  const reportInternalError = (message: string, stack?: string) => {
    channel.send<WidgetParentEndpoint>({
      type: "error",
      message,
      kind: "internal",
      stack,
    });
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
      const delay = getWidgetRevealDelayMs(index);
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
      if (root) {
        cleanupStateRuntime?.();
        const cleanup = installPochiWidgetStateRuntime({
          root,
          reportState: (state) => {
            channel.send<WidgetParentEndpoint>({ type: "state", state });
          },
          reportError: reportInternalError,
        });
        cleanupStateRuntime = cleanup;
      }
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

function ensurePochiWidgetElementDefined() {
  if (typeof customElements === "undefined") return;
  if (customElements.get("pochi-widget")) return;

  class PochiWidgetElement extends HTMLElement {
    get state() {
      return JSON.parse(this.getAttribute("state") || "{}");
    }

    set state(nextState: unknown) {
      const jsonState = cloneJsonSerializableState(nextState);
      this.setAttribute("state", stringifyWidgetState(jsonState));
      this.dispatchEvent(
        new CustomEvent("pochi-state-change", {
          detail: { state: jsonState },
        }),
      );
    }
  }

  customElements.define("pochi-widget", PochiWidgetElement);
}

function findTopLevelPochiWidget(root: Element) {
  return Array.from(root.children).find(
    (child) => child.tagName.toLowerCase() === "pochi-widget",
  );
}

function readWidgetState(
  widgetElement: Element,
  reportError: (message: string, stack?: string) => void,
) {
  const rawState = widgetElement.getAttribute("state") || "{}";
  try {
    return cloneJsonSerializableState(JSON.parse(rawState));
  } catch (error) {
    reportError(
      error instanceof Error ? error.message : String(error),
      error instanceof Error ? error.stack : undefined,
    );
    return {};
  }
}

function stringifyWidgetState(state: unknown) {
  return JSON.stringify(state);
}

function cloneJsonSerializableState(state: unknown) {
  assertJsonSerializable(state);
  return JSON.parse(JSON.stringify(state)) as unknown;
}

function assertJsonSerializable(state: unknown, seen = new Set<object>()) {
  if (state === null) return;

  const stateType = typeof state;
  if (stateType === "string" || stateType === "boolean") return;
  if (stateType === "number") {
    if (!Number.isFinite(state)) throw new Error(InvalidWidgetStateError);
    return;
  }
  if (stateType !== "object") throw new Error(InvalidWidgetStateError);

  const objectState = state as object;
  if (seen.has(objectState)) throw new Error(InvalidWidgetStateError);
  seen.add(objectState);

  if (Array.isArray(state)) {
    for (const item of state) {
      assertJsonSerializable(item, seen);
    }
    seen.delete(objectState);
    return;
  }

  const prototype = Object.getPrototypeOf(state);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error(InvalidWidgetStateError);
  }

  for (const value of Object.values(state as Record<string, unknown>)) {
    assertJsonSerializable(value, seen);
  }
  seen.delete(objectState);
}
