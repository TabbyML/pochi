// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { createRef, useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useScrollToBottom } from "./use-scroll-to-bottom";

class ResizeObserverMock {
  static instances: ResizeObserverMock[] = [];

  private readonly callback: ResizeObserverCallback;

  observe = vi.fn();
  disconnect = vi.fn();

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    ResizeObserverMock.instances.push(this);
  }

  trigger() {
    this.callback([], this as unknown as ResizeObserver);
  }
}

describe("useScrollToBottom", () => {
  beforeEach(() => {
    ResizeObserverMock.instances = [];
    vi.stubGlobal("ResizeObserver", ResizeObserverMock);
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("does not follow streaming resizes after the user scrolls away from the bottom", () => {
    const context = setup();

    context.scrollTo.mockClear();

    act(() => {
      context.userScrollTo(300);
      context.resizeObserver.trigger();
    });

    expect(context.scrollTo).not.toHaveBeenCalled();
  });

  it("pauses following after keyboard scrolling up", () => {
    const context = setup();

    act(() => context.keyboardScrollTo("ArrowUp", 300));
    context.scrollTo.mockClear();
    context.setScrollHeight(1200);
    act(() => context.resizeObserver.trigger());

    expect(context.scrollTo).not.toHaveBeenCalled();
  });

  it("pauses following after touch scrolling up", () => {
    const context = setup();

    act(() => context.touchScrollTo(300));
    context.scrollTo.mockClear();
    context.setScrollHeight(1200);
    act(() => context.resizeObserver.trigger());

    expect(context.scrollTo).not.toHaveBeenCalled();
  });

  it("pauses following after dragging the scrollbar up", () => {
    const context = setup();

    act(() => context.dragScrollbarTo(300));
    context.scrollTo.mockClear();
    context.setScrollHeight(1200);
    act(() => context.resizeObserver.trigger());

    expect(context.scrollTo).not.toHaveBeenCalled();
  });

  it("keeps following when the user scrolls up by less than 40 pixels", () => {
    const context = setup();

    context.scrollTo.mockClear();
    act(() => context.userScrollTo(461));
    context.setScrollHeight(1200);
    act(() => context.resizeObserver.trigger());

    expect(context.scrollTo).toHaveBeenCalledWith({
      top: 1200,
      behavior: "auto",
    });
  });

  it("pauses following after 40 pixels of cumulative user scrolling", () => {
    const context = setup();

    act(() => {
      context.userScrollTo(480);
      context.userScrollTo(460);
    });
    context.scrollTo.mockClear();
    context.setScrollHeight(1200);
    act(() => context.resizeObserver.trigger());

    expect(context.scrollTo).not.toHaveBeenCalled();
  });

  it("accumulates explicit user scrolling across pauses", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const context = setup();

    act(() => context.userScrollTo(480));
    act(() => vi.advanceTimersByTime(151));
    act(() => context.userScrollTo(460));

    context.scrollTo.mockClear();
    context.setScrollHeight(1200);
    act(() => context.resizeObserver.trigger());

    expect(context.scrollTo).not.toHaveBeenCalled();
  });

  it("follows streaming resizes without smooth scrolling", () => {
    const context = setup();

    context.scrollTo.mockClear();
    context.setScrollTop(360);

    act(() => {
      context.resizeObserver.trigger();
    });

    expect(context.scrollTo).toHaveBeenCalledWith({
      top: 1000,
      behavior: "auto",
    });
  });

  it("coalesces streaming resizes within the same animation frame", () => {
    const animationFrames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      animationFrames.push(callback);
      return animationFrames.length;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const context = setup();

    context.scrollTo.mockClear();
    context.setScrollHeight(1200);
    act(() => {
      context.resizeObserver.trigger();
      context.resizeObserver.trigger();
    });

    expect(animationFrames).toHaveLength(1);
    expect(context.scrollTo).not.toHaveBeenCalled();

    act(() => animationFrames[0](0));
    expect(context.scrollTo).toHaveBeenCalledOnce();
    expect(context.scrollTo).toHaveBeenCalledWith({
      top: 1200,
      behavior: "auto",
    });
  });

  it("keeps following across repeated content growth", () => {
    const context = setup();

    context.scrollTo.mockClear();
    context.setScrollHeight(3000);
    act(() => {
      context.programmaticScrollTo(1800);
      context.resizeObserver.trigger();
    });
    expect(context.scrollTo).toHaveBeenCalledWith({
      top: 3000,
      behavior: "auto",
    });

    context.scrollTo.mockClear();
    context.setScrollHeight(3500);
    act(() => context.resizeObserver.trigger());

    expect(context.scrollTo).toHaveBeenCalledWith({
      top: 3500,
      behavior: "auto",
    });
  });

  it("keeps following when an upward correction lands at the bottom", () => {
    const context = setup();

    context.setScrollHeight(1200);
    act(() => context.programmaticScrollTo(700));
    context.setScrollHeight(1000);
    act(() => context.programmaticScrollTo(500));

    context.scrollTo.mockClear();
    context.setScrollHeight(1200);
    act(() => context.resizeObserver.trigger());

    expect(context.scrollTo).toHaveBeenCalledWith({
      top: 1200,
      behavior: "auto",
    });
  });

  it("keeps following after a non-user upward scroll correction", () => {
    const context = setup();

    context.setScrollHeight(1500);
    act(() => context.programmaticScrollTo(300));

    context.scrollTo.mockClear();
    context.setScrollHeight(1600);
    act(() => context.resizeObserver.trigger());

    expect(context.scrollTo).toHaveBeenCalledWith({
      top: 1600,
      behavior: "auto",
    });
  });

  it("resumes following when the user scrolls down into the near-bottom range", () => {
    const context = setup();

    act(() => {
      context.userScrollTo(300);
      context.userScrollTo(350);
    });
    context.scrollTo.mockClear();
    context.setScrollHeight(1200);
    act(() => context.resizeObserver.trigger());

    expect(context.scrollTo).toHaveBeenCalledWith({
      top: 1200,
      behavior: "auto",
    });
  });

  it("does not resume following outside the 150-pixel near-bottom range", () => {
    const context = setup();

    act(() => {
      context.userScrollTo(300);
      context.userScrollTo(349);
    });
    context.scrollTo.mockClear();
    context.setScrollHeight(1200);
    act(() => context.resizeObserver.trigger());

    expect(context.scrollTo).not.toHaveBeenCalled();
  });

  it("does not resume following after a non-user near-bottom correction", () => {
    const context = setup();

    act(() => context.userScrollTo(300));
    act(() => context.programmaticScrollTo(360));
    context.scrollTo.mockClear();
    context.setScrollHeight(1200);
    act(() => context.resizeObserver.trigger());

    expect(context.scrollTo).not.toHaveBeenCalled();
  });

  it("does not scroll on rerender after the user scrolls away from the bottom", () => {
    const context = setup();

    context.scrollTo.mockClear();

    act(() => {
      context.userScrollTo(300);
    });

    context.rerender({});

    expect(context.scrollTo).not.toHaveBeenCalled();
  });

  it("does not scroll on rerender while near the bottom", () => {
    const context = setup();

    context.scrollTo.mockClear();
    context.setScrollTop(360);

    context.rerender({});

    expect(context.scrollTo).not.toHaveBeenCalled();
  });

  it("scrolls when the last message changes to a user message", () => {
    const context = setup();

    context.scrollTo.mockClear();

    context.rerender({
      lastUserMessageId: "user-message-1",
    });

    expect(context.scrollTo).toHaveBeenCalledWith({
      top: 1000,
      behavior: "auto",
    });
  });

  it("resumes following content growth after a new user message", () => {
    const context = setup();

    act(() => context.userScrollTo(300));
    context.rerender({
      lastUserMessageId: "user-message-1",
    });

    context.scrollTo.mockClear();
    context.setScrollHeight(1200);
    act(() => context.resizeObserver.trigger());

    expect(context.scrollTo).toHaveBeenCalledWith({
      top: 1200,
      behavior: "auto",
    });
  });

  it("does not scroll for the initially observed user message id", () => {
    const context = setup({
      lastUserMessageId: "existing-user-message",
    });

    expect(context.scrollTo).toHaveBeenCalledOnce();
    expect(context.scrollTo).toHaveBeenCalledWith({
      top: 1000,
      behavior: "auto",
    });
  });

  it("scrolls when tool call approval buttons become visible", () => {
    const context = setup();

    context.scrollTo.mockClear();

    act(() => {
      context.onToolCallApprovalVisible();
    });

    expect(context.scrollTo).toHaveBeenCalledWith({
      top: 1000,
      behavior: "smooth",
    });
  });

  it("starts observing after the chat scroll container mounts", () => {
    const { container, scrollTo } = createScrollContainer();
    const messagesContainerRef = createRef<HTMLDivElement>();
    const hook = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useScrollToBottom({
          enabled,
          messagesContainerRef,
        }),
      { initialProps: { enabled: false } },
    );

    expect(ResizeObserverMock.instances).toHaveLength(0);
    expect(scrollTo).not.toHaveBeenCalled();

    messagesContainerRef.current = container;
    hook.rerender({ enabled: true });

    expect(ResizeObserverMock.instances).toHaveLength(1);
    expect(scrollTo).toHaveBeenCalledWith({
      top: 1000,
      behavior: "auto",
    });
  });
});

