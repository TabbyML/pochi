import { useDefaultStore } from "@/lib/use-default-store";
import { catalog } from "@getpochi/livekit";
import type { Meta, StoryObj } from "@storybook/react";
import { useEffect } from "react";
import type { NewTaskToolViewProps } from "../components/new-task";
import { PlannerView } from "../components/new-task/planner-view";

const meta = {
  title: "Features/Tools/NewTask/PlannerView",
  component: PlannerView,
  args: {
    tool: {
      toolCallId: "call_1",
      type: "tool-newTask",
      state: "call",
      input: {
        agentType: "planner",
        description: "Create a plan",
        prompt: "Create a plan",
      },
    },
    isExecuting: false,
    isLoading: false,
    messages: [],
    uid: "task_1",
    taskSource: {
      parentId: "root",
      messages: [],
      todos: [],
      isLoading: false,
    },
  } as unknown as NewTaskToolViewProps,
  decorators: [
    (Story) => (
      <div className="p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof PlannerView>;

export default meta;
type Story = StoryObj<typeof meta>;

const planContent = `
# Implementation Plan

This is a comprehensive plan for implementing the new feature.

1.  **Requirement Analysis**:
    -   Review user stories.
    -   Identify key constraints.
    -   Define success metrics.

2.  **System Design**:
    -   Update database schema.
    -   Design API endpoints.
    -   Draft UI mockups.

3.  **Implementation**:
    -   Set up the development environment.
    -   Implement backend logic.
    -   Develop frontend components.
    -   Integrate APIs.

4.  **Testing**:
    -   Write unit tests.
    -   Perform integration testing.
    -   Conduct user acceptance testing.

## Details

-   **Database**: We will use PostgreSQL for data storage.
-   **Frontend**: React with Tailwind CSS will be used for the UI.
-   **Backend**: Node.js with Express will handle API requests.
-   **Timeline**: The project is expected to take 2 weeks.

## Risks

-   Potential delays in API integration.
-   Unforeseen database migration issues.
`;

const defaultTaskSource: NewTaskToolViewProps["taskSource"] = {
  parentId: "root",
  messages: [
    {
      id: "1",
      role: "user",
      parts: [
        {
          type: "text",
          text: "Please create a plan for the new feature.",
          state: "done",
        },
      ],
    },
    {
      id: "2",
      role: "assistant",
      metadata: { kind: "assistant", totalTokens: 0, finishReason: "stop" },
      parts: [
        {
          type: "text",
          text: "I'll start by exploring the codebase.",
          state: "done",
        },
        {
          type: "tool-listFiles",
          toolCallId: "call_2",
          state: "output-available",
          input: { path: ".", recursive: true },
          output: {
            files: ["package.json", "src/index.ts", "README.md"],
            isTruncated: false,
          },
        },
      ],
    },
    {
      id: "3",
      role: "assistant",
      metadata: { kind: "assistant", totalTokens: 0, finishReason: "stop" },
      parts: [
        {
          type: "text",
          text: "I see the structure. I'll read the README.",
          state: "done",
        },
        {
          type: "tool-readFile",
          toolCallId: "call_3",
          state: "output-available",
          input: { path: "README.md" },
          output: { content: "# Project\n...", isTruncated: false },
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
          text: "I'll check the package.json dependencies.",
          state: "done",
        },
        {
          type: "tool-readFile",
          toolCallId: "call_4",
          state: "output-available",
          input: { path: "package.json" },
          output: {
            content:
              '{\n  "name": "project",\n  "version": "1.0.0",\n  "dependencies": {\n    "react": "^18.0.0"\n  }\n}',
            isTruncated: false,
          },
        },
      ],
    },
    {
      id: "5",
      role: "assistant",
      metadata: { kind: "assistant", totalTokens: 0, finishReason: "stop" },
      parts: [
        {
          type: "text",
          text: "I'll search for existing components.",
          state: "done",
        },
        {
          type: "tool-globFiles",
          toolCallId: "call_5",
          state: "output-available",
          input: { path: "src/components", globPattern: "*.tsx" },
          output: {
            files: ["Button.tsx", "Header.tsx", "Footer.tsx"],
            isTruncated: false,
          },
        },
      ],
    },
    {
      id: "6",
      role: "assistant",
      metadata: { kind: "assistant", totalTokens: 0, finishReason: "stop" },
      parts: [
        {
          type: "text",
          text: "I'll check the Button component implementation.",
          state: "done",
        },
        {
          type: "tool-readFile",
          toolCallId: "call_6",
          state: "output-available",
          input: { path: "src/components/Button.tsx" },
          output: {
            content:
              "import React from 'react';\n\nexport const Button = () => <button>Click me</button>;",
            isTruncated: false,
          },
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
          text: "I have gathered enough information. I will now create the plan.",
          state: "done",
        },
      ],
    },
  ],
  todos: [
    {
      id: "1",
      content: "Analyze requirements",
      status: "completed",
      priority: "high",
    },
    {
      id: "2",
      content: "Design solution",
      status: "in-progress",
      priority: "high",
    },
    {
      id: "3",
      content: "Implement feature",
      status: "pending",
      priority: "medium",
    },
  ],
  isLoading: false,
};

export const Default: Story = {
  args: {
    taskSource: defaultTaskSource,
  },
  decorators: [
    (Story) => {
      const store = useDefaultStore();
      useEffect(() => {
        // Seed the store with a plan.md file
        store.commit(
          catalog.events.writeStoreFile({
            filePath: "/plan.md",
            content: planContent,
          }),
        );
      }, [store]);
      return <Story />;
    },
  ],
};

export const Executing: Story = {
  args: {
    isExecuting: true,
    taskSource: {
      ...defaultTaskSource,
      parentId: "executing-task",
    },
  },
};
