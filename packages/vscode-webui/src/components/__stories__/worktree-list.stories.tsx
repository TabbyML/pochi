import type { Meta, StoryObj } from "@storybook/react";
import type { Task } from "@getpochi/livekit";
import type { GitWorktree } from "@getpochi/common/vscode-webui-bridge";
import { WorktreeList } from "../worktree-list";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

// Create a QueryClient for Storybook
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      staleTime: Number.POSITIVE_INFINITY,
    },
  },
});

// Mock data for worktrees
const mockWorktrees: GitWorktree[] = [
  {
    path: "/Users/test/project",
    branch: "main",
    commit: "abc123",
    isMain: true,
  },
  {
    path: "/Users/test/project/.worktrees/feature-branch",
    branch: "feature-branch",
    commit: "def456",
    isMain: false,
  },
  {
    path: "/Users/test/project/.worktrees/bugfix-branch",
    branch: "bugfix-branch",
    commit: "ghi789",
    isMain: false,
  },
  {
    path: "/Users/test/project/.worktrees/another-feature",
    branch: "another-feature",
    commit: "jkl012",
    isMain: false,
  },
];

const mockCurrentWorkspace = {
  workspaceFolder: "/Users/test/project",
};

const mockGhCli = {
  installed: true,
  authorized: true,
};

// Decorator to provide mocked React Query context
const withMockedQueries = (Story: () => ReactNode) => {
  // Set up mock data in the query cache
  queryClient.setQueryData(["worktrees"], {
    worktrees: { value: mockWorktrees },
    ghCli: { value: mockGhCli },
    gitOriginUrl: "https://github.com/test/project.git",
  });
  
  queryClient.setQueryData(["currentWorkspace"], mockCurrentWorkspace);

  return (
    <QueryClientProvider client={queryClient}>
      <Story />
    </QueryClientProvider>
  );
};

const meta = {
  title: "Components/WorktreeList",
  component: WorktreeList,
  decorators: [withMockedQueries],
  parameters: {
    layout: "padded",
    docs: {
      description: {
        component:
          "WorktreeList displays Git worktrees with their associated tasks. It supports grouping, deletion, PR creation, and pagination (loads 10 tasks initially with 'Load More' button).",
      },
    },
  },
  tags: ["autodocs"],
} satisfies Meta<typeof WorktreeList>;

export default meta;
type Story = StoryObj<typeof meta>;

// Helper to create mock tasks with proper types
const createMockTask = (
  id: string,
  title: string | null,
  cwd: string | null,
  lineChanges?: { added: number; removed: number } | null,
): Task => ({
  id,
  title,
  cwd,
  createdAt: new Date(),
  updatedAt: new Date(),
  lineChanges: lineChanges || null,
  status: "pending-input",
  shareId: null,
  isPublicShared: false,
  parentId: null,
  todos: [],
  git: null,
  pendingToolCalls: null,
  totalTokens: null,
  lastStepDuration: null,
  error: null,
  modelId: null,
  displayId: null,
});

/**
 * Empty state - no tasks
 */
export const Empty: Story = {
  args: {
    tasks: [],
    deletingWorktreePaths: new Set(),
    onDeleteWorktree: (path) => console.log("Delete worktree:", path),
  },
  parameters: {
    docs: {
      description: {
        story: "Shows the component when there are no tasks in any worktree.",
      },
    },
  },
};

/**
 * Main worktree with multiple tasks
 */
export const MainWorktreeWithTasks: Story = {
  args: {
    tasks: [
      createMockTask(
        "task-1",
        "Implement user authentication",
        "/Users/test/project",
        { added: 120, removed: 30 },
      ),
      createMockTask(
        "task-2",
        "Fix navigation bug",
        "/Users/test/project",
        { added: 15, removed: 8 },
      ),
      createMockTask(
        "task-3",
        "Update documentation",
        "/Users/test/project",
        { added: 50, removed: 10 },
      ),
    ],
    deletingWorktreePaths: new Set(),
    onDeleteWorktree: (path) => console.log("Delete worktree:", path),
  },
  parameters: {
    docs: {
      description: {
        story:
          "Shows tasks in the main worktree. Note that tasks with line changes will show a PR creation button.",
      },
    },
  },
};

/**
 * Multiple worktrees with tasks
 */
export const MultipleWorktrees: Story = {
  args: {
    tasks: [
      createMockTask(
        "task-1",
        "Main branch task",
        "/Users/test/project",
        { added: 50, removed: 20 },
      ),
      createMockTask(
        "task-2",
        "Feature branch task 1",
        "/Users/test/project/.worktrees/feature-branch",
        { added: 200, removed: 50 },
      ),
      createMockTask(
        "task-3",
        "Feature branch task 2",
        "/Users/test/project/.worktrees/feature-branch",
        { added: 80, removed: 10 },
      ),
      createMockTask(
        "task-4",
        "Bugfix task",
        "/Users/test/project/.worktrees/bugfix-branch",
        { added: 30, removed: 15 },
      ),
    ],
    deletingWorktreePaths: new Set(),
    onDeleteWorktree: (path) => console.log("Delete worktree:", path),
  },
  parameters: {
    docs: {
      description: {
        story:
          "Shows multiple worktrees, each with their own tasks. Worktrees are collapsible and can be deleted (except main).",
      },
    },
  },
};

/**
 * Pagination - 15 tasks (shows Load More button)
 */
