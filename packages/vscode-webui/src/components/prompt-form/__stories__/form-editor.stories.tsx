import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "@storybook/test";
import { FormEditor } from "../form-editor";

const meta = {
  title: "Chat/FormEditor",
  component: FormEditor,
  parameters: {
    layout: "padded",
  },
  argTypes: {
    input: { control: "text" },
    isLoading: { control: "boolean" },
    autoFocus: { control: "boolean" },
  },
  args: {
    setInput: fn(),
    onSubmit: fn(),
    onCtrlSubmit: fn(),
    onError: fn(),
    onPaste: fn(),
  },
} satisfies Meta<typeof FormEditor>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    input: "Hello, world!",
    isLoading: false,
    autoFocus: true,
    isSubTask: false,
  },
};

export const Loading: Story = {
  args: {
    input: "This is a loading state",
    isLoading: true,
    autoFocus: false,
    isSubTask: false,
  },
};
