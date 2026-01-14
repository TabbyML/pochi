import type { Meta, StoryObj } from "@storybook/react";
import { AutoApproveMenu } from "../auto-approve-menu";

const meta: Meta<typeof AutoApproveMenu> = {
  title: "Features/Settings/AutoApproveMenu",
  component: AutoApproveMenu,
  parameters: {
    layout: "centered",
  },
  decorators: [
    (Story) => (
      <div style={{ width: "400px", padding: "20px" }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
