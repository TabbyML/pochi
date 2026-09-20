import type { Meta, StoryObj } from "@storybook/react";
import { AttemptCompletionTool } from "../components/attempt-completion";
import type { ToolProps } from "../components/types";

const meta: Meta<typeof AttemptCompletionTool> = {
  title: "Features/Tools/AttemptCompletion",
  component: AttemptCompletionTool,
};

export default meta;

type Story = StoryObj<typeof AttemptCompletionTool>;

const toolCall: ToolProps<"attemptCompletion">["tool"] = {
  type: "tool-attemptCompletion",
  toolCallId: "tool-1",
  input: {
    result:
      "The task has been completed successfully. I have updated the files as requested.",
  },
  state: "output-available",
  output: {
    success: true,
  },
};

export const ShowButton: Story = {
  args: {
    tool: toolCall,
    isExecuting: false,
    isLoading: false,
    isLastPart: true,
  },
};

export const HideButtonNotLastPart: Story = {
  args: {
    tool: toolCall,
    isExecuting: false,
    isLoading: false,
    isLastPart: false,
  },
};

export const HideButtonNotLastMessage: Story = {
  args: {
    tool: toolCall,
    isExecuting: false,
    isLoading: false,
    isLastPart: false,
  },
};

export const WithMarkdown: Story = {
  args: {
    tool: {
      ...toolCall,
      input: {
        result: `Here is what I did:
- Updated \`src/App.tsx\`
- Added new component
- Fixed bugs

Please review the changes.`,
      },
    },
    isExecuting: false,
    isLoading: false,
    isLastPart: true,
  },
};
