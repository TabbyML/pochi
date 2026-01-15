import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "@storybook/test";
import { FormEditor } from "../form-editor";

const meta = {
  title: "PromptForm/FormEditor",
  component: FormEditor,
  parameters: {
    layout: "padded",
  },
  argTypes: {
    isLoading: { control: "boolean" },
    autoFocus: { control: "boolean" },
    isSubTask: { control: "boolean" },
  },
  args: {
    input: { text: "", json: {} },
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
    input: {
      text: "Hello world",
      json: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "Hello world",
              },
            ],
          },
        ],
      },
    },
    isLoading: false,
    autoFocus: true,
    isSubTask: false,
  },
};

export const Loading: Story = {
  args: {
    isLoading: true,
    autoFocus: false,
    isSubTask: false,
  },
};
