import { TaskThread, type TaskThreadSource } from "@/components/task-thread";
import { FixedStateChatContextProvider } from "@/features/chat";
import type { Message } from "@getpochi/livekit";
import type { Meta, StoryObj } from "@storybook/react";
import { newTaskTool as NewTaskTool } from "../components/new-task";

const meta: Meta<typeof NewTaskTool> = {
  title: "Features/Tools/SubtaskAgent",
  component: NewTaskTool,
};

export default meta;

type Story = StoryObj<typeof meta>;

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

const overviewMessage: Message = {
  id: "overview-msg",
  role: "assistant",
  metadata: {
    kind: "assistant",
    totalTokens: 0,
    finishReason: "tool-calls",
  },
  parts: [
    { type: "step-start" },
    {
      type: "text",
      text: "I will demonstrate three types of tool interactions:",
      state: "done",
    },
    {
      type: "tool-newTask",
      toolCallId: "tool_new_task_inline_1",
      state: "output-available",
      input: {
        description: "Inline Subtask Agent",
        prompt: "Run seq 7",
        _meta: { uid: "task-inline-1" },
        _transient: {
          task: {
            messages: subtaskMessages,
            clientTaskId: "task-inline-1",
            todos: [],
          },
        },
      },
      output: {
        result: "1\n2\n3\n4\n5\n6\n7\n",
      },
    },
    {
      type: "tool-newTask",
      toolCallId: "tool_new_task_async_1",
      state: "input-available",
      input: {
        description: "Async Subtask Agent",
        prompt: "Run the command and report the output.",
        runAsync: true,
        _meta: { uid: "task-async-1" },
      },
    },
    {
      type: "tool-readBackgroundJobOutput",
      toolCallId: "tool_read_bg_top_level",
      state: "output-available",
      input: {
        backgroundJobId: "2043523e-d13d-4c74-ad66-40e991047153",
      },
      output: {
        status: "completed",
        output: "Server started on port 3000\nConnected to database\n",
        isTruncated: false,
      },
    },
  ],
};

const overviewTaskSource: TaskThreadSource = {
  messages: [overviewMessage],
  todos: [],
  isLoading: false,
};

export const Overview: Story = {
  render: () => (
    <FixedStateChatContextProvider>
      <TaskThread source={overviewTaskSource} showMessageList={true} />
    </FixedStateChatContextProvider>
  ),
  args: {
    // Dummy args to satisfy types
    isExecuting: false,
    isLoading: false,
    messages: [],
    tool: {
      type: "tool-newTask",
      toolCallId: "dummy",
      state: "input-available",
      input: { description: "", prompt: "" },
    },
  },
};