export const WithPagination: Story = {
  args: {
    tasks: Array.from({ length: 15 }, (_, i) =>
      createMockTask(
        `task-${i}`,
        `Task ${i + 1}: Implement feature ${i + 1}`,
        "/Users/test/project",
        {
          added: Math.floor(Math.random() * 200) + 10,
          removed: Math.floor(Math.random() * 50) + 1,
        },
      ),
    ),
    deletingWorktreePaths: new Set(),
    onDeleteWorktree: (path) => console.log("Delete worktree:", path),
  },
  parameters: {
    docs: {
      description: {
        story:
          "Shows 15 tasks with pagination. Initially displays 10 tasks, then shows a 'Load More' button to load the remaining 5 tasks.",
      },
    },
  },
};

/**
 * Pagination - 25 tasks (multiple Load More clicks)
 */
export const WithManyTasks: Story = {
  args: {
    tasks: Array.from({ length: 25 }, (_, i) =>
      createMockTask(
        `task-${i}`,
        `Task ${i + 1}: ${i % 3 === 0 ? "Fix bug" : i % 3 === 1 ? "Add feature" : "Refactor code"} #${i + 1}`,
        "/Users/test/project",
        {
          added: Math.floor(Math.random() * 200) + 10,
          removed: Math.floor(Math.random() * 50) + 1,
        },
      ),
    ),
    deletingWorktreePaths: new Set(),
    onDeleteWorktree: (path) => console.log("Delete worktree:", path),
  },
  parameters: {
    docs: {
      description: {
        story:
          "Shows 25 tasks requiring multiple 'Load More' clicks. Demonstrates pagination with large task lists (10 initial + 10 more + 5 remaining).",
      },
    },
  },
};

/**
 * Multiple worktrees with pagination
 */
export const MultipleWorktreesWithPagination: Story = {
  args: {
    tasks: [
      // Main worktree with 15 tasks
      ...Array.from({ length: 15 }, (_, i) =>
        createMockTask(
          `main-task-${i}`,
          `Main: Task ${i + 1}`,
          "/Users/test/project",
          { added: 50 + i * 10, removed: 10 + i * 2 },
        ),
      ),
      // Feature branch with 12 tasks
      ...Array.from({ length: 12 }, (_, i) =>
        createMockTask(
          `feature-task-${i}`,
          `Feature: Task ${i + 1}`,
          "/Users/test/project/.worktrees/feature-branch",
          { added: 100 + i * 15, removed: 20 + i * 3 },
        ),
      ),
      // Bugfix branch with 8 tasks
      ...Array.from({ length: 8 }, (_, i) =>
        createMockTask(
          `bugfix-task-${i}`,
          `Bugfix: Task ${i + 1}`,
          "/Users/test/project/.worktrees/bugfix-branch",
          { added: 30 + i * 5, removed: 5 + i },
        ),
      ),
    ],
    deletingWorktreePaths: new Set(),
    onDeleteWorktree: (path) => console.log("Delete worktree:", path),
  },
  parameters: {
    docs: {
      description: {
        story:
          "Shows multiple worktrees, each with enough tasks to trigger pagination. Main has 15 tasks, feature has 12, and bugfix has 8.",
      },
    },
  },
};

/**
 * Task without line changes (no PR button)
 */
export const NoLineChanges: Story = {
  args: {
    tasks: [
      createMockTask(
        "task-1",
        "Task without code changes",
        "/Users/test/project/.worktrees/feature-branch",
        null,
      ),
    ],
    deletingWorktreePaths: new Set(),
    onDeleteWorktree: (path) => console.log("Delete worktree:", path),
  },
  parameters: {
    docs: {
      description: {
        story:
          "Shows a task without line changes. Note that the PR creation button is not displayed.",
      },
    },
  },
};

/**
 * Worktree being deleted (optimistic UI)
 */
export const DeletingWorktree: Story = {
  args: {
    tasks: [
      createMockTask(
        "task-1",
        "Main task",
        "/Users/test/project",
        { added: 50, removed: 20 },
      ),
      createMockTask(
        "task-2",
        "Task in worktree being deleted",
        "/Users/test/project/.worktrees/feature-branch",
        { added: 100, removed: 30 },
      ),
    ],
    deletingWorktreePaths: new Set([
      "/Users/test/project/.worktrees/feature-branch",
    ]),
    onDeleteWorktree: (path) => console.log("Delete worktree:", path),
  },
  parameters: {
    docs: {
      description: {
        story:
          "Shows optimistic UI when a worktree is being deleted. The worktree is marked as deleted immediately.",
      },
    },
  },
};

/**
 * Interactive example - try the UI
 */
export const Interactive: Story = {
  args: {
    tasks: [
      createMockTask(
        "task-1",
        "Main branch task",
        "/Users/test/project",
        { added: 50, removed: 20 },
      ),
      createMockTask(
        "task-2",
        "Feature task",
        "/Users/test/project/.worktrees/feature-branch",
        { added: 200, removed: 50 },
      ),
      createMockTask(
        "task-3",
        "Another feature task",
        "/Users/test/project/.worktrees/another-feature",
        { added: 150, removed: 30 },
      ),
    ],
    deletingWorktreePaths: new Set(),
    onDeleteWorktree: (path) => {
      console.log("Delete worktree:", path);
      alert(`Deleting worktree: ${path}`);
    },
  },
  parameters: {
    docs: {
      description: {
        story:
          "Interactive example. Try:\n- Hovering over worktrees to see action buttons\n- Clicking the delete button to see the confirmation dialog\n- Expanding/collapsing worktrees\n- Clicking on the PR button (if available)",
      },
    },
  },
};