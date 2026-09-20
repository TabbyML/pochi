import type { Meta, StoryObj } from "@storybook/react";
import type { ToolProps } from "../components/types";
import { UseSkillTool } from "../components/use-skill";

const meta: Meta<typeof UseSkillTool> = {
  title: "Features/Tools/UseSkill",
  component: UseSkillTool,
};

export default meta;

type Story = StoryObj<typeof UseSkillTool>;

const toolCallInput = {
  skill: "translate-text",
};

const toolCallOutput = {
  result: "Translated text: Hello World",
  filePath: "src/translations/en.json",
};

const toolCall: ToolProps<"useSkill">["tool"] = {
  type: "tool-useSkill",
  toolCallId: "tool-1",
  input: toolCallInput,
  state: "output-available",
  output: toolCallOutput,
};

const executingToolCall: ToolProps<"useSkill">["tool"] = {
  type: "tool-useSkill",
  toolCallId: "tool-1",
  input: toolCallInput,
  state: "input-available",
};

export const Executing: Story = {
  args: {
    tool: executingToolCall,
    isExecuting: true,
    isLoading: false,
  },
};

export const Completed: Story = {
  args: {
    tool: toolCall,
    isExecuting: false,
    isLoading: false,
  },
};

export const WithoutFilePath: Story = {
  args: {
    tool: {
      ...toolCall,
      output: {
        _meta: {
          filePath: "foo.md",
        },
        result: "Operation completed successfully without file path.",
      },
    },
    isExecuting: false,
    isLoading: false,
  },
};

export const LongOutput: Story = {
  args: {
    tool: {
      ...toolCall,
      output: {
        ...toolCallOutput,
        result: `Here is a long output from the skill.
It spans multiple lines.
- Item 1
- Item 2
- Item 3

\`\`\`typescript
const x = 1;
console.log(x);
\`\`\`
        `,
      },
    },
    isExecuting: false,
    isLoading: false,
  },
};
