import type {
  ValidCustomAgentFile,
  ValidSkillFile,
} from "@getpochi/common/vscode-webui-bridge";
import { describe, expect, it } from "vitest";
import { resolveSlashMentions } from "./resolve-slash-mentions";

const customAgent: ValidCustomAgentFile = {
  name: "tester",
  description: "Run test tasks",
  filePath: "/agents/tester.md",
  systemPrompt: "Test the requested behavior.",
};

const skill: ValidSkillFile = {
  name: "deploy",
  description: "Deploy the application",
  filePath: "/skills/deploy/SKILL.md",
  instructions: "Deploy safely.",
};

describe("resolveSlashMentions", () => {
  it("collects selected custom-agent nodes once", () => {
    const mention = {
      type: "slashMention",
      attrs: {
        type: "custom-agent",
        id: "tester",
        rawData: customAgent,
      },
    };

    expect(
      resolveSlashMentions(
        {
          text: "use tester twice",
          json: {
            type: "doc",
            content: [
              { type: "paragraph", content: [mention, mention] },
            ],
          },
        },
        [],
        [customAgent],
      ),
    ).toEqual({
      status: "valid",
      text: "use tester twice",
      invokedSkills: [],
      invokedCustomAgents: ["tester"],
    });
  });

  it("collects selected skill nodes", () => {
    expect(
      resolveSlashMentions(
        {
          text: "deploy this",
          json: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [
                  {
                    type: "slashMention",
                    attrs: {
                      type: "skill",
                      id: "deploy",
                      rawData: skill,
                    },
                  },
                ],
              },
            ],
          },
        },
        [skill],
      ),
    ).toEqual({
      status: "valid",
      text: "deploy this",
      invokedSkills: [skill],
      invokedCustomAgents: [],
    });
  });

  it("blocks a selected skill that is not user-invocable", () => {
    const result = resolveSlashMentions(
      {
        text: "deploy this",
        json: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "slashMention",
                  attrs: {
                    type: "skill",
                    id: "deploy",
                    rawData: skill,
                  },
                },
              ],
            },
          ],
        },
      },
      [{ ...skill, userInvocable: false }],
    );

    expect(result.status).toBe("blocked");
    if (result.status === "blocked") {
      expect(result.message).toContain('Skill "deploy" cannot be invoked');
    }
  });

  it("does not invoke agents or skills from plain text", () => {
    const text = "use /tester and /deploy for this task";

    expect(
      resolveSlashMentions(
        {
          text,
          json: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text }],
              },
            ],
          },
        },
        [skill],
        [customAgent],
      ),
    ).toEqual({
      status: "valid",
      text,
      invokedSkills: [],
      invokedCustomAgents: [],
    });
  });

  it("does not treat paths containing known skill names as invocations", () => {
    for (const text of [
      "src/deploy/index.ts",
      "./deploy",
      "../deploy",
      "/usr/bin/deploy",
      "C:\\deploy\\index.ts",
      "https://example.com/deploy",
    ]) {
      expect(
        resolveSlashMentions(
          {
            text,
            json: {
              type: "doc",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text }],
                },
              ],
            },
          },
          [{ ...skill, userInvocable: false }],
        ),
      ).toEqual({
        status: "valid",
        text,
        invokedSkills: [],
        invokedCustomAgents: [],
      });
    }
  });

  it("blocks a selected custom agent that is no longer available", () => {
    expect(
      resolveSlashMentions(
        {
          text: "/tester",
          json: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [
                  {
                    type: "slashMention",
                    attrs: {
                      type: "custom-agent",
                      id: "tester",
                      rawData: customAgent,
                    },
                  },
                ],
              },
            ],
          },
        },
        [],
        [],
      ),
    ).toEqual({
      status: "blocked",
      message:
        'Agent "tester" is no longer available. Remove or reselect the slash command.',
    });
  });
});
