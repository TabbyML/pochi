import { SubmitDropdownButton } from "@/components/submit-dropdown-button";
import { queryClient } from "@/lib/query-client";
import type { McpStatus } from "@getpochi/common/mcp-utils";
import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "@storybook/test";
import { useEffect } from "react";

const meta = {
  title: "Components/SubmitDropdownButton",
  component: SubmitDropdownButton,
  tags: ["autodocs"],
  args: {
    onSubmit: fn(),
    onSubmitPlan: fn(),
    onToggleServer: fn(),
    resetMcpTools: fn(),
    mcpConfigOverride: {},
  },
  decorators: [
    (Story) => (
      <div className="flex h-64 items-center justify-center p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SubmitDropdownButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Loading: Story = {
  args: {
    isLoading: true,
  },
};

export const Disabled: Story = {
  args: {
    disabled: true,
  },
};

const mockMcpStatus: McpStatus = {
  connections: {
    "test-server-1": {
      status: "ready",
      error: undefined,
      tools: {
        "tool-a": {
          name: "tool-a",
          description: "Tool A description",
          // @ts-expect-error
          inputSchema: {},
          disabled: false,
        },
      },
    },
    "test-server-2": {
      status: "stopped",
      error: undefined,
      tools: {},
    },
    "test-server-error": {
      status: "error",
      error: "Connection failed",
      tools: {},
    },
  },
  toolset: {},
  instructions: "",
};

export const WithServers: Story = {
  decorators: [
    (Story) => {
      useEffect(() => {
        queryClient.setQueryData(["mcpStatus"], { value: mockMcpStatus });

        // Also need to cache tools for useMcpToolsCache
        queryClient.setQueryData(["mcpConnectTools", "test-server-1"], {
          name: "test-server-1",
          tools: mockMcpStatus.connections["test-server-1"].tools,
        });

        return () => {
          queryClient.setQueryData(["mcpStatus"], {
            value: { connections: {}, toolset: {}, instructions: "" },
          });
        };
      }, []);
      return <Story />;
    },
  ],
};

export const WithConfigOverride: Story = {
  args: {
    mcpConfigOverride: {
      "test-server-1": {
        disabledTools: [],
      },
    },
  },
  decorators: [
    (Story) => {
      useEffect(() => {
        queryClient.setQueryData(["mcpStatus"], { value: mockMcpStatus });
        queryClient.setQueryData(["mcpConnectTools", "test-server-1"], {
          name: "test-server-1",
          tools: mockMcpStatus.connections["test-server-1"].tools,
        });

        return () => {
          queryClient.setQueryData(["mcpStatus"], {
            value: { connections: {}, toolset: {}, instructions: "" },
          });
        };
      }, []);
      return <Story />;
    },
  ],
};
