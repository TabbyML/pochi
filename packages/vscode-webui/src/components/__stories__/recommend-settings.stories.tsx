import type { VSCodeSettings } from "@getpochi/common/vscode-webui-bridge";
import type { Meta, StoryObj } from "@storybook/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RecommendSettings } from "../recommend-settings";

const defaultSettings: VSCodeSettings = {
  hideRecommendSettings: false,
  autoSaveDisabled: false,
  commentsOpenViewDisabled: false,
  githubCopilotCodeCompletionEnabled: true,
  pochiLayout: {
    enabled: false,
  },
};

function MockedRecommendSettings({
  children,
  settings,
}: {
  children: React.ReactNode;
  settings?: VSCodeSettings;
}) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: Number.POSITIVE_INFINITY,
      },
    },
  });

  queryClient.setQueryData(["vscodeSettings"], {
    value: settings ?? defaultSettings,
  });

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

const meta = {
  title: "Pochi/RecommendSettings",
  component: RecommendSettings,
  parameters: {
    layout: "centered",
  },
  decorators: [
    (Story, context) => (
      <MockedRecommendSettings settings={context.parameters.settings}>
        <Story />
      </MockedRecommendSettings>
    ),
  ],
} satisfies Meta<typeof RecommendSettings>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  parameters: {
    settings: defaultSettings,
  },
};

export const AllConfigured: Story = {
  parameters: {
    settings: {
      ...defaultSettings,
      autoSaveDisabled: true,
      commentsOpenViewDisabled: true,
      githubCopilotCodeCompletionEnabled: false,
      pochiLayout: {
        enabled: true,
      },
    },
  },
};
