import type { BackgroundJobNotification } from "@getpochi/common";
import type { BackgroundCommands } from "@getpochi/common/vscode-webui-bridge";
import type { Message } from "@getpochi/livekit";
import { signal } from "@preact/signals-core";
import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, within } from "@storybook/test";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { BackgroundJobManagePanel } from "../background-job-manage-panel";

const meta = {
  title: "Features/Chat/BackgroundJobManagePanel",
  component: BackgroundJobManagePanel,
  args: {
    taskId: "story-task",
    messages: [],
  },
  decorators: [
    (Story) => (
      <div className="relative flex h-64 justify-end p-2">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof BackgroundJobManagePanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  play: openPanel,
};

export const WithJobs: Story = {
  args: {
    messages: [
      message([
        executeCommandPart("bgjob-cmd-1", "bun run dev"),
        executeCommandPart("bgjob-cmd-2", "bun run build"),
        notificationPart(notification("bgjob-cmd-2", "completed")),
        executeCommandPart("bgjob-cmd-3", "bun run test"),
        notificationPart(notification("bgjob-cmd-3", "failed")),
      ]),
    ],
  },
  decorators: [withRunningCommands({ "bgjob-cmd-1": { isVisible: true } })],
  play: openPanel,
};

async function openPanel({
  canvasElement,
}: { canvasElement: HTMLElement }): Promise<void> {
  const canvas = within(canvasElement);
  const toggle = canvas.getByTestId("background-job-manage-panel-toggle");
  await userEvent.click(toggle);
  await expect(toggle).toHaveAttribute("data-state", "open");
}

/** Seeds the host query so the panel sees running commands without a host. */
function withRunningCommands(backgroundCommands: BackgroundCommands) {
  const noop = async () => {};
  const data = {
    backgroundCommands: signal(backgroundCommands),
    show: noop,
    hide: noop,
    close: noop,
  };

  return (Story: React.ComponentType) => {
    const queryClient = useQueryClient();
    useState(() => {
      queryClient.setQueryData(["backgroundCommands"], data);
      return null;
    });
    return <Story />;
  };
}

function message(parts: unknown[]): Message {
  return { id: "message-1", role: "assistant", parts } as unknown as Message;
}

function executeCommandPart(backgroundJobId: string, command: string) {
  return {
    type: "tool-executeCommand",
    state: "output-available",
    input: { command, background: true },
    output: { _meta: { backgroundJobId } },
  };
}

function notificationPart(data: BackgroundJobNotification) {
  return { type: "data-background-job-notification", data };
}

function notification(
  backgroundJobId: string,
  status: BackgroundJobNotification["status"],
): BackgroundJobNotification {
  return {
    notificationId: `${backgroundJobId}:terminal`,
    backgroundJobId,
    outputFile: `/tmp/${backgroundJobId}.log`,
    command: `run ${backgroundJobId}`,
    status,
    summary: `Background command "${backgroundJobId}" ${status}`,
    finishedAt: Date.now(),
  };
}
