import type { TaskThreadSource } from "@/components/task-thread";
import type { Message } from "@getpochi/livekit";
import type { Todo } from "@getpochi/tools";
import type { Meta, StoryObj } from "@storybook/react";
import type { NewTaskToolViewProps } from "../components/new-task";
import { AttemptTodoCompletionView } from "../components/new-task/attempt-todo-completion-view";

type AttemptTodoCompletionProps = Omit<NewTaskToolViewProps, "taskSource"> & {
  label: string;
  taskSource: NonNullable<NewTaskToolViewProps["taskSource"]>;
};

const AttemptTodoCompletionStates = ({
  variants,
}: {
  variants: AttemptTodoCompletionProps[];
}) => {
  return (
    <div className="flex flex-col gap-4 p-4">
      {variants.map(({ label, ...props }) => (
        <section className="flex flex-col gap-1" key={props.tool.toolCallId}>
          <div className="text-muted-foreground text-xs">{label}</div>
          <AttemptTodoCompletionView {...props} />
        </section>
      ))}
    </div>
  );
};

const meta = {
  title: "Features/Tools/NewTask/AttemptTodoCompletionView",
  component: AttemptTodoCompletionStates,
} satisfies Meta<typeof AttemptTodoCompletionStates>;

export default meta;
type Story = StoryObj<typeof meta>;

const auditTodos: Todo[] = [
  {
    id: "todo-1",
    content: "Add regression coverage for todo audit cancellation",
    status: "in-progress",
    priority: "medium",
  },
];

const completedTodos: Todo[] = auditTodos.map((todo) => ({
  ...todo,
  status: "completed",
}));

const taskMessages: Message[] = [
  {
    id: "user-message",
    role: "user",
    parts: [
      {
        type: "text",
        text: "Please audit the todo list.",
        state: "done",
      },
    ],
  },
  {
    id: "assistant-message",
    metadata: {
      kind: "assistant",
      totalTokens: 80,
      finishReason: "stop",
    },
    role: "assistant",
    parts: [
      {
        type: "text",
        text: "This is message list",
        state: "done",
      },
    ],
  },
];

const taskSource: TaskThreadSource = {
  messages: taskMessages,
  todos: auditTodos,
  isLoading: false,
};

const emptyTaskSource: TaskThreadSource = {
  messages: [],
  todos: auditTodos,
  isLoading: false,
};

const baseTool: NewTaskToolViewProps["tool"] = {
  state: "input-available",
  toolCallId: "tool_attempt_todo_completion",
  type: "tool-newTask",
  input: {
    agentType: "attemptTodoCompletion",
    description: "Audit todo completion",
    prompt: "Audit whether the current todo list is complete.",
  },
};

function makeProps(
  label: string,
  tool: NewTaskToolViewProps["tool"],
  options: {
    isExecuting?: boolean;
    isLoading?: boolean;
    taskSource?: AttemptTodoCompletionProps["taskSource"];
  } = {},
): AttemptTodoCompletionProps {
  return {
    label,
    uid: tool.toolCallId,
    tool,
    isExecuting: options.isExecuting ?? false,
    isLoading: options.isLoading ?? false,
    messages: [],
    taskSource: options.taskSource ?? taskSource,
    isLastPart: true,
  };
}

export const States: Story = {
  args: {
    variants: [
      makeProps(
        "Auditing with thread",
        {
          ...baseTool,
          toolCallId: "tool_attempt_todo_completion-auditing",
        },
        { isExecuting: true },
      ),
      makeProps("Completed", {
        ...baseTool,
        toolCallId: "tool_attempt_todo_completion-completed",
        state: "output-available",
        output: {
          result: {
            summary: "All todos are complete.",
            todos: completedTodos,
          },
        } as never,
      }),
      makeProps("Needs work with audit summary", {
        ...baseTool,
        toolCallId: "tool_attempt_todo_completion-needs-work",
        state: "output-available",
        output: {
          result: {
            summary: "The audit found one todo that still needs work.",
            todos: auditTodos,
          },
        } as never,
      }),
      makeProps("Stopped after result with thread", {
        ...baseTool,
        toolCallId: "tool_attempt_todo_completion-stopped-after-summary",
        state: "output-available",
        output: {
          result: {
            summary: "Cancelled audit summary that should stay hidden.",
            todos: auditTodos,
          },
          error: "User aborted the tool call",
        } as never,
      }),
      makeProps("Stopped before summary with thread", {
        ...baseTool,
        toolCallId: "tool_attempt_todo_completion-stopped",
        state: "output-available",
        output: {
          error: "User aborted the tool call",
        } as never,
      }),
      makeProps(
        "Stopped before summary fallback",
        {
          ...baseTool,
          toolCallId: "tool_attempt_todo_completion-stopped-fallback",
          state: "output-available",
          output: {
            error: "User aborted the tool call",
          } as never,
        },
        { isExecuting: true, isLoading: true, taskSource: emptyTaskSource },
      ),
      makeProps("Unavailable result with thread", {
        ...baseTool,
        toolCallId: "tool_attempt_todo_completion-unavailable",
        state: "output-available",
        output: {
          error: "Todo audit failed",
        } as never,
      }),
      makeProps(
        "Unavailable result fallback",
        {
          ...baseTool,
          toolCallId: "tool_attempt_todo_completion-unavailable-fallback",
          state: "output-available",
          output: {
            error: "Todo audit failed",
          } as never,
        },
        { taskSource: emptyTaskSource },
      ),
    ],
  },
};
