import type { Meta, StoryObj } from "@storybook/react";
import { EmptyChatPlaceholder } from "../empty-chat-placeholder";

const meta: Meta<typeof EmptyChatPlaceholder> = {
  title: "Components/EmptyChatPlaceholder",
  component: EmptyChatPlaceholder,
  parameters: {
    layout: "fullscreen",
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  parameters: {
    backgrounds: { disable: true },
  },
};
