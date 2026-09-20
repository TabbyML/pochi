import type { PochiTaskInfo } from "@getpochi/common/vscode-webui-bridge";
import {
  Matches,
  RouterContextProvider,
  createMemoryHistory,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  type ReactNode,
  StrictMode,
  createContext,
  useContext,
  useEffect,
} from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CompleteSubtaskButton } from "../../features/chat/components/subtask";
import { Route as rootRoute } from "../../routes/__root";
import { Route as taskRoute } from "../../routes/task";
import { TaskPanel } from "../task-panel";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "../ui/sheet";

const state = vi.hoisted(() => ({
  mounts: vi.fn(),
  dispose: vi.fn(),
  globalDispose: vi.fn(),
  initialize: vi.fn(),
  watchTask: vi.fn(async () => {}),
  managerDispose: vi.fn(async () => {}),
  adaptor: vi.fn(),
  models: {
    modelList: [{}] as object[] | undefined,
    isLoading: false,
    isFetching: false,
  },
  credentialsPending: false,
}));
const StoreContext = createContext("");
const store = { storeId: "shared" };
vi.mock("@tanstack/react-router-devtools", () => ({
  TanStackRouterDevtools: () => null,
}));
vi.mock("@/lib/vscode", () => ({
  vscodeHost: {},
  isVSCodeEnvironment: () => true,
}));
vi.mock("@getpochi/livekit", () => ({
  BackgroundJobManager: {
    forStore: () => ({
      initialize: state.initialize,
      watchTask: state.watchTask,
      dispose: state.managerDispose,
    }),
  },
}));
vi.mock("@/lib/remote-blob-store", () => ({ blobStore: {} }));
vi.mock("@/lib/vscode-background-task-state", () => ({
  createVscodeBackgroundTaskStateStore: () => ({}),
}));
vi.mock("@/lib/vscode-running-task-adaptor", () => ({
  VscodeRunningTaskAdaptor: class {
    constructor() {
      state.adaptor();
    }
  },
}));
vi.mock("../terminal-context-state-initializer", () => ({
  TerminalContextStateInitializer: () => null,
}));
vi.mock("@/lib/use-default-store", () => ({
  useDefaultStore: () => store,
  DefaultStoreOptionsProvider: ({
    storeId,
    children,
  }: { storeId: string; children: ReactNode }) => (
    <StoreContext.Provider value={storeId}>{children}</StoreContext.Provider>
  ),
}));
vi.mock("@/lib/hooks/use-model-list", () => ({
  useModelList: () => state.models,
}));
vi.mock("@/lib/hooks/use-user-storage", () => ({
  useUserStorage: () => ({ users: {} }),
}));
vi.mock("@/lib/hooks/use-pochi-credentials", () => ({
  usePochiCredentials: () => ({
    jwt: null,
    isPending: state.credentialsPending,
  }),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("../global-store-initializer", () => ({
  GlobalStoreInitializer: () => {
    useEffect(
      () => () => {
        state.globalDispose();
      },
      [],
    );
    return null;
  },
}));
vi.mock("@/features/chat", () => ({
  // Preserve the actual toolbar button that requires a router, even while hidden.
  ChatSkeleton: () => (
    <div>
      <CompleteSubtaskButton subtask={undefined} showCompleteButton={false} />
      Loading
    </div>
  ),
  SubtaskPage: () => (
    <div data-testid="child" data-store={useContext(StoreContext)}>
      Child details
    </div>
  ),
  ChatPage: () => {
    const storeId = useContext(StoreContext);
    useEffect(() => {
      state.mounts();
      return () => {
        state.dispose();
      };
    }, []);
    return (
      <section data-testid="parent" data-store={storeId}>
        <Sheet>
          <SheetTrigger>Open jobs</SheetTrigger>
          <SheetContent>
            <SheetTitle>Jobs</SheetTitle>
            <SheetDescription>Background jobs</SheetDescription>
          </SheetContent>
        </Sheet>
      </section>
    );
  },
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
beforeEach(() => {
  vi.clearAllMocks();
  state.models = { modelList: [{}], isLoading: false, isFetching: false };
  state.credentialsPending = false;
});

async function setup(
  initialEntry = "/task?uid=parent&storeId=shared",
  info: PochiTaskInfo = {
    type: "open-task",
    uid: "parent",
    cwd: "/repo",
    storeId: "shared",
  },
  kind: "task" | "sidebar" | "standalone" = "task",
  strict = false,
) {
  vi.stubGlobal("POCHI_WEBVIEW_KIND", kind === "sidebar" ? "sidebar" : "pane");
  vi.stubGlobal(
    "POCHI_PANEL_INFO",
    kind === "task"
      ? { type: "task", payload: { task: info } }
      : kind === "standalone"
        ? { type: "standalone", payload: { route: "/browser-agent-settings" } }
        : undefined,
  );
  // Register the production root and task routes as the generated route tree does.
  const taskOptions = {
    ...taskRoute.options,
    getParentRoute: () => rootRoute,
    path: "/task",
  };
  const task = taskRoute.update(taskOptions);
  const settings = createRoute({
    getParentRoute: () => rootRoute,
    path: "/settings",
    component: () => <div>Settings page</div>,
  });
  const taskList = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => <div>Task list</div>,
  });
  const browserSettings = createRoute({
    getParentRoute: () => rootRoute,
    path: "/browser-agent-settings",
    component: () => <div>Browser settings</div>,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      task,
      settings,
      taskList,
      browserSettings,
    ]),
    history: createMemoryHistory({ initialEntries: [initialEntry] }),
    defaultPendingMinMs: 0,
  });
  await router.load();
  const panel = () => (
    <RouterContextProvider router={router}>
      <TaskPanel>
        <Matches />
      </TaskPanel>
    </RouterContextProvider>
  );
  const element = () => (strict ? <StrictMode>{panel()}</StrictMode> : panel());
  const view = render(element());
  return { router, ...view, refresh: () => view.rerender(element()) };
}

describe("task panel ownership", () => {
  it("does not flash the welcome screen while the initial model list is loading", async () => {
    state.models = { modelList: undefined, isLoading: true, isFetching: false };
    const { refresh } = await setup();
    expect(
      screen.queryByRole("link", { name: "welcomeScreen.signIn" }),
    ).toBeNull();
    expect(state.initialize).not.toHaveBeenCalled();
    state.models = { modelList: [], isLoading: false, isFetching: true };
    refresh();
    expect(
      screen.queryByRole("link", { name: "welcomeScreen.signIn" }),
    ).toBeNull();
    state.models = { modelList: [{}], isLoading: false, isFetching: false };
    refresh();
    await screen.findByTestId("parent");
    expect(
      screen.queryByRole("link", { name: "welcomeScreen.signIn" }),
    ).toBeNull();
    // Refreshing available models must not unmount the running panel.
    state.models = { ...state.models, isFetching: true };
    refresh();
    expect(screen.getByTestId("parent")).toBeTruthy();
    expect(state.initialize).toHaveBeenCalledOnce();
    expect(state.managerDispose).not.toHaveBeenCalled();
  });

  it("shows the welcome screen only after loading confirms there are no models", async () => {
    state.models = { modelList: [], isLoading: false, isFetching: true };
    const { refresh } = await setup();
    expect(
      screen.queryByRole("link", { name: "welcomeScreen.signIn" }),
    ).toBeNull();
    state.models = { ...state.models, isFetching: false };
    refresh();
    expect(
      screen.getByRole("link", { name: "welcomeScreen.signIn" }),
    ).toBeTruthy();
    expect(state.initialize).not.toHaveBeenCalled();
  });

  it("provides router context while background initialization shows the loading skeleton", async () => {
    let ready!: () => void;
    state.watchTask.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          ready = resolve;
        }),
    );
    const { unmount } = await setup();
    expect(screen.getByText("Loading")).toBeTruthy();
    expect(screen.queryByTestId("parent")).toBeNull();
    await act(async () => {
      ready();
    });
    await screen.findByTestId("parent");
    unmount();
  });

  it("unmounts whole pages and their portals while retaining the panel owner", async () => {
    const { router, unmount } = await setup();
    const parent = await screen.findByTestId("parent");
    fireEvent.click(screen.getByText("Open jobs"));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(document.body.style.pointerEvents).toBe("none");
    await act(async () => {
      await router.navigate({
        to: "/task",
        search: { uid: "child", storeId: "shared" },
      });
    });
    expect(screen.queryByTestId("parent")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.querySelector('[data-slot="sheet-overlay"]')).toBeNull();
    expect(document.body.style.pointerEvents).toBe("");
    expect(screen.getByTestId("child").getAttribute("data-store")).toBe(
      "shared",
    );
    expect(state.dispose).toHaveBeenCalledOnce();
    expect(state.managerDispose).not.toHaveBeenCalled();
    await act(async () => {
      await router.navigate({ to: "/settings" });
    });
    expect(screen.queryByTestId("child")).toBeNull();
    expect(screen.getByText("Settings page")).toBeTruthy();
    expect(state.managerDispose).not.toHaveBeenCalled();
    await act(async () => {
      await router.navigate({ to: "/task", search: { uid: "parent" } });
    });
    expect(screen.getByTestId("parent")).not.toBe(parent);
    expect(state.mounts).toHaveBeenCalledTimes(2);
    expect(state.initialize).toHaveBeenCalledOnce();
    expect(state.adaptor).toHaveBeenCalledOnce();
    expect(state.globalDispose).not.toHaveBeenCalled();
    unmount();
    await waitFor(() => expect(state.managerDispose).toHaveBeenCalledOnce());
    expect(state.globalDispose).toHaveBeenCalledOnce();
  });

  it("starts background jobs without mounting the main page when opened at a child", async () => {
    await setup("/task?uid=child&storeId=other", {
      type: "open-task",
      uid: "parent",
      cwd: "/repo",
      storeId: "owner-store",
    });
    await screen.findByTestId("child");
    expect(screen.queryByTestId("parent")).toBeNull();
    expect(screen.getByTestId("child").getAttribute("data-store")).toBe(
      "owner-store",
    );
    expect(state.mounts).not.toHaveBeenCalled();
    expect(state.initialize).toHaveBeenCalledOnce();
    expect(state.watchTask).toHaveBeenCalledWith("parent");
  });

  it("starts one owner after StrictMode replays mounting", async () => {
    const { unmount } = await setup("/task?uid=child", undefined, "task", true);
    await screen.findByTestId("child");
    expect(state.initialize).toHaveBeenCalledOnce();
    expect(state.managerDispose).not.toHaveBeenCalled();
    unmount();
    await waitFor(() => expect(state.managerDispose).toHaveBeenCalledOnce());
  });

  it("does not mount a task when the sidebar switches between task list and settings", async () => {
    const { router } = await setup("/", undefined, "sidebar");
    await screen.findByText("Task list");
    await act(async () => {
      await router.navigate({ to: "/settings" });
    });
    await screen.findByText("Settings page");
    await act(async () => {
      await router.navigate({ to: "/" });
    });
    await screen.findByText("Task list");
    expect(screen.queryByTestId("parent")).toBeNull();
    expect(state.mounts).not.toHaveBeenCalled();
    expect(state.initialize).not.toHaveBeenCalled();
  });

  it("does not mount a task in the standalone settings panel", async () => {
    await setup("/browser-agent-settings", undefined, "standalone");
    await screen.findByText("Browser settings");
    expect(screen.queryByTestId("parent")).toBeNull();
    expect(state.mounts).not.toHaveBeenCalled();
    expect(state.initialize).not.toHaveBeenCalled();
  });
});
