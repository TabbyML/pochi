import type { Message, Task } from "@getpochi/livekit";
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

const messageWithTool: Message = {
  id: "msg-1",
  role: "assistant",
  parts: [toolCall],
};

export const ShowButton: Story = {
  args: {
    tool: toolCall,
    isExecuting: false,
    isLoading: false,
    messages: [messageWithTool],
  },
};

const messageWithToolNotLast: Message = {
  id: "msg-1",
  role: "assistant",
  parts: [toolCall, { type: "text", text: "Some text after tool call" }],
};

export const HideButtonNotLastPart: Story = {
  args: {
    tool: toolCall,
    isExecuting: false,
    isLoading: false,
    messages: [messageWithToolNotLast],
  },
};

const messageWithToolNotLastMessage: Message = {
  id: "msg-1",
  role: "assistant",
  parts: [toolCall],
};

const nextMessage: Message = {
  id: "msg-2",
  role: "user",
  parts: [{ type: "text", text: "Thanks" }],
};

export const HideButtonNotLastMessage: Story = {
  args: {
    tool: toolCall,
    isExecuting: false,
    isLoading: false,
    messages: [messageWithToolNotLastMessage, nextMessage],
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
    messages: [messageWithTool],
  },
};

const mockTask: Task = {
  id: "task-1",
  shareId: "task-1",
  cwd: "/workspace/my-project",
  title: "Implement user authentication",
  status: "completed",
  isPublicShared: false,
  parentId: null,
  todos: [],
  git: null,
  pendingToolCalls: null,
  lineChanges: null,
  lastStepDuration: null,
  executionDuration: {
    completedDurations: [
      {
        key: toolCall.toolCallId,
        value: { streamingDuration: 9200, toolCallsDuration: 5000 },
      },
    ],
    current: null,
  },
  totalTokens: 10000,
  error: null,
  createdAt: new Date("2025-12-15T10:00:00Z"),
  updatedAt: new Date("2025-12-15T10:00:00Z"),
  modelId: null,
  displayId: null,
  runAsync: null,
  background: null,
  lastCheckpointHash: null,
};

export const WithDuration: Story = {
  args: {
    tool: toolCall,
    isExecuting: false,
    isLoading: false,
    messages: [messageWithTool],
    task: mockTask,
  },
};

export const WithDurationAndMarkdown: Story = {
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
    messages: [messageWithTool],
    task: mockTask,
  },
};
