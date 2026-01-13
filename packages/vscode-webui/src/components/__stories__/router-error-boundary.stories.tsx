import type { Meta, StoryObj } from "@storybook/react";
import { RouterErrorBoundary } from "../router-error-boundary";

const meta: Meta<typeof RouterErrorBoundary> = {
  title: "Components/RouterErrorBoundary",
  component: RouterErrorBoundary,
  parameters: {
    layout: "fullscreen",
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    error: new Error(
      "This is a test error message that might be long and contain details about what went wrong in the application routing.",
    ),
  },
  parameters: {
    backgrounds: { disable: true },
  },
};
