import type { GitWorktree } from "@getpochi/common/vscode-webui-bridge";
import type { Task } from "@getpochi/livekit";
import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "@storybook/test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { usePaginatedTasks } from "#lib/hooks/use-paginated-tasks";
import { WorktreeList } from "../worktree-list";

const mockCwd = "/Users/TabbyML/project/pochi";
const mockOnDeleteWorktree = (worktreePath: string) => {
  console.log("deleting:", worktreePath);
};
const mockDeletingWorktreePaths = new Set<string>();
const mockWorktrees = [
  {
    commit: "kasdlweieiowjala",
    path: mockCwd,
    isMain: true,
    branch: "main",
    data: {
      nextDisplayId: 1,
      github: {
        pullRequest: {
          id: 122,
          status: "open",
          checks: [
            {
              name: "CI/CD Pipeline",
              state: "success",
              url: "https://github.com/TabbyML/pochi/actions/122",
            },
            {
              name: "CodeQL Analysis",
              state: "success",
              url: "https://github.com/TabbyML/pochi/security/122",
            },
            {
              name: "Test Coverage",
              state: "pending",
              url: "https://github.com/TabbyML/pochi/tests/122",
            },
          ],
        },
      },
    },
  },
  {
    commit: "2390asdjko3ifalksd",
    path: `${mockCwd}-feature-auth`,
    isMain: false,
    branch: "feature/auth",
    data: {
      nextDisplayId: 2,
      github: {
        pullRequest: {
          id: 123,
          status: "merged",
          checks: [
            {
              name: "CI/CD Pipeline",
              state: "success",
              url: "https://github.com/TabbyML/pochi/actions/123",
            },
            {
              name: "CodeCov Analysis",
              state: "success",
              url: "https://github.com/TabbyML/pochi/security/123",
            },
            {
              name: "Test Coverage",
              state: "failure",
              url: "https://github.com/TabbyML/pochi/tests/123",
            },
          ],
        },
      },
    },
  },
] satisfies GitWorktree[];
const mockTasks = [
  {
    id: "task-1",
    shareId: "task-1",
    cwd: mockCwd,
    title: "Implement user authentication",
    status: "completed",
    isPublicShared: false,
    parentId: null,
    todos: [],
    git: null,
    pendingToolCalls: null,
    lineChanges: null,
    lastStepDuration: null,
    totalTokens: 10000,
    error: null,
    createdAt: new Date("2025-12-15T10:00:00Z"),
    updatedAt: new Date("2025-12-15T10:00:00Z"),
    modelId: null,
    displayId: 1,
    lastCheckpointHash: null,
  },
  {
    id: "task-2",
    shareId: "task-2",
    cwd: mockCwd,
    title: "Add password reset functionality",
    status: "pending-tool",
    isPublicShared: false,
    parentId: null,
    todos: [],
    git: null,
    pendingToolCalls: null,
    lineChanges: null,
    lastStepDuration: null,
    totalTokens: 10000,
    error: null,
    createdAt: new Date("2025-12-15T10:02:00Z"),
    updatedAt: new Date("2025-12-15T10:02:00Z"),
    modelId: null,
    displayId: 2,
    lastCheckpointHash: null,
  },
  {
    id: "task-3",
    shareId: "task-3",
    cwd: mockCwd,
    title: "Fix login page styling",
    status: "pending-input",
    isPublicShared: false,
    parentId: null,
    todos: [],
    git: null,
    pendingToolCalls: null,
    lineChanges: null,
    lastStepDuration: null,
    totalTokens: 10000,
    error: null,
    createdAt: new Date("2025-12-15T10:05:00Z"),
    updatedAt: new Date("2025-12-15T10:05:00Z"),
    modelId: null,
    displayId: 3,
    lastCheckpointHash: null,
  },
] satisfies Task[];
const mockGh = {
  installed: true,
  authorized: true,
};
// Create a wrapper component that provides mocked data through React Query
function MockedWorktreeList({
  children,
  mockData,
}: {
  children: React.ReactNode;
  mockData: {
    worktrees?: GitWorktree[];
    isLoading?: boolean;
    gh?: typeof mockGh;
    gitOriginUrl?: string | null;
    workspacePath?: string;
  };
}) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        // staleTime: Number.POSITIVE_INFINITY,
      },
    },
  });

  // Set initial data for queries
  queryClient.setQueryData(["currentWorkspace"], {
    workspacePath: mockData.workspacePath || mockCwd,
  });

  queryClient.setQueryData(["worktrees"], {
    worktrees: {
      value: mockData.isLoading ? undefined : mockData.worktrees,
    },
    isLoading: mockData.isLoading,
    gh: { value: mockData.gh || mockGh },
    gitOriginUrl: mockData.gitOriginUrl,
  });

  queryClient.setQueryData(["pochiTabs"], {
    value: {
      "task-1": {},
      "task-2": { unread: true },
      "task-3": { running: true },
    },
  });

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

