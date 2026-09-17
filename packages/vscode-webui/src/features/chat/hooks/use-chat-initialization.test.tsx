// @vitest-environment jsdom
import { getOrLoadTaskStore } from "@/lib/use-default-store";
import { prompts } from "@getpochi/common";
import type {
  PochiTaskInfo,
  ValidSkillFile,
} from "@getpochi/common/vscode-webui-bridge";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { TFunction } from "i18next";
import { describe, expect, it, vi } from "vitest";
import { useChatInitialization } from "./use-chat-initialization";

vi.mock("@/lib/vscode", () => ({
  vscodeHost: { deleteReviews: vi.fn() },
}));

vi.mock("@/lib/use-default-store", () => ({
  getOrLoadTaskStore: vi.fn(),
}));

function createForkOptions() {
  return {
    chatKit: { inited: false, fork: vi.fn() },
    info: {
      type: "fork-task" as const,
      uid: "fork-task",
      storeId: "fork-store",
      cwd: "/workspace",
      forkParams: {
        sourceStoreId: "source-store",
        sourceTaskId: "source-task",
        commitId: "checkpoint",
        messageId: "message",
        title: "Forked task",
      },
    },
    storeRegistry: {} as never,
    jwt: null,
    t: ((key: string) => key) as TFunction,
    setMcpConfigOverride: vi.fn() as never,
    isMcpConfigLoading: false,
  };
}

function renderForkInitialization(
  options: ReturnType<typeof createForkOptions>,
) {
  return renderHook(() =>
    useChatInitialization({ ...options, chatKit: options.chatKit as never }),
  );
}

