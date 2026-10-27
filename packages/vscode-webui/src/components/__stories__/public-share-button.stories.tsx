import type { Task } from "@getpochi/livekit";
import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "@storybook/test";
import { type ComponentProps, useState } from "react";
import i18n from "../../i18n/config";
import { PublicShareButtonView } from "../public-share-button";

const sync = fn(async () => {});
const synced: ComponentProps<typeof PublicShareButtonView>["syncStatus"] = {
  state: "synced",
  isLoading: false,
  pending: 0,
  error: null,
  sync,
  isRequesting: false,
};

const task = {
  id: "storybook-share-task",
  shareId: "p-storybook-share-task",
  isPublicShared: true,
} as Task;

const meta = {
  title: "Components/PublicShareButton",
  component: PublicShareButtonView,
  parameters: { layout: "centered" },
  args: {
    task,
    open: true,
    onOpenChange: fn(),
    syncStatus: synced,
    onUpdateIsPublicShared: fn(),
  },
  argTypes: {
    open: { control: false },
    onOpenChange: { control: false },
  },
  render: function Render(args) {
    const [open, setOpen] = useState(args.open);
    return (
      <PublicShareButtonView {...args} open={open} onOpenChange={setOpen} />
    );
  },
  decorators: [
    (Story) => (
      <div className="flex h-72 w-72 items-end justify-end p-4">
        <Story />
      </div>
    ),
  ],
  beforeEach: async () => {
    const previousLanguage = i18n.language;
    await i18n.changeLanguage("en");
    return () => {
      void i18n.changeLanguage(previousLanguage);
    };
  },
} satisfies Meta<typeof PublicShareButtonView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Synced: Story = {};

export const Syncing: Story = {
  args: {
    syncStatus: { ...synced, state: "syncing", pending: 3, isRequesting: true },
  },
};

export const Offline: Story = {
  args: {
    syncStatus: { ...synced, state: "offline", pending: 3 },
  },
};

export const Failed: Story = {
  args: {
    syncStatus: {
      ...synced,
      state: "offline",
      pending: 3,
      error: "Upload failed",
    },
  },
};

export const Initializing: Story = {
  args: {
    syncStatus: { ...synced, state: "offline", isLoading: true },
  },
};

export const PrivateAccess: Story = {
  args: { task: { ...task, isPublicShared: false } },
};