const meta = {
  title: "Chat/WorktreeList",
  component: WorktreeList,
  parameters: {
    layout: "centered",
  },
  decorators: [
    (Story, context) => {
      return (
        <MockedWorktreeList mockData={context.parameters.mockData || {}}>
          <Story />
        </MockedWorktreeList>
      );
    },
  ],
} satisfies Meta<typeof WorktreeList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  async beforeEach() {
    usePaginatedTasks.mockReturnValue({
      tasks: mockTasks,
      hasMore: false,
      loadMore: fn(),
      reset: fn(),
      isLoading: false,
    });
  },
  args: {
    cwd: mockCwd,
    onDeleteWorktree: mockOnDeleteWorktree,
    deletingWorktreePaths: mockDeletingWorktreePaths,
  },
  parameters: {
    mockData: {
      gitOriginUrl: "git@github.com:TabbyML/pochi.git",
    },
  },
};

export const LoadingState: Story = {
  async beforeEach() {
    usePaginatedTasks.mockReturnValue({
      tasks: mockTasks,
      hasMore: false,
      loadMore: fn(),
      reset: fn(),
      isLoading: true,
    });
  },
  args: {
    ...Default.args,
  },
  parameters: {
    mockData: {
      isLoading: true,
    },
  },
};

export const EmptyState: Story = {
  ...Default,
  args: {
    ...Default.args,
  },
  parameters: {
    mockData: {
      worktrees: [],
    },
  },
};

export const MultipleWorktrees: Story = {
  ...Default,
  args: {
    ...Default.args,
  },
  parameters: {
    mockData: {
      worktrees: mockWorktrees,
    },
  },
};

export const WithDeletingWorktree: Story = {
  ...Default,
  args: {
    ...Default.args,
    deletingWorktreePaths: new Set([mockWorktrees[1].path]),
  },
  parameters: {
    mockData: {
      worktrees: mockWorktrees,
    },
  },
};

export const NoGithubCli: Story = {
  args: {
    ...Default.args,
  },
  parameters: {
    mockData: {
      gh: {
        installed: false,
        authorized: false,
      },
    },
  },
};

export const UnauthorizedGithub: Story = {
  args: {
    ...Default.args,
  },

  parameters: {
    mockData: {
      gh: {
        installed: true,
        authorized: false,
      },
    },
  },
};

export const NoGitOrigin: Story = {
  ...Default,
  args: {
    ...Default.args,
  },

  parameters: {
    mockData: {
      gitOriginUrl: null,
    },
  },
};

export const MainWorkspaceOnly: Story = {
  ...Default,
  args: {
    ...Default.args,
  },
  parameters: {
    mockData: {
      worktrees: [mockWorktrees[0]], // Only the main workspace
    },
  },
};

export const WorktreeWithNoPR: Story = {
  ...Default,
  args: {
    ...Default.args,
  },

  parameters: {
    mockData: {
      worktrees: [
        {
          commit: "abc123def456",
          path: "/Users/will/work/pochi-no-pr",
          isMain: false,
          branch: "feature/no-pr",
          data: {
            nextDisplayId: 5,
          },
        },
      ],
    },
  },
};

export const WorktreeWithFailedChecks: Story = {
  ...Default,
  args: {
    ...Default.args,
  },

  parameters: {
    mockData: {
      worktrees: [
        {
          commit: "failed123def456",
          path: "/Users/will/work/pochi-failed-checks",
          isMain: false,
          branch: "fix/failed-checks",
          data: {
            nextDisplayId: 6,
            github: {
              pullRequest: {
                id: 127,
                status: "open",
                checks: [
                  {
                    name: "CI/CD Pipeline",
                    state: "failure",
                    url: "https://github.com/TabbyML/pochi/actions/127",
                  },
                  {
                    name: "CodeCov Analysis",
                    state: "error",
                    url: "https://github.com/TabbyML/pochi/security/127",
                  },
                ],
              },
            },
          },
        },
      ],
    },
  },
};