function setup(
  options: {
    lastUserMessageId?: string;
  } = {},
) {
  const {
    container,
    dragScrollbarTo,
    keyboardScrollTo,
    programmaticScrollTo,
    scrollTo,
    setScrollHeight,
    setScrollTop,
    touchScrollTo,
    userScrollTo,
  } = createScrollContainer();

  type HookProps = {
    lastUserMessageId?: string;
  };

  const initialProps: HookProps = {
    lastUserMessageId: options.lastUserMessageId,
  };

  const hook = renderHook(
    ({ lastUserMessageId }: HookProps) => {
      const ref = useRef<HTMLDivElement | null>(container);
      return useScrollToBottom({
        messagesContainerRef: ref,
        lastUserMessageId,
      });
    },
    {
      initialProps,
    },
  );

  expect(ResizeObserverMock.instances).toHaveLength(1);

  return {
    container,
    dragScrollbarTo,
    keyboardScrollTo,
    onToolCallApprovalVisible:
      hook.result.current?.onToolCallApprovalVisible ?? missingApprovalCallback,
    programmaticScrollTo,
    rerender: hook.rerender,
    resizeObserver: ResizeObserverMock.instances[0],
    scrollTo,
    setScrollHeight,
    setScrollTop,
    touchScrollTo,
    userScrollTo,
  };
}

