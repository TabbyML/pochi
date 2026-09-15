import { useDefaultStore } from "@/lib/use-default-store";
import { createBackgroundJobNotification } from "@getpochi/common";
import { BackgroundJobManager } from "@getpochi/livekit";
import { signal } from "@preact/signals-core";
import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, within } from "@storybook/test";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { BackgroundJobManagePanel } from "../background-job-manage-panel";

const meta = {
  title: "Features/Chat/BackgroundJobManagePanel",
  component: BackgroundJobManagePanel,
  args: { taskId: "story-empty" },
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

export const Empty: Story = { play: openPanel };

export const WithJobs: Story = {
  args: { taskId: "story-jobs" },
  decorators: [
    function WithJobs(Story) {
      const store = useDefaultStore();
      const queryClient = useQueryClient();
      useEffect(() => {
        const noop = async () => {};
        queryClient.setQueryData(["backgroundCommands"], {
          backgroundCommands: signal({
            "bgjob-cmd-1": { isVisible: true, taskId: "story-jobs" },
          }),
          show: noop,
          hide: noop,
          close: noop,
        });
        const manager = BackgroundJobManager.forStore(store);
        manager.connect({
          kill: noop,
          observeCommands: async (update) => {
            update({
              "bgjob-cmd-1": {
                taskId: "story-jobs",
                command: "bun run dev",
                isVisible: true,
                outputFile: "/tmp/bgjob-cmd-1.log",
              },
            });
            return { dispose() {} };
          },
          observeNotifications: async (_taskId, update) => {
            update(
              (["completed", "failed"] as const).map((status, index) =>
                createBackgroundJobNotification({
                  taskId: "story-jobs",
                  backgroundJobId: `bgjob-cmd-${index + 2}`,
                  command: `bun run ${["build", "test"][index]}`,
                  status,
                  outputFile: `/tmp/bgjob-cmd-${index + 2}.log`,
                  finishedAt: 1,
                }),
              ),
            );
            return { dispose() {}, acknowledge: noop };
          },
        });
        void manager.watchTask("story-jobs");
        return () => {
          void manager.dispose();
        };
      }, [store, queryClient]);
      return <Story />;
    },
  ],
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
