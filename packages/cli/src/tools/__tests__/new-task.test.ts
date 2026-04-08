import { getToolArgs } from "@getpochi/tools";
import { describe, expect, it, vi } from "vitest";
import type { ToolCallOptions } from "../../types";
import { newTask } from "../new-task";

describe("newTask whitelist", () => {
  it("should allow agent in newTask whitelist", async () => {
    const run = vi.fn(async () => {});
    const createSubTaskRunner = vi.fn(() =>
      ({
        run,
        state: {
          messages: [
            {
              role: "assistant",
              parts: [
                {
                  type: "tool-attemptCompletion",
                  state: "input-available",
                  input: {
                    result: "ok",
                  },
                },
              ],
            },
          ],
        },
      }) as any,
    );

    const options = {
      createSubTaskRunner,
      customAgents: [
        {
          name: "explore",
          description: "Explore agent",
          tools: ["readFile"],
          systemPrompt: "Explore",
        },
      ],
    } as unknown as ToolCallOptions;

    const result = await newTask(options)(
      {
        description: "desc",
        prompt: "prompt",
        agentType: "explore",
      },
      {
        toolCallId: "tool-1",
        messages: [],
        newTaskAgentTypeWhitelist: ["explore", "plan"],
      } as any,
    );

    expect(result.result).toBe("ok");
    expect(createSubTaskRunner).toHaveBeenCalledOnce();
    expect(run).toHaveBeenCalledOnce();
  });

  it("should reject agent not in newTask whitelist", async () => {
    const options = {
      createSubTaskRunner: vi.fn(() => ({
        run: vi.fn(async () => {}),
        state: { messages: [] },
      })),
      customAgents: [
        {
          name: "explore",
          description: "Explore agent",
          tools: ["readFile"],
          systemPrompt: "Explore",
        },
      ],
    } as unknown as ToolCallOptions;

    await expect(
      newTask(options)(
        {
          description: "desc",
          prompt: "prompt",
          agentType: "browser",
        },
        {
          toolCallId: "tool-1",
          messages: [],
          newTaskAgentTypeWhitelist: ["explore", "plan"],
        } as any,
      ),
    ).rejects.toThrow("Agent is not supported. Allowed agents: explore, plan");
  });

  it("should parse multi-agent arguments from single newTask spec", () => {
    const allowed = getToolArgs(["newTask(explore,plan)"], "newTask");

    expect(allowed).toEqual(["explore", "plan"]);
  });

  it("should merge multi-agent arguments from multiple newTask specs", () => {
    const allowed = getToolArgs(
      ["newTask(explore)", "newTask(plan)", "newTask(explore)"],
      "newTask",
    );

    expect(allowed).toEqual(["explore", "plan"]);
  });
});
