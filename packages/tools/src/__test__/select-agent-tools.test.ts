import type { Tool } from "ai";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { type CustomAgent, selectAgentTools } from "../index";

const ClientToolNames = [
  "applyDiff",
  "askFollowupQuestion",
  "attemptCompletion",
  "editNotebook",
  "executeCommand",
  "globFiles",
  "killBackgroundJob",
  "listFiles",
  "newTask",
  "readBackgroundJobOutput",
  "readFile",
  "searchFiles",
  "startBackgroundJob",
  "todoWrite",
  "useSkill",
  "writeToFile",
].sort();

const RequiredAgentToolNames = [
  "attemptCompletion",
  "todoWrite",
  "useSkill",
].sort();

function createAgent(overrides: Partial<CustomAgent> = {}): CustomAgent {
  return {
    name: "test-agent",
    description: "Test agent",
    systemPrompt: "Test system prompt",
    ...overrides,
  };
}

function createTool(description: string): Tool {
  return { description } as Tool;
}

function toolNames(tools: Record<string, unknown>): string[] {
  return Object.keys(tools).sort();
}

describe("selectAgentTools", () => {
  it("returns all client tools and MCP tools when no agent filter is configured", () => {
    const mcpTool = createTool("MCP search");

    const tools = selectAgentTools({
      isSubTask: false,
      mcpTools: { mcpSearch: mcpTool },
    });

    expect(toolNames(tools)).toEqual([...ClientToolNames, "mcpSearch"].sort());
    expect(tools.mcpSearch).toBe(mcpTool);
    expect(tools).not.toHaveProperty("createReview");
  });

  it.each<[string[] | undefined]>([[undefined], [[]]])(
    "does not filter tools when agent tools are %s",
    (agentTools) => {
      const mcpTool = createTool("MCP lookup");

      const tools = selectAgentTools({
        agent: createAgent({ tools: agentTools }),
        isSubTask: false,
        mcpTools: { mcpLookup: mcpTool },
      });

      expect(toolNames(tools)).toEqual(
        [...ClientToolNames, "mcpLookup"].sort(),
      );
      expect(tools.mcpLookup).toBe(mcpTool);
    },
  );

  it("filters to declared agent tools plus required completion tools", () => {
    const mcpTool = createTool("MCP lookup");

    const tools = selectAgentTools({
      agent: createAgent({
        tools: [
          "readFile",
          "searchFiles",
          "executeCommand(git status)",
          "mcpLookup",
          "missingTool",
        ],
      }),
      isSubTask: false,
      mcpTools: { mcpLookup: mcpTool },
    });

    expect(toolNames(tools)).toEqual(
      [
        ...RequiredAgentToolNames,
        "executeCommand",
        "mcpLookup",
        "readFile",
        "searchFiles",
      ].sort(),
    );
    expect(tools.mcpLookup).toBe(mcpTool);
    expect(tools).not.toHaveProperty("executeCommand(git status)");
    expect(tools).not.toHaveProperty("missingTool");
  });

  it("extracts builtin tool names from file tool declarations with rules", () => {
    const tools = selectAgentTools({
      agent: createAgent({
        tools: [
          "readFile(src/**)",
          "readFile(pochi://-/plan.md)",
          "writeToFile(pochi://-/notes.md)",
          "applyDiff(src/**)",
          "editNotebook(src/**/*.ipynb)",
          "executeCommand(git status)",
        ],
      }),
      isSubTask: false,
    });

    expect(toolNames(tools)).toEqual(
      [
        ...RequiredAgentToolNames,
        "applyDiff",
        "editNotebook",
        "executeCommand",
        "readFile",
        "writeToFile",
      ].sort(),
    );
    expect(tools).not.toHaveProperty("readFile(src/**)");
    expect(tools).not.toHaveProperty("readFile(pochi://-/plan.md)");
    expect(tools).not.toHaveProperty("writeToFile(pochi://-/notes.md)");
    expect(tools).not.toHaveProperty("applyDiff(src/**)");
    expect(tools).not.toHaveProperty("editNotebook(src/**/*.ipynb)");
    expect(tools).not.toHaveProperty("executeCommand(git status)");
  });

  it("only enables askFollowupQuestion for planner and guide agents", () => {
    const disallowed = selectAgentTools({
      agent: createAgent({
        name: "test-agent",
        tools: ["askFollowupQuestion", "readFile"],
      }),
      isSubTask: false,
    });

    expect(toolNames(disallowed)).toEqual(
      [...RequiredAgentToolNames, "readFile"].sort(),
    );

    for (const agentName of ["planner", "guide"]) {
      const allowed = selectAgentTools({
        agent: createAgent({
          name: agentName,
          tools: ["askFollowupQuestion", "readFile"],
        }),
        isSubTask: false,
      });

      expect(toolNames(allowed)).toEqual(
        [
          ...RequiredAgentToolNames,
          "askFollowupQuestion",
          "readFile",
        ].sort(),
      );
    }
  });

  it("removes newTask from subtasks but keeps it for top-level agents", () => {
    const agent = createAgent({ tools: ["newTask", "readFile"] });

    const topLevelTools = selectAgentTools({
      agent,
      isSubTask: false,
    });
    const subTaskTools = selectAgentTools({
      agent,
      isSubTask: true,
    });

    expect(toolNames(topLevelTools)).toEqual(
      [...RequiredAgentToolNames, "newTask", "readFile"].sort(),
    );
    expect(toolNames(subTaskTools)).toEqual(
      [...RequiredAgentToolNames, "readFile"].sort(),
    );
  });

  it("exposes createReview only for reviewer agents that declare it", () => {
    const reviewerTools = selectAgentTools({
      agent: createAgent({
        name: "reviewer",
        tools: ["createReview", "readFile"],
      }),
      isSubTask: false,
    });
    const reviewerWithoutCreateReview = selectAgentTools({
      agent: createAgent({
        name: "reviewer",
        tools: ["readFile"],
      }),
      isSubTask: false,
    });
    const nonReviewerTools = selectAgentTools({
      agent: createAgent({
        name: "not-reviewer",
        tools: ["createReview", "readFile"],
      }),
      isSubTask: false,
    });

    expect(toolNames(reviewerTools)).toEqual(
      [...RequiredAgentToolNames, "createReview", "readFile"].sort(),
    );
    expect(toolNames(reviewerWithoutCreateReview)).toEqual(
      [...RequiredAgentToolNames, "readFile"].sort(),
    );
    expect(toolNames(nonReviewerTools)).toEqual(
      [...RequiredAgentToolNames, "readFile"].sort(),
    );
  });

  it("lets MCP tools override client tools with the same name", () => {
    const mcpReadFile = createTool("MCP readFile override");

    const tools = selectAgentTools({
      agent: createAgent({ tools: ["readFile"] }),
      isSubTask: false,
      mcpTools: { readFile: mcpReadFile },
    });

    expect(toolNames(tools)).toEqual(
      [...RequiredAgentToolNames, "readFile"].sort(),
    );
    expect(tools.readFile).toBe(mcpReadFile);
  });

  it("passes tool creation options through selected client tools", () => {
    const customAgent = createAgent({
      name: "child-agent",
      description: "Runs child tasks",
    });
    const customResultSchema = z.object({
      ok: z.boolean(),
    });

    const tools = selectAgentTools({
      isSubTask: false,
      contentType: ["image/png"],
      customAgents: [customAgent],
      skills: [
        {
          name: "demo-skill",
          description: "Demonstrates skill injection",
          filePath: "/tmp/demo-skill/SKILL.md",
          instructions: "Do the thing.",
        },
      ],
      attemptCompletionSchema: customResultSchema as unknown as z.ZodAny,
    });
    const completionInputSchema = tools.attemptCompletion
      ?.inputSchema as z.ZodType;

    expect(tools.readFile?.description).toContain("image/png");
    expect(tools.newTask?.description).toContain("child-agent");
    expect(tools.useSkill?.description).toContain("demo-skill");
    expect(
      completionInputSchema.safeParse({
        result: { ok: true },
      }).success,
    ).toBe(true);
    expect(
      completionInputSchema.safeParse({
        result: "plain text",
      }).success,
    ).toBe(false);
  });
});
