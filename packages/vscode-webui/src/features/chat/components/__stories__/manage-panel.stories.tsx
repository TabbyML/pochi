import type { BackgroundJobNotification } from "@getpochi/common";
import type { Message } from "@getpochi/livekit";
import { signal } from "@preact/signals-core";
import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, within } from "@storybook/test";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { TerminalSnapshot } from "../../lib/build-job-list";
import { ManagePanel } from "../manage-panel";

const meta = {
  title: "Features/Chat/ManagePanel",
  component: ManagePanel,
  args: {
    taskId: "story-task",
    messages: [],
  },
  decorators: [
    (Story) => (
      // The trigger lives in the chat toolbar in the app, so give it a
      // stand-in row here.
      <div className="relative flex h-64 justify-end p-2">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ManagePanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Nothing running: the trigger stays put so the panel remains discoverable. */
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
  decorators: [withTerminals([terminal("bgjob-cmd-1")])],
  play: openPanel,
};

async function openPanel({
  canvasElement,
}: { canvasElement: HTMLElement }): Promise<void> {
  const canvas = within(canvasElement);
  const toggle = canvas.getByTestId("manage-panel-toggle");
  await userEvent.click(toggle);
  await expect(toggle).toHaveAttribute("data-state", "open");
}

/**
 * Seeds the terminal query so the panel sees live terminals without a host.
 */
function withTerminals(terminals: TerminalSnapshot[]) {
  const data = {
    terminals: signal(terminals),
    openBackgroundJobTerminal: () => {},
  };

  return (Story: React.ComponentType) => {
    const queryClient = useQueryClient();
    // Seed once, before the panel below mounts and fires the query.
    useState(() => {
      queryClient.setQueryData(["visibleTerminals"], data);
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

function terminal(backgroundJobId: string): TerminalSnapshot {
  return {
    isActive: false,
    backgroundJobId,
    outputFile: `/tmp/${backgroundJobId}.log`,
  };
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
