import type { Message, Task } from "@getpochi/livekit";
import type { Meta, StoryObj } from "@storybook/react";
import { RenderWidgetTool } from "../components/render-widget";
import type { ToolProps } from "../components/types";

const meta: Meta<typeof RenderWidgetTool> = {
  title: "Features/Tools/RenderWidget",
  component: RenderWidgetTool,
};

export default meta;

type Story = StoryObj<typeof RenderWidgetTool>;

const widgetToolCallId = "tool-widget-1";

const widgetTool: ToolProps<"renderWidget">["tool"] = {
  type: "tool-renderWidget",
  toolCallId: widgetToolCallId,
  input: {
    title: "Color Palette",
    guidelinesRead: true,
    widgetCode: `<pochi-widget state='{}'>
  <div style="display:flex;gap:8px;padding:12px;font-family:var(--vscode-font-family)">
    <div style="width:48px;height:48px;border-radius:6px;background:#7F77DD"></div>
    <div style="width:48px;height:48px;border-radius:6px;background:#1D9E75"></div>
    <div style="width:48px;height:48px;border-radius:6px;background:#D85A30"></div>
    <div style="width:48px;height:48px;border-radius:6px;background:#EF9F27"></div>
  </div>
</pochi-widget>`,
  },
  state: "output-available",
  output: { state: null },
};

const messageWithWidget: Message = {
  id: "msg-1",
  role: "assistant",
  parts: [widgetTool],
};

const mockTask: Task = {
  id: "task-1",
  shareId: "task-1",
  cwd: "/workspace/my-project",
  title: "Generate color palette widget",
  status: "completed",
  isPublicShared: false,
  parentId: null,
  todos: [],
  git: null,
  pendingToolCalls: null,
  lineChanges: null,
  lastStepDuration: null,
  executionDuration: {
    completedDurations: [{ key: widgetToolCallId, value: 14200 }],
    currentAccumulatedDuration: null,
    currentExecutionStartedAt: null,
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

export const Default: Story = {
  args: {
    tool: widgetTool,
    isExecuting: false,
    isLoading: false,
    isLastPart: true,
    messages: [messageWithWidget],
  },
};

export const WithDuration: Story = {
  args: {
    tool: widgetTool,
    isExecuting: false,
    isLoading: false,
    isLastPart: true,
    messages: [messageWithWidget],
    task: mockTask,
  },
};
