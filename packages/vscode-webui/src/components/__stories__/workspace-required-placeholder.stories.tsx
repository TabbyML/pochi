import type { Meta, StoryObj } from "@storybook/react";
import { WorkspaceRequiredPlaceholder } from "../workspace-required-placeholder";

const meta: Meta<typeof WorkspaceRequiredPlaceholder> = {
  title: "Components/WorkspaceRequiredPlaceholder",
  component: WorkspaceRequiredPlaceholder,
  parameters: {
    layout: "centered",
  },
  args: {
    isFetching: false,
  },
  argTypes: {
    isFetching: {
      control: "boolean",
      description: "Whether the workspace state is being fetched",
    },
    className: {
      control: "text",
      description: "Additional CSS classes to apply",
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    isFetching: false,
  },
};
