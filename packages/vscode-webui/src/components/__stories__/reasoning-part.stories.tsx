import type { Meta, StoryObj } from "@storybook/react";

import { ReasoningPartUI } from "../reasoning-part";

const meta = {
  title: "Part-UI/Reasoning",
  component: ReasoningPartUI,
} satisfies Meta<typeof ReasoningPartUI>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    isLoading: false,
    part: {
      type: "reasoning",
      text: "This is a reasoning message.",
    },
  },
};

export const Loading: Story = {
  args: {
    isLoading: true,
    part: {
      type: "reasoning",
      text: "This is a reasoning message.",
    },
  },
};
