import type { TaskThreadSource } from "@/components/task-thread";
import type { Message } from "@getpochi/livekit";
import type { Meta, StoryObj } from "@storybook/react";
import { newTaskTool as NewTaskTool } from "../components/new-task";
import type { ToolProps } from "../components/types";

const meta: Meta<typeof NewTaskTool> = {
  title: "Features/Tools/SubtaskAgent",
  component: NewTaskTool,
};

export default meta;

type Story = StoryObj<typeof meta>;
type NewTaskProp = ToolProps<"newTask">;

const subtaskMessages: Message[] = [
  {
    id: "subtask-msg-1",
    role: "assistant",
    metadata: {
      kind: "assistant",
      totalTokens: 120,
      finishReason: "tool-calls",
    },
    parts: [
      { type: "step-start" },
      {
        type: "text",
        text: "I'll execute the following command:",
        state: "done",
      },
      {
        type: "tool-executeCommand",
        toolCallId: "tool_exec_subtask_1",
        state: "output-available",
        input: {
          command: "seq 7",
        },
        output: {
          output: "1\n2\n3\n4\n5\n6\n7\n",
          isTruncated: false,
        },
      },
    ],
  },
  {
    id: "subtask-msg-2",
    role: "assistant",
    metadata: {
      kind: "assistant",
      totalTokens: 32,
      finishReason: "stop",
    },
    parts: [
      { type: "step-start" },
      {
        type: "text",
        text: "Done.",
        state: "done",
      },
    ],
  },
];

const taskThreadSource: TaskThreadSource = {
  messages: subtaskMessages,
  todos: [],
  isLoading: false,
};

const inlineSubtaskTool: NewTaskProp["tool"] = {
  state: "output-available",
  toolCallId: "tool_new_task_inline_1",
  type: "tool-newTask",
  input: {
    description: "Run seq 7",
    prompt: "Run the command and report the output.",
    _meta: { uid: "task-inline-1" },
  },
  output: {
    result: "1\n2\n3\n4\n5\n6\n7\n",
  },
};

const backgroundSubtaskTool: NewTaskProp["tool"] = {
  state: "input-available",
  toolCallId: "tool_new_task_async_1",
  type: "tool-newTask",
  input: {
    description: "Run seq 7",
    prompt: "Run the command and report the output.",
    runAsync: true,
    _meta: { uid: "task-async-1" },
  },
};

export const InlineSubtask: Story = {
  args: {
    tool: inlineSubtaskTool,
    isExecuting: false,
    isLoading: false,
    messages: [],
    taskThreadSource,
  },
};

export const BackgroundSubtask: Story = {
  args: {
    tool: backgroundSubtaskTool,
    isExecuting: false,
    isLoading: false,
    messages: [],
  },
};
