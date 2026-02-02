import type { Meta, StoryObj } from "@storybook/react";

import type { ModelGroups } from "@/features/settings";
import { ModelSelect } from "../model-select";

const meta = {
  title: "Components/ModelSelect",
  component: ModelSelect,
  parameters: {
    layout: "centered",
  },
} satisfies Meta<typeof ModelSelect>;

export default meta;
type Story = StoryObj<typeof meta>;

const mockModels: ModelGroups = [
  {
    title: "Super Models",
    isCustom: false,
    models: [
      {
        id: "pochi/max-1",
        modelId: "pochi/max-1",
        name: "Pochi Max 1",
        type: "vendor",
        vendorId: "pochi",
        options: {
          label: "super",
          contextWindow: 1048576,
        },
        getCredentials: async () => ({}),
      },
      {
        id: "google/gemini-3-pro",
        modelId: "google/gemini-3-pro",
        name: "Gemini 3 Pro",
        type: "vendor",
        vendorId: "google",
        options: {
          label: "super",
          contextWindow: 1048576,
        },
        getCredentials: async () => ({}),
      },
    ],
  },
  {
    title: "Swift",
    isCustom: false,
    models: [
      {
        id: "pochi/pro-1",
        modelId: "pochi/pro-1",
        name: "Pochi Pro 1",
        type: "vendor",
        vendorId: "pochi",
        options: {
          label: "swift",
          contextWindow: 1048576,
        },
        getCredentials: async () => ({}),
      },
      {
        id: "google/gemini-3-flash",
        modelId: "google/gemini-3-flash",
        name: "Gemini 3 Flash",
        type: "vendor",
        vendorId: "google",
        options: {
          label: "swift",
          contextWindow: 1048576,
        },
        getCredentials: async () => ({}),
      },
      {
        id: "moonshotai/kimi-k2",
        modelId: "moonshotai/kimi-k2",
        name: "Kimi K2",
        type: "vendor",
        vendorId: "moonshotai",
        options: {
          label: "swift",
          contextWindow: 256000,
        },
        getCredentials: async () => ({}),
      },
      {
        id: "qwen/qwen3-coder",
        modelId: "qwen/qwen3-coder",
        name: "Qwen 3 Coder",
        type: "vendor",
        vendorId: "qwen",
        options: {
          label: "swift",
          contextWindow: 262144,
        },
        getCredentials: async () => ({}),
      },
      {
        id: "xai/grok-code-fast-1",
        modelId: "xai/grok-code-fast-1",
        name: "Grok Code Fast 1",
        type: "vendor",
        vendorId: "xai",
        options: {
          label: "swift",
          contextWindow: 256000,
        },
        getCredentials: async () => ({}),
      },
      {
        id: "zai/glm-4.7",
        modelId: "zai/glm-4.7",
        name: "GLM 4.7",
        type: "vendor",
        vendorId: "zai",
        options: {
          label: "swift",
          contextWindow: 200000,
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
    reloadModels: async () => console.log("Refreshing models..."),
  },
};

export const LoadingState: Story = {
  args: {
    models: undefined,
    value: undefined,
    onChange: (v) => console.log("Selected model:", v),
    isLoading: true,
    isValid: false,
    reloadModels: async () => console.log("Refreshing models..."),
  },
};

export const NoModels: Story = {
  args: {
    models: [],
    value: undefined,
    onChange: (v) => console.log("Selected model:", v),
    isLoading: false,
    isFetching: false,
    isValid: false,
    reloadModels: async () => console.log("Refreshing models..."),
  },
};

export const Refreshing: Story = {
  args: {
    models: [],
    value: undefined,
    onChange: (v) => console.log("Selected model:", v),
    isLoading: false,
    isFetching: true,
    isValid: false,
    reloadModels: async () => console.log("Refreshing models..."),
  },
};

export const Invalid: Story = {
  args: {
    models: mockModels,
    value: mockModels[0].models[0],
    onChange: (v) => console.log("Selected model:", v),
    isLoading: false,
    isFetching: false,
    isValid: false,
    reloadModels: async () => console.log("Refreshing models..."),
  },
};
