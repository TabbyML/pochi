import type { DisplayModel } from "@getpochi/common/vscode-webui-bridge";
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TokenUsage } from "../token-usage";

const { devModeState } = vi.hoisted(() => ({
  devModeState: { enabled: true },
}));

vi.mock("@/components/ui/popover", () => ({
  Popover: ({ children }: { children: React.ReactNode }) => children,
  PopoverContent: ({ children }: { children: React.ReactNode }) => children,
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@/features/settings", () => ({
  useIsDevMode: () => [devModeState.enabled, vi.fn()] as const,
}));

vi.mock("@/features/tools", () => ({
  FileList: () => null,
}));

vi.mock("@/lib/hooks/use-auto-memory-enabled", () => ({
  useAutoMemoryEnabled: () => ({
    autoMemoryEnabled: false,
    setAutoMemoryEnabled: vi.fn(),
  }),
}));

vi.mock("@/lib/hooks/use-effective-context-window", () => ({
  useEffectiveContextWindow: () => undefined,
}));

vi.mock("@/lib/hooks/use-rules", () => ({
  useRules: () => ({ rules: [] }),
}));

vi.mock("@/lib/hooks/use-task-context-window-usage", () => ({
  useTaskContextWindowUsage: () => ({ contextWindowUsage: undefined }),
}));

vi.mock("@/lib/hooks/use-task-memory-state", () => ({
  useTaskMemoryState: () => ({
    taskMemoryState: { extractionCount: 0 },
  }),
}));

vi.mock("@/lib/vscode", () => ({
  vscodeAutoMemoryManager: {
    readContext: vi.fn().mockResolvedValue(undefined),
    clearProjectMemory: vi.fn(),
  },
  vscodeHost: {
    openFile: vi.fn(),
    showInformationMessage: vi.fn(),
  },
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: undefined }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

const selectedModel = {
  type: "provider",
  options: { contextWindow: 200_000 },
} as DisplayModel;

function renderTokenUsage(
  props: Partial<React.ComponentProps<typeof TokenUsage>> = {},
) {
  return render(
    <TokenUsage
      taskId="task-id"
      selectedModel={selectedModel}
      totalTokens={12_000}
      {...props}
    />,
  );
}

describe("TokenUsage development metadata", () => {
  it("shows input and cache-read tokens in development mode", () => {
    devModeState.enabled = true;

    renderTokenUsage({ inputTokens: 10_000, cacheReadTokens: 8_000 });

    expect(screen.getByText("tokenUsage.inputTokens")).not.toBeNull();
    expect(screen.getByText("10k")).not.toBeNull();
    expect(screen.getByText("tokenUsage.cacheReadTokens")).not.toBeNull();
    expect(screen.getByText("8k")).not.toBeNull();
  });

  it("shows cache-read then input metadata after the context window progress bar", () => {
    devModeState.enabled = true;

    const { container } = renderTokenUsage({
      inputTokens: 10_000,
      cacheReadTokens: 8_000,
    });
    const progress = container.querySelector('[data-slot="progress"]');
    const cacheReadTokens = screen.getByText("tokenUsage.cacheReadTokens");
    const inputTokens = screen.getByText("tokenUsage.inputTokens");

    expect(progress).not.toBeNull();
    expect(progress?.compareDocumentPosition(cacheReadTokens) ?? 0).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(cacheReadTokens.compareDocumentPosition(inputTokens)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it("preserves zero-valued metadata", () => {
    devModeState.enabled = true;

    renderTokenUsage({ inputTokens: 0, cacheReadTokens: 0 });

    expect(screen.getAllByText("0")).toHaveLength(2);
  });

  it("shows N/A when metadata is undefined", () => {
    devModeState.enabled = true;

    renderTokenUsage();

    expect(screen.getAllByText("N/A")).toHaveLength(2);
  });

  it("hides detailed metadata outside development mode", () => {
    devModeState.enabled = false;

    renderTokenUsage({ inputTokens: 10_000, cacheReadTokens: 8_000 });

    expect(screen.queryByText("tokenUsage.inputTokens")).toBeNull();
    expect(screen.queryByText("tokenUsage.cacheReadTokens")).toBeNull();
  });
});
