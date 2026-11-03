import type { Message } from "@getpochi/livekit";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  store: { storeId: "parent-store" },
  manager: { registerSession: vi.fn(), unregisterSession: vi.fn() },
  settings: { runtime: { mode: "localChrome" } },
}));
vi.mock("../use-default-store", () => ({ useDefaultStore: () => mocks.store }));
vi.mock("../vscode", () => ({ vscodeHost: {} }));
vi.mock("../browser-session-manager", () => ({
  browserSessionManager: mocks.manager,
}));
vi.mock("../hooks/use-browser-agent-settings", () => ({
  useBrowserAgentSettings: () => ({ browserSettings: mocks.settings }),
}));
vi.mock("@getpochi/common/store-id-utils", () => ({
  decodeStoreId: () => ({ taskId: "parent" }),
}));
import { useManageBrowserSession } from "../use-browser-session";

const browserMessage = (
  state: string,
  uid: string | undefined = "browser-task",
  background?: boolean,
) =>
  ({
    id: "browser-call-message",
    role: "assistant",
    parts: [
      {
        type: "tool-newTask",
        toolCallId: "call",
        state,
        input: {
          agentType: "browser",
          ...(background === undefined ? {} : { background }),
          _meta: { uid },
        },
        ...(state === "output-available" ? { output: { result: "done" } } : {}),
      },
    ],
  }) as Message;
const nextMessage = {
  id: "next",
  role: "assistant",
  parts: [{ type: "text", text: "Result" }],
} as Message;

afterEach(() => vi.clearAllMocks());
describe("browser session lifecycle in the parent task", () => {
  it.each(["output-available", "output-error"])(
    "flushes a %s browser call even when the parent has already continued",
    async (state) => {
      const { rerender } = renderHook(
        ({ messages }) => useManageBrowserSession({ messages }),
        {
          initialProps: {
            messages: [
              browserMessage("input-available", "browser-task", false),
            ],
          },
        },
      );
      expect(mocks.manager.registerSession).toHaveBeenCalledWith(
        "browser-task",
        "parent",
        { viewport: undefined },
      );
      rerender({
        messages: [browserMessage(state, "browser-task", false), nextMessage],
      });
      await waitFor(() =>
        expect(mocks.manager.unregisterSession).toHaveBeenCalledWith(
          "browser-task",
          "call",
          mocks.store,
        ),
      );
    },
  );

  it("recovers an active foreground browser session preceding a newer message", () => {
    renderHook(() =>
      useManageBrowserSession({
        messages: [
          browserMessage("input-available", "browser-task", false),
          nextMessage,
        ],
      }),
    );
    expect(mocks.manager.registerSession).toHaveBeenCalledWith(
      "browser-task",
      "parent",
      { viewport: undefined },
    );
  });

  it("does not pre-register a background browser task before it starts executing", () => {
    renderHook(() =>
      useManageBrowserSession({
        messages: [browserMessage("input-available")],
      }),
    );
    expect(mocks.manager.registerSession).not.toHaveBeenCalled();
  });

  it("keeps the session of a browser task running in the background", () => {
    const message = browserMessage("output-available");
    (message.parts[0] as { output: unknown }).output = {
      result: "started",
      backgroundJobId: "bgjob-task-browser-task",
    };
    renderHook(() =>
      useManageBrowserSession({ messages: [message, nextMessage] }),
    );
    expect(mocks.manager.unregisterSession).not.toHaveBeenCalled();
  });

  it("does not register a default/empty session before a task ID is assigned", () => {
    const message = browserMessage("input-available", "browser-task", false);
    (message.parts[0] as { input: { _meta: unknown } }).input._meta = undefined;
    renderHook(() => useManageBrowserSession({ messages: [message] }));
    expect(mocks.manager.registerSession).not.toHaveBeenCalled();
    expect(mocks.manager.unregisterSession).not.toHaveBeenCalled();
  });
});