function missingApprovalCallback() {
  throw new Error("onToolCallApprovalVisible is not available");
}

function createScrollContainer() {
  let scrollTop = 500;
  let scrollHeight = 1000;
  const scrollArea = document.createElement("div");
  scrollArea.dataset.slot = "scroll-area";
  const container = document.createElement("div");
  container.appendChild(document.createElement("div"));
  scrollArea.appendChild(container);
  const scrollbar = document.createElement("div");
  scrollbar.dataset.slot = "scroll-area-scrollbar";
  scrollArea.appendChild(scrollbar);

  Object.defineProperties(container, {
    scrollHeight: {
      configurable: true,
      get: () => scrollHeight,
    },
    clientHeight: {
      configurable: true,
      get: () => 500,
    },
    scrollTop: {
      configurable: true,
      get: () => scrollTop,
      set: (value: number) => {
        scrollTop = value;
      },
    },
  });

  const scrollTo = vi.fn((scrollOptions: ScrollToOptions) => {
    if (typeof scrollOptions.top === "number") {
      scrollTop = Math.min(
        scrollOptions.top,
        scrollHeight - container.clientHeight,
      );
    }
  });
  Object.defineProperty(container, "scrollTo", {
    configurable: true,
    value: scrollTo,
  });

  return {
    container,
    dragScrollbarTo: (value: number) => {
      scrollbar.dispatchEvent(createPointerEvent("pointerdown", "mouse"));
      scrollTop = value;
      container.dispatchEvent(new Event("scroll"));
      scrollbar.dispatchEvent(createPointerEvent("pointerup", "mouse"));
    },
    keyboardScrollTo: (key: string, value: number) => {
      container.dispatchEvent(new KeyboardEvent("keydown", { key }));
      scrollTop = value;
      container.dispatchEvent(new Event("scroll"));
    },
    programmaticScrollTo: (value: number) => {
      scrollTop = value;
      container.dispatchEvent(new Event("scroll"));
    },
    scrollTo,
    setScrollHeight: (value: number) => {
      scrollHeight = value;
    },
    setScrollTop: (value: number) => {
      scrollTop = value;
    },
    touchScrollTo: (value: number) => {
      container.dispatchEvent(createPointerEvent("pointerdown", "touch", 100));
      container.dispatchEvent(
        createPointerEvent(
          "pointermove",
          "touch",
          value < scrollTop ? 120 : 80,
        ),
      );
      container.dispatchEvent(createPointerEvent("pointercancel", "touch"));
      scrollTop = value;
      container.dispatchEvent(new Event("scroll"));
    },
    userScrollTo: (value: number) => {
      container.dispatchEvent(
        new WheelEvent("wheel", { deltaY: value < scrollTop ? -1 : 1 }),
      );
      scrollTop = value;
      container.dispatchEvent(new Event("scroll"));
    },
  };
}

function createPointerEvent(type: string, pointerType: string, clientY = 0) {
  const event = new Event(type, { bubbles: true });
  Object.defineProperties(event, {
    clientY: { value: clientY },
    pointerType: { value: pointerType },
  });
  return event;
}
