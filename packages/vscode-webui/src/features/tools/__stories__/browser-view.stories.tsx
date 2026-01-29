import { queryClient } from "@/lib/query-client";
import type { Meta, StoryObj } from "@storybook/react";
import type { NewTaskToolViewProps } from "../components/new-task";
import { BrowserView } from "../components/new-task/browser-view";
import type { ToolProps } from "../components/types";

// Mock WebSocket to simulate streaming
class MockWebSocket {
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  onmessage: ((e: MessageEvent) => void) | null = null;

  constructor(public url: string) {
    setTimeout(() => {
      this.onopen?.();

      // Simulate sending a frame
      if (url.includes("success")) {
        const frameData = {
          type: "frame",
          // 1x1 gray pixel
          data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==",
        };
        this.onmessage?.({ data: JSON.stringify(frameData) } as MessageEvent);
      }
    }, 500);
  }

  close() {
    this.onclose?.();
  }
}

const originalWebSocket = window.WebSocket;

const meta: Meta<typeof BrowserView> = {
  title: "Features/Tools/NewTask/BrowserView",
  component: BrowserView,
  decorators: [
    (Story) => {
      // @ts-ignore
      window.WebSocket = MockWebSocket;
      // Seed the query cache with mock browser sessions
      queryClient.setQueryData(["browserSessions"], {
        value: {
          "task-123": {
            taskId: "task-123",
            streamUrl: "ws://mock-stream/success",
          },
          "task-no-frame": {
            taskId: "task-no-frame",
            streamUrl: "ws://mock-stream/no-frame",
          },
        },
      });
      return <Story />;
    },
  ],
  parameters: {
    // Restore original WebSocket after stories
    docs: {
      afterStories: () => {
        window.WebSocket = originalWebSocket;
      },
    },
  },
};

export default meta;

type Story = StoryObj<typeof BrowserView>;

const baseTool: ToolProps<"newTask">["tool"] = {
  toolCallId: "tool-1",
  type: "tool-newTask",
  state: "output-available",
  input: {
    agentType: "browser",
    description:
      "Automating browser task to search for information and verify the results on the page.",
    prompt: "Go to example.com",
  },
  output: {
    result: "Done",
  },
};

const baseProps: NewTaskToolViewProps = {
  tool: baseTool,
  isExecuting: true,
  isLoading: false,
  messages: [],
  uid: "task-123",
  taskSource: {
    isLoading: false,
    messages: [],
    todos: [],
  },
};

export const Default: Story = {
  args: {
    ...baseProps,
    taskSource: {
      isLoading: false,
      todos: [
        {
          id: "1",
          content: "Navigate to google.com",
          status: "completed",
          priority: "high",
        },
        {
          id: "2",
          content: "Search for 'hello world'",
          status: "completed",
          priority: "high",
        },
        {
          id: "3",
          content: "Click on the first result",
          status: "in-progress",
          priority: "medium",
        },
        {
          id: "4",
          content: "Verify page title",
          status: "pending",
          priority: "medium",
        },
      ],
      messages: [
        {
          id: "1",
          role: "user",
          parts: [
            { type: "text", text: "Navigate to google.com", state: "done" },
          ],
        },
        {
          id: "2",
          role: "assistant",
          metadata: { kind: "assistant", totalTokens: 0, finishReason: "stop" },
          parts: [
            {
              type: "text",
              text: "I'm navigating to google.com.",
              state: "done",
            },
          ],
        },
        {
          id: "3",
          role: "user",
          parts: [
            {
              type: "text",
              text: "Now search for 'hello world'",
              state: "done",
            },
          ],
        },
        {
          id: "4",
          role: "assistant",
          metadata: { kind: "assistant", totalTokens: 0, finishReason: "stop" },
          parts: [
            {
              type: "text",
              text: "Searching for 'hello world'...",
              state: "done",
            },
          ],
        },
        {
          id: "5",
          role: "assistant",
          metadata: { kind: "assistant", totalTokens: 0, finishReason: "stop" },
          parts: [
            {
              type: "tool-executeCommand",
              toolCallId: "tool-2",
              state: "output-available",
              input: {
                command: "echo 'clicking #first-result'",
              },
              output: {
                output: "clicked",
              },
            },
          ],
        },
        {
          id: "6",
          role: "user",
          parts: [
            {
              type: "text",
              text: "Verify the page title contains 'Hello World'",
              state: "done",
            },
          ],
        },
        {
          id: "7",
          role: "assistant",
          metadata: { kind: "assistant", totalTokens: 0, finishReason: "stop" },
          parts: [
            {
              type: "text",
              text: "Checking page title...",
              state: "done",
            },
            {
              type: "tool-executeCommand",
              toolCallId: "tool-3",
              state: "output-available",
              input: {
                command: "echo 'checking title'",
              },
              output: {
                output: "Title is 'Hello World - Search'",
              },
            },
            {
              type: "text",
              text: "The page title matches.",
              state: "done",
            },
          ],
        },
      ],
    },
  },
};

export const NoFrame: Story = {
  args: {
    ...baseProps,
    uid: "task-no-frame",
  },
};
