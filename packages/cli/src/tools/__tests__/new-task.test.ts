import { getToolArgs } from "@getpochi/tools";
import { describe, expect, it, vi } from "vitest";
import type { ToolCallOptions } from "../../types";
import { newTask } from "../new-task";

describe("newTask whitelist", () => {
  const createRunnerMocks = () => {
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

    return { run, createSubTaskRunner };
  };

  const createBaseOptions = (createSubTaskRunner: ReturnType<typeof vi.fn>) =>
    ({
      createSubTaskRunner,
      customAgents: [
        {
          name: "explore",
          description: "Explore agent",
          tools: ["readFile"],
          systemPrompt: "Explore",
        },
        {
          name: "planner",
          description: "Planner agent",
          tools: ["newTask(explore)", "readFile"],
          systemPrompt: "Plan",
        },
      ],
    }) as unknown as ToolCallOptions;

  it("should allow explore when whitelist contains explore", async () => {
    const { run, createSubTaskRunner } = createRunnerMocks();
    const options = createBaseOptions(createSubTaskRunner);

    const result = await newTask(options)(
      {
        description: "desc",
        prompt: "prompt",
        agentType: "explore",
      },
      {
        toolCallId: "tool-1",
        messages: [],
        newTaskAgentTypeWhitelist: ["explore"],
      } as any,
    );

    expect(result.result).toBe("ok");
    expect(createSubTaskRunner).toHaveBeenCalledOnce();
    expect(run).toHaveBeenCalledOnce();
  });

  it("should reject agent not in whitelist", async () => {
    const { createSubTaskRunner } = createRunnerMocks();
    const options = createBaseOptions(createSubTaskRunner);

    await expect(
      newTask(options)(
        {
          description: "desc",
          prompt: "prompt",
          agentType: "planner",
        },
        {
          toolCallId: "tool-1",
          messages: [],
          newTaskAgentTypeWhitelist: ["explore"],
        } as any,
      ),
    ).rejects.toThrow("Agent is not supported. Allowed agents: explore");
  });

  it("should allow nested explore from planner-configured newTask rule", async () => {
    const { run, createSubTaskRunner } = createRunnerMocks();
    const options = createBaseOptions(createSubTaskRunner);
    const plannerTools = ["newTask(explore)", "readFile"];
    const newTaskAgentTypeWhitelist = getToolArgs(plannerTools, "newTask");

    expect(newTaskAgentTypeWhitelist).toEqual(["explore"]);

    const result = await newTask(options)(
      {
        description: "nested",
        prompt: "nested prompt",
        agentType: "explore",
      },
      {
        toolCallId: "tool-nested",
        messages: [],
        newTaskAgentTypeWhitelist,
      } as any,
    );

    expect(result.result).toBe("ok");
    expect(createSubTaskRunner).toHaveBeenCalledOnce();
    expect(run).toHaveBeenCalledOnce();
  });

  it("should parse multi-agent arguments from single newTask spec", () => {
    const allowed = getToolArgs(["newTask(explore,plan)"], "newTask");

    expect(allowed).toEqual(["explore", "plan"]);
  });
});
