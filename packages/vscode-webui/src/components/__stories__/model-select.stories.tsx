import type { Meta, StoryObj } from "@storybook/react";

import type { ModelGroups } from "@/features/settings";
import { ModelSelect } from "../model-select";

const meta = {
  title: "Chat/ModelSelect",
  component: ModelSelect,
  parameters: {
    layout: "centered",
  },
} satisfies Meta<typeof ModelSelect>;

export default meta;
type Story = StoryObj<typeof meta>;

const mockModels: ModelGroups = [
  {
    title: "Hosted Models",
    isCustom: false,
    models: [
      {
        id: "claude-3-opus",
        modelId: "claude-3-opus",
        name: "Claude 3 Opus",
        type: "vendor",
        vendorId: "anthropic",
        options: {
          label: "super",
          contextWindow: 200000,
        },
        getCredentials: async () => ({}),
      },
      {
        id: "gpt-4o",
        modelId: "gpt-4o",
        name: "GPT-4o",
        type: "vendor",
        vendorId: "openai",
        options: {
          label: "super",
          contextWindow: 128000,
        },
        getCredentials: async () => ({}),
      },
      {
        id: "gemini-1.5-flash",
        modelId: "gemini-1.5-flash",
        name: "Gemini 1.5 Flash",
        type: "vendor",
        vendorId: "google",
        options: {
          label: "swift",
          contextWindow: 1000000,
        },
        getCredentials: async () => ({}),
      },
    ],
  },
  {
    title: "Custom Models",
    isCustom: true,
    models: [
      {
        id: "custom-model-1",
        modelId: "custom-model-1",
        name: "My Custom Model 1",
        type: "provider",
        options: {
          maxTokens: 4000,
          label: "custom",
          contextWindow: 10000,
        },
        provider: {
          name: "Custom Provider",
          baseURL: "http://localhost:8080",
        },
      },
      {
        id: "custom-model-2",
        modelId: "custom-model-2",
        name: "My Custom Model 2",
        type: "provider",
        options: {
          maxTokens: 8000,
          label: "custom",
          contextWindow: 20000,
        },
        provider: {
          name: "Custom Provider",
          baseURL: "http://localhost:8080",
        },
      },
    ],
  },
];

export const Default: Story = {
  args: {
    models: mockModels,
    value: mockModels[0].models[0],
    onChange: (v) => console.log("Selected model:", v),
    isLoading: false,
    isValid: true,
  },
};

export const LoadingState: Story = {
  args: {
    models: undefined,
    value: undefined,
    onChange: (v) => console.log("Selected model:", v),
    isLoading: true,
    isValid: false,
  },
};

export const NoModels: Story = {
  args: {
    models: [],
    value: undefined,
    onChange: (v) => console.log("Selected model:", v),
    isLoading: false,
    isValid: false,
  },
};

export const Invalid: Story = {
  args: {
    models: mockModels,
    value: mockModels[0].models[0],
    onChange: (v) => console.log("Selected model:", v),
    isLoading: false,
    isValid: false,
  },
};
