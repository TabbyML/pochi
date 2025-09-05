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
        type: "hosted",
        contextWindow: 200000,
        costType: "premium",
      },
      {
        id: "gpt-4o",
        modelId: "gpt-4o",
        name: "GPT-4o",
        type: "hosted",
        contextWindow: 128000,
        costType: "premium",
      },
      {
        id: "gemini-1.5-flash",
        modelId: "gemini-1.5-flash",
        name: "Gemini 1.5 Flash",
        type: "hosted",
        contextWindow: 1000000,
        costType: "basic",
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
        type: "byok",
        contextWindow: 10000,
        maxTokens: 4000,
        provider: {
          name: "Custom Provider",
          baseURL: "http://localhost:8080",
        },
      },
      {
        id: "custom-model-2",
        modelId: "custom-model-2",
        name: "My Custom Model 2",
        type: "byok",
        contextWindow: 20000,
        maxTokens: 8000,
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
  },
};

export const LoadingState: Story = {
  args: {
    models: undefined,
    value: undefined,
    onChange: (v) => console.log("Selected model:", v),
    isLoading: true,
  },
};

export const NoModels: Story = {
  args: {
    models: [],
    value: undefined,
    onChange: (v) => console.log("Selected model:", v),
    isLoading: false,
  },
};
