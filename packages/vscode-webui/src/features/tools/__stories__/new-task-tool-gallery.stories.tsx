import type { Meta, StoryObj } from "@storybook/react";

import type { TaskThreadSource } from "@/components/task-thread";
import type { Message } from "@getpochi/livekit";
import type { Todo } from "@getpochi/tools";
import type { ToolUIPart } from "ai";
import { newTaskTool } from "../components/new-task";
import type { ToolProps } from "../components/types";

const NewTaskTool = newTaskTool;

const ToolsGallery: React.FC<{
  tools: ToolUIPart[];
}> = ({ tools = [] }) => {
  return (
    <div className="mt-3 ml-1 flex flex-col gap-2">
      {tools.map((tool, index) => (
        <NewTaskTool
          // @ts-ignore
          tool={tool}
          key={tool.toolCallId + index}
          taskThreadSource={
            (tool as { taskThreadSource?: TaskThreadSource }).taskThreadSource
          }
        />
      ))}
    </div>
  );
};

const meta: Meta<typeof ToolsGallery> = {
  title: "Features/Tools/NewTask",
  component: ToolsGallery,
};

export default meta;

type Story = StoryObj<typeof ToolsGallery>;
type NewTaskProp = ToolProps<"newTask">;

// Mock data for TaskThreadSource stories
const mockMessages: Message[] = [
  {
    id: "msg-0",
    role: "user",
    parts: [
      {
        type: "text",
        text: "hello",
        state: "done",
      },
    ],
  },
  ...new Array(8).fill(0).map(
    (_, i) =>
      ({
        id: `msg-${i}`,
        metadata: {
          kind: "assistant",
          totalTokens: 150,
          finishReason: "tool-calls",
        },
        role: "assistant",
        parts: [
          {
            type: "step-start",
          },
          {
            type: "text",
            text: "I'll help you create a new React component with TypeScript support.",
            state: "done",
          },
          {
            type: "tool-writeToFile",
            toolCallId: "tool-1",
            state: "output-available",
            input: {
              path: "src/components/NewComponent.tsx",
              content:
                "import React from 'react';\n\ninterface NewComponentProps {\n  title: string;\n}\n\nexport const NewComponent: React.FC<NewComponentProps> = ({ title }) => {\n  return <div>{title}</div>;\n};",
            },
            output: {
              success: true,
            },
          },
        ],
      }) satisfies Message,
  ),
  {
    id: "msg-final",
    metadata: {
      kind: "assistant",
      totalTokens: 150,
      finishReason: "tool-calls",
    },
    role: "assistant",
    parts: [
      {
        type: "step-start",
      },
      {
        type: "tool-attemptCompletion",
        toolCallId: "call_49e745ede4b84732aec16ddc",
        state: "input-available",
        input: {
          result:
            "Successfully created 3 todo items using a new task and marked all of them as completed. The todo items covered project structure setup, user authentication implementation, and comprehensive testing - all set to completed status.",
        },
      },
    ],
  },
];

const mockTodos: Todo[] = [
  {
    id: "create-component",
    content: "Create new React component with TypeScript interface",
    status: "completed",
    priority: "high",
  },
  {
    id: "add-props",
    content: "Add props interface with title property",
    status: "completed",
    priority: "medium",
  },
  {
    id: "test-component",
    content: "Test the component in the application",
    status: "pending",
    priority: "medium",
  },
];

const mockTaskThreadSource = {
  messages: mockMessages,
  todos: mockTodos,
  isLoading: false,
};

const mockTaskThreadSourceLoading = {
  messages: mockMessages,
  todos: [],
  isLoading: true,
};

const mockTaskThreadSourceEmpty = {
  messages: [],
  todos: [],
  isLoading: false,
};

const newTaskProps1: NewTaskProp["tool"] = {
  state: "output-available",
  toolCallId: "tool_new_task_1",
  type: "tool-newTask",
  input: {
    description: "Find the relevant file to update for the user's request",
    prompt:
      "The user wants to add a new tool to the storybook gallery. Find the relevant file to update.",
    _transient: {
      task: { ...mockTaskThreadSource, clientTaskId: "transient-task-1" },
    },
  },
  output: {
    result: "This is a great day",
    uid: "new-task-output-1",
  },
};

const newTaskProps2: NewTaskProp["tool"] = {
  state: "output-available",
  toolCallId: "tool_new_task_1",
  type: "tool-newTask",
  input: {
    description: "Find the relevant file to update for the user's request",
    prompt:
      "The user wants to add a new tool to the storybook gallery. Find the relevant file to update.",
    _transient: {
      task: {
        ...mockTaskThreadSourceLoading,
        clientTaskId: "transient-task-2",
      },
    },
  },
  output: {
    result: "This is a great day",
    uid: "new-task-output-2",
  },
};

const newTaskProps3: NewTaskProp["tool"] = {
  state: "output-available",
  toolCallId: "tool_new_task_1",
  type: "tool-newTask",
  input: {
    description: "Find the relevant file to update for the user's request",
    prompt:
      "The user wants to add a new tool to the storybook gallery. Find the relevant file to update.",
    _transient: {
      task: {
        ...mockTaskThreadSourceEmpty,
        clientTaskId: "transient-task-3",
      },
    },
  },
  output: {
    result: "This is a great day",
    uid: "new-task-output-3",
  },
};

export const Variants: Story = {
  args: {
    tools: [
      {
        ...newTaskProps1,
        toolCallId: `${newTaskProps1.toolCallId}-completed`,
        // @ts-expect-error - Adding custom prop for Storybook
        taskThreadSource: mockTaskThreadSource,
      },
      {
        ...newTaskProps2,
        toolCallId: `${newTaskProps2.toolCallId}-loading`,
        // @ts-expect-error - Adding custom prop for Storybook
        taskThreadSource: mockTaskThreadSourceLoading,
      },
      {
        ...newTaskProps3,
        toolCallId: `${newTaskProps3.toolCallId}-empty`,
        // @ts-expect-error - Adding custom prop for Storybook
        taskThreadSource: mockTaskThreadSourceEmpty,
      },
    ],
  },
};
