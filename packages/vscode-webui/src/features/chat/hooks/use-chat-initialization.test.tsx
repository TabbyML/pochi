// @vitest-environment jsdom
import { prompts } from "@getpochi/common";
import type {
  PochiTaskInfo,
  ValidSkillFile,
} from "@getpochi/common/vscode-webui-bridge";
import { renderHook } from "@testing-library/react";
import type { TFunction } from "i18next";
import { describe, expect, it, vi } from "vitest";
import { useChatInitialization } from "./use-chat-initialization";

vi.mock("@/lib/vscode", () => ({
  vscodeHost: { deleteReviews: vi.fn() },
}));

describe("useChatInitialization", () => {
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
});
