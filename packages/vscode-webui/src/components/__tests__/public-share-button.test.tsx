// @vitest-environment jsdom
import type { Task } from "@getpochi/livekit";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
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
  sync.pending = 0;
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
  it("keeps the compact header loading instead of showing offline", () => {
    sync.state = "offline";
    sync.isLoading = true;
    const { rerender } = render(<PublicShareButton task={task} />);
    fireEvent.keyDown(screen.getByRole("button"), { key: "ArrowDown" });
    const header = screen.getByRole("heading", {
      name: "share.title",
    }).parentElement;
    expect(header?.querySelector('[data-slot="skeleton"]')).not.toBeNull();
    expect(header?.getAttribute("aria-busy")).toBe("true");
    expect(screen.queryByTestId("sync-status-icon")).toBeNull();
    expect(screen.queryByTestId("sync-status-dot")).toBeNull();
    expect(
      screen.queryByRole("menuitem", { name: /^share\.sync\./ }),
    ).toBeNull();
    sync.isLoading = false;
    rerender(<PublicShareButton task={task} />);
    expect(header?.querySelector('[data-slot="skeleton"]')).toBeNull();
    expect(
      screen.getByTestId("sync-status-icon").getAttribute("aria-label"),
    ).toBe("share.sync.offline");
  });

  it.each(["syncing", "offline"] as const)(
    "shows the %s label only in the icon tooltip",
    async (state) => {
      sync.state = state;
      render(<PublicShareButton task={task} />);
      expect(screen.queryByTestId("sync-status-dot")).toBeNull();
      expect(screen.queryByTestId("sync-status-icon")).toBeNull();
      fireEvent.keyDown(screen.getByRole("button"), { key: "ArrowDown" });
      const icon = screen.getByTestId("sync-status-icon");
      expect(icon.textContent).toBe("");
      expect(icon.getAttribute("aria-label")).toBe(`share.sync.${state}`);
      expect(screen.queryByRole("tooltip")).toBeNull();
      fireEvent.pointerMove(icon, { pointerType: "mouse" });
      await waitFor(() =>
        expect(screen.getByRole("tooltip").textContent).toBe(
          `share.sync.${state}`,
        ),
      );
      expect(
        icon
          .querySelector("svg")
          ?.classList.contains("motion-safe:animate-spin") === true,
      ).toBe(state === "syncing");
    },
  );

  it("does not offer a duplicate sync action for a synced task", () => {
    render(<PublicShareButton task={task} />);
    fireEvent.keyDown(screen.getByRole("button"), { key: "ArrowDown" });
    expect(screen.getByRole("heading", { name: "share.title" })).toBeTruthy();
    expect(screen.queryByTestId("sync-status-icon")).toBeNull();
    expect(
      screen.queryByRole("menuitem", { name: /^share\.sync\./ }),
    ).toBeNull();
    expect(screen.queryByText("Advanced")).toBeNull();
    expect(sync.sync).not.toHaveBeenCalled();
  });

  it("shows pending changes as syncing without another sync action", () => {
    sync.state = "syncing";
    sync.pending = 3;
    render(<PublicShareButton task={task} />);
    fireEvent.keyDown(screen.getByRole("button"), { key: "ArrowDown" });
    expect(screen.getByText("share.sync.syncing").className).toContain(
      "text-muted-foreground",
    );
    expect(
      screen.queryByRole("menuitem", { name: /^share\.sync\./ }),
    ).toBeNull();
    expect(sync.sync).not.toHaveBeenCalled();
  });

  it("shows muted status text while a manual sync is waiting", () => {
    sync.state = "syncing";
    sync.isRequesting = true;
    render(<PublicShareButton task={task} />);
    fireEvent.keyDown(screen.getByRole("button"), { key: "ArrowDown" });
    const status = screen.getByText("share.sync.syncing");
    expect(status.className).toContain("text-muted-foreground");
    expect(
      screen.queryByRole("menuitem", { name: "share.sync.syncing" }),
    ).toBeNull();
    expect(sync.sync).not.toHaveBeenCalled();
  });

  it("uses the notification warning icon and lets failed uploads retry", async () => {
    sync.error = "Upload failed";
    render(<PublicShareButton task={task} />);
    expect(screen.getByTestId("sync-status-dot").className).not.toContain(
      "bg-destructive",
    );
    fireEvent.keyDown(screen.getByRole("button"), { key: "ArrowDown" });
    const icon = screen.getByTestId("sync-status-icon");
    expect(icon.querySelector("svg")?.getAttribute("style")).toContain(
      "--vscode-notificationsWarningIcon-foreground",
    );
    expect(icon.querySelector("svg")?.getAttribute("stroke-width")).toBe("1.5");
    fireEvent.pointerMove(icon, { pointerType: "mouse" });
    await waitFor(() =>
      expect(screen.getByRole("tooltip").textContent).toBe("share.sync.failed"),
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "share.sync.retry" }));
    expect(sync.sync).toHaveBeenCalledOnce();
  });

  it("keeps retry and access changes independent while offline", () => {
    sync.state = "offline";
    const updateAccess = vi.fn();
    render(
      <PublicShareButton task={task} onUpdateIsPublicShared={updateAccess} />,
    );
    fireEvent.keyDown(screen.getByRole("button"), { key: "ArrowDown" });
    fireEvent.click(screen.getByRole("menuitem", { name: "share.setPrivate" }));
    expect(updateAccess).toHaveBeenCalledWith(false);
    expect(sync.sync).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("menuitem", { name: "share.sync.retry" }));
    expect(sync.sync).toHaveBeenCalledOnce();
    expect(
      screen.getByRole("menuitem", { name: "share.copyLink" }),
    ).toBeTruthy();
  });
});
