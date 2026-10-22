// @vitest-environment jsdom
import type { Task } from "@getpochi/livekit";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { PublicShareButton } from "../public-share-button";

const sync = vi.hoisted(() => ({
  state: "synced" as "synced" | "syncing" | "offline",
  pending: 0,
  error: null as string | null,
  isLoading: false,
  isRequesting: false,
  sync: vi.fn(async () => {}),
}));
vi.mock("@/lib/hooks/use-sync-status", () => ({ useSyncStatus: () => sync }));
vi.mock("@/lib/use-default-store", () => ({ useDefaultStore: () => ({}) }));
vi.mock("@/lib/vscode", () => ({ vscodeHost: {} }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

afterEach(cleanup);
beforeEach(() => {
  sync.state = "synced";
  sync.error = null;
  sync.isLoading = false;
  sync.isRequesting = false;
  sync.sync.mockClear();
});
beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});
const task = { id: "task", shareId: "p-task" } as Task;

describe("share sync controls", () => {
  it("shows a placeholder instead of offline during the initial status query", () => {
    sync.state = "offline";
    sync.isLoading = true;
    const { rerender } = render(<PublicShareButton task={task} />);
    fireEvent.keyDown(screen.getByRole("button"), { key: "ArrowDown" });
    const item = screen
      .getByText("share.sync.toRemote")
      .closest('[role="menuitem"]');
    expect(item?.querySelector('[data-slot="skeleton"]')).not.toBeNull();
    expect(item?.getAttribute("aria-busy")).toBe("true");
    expect(screen.queryByTestId("sync-status-label")).toBeNull();
    expect(screen.queryByTestId("sync-status-dot")).toBeNull();
    sync.isLoading = false;
    rerender(<PublicShareButton task={task} />);
    expect(item?.querySelector('[data-slot="skeleton"]')).toBeNull();
    expect(screen.getByTestId("sync-status-label").textContent).toBe(
      "share.sync.offline",
    );
  });

  it.each(["synced", "syncing", "offline"] as const)(
    "keeps %s status inside the menu without a toolbar dot",
    (state) => {
      sync.state = state;
      render(<PublicShareButton task={task} />);
      expect(screen.queryByTestId("sync-status-dot")).toBeNull();
      fireEvent.keyDown(screen.getByRole("button"), { key: "ArrowDown" });
      expect(screen.getByTestId("sync-status-label").textContent).toBe(
        `share.sync.${state}`,
      );
      const item = screen
        .getByText("share.sync.toRemote")
        .closest('[role="menuitem"]');
      expect(item?.contains(screen.getByTestId("sync-status-label"))).toBe(
        true,
      );
      expect(item?.querySelector(".animate-spin") !== null).toBe(
        state === "syncing",
      );
    },
  );

  it("keeps the combined sync item disabled while waiting", () => {
    sync.state = "syncing";
    sync.isRequesting = true;
    render(<PublicShareButton task={task} />);
    expect(screen.queryByTestId("sync-status-dot")).toBeNull();
    fireEvent.keyDown(screen.getByRole("button"), { key: "ArrowDown" });
    const item = screen
      .getByText("share.sync.toRemote")
      .closest('[role="menuitem"]');
    expect(item?.getAttribute("aria-disabled")).toBe("true");
    expect(item?.querySelector(".animate-spin")).not.toBeNull();
    expect(item?.getAttribute("title")).toBe("share.sync.description");
  });

  it("shows the failure dot and lets an already synced task request sync again", () => {
    sync.error = "Upload failed";
    render(<PublicShareButton task={task} />);
    expect(screen.getByTestId("sync-status-dot")).not.toBeNull();
    fireEvent.keyDown(screen.getByRole("button"), { key: "ArrowDown" });
    expect(screen.getByTestId("sync-status-label").textContent).toBe(
      "share.sync.failed",
    );
    fireEvent.click(screen.getByText("share.sync.toRemote"));
    expect(sync.sync).toHaveBeenCalledOnce();
  });
});