describe("useChatInitialization", () => {
  it("copies a fork from its source store and finishes initialization", async () => {
    const options = createForkOptions();
    const sourceStore = {
      shutdownPromise: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(getOrLoadTaskStore).mockResolvedValueOnce(sourceStore as never);

    const { result } = renderForkInitialization(options);
    expect(result.current.isInitializing).toBe(true);

    await waitFor(() => expect(result.current.isInitializing).toBe(false));
    expect(options.chatKit.fork).toHaveBeenCalledExactlyOnceWith(sourceStore, {
      taskId: "source-task",
      commitId: "checkpoint",
      messageId: "message",
      title: "Forked task",
    });
    expect(sourceStore.shutdownPromise).toHaveBeenCalledOnce();
    expect(result.current.error).toBeUndefined();
  });

  it.each(["load", "fork", "shutdown"])(
    "exposes a fork initialization error during %s instead of silently opening an empty task",
    async (phase) => {
      const options = createForkOptions();
      const error = new Error(`Failed to ${phase}`);
      const sourceStore = {
        shutdownPromise: vi.fn().mockResolvedValue(undefined),
      };
      if (phase === "load") {
        vi.mocked(getOrLoadTaskStore).mockRejectedValueOnce(error);
      } else {
        vi.mocked(getOrLoadTaskStore).mockResolvedValueOnce(
          sourceStore as never,
        );
        if (phase === "fork") {
          options.chatKit.fork.mockImplementation(() => {
            throw error;
          });
        } else {
          sourceStore.shutdownPromise.mockRejectedValueOnce(error);
        }
      }

      const { result } = renderForkInitialization(options);

      await waitFor(() => expect(result.current.error).toBe(error));
      expect(result.current.isInitializing).toBe(false);
      if (phase === "load") {
        expect(options.chatKit.fork).not.toHaveBeenCalled();
      } else {
        expect(sourceStore.shutdownPromise).toHaveBeenCalledOnce();
      }
    },
  );

  it("releases a source store loaded after the fork was cancelled", async () => {
    const options = createForkOptions();
    const sourceStore = {
      shutdownPromise: vi.fn().mockResolvedValue(undefined),
    };
    let finishLoading!: (store: never) => void;
    vi.mocked(getOrLoadTaskStore).mockReturnValueOnce(
      new Promise((resolve) => {
        finishLoading = resolve;
      }),
    );

    const { unmount } = renderForkInitialization(options);
    unmount();
    await act(async () => {
      finishLoading(sourceStore as never);
    });

    expect(options.chatKit.fork).not.toHaveBeenCalled();
    expect(sourceStore.shutdownPromise).toHaveBeenCalledOnce();
  });

  it("keeps a compact task in the loading state until initialization can run", () => {
    const init = vi.fn();
    const { result } = renderHook(() =>
      useChatInitialization({
        chatKit: { inited: false, init } as never,
        info: {
          type: "compact-task",
          uid: "task-1",
          cwd: "/workspace",
          messages: "[]",
        },
        storeRegistry: {} as never,
        jwt: null,
        t: ((key: string) => key) as TFunction,
        setMcpConfigOverride: vi.fn() as never,
        isMcpConfigLoading: true,
      }),
    );

    expect(result.current.isInitializing).toBe(true);
    expect(init).not.toHaveBeenCalled();
  });

  it("assembles invoked skills as reminder parts for a new task", () => {
    const skill: ValidSkillFile = {
      name: "deploy",
      description: "Deploy the application",
      filePath: "/skills/deploy/SKILL.md",
      instructions: "Run the deployment workflow.",
    };
    const info: PochiTaskInfo = {
      type: "new-task",
      uid: "task-1",
      cwd: "/workspace",
      prompt: "/deploy",
      invokedSkills: [skill],
    };
    const init = vi.fn();

    renderHook(() =>
      useChatInitialization({
        chatKit: { inited: false, init } as never,
        info,
        storeRegistry: {} as never,
        jwt: null,
        t: ((key: string) => key) as TFunction,
        setMcpConfigOverride: vi.fn() as never,
        isMcpConfigLoading: false,
      }),
    );

    expect(init).toHaveBeenCalledWith("/workspace", {
      prompt: "/deploy",
      parts: [
        { type: "text", text: prompts.skillSystemReminder(skill) },
        { type: "text", text: "/deploy" },
      ],
    });
  });

  it("assembles invoked custom agents as reminder parts for a new task", () => {
    const prompt =
      'use <custom-agent id="tester" path="/agents/tester.md">/tester</custom-agent> for this task';
    const info: PochiTaskInfo = {
      type: "new-task",
      uid: "task-1",
      cwd: "/workspace",
      prompt,
      invokedCustomAgents: ["tester"],
    };
    const init = vi.fn();

    renderHook(() =>
      useChatInitialization({
        chatKit: { inited: false, init } as never,
        info,
        storeRegistry: {} as never,
        jwt: null,
        t: ((key: string) => key) as TFunction,
        setMcpConfigOverride: vi.fn() as never,
        isMcpConfigLoading: false,
      }),
    );

    expect(init).toHaveBeenCalledWith("/workspace", {
      prompt,
      parts: [
        {
          type: "text",
          text: prompts.customAgentSystemReminder("tester"),
        },
        { type: "text", text: prompt },
      ],
    });
  });

  it("adds pasted text file references for a new task", () => {
    const pastedTextFiles = [
      { filePath: "/tmp/pasted.txt", title: "large pasted text" },
    ];
    const info = {
      type: "new-task",
      uid: "task-1",
      cwd: "/workspace",
      prompt: "Analyze this",
      pastedTextFiles,
    } as PochiTaskInfo;
    const init = vi.fn();

    renderHook(() =>
      useChatInitialization({
        chatKit: { inited: false, init } as never,
        info,
        storeRegistry: {} as never,
        jwt: null,
        t: ((key: string) => key) as TFunction,
        setMcpConfigOverride: vi.fn() as never,
        isMcpConfigLoading: false,
      }),
    );

    expect(init).toHaveBeenCalledWith("/workspace", {
      prompt: "Analyze this",
      parts: [
        { type: "text", text: "Analyze this" },
        {
          type: "text",
          text: prompts.createSystemReminder(
            prompts.pastedTextFileReferences(pastedTextFiles),
          ),
        },
        {
          type: "data-pasted-text",
          data: pastedTextFiles[0],
        },
      ],
    });
  });
});
