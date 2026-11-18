// Shared locators and helpers for driving the Pochi webviews with Playwright.
//
// Used by the E2E specs (through `fixtures.ts`) and by the agent UI tool
// `.agents/skills/run-vscode-extension/scripts/webview.mjs`, so a flow written
// with `webview.mjs run` can move into a spec almost unchanged.
//
// Keep this file loadable by plain Node (type stripping): type-only imports,
// no enums, namespaces or parameter properties.
import type { FrameLocator, Locator, Page } from "@playwright/test";

/** Every Pochi webview iframe (sidebar and task tabs). */
export const PochiWebviewSelector =
  'iframe.webview[src*="extensionId=TabbyML.pochi" i]';

/** The Pochi sidebar webview iframe. */
export const PochiSidebarSelector = `${PochiWebviewSelector}[src*="purpose=webviewView"]`;

/** Pochi task tab (editor) webview iframes. */
export const PochiTaskTabSelector = `${PochiWebviewSelector}:not([src*="purpose=webviewView"])`;

export function pochiIframes(page: Page): Locator {
  return page.locator(PochiWebviewSelector);
}

/**
 * Webview content lives in a nested `#active-frame` inside the webview iframe.
 */
function webviewContent(iframe: Locator): FrameLocator {
  return iframe.contentFrame().locator("#active-frame").contentFrame();
}

/** Content of the Pochi sidebar webview. */
export function sidebarFrame(page: Page): FrameLocator {
  return webviewContent(page.locator(PochiSidebarSelector).first());
}

/** Content of the visible Pochi task tab (the last one if several are visible). */
export function taskTabFrame(page: Page): FrameLocator {
  return webviewContent(
    page.locator(PochiTaskTabSelector).filter({ visible: true }).last(),
  );
}

/** Open the Pochi view container in the activity bar (no-op if it's open). */
export async function openPochiSidebar(
  page: Page,
  { timeout = 30_000 }: { timeout?: number } = {},
): Promise<void> {
  const tab = page.getByRole("tab", { name: /^Pochi/ }).first();
  await tab.waitFor({ state: "attached", timeout });
  if ((await tab.getAttribute("aria-selected")) !== "true") await tab.click();
}

export function modelSelect(frame: FrameLocator): Locator {
  return frame.getByLabel("model-select", { exact: true });
}

async function isModelReady(select: Locator): Promise<boolean> {
  const [valid, modelId] = await Promise.all([
    select.getAttribute("data-valid"),
    select.getAttribute("data-model-id"),
  ]);
  return valid === "true" && !!modelId;
}

async function waitForModelReady(
  select: Locator,
  timeout: number,
): Promise<boolean> {
  const deadline = Date.now() + timeout;
  while (!(await isModelReady(select))) {
    if (Date.now() > deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return true;
}

/**
 * Make sure a usable model is selected in `frame` (sidebar or task tab).
 * The chat input silently drops submissions without one, and a fresh profile
 * may have none. With `model` (and/or `group`, e.g. "Swift"), picks the first
 * entry whose name contains `model` (in the group whose title starts with
 * `group`); otherwise keeps a valid selection (models load asynchronously, so
 * it waits a moment for one) or picks the first entry.
 */
export async function selectModel(
  frame: FrameLocator,
  {
    model,
    group,
    timeout = 30_000,
  }: { model?: string; group?: string; timeout?: number } = {},
): Promise<void> {
  const select = modelSelect(frame);
  await select.waitFor({ state: "visible", timeout });
  if (!model && !group && (await waitForModelReady(select, 5_000))) return;

  await openModelMenu(frame, { timeout });
  let items = modelMenu(frame).getByRole("menuitemradio");
  if (group) {
    items = modelGroupTitles(frame)
      .filter({ hasText: new RegExp(`^${escapeRegExp(group)}`) })
      .first()
      .locator("xpath=..")
      .getByRole("menuitemradio");
  }
  const item = model ? items.filter({ hasText: model }).first() : items.first();
  await item.click({ timeout });

  if (!(await waitForModelReady(select, timeout))) {
    throw new Error(
      `model select did not become ready (model: ${model ?? "first"}, group: ${group ?? "any"})`,
    );
  }
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The model dropdown (its accessible name comes from the trigger, so match the attribute). */
export function modelMenu(frame: FrameLocator): Locator {
  return frame.locator('[aria-label="model-select-menu"]');
}

/** Group titles in the open model menu, e.g. "Super", "Swift". */
export function modelGroupTitles(frame: FrameLocator): Locator {
  return modelMenu(frame).locator('[aria-label="model-group-title"]');
}

/** Open the model dropdown and wait until its model groups have loaded. */
export async function openModelMenu(
  frame: FrameLocator,
  { timeout = 30_000 }: { timeout?: number } = {},
): Promise<void> {
  if (!(await modelMenu(frame).isVisible())) {
    await modelSelect(frame).click({ timeout });
  }
  await modelGroupTitles(frame).first().waitFor({ state: "visible", timeout });
}

/** Type `text` into the chat input of `frame` and submit it with Enter. */
export async function sendMessage(
  frame: FrameLocator,
  text: string,
  { timeout = 30_000 }: { timeout?: number } = {},
): Promise<void> {
  await selectModel(frame, { timeout });
  const input = frame.locator(".ProseMirror").first();
  await input.click({ timeout });
  await input.pressSequentially(text);
  await input.press("Enter");
}

/** Task rows in the sidebar task list. */
export function taskRows(frame: FrameLocator): Locator {
  return frame.locator('[aria-label="task-row"]');
}

/** The sidebar task row of task `id`. */
export function taskRow(frame: FrameLocator, id: string): Locator {
  return frame.locator(`[aria-label="task-row"][data-task-id="${id}"]`);
}

/** Ids of the task rows currently in the sidebar task list. */
export async function taskIds(frame: FrameLocator): Promise<string[]> {
  const rows = await taskRows(frame).all();
  const ids = await Promise.all(
    rows.map((row) => row.getAttribute("data-task-id")),
  );
  return ids.filter((id): id is string => !!id);
}

/** Toggle archive state of task `id` (its archive button shows on hover). */
export async function archiveTask(
  frame: FrameLocator,
  id: string,
): Promise<void> {
  const row = taskRow(frame, id);
  await row.hover();
  await row.locator('[aria-label="archive-task-button"]').click();
}

/** Toggle "Archived tasks" in the task list filter menu. */
export async function toggleArchivedTasks(frame: FrameLocator): Promise<void> {
  await frame.locator('[data-testid="tasks-header"]').hover();
  await frame.locator('[data-testid="filter-tasks-dropdown"]').click();
  const item = frame.locator('[data-testid="filter-archived-tasks"]');
  await item.click();
  await item.waitFor({ state: "hidden" });
}

/** User / assistant messages in a task webview (e.g. `pochi.taskTab`). */
export function chatMessages(
  frame: FrameLocator,
  role: "user" | "assistant",
): Locator {
  return frame.locator(`[aria-label="chat-message-${role}"]`);
}

/** Tool invocation containers in a task webview, optionally filtered by tool name. */
export function toolInvocations(
  frame: FrameLocator,
  toolName?: string,
): Locator {
  return toolName
    ? frame.locator(
        `[data-testid="tool-invocation"][data-tool-name="${toolName}"]`,
      )
    : frame.locator('[data-testid="tool-invocation"]');
}

/**
 * Wait until the task in `frame` finishes its current turn (`completed` or
 * `pending-input`) and the toolbar is no longer running or auto-retrying.
 * Throws immediately if the task settles in `failed`.
 */
export async function waitForTaskFinish(
  frame: FrameLocator,
  { timeout = 150_000 }: { timeout?: number } = {},
): Promise<"completed" | "pending-input"> {
  const deadline = Date.now() + timeout;
  const container = frame.locator('[data-testid="chat-container"]');
  const submitStop = frame.locator('[data-testid="chat-submit-stop-button"]');
  await container.waitFor({ state: "visible", timeout });

  for (;;) {
    const [status, running, assistantCount] = await Promise.all([
      container.getAttribute("data-task-status"),
      submitStop.getAttribute("data-running"),
      chatMessages(frame, "assistant").count(),
    ]);
    if (status === "failed" && running === "false") {
      const errorLocator = frame.locator('[data-testid="chat-error-message"]');
      const detail = (await errorLocator.count())
        ? (await errorLocator.first().innerText()).trim()
        : "unknown error";
      throw new Error(`task failed: ${detail}`);
    }
    if (
      assistantCount > 0 &&
      running === "false" &&
      (status === "completed" || status === "pending-input")
    ) {
      return status;
    }
    if (Date.now() > deadline) {
      throw new Error(
        `task did not finish within ${timeout}ms (status: ${status ?? "none"}, running: ${running ?? "unknown"}, assistantMessages: ${assistantCount})`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

/** Open task `id` from the sidebar task list and wait for its task tab to render. */
export async function openTask(
  page: Page,
  id: string,
  { timeout = 30_000 }: { timeout?: number } = {},
): Promise<void> {
  const row = taskRow(sidebarFrame(page), id);
  await row.waitFor({ state: "visible", timeout });
  await row.click({ timeout });
  await taskTabFrame(page)
    .locator('[data-testid="chat-container"]')
    .waitFor({ state: "visible", timeout });
}

/** Run a VS Code Command Palette entry by title. */
export async function runCommand(
  page: Page,
  title: string,
  { timeout = 30_000 }: { timeout?: number } = {},
): Promise<void> {
  await page.evaluate(
    "document.activeElement?.tagName === 'IFRAME' && document.activeElement.blur()",
  );
  await page.keyboard.press("F1");
  const input = page.locator(".quick-input-widget .quick-input-box input");
  await input.waitFor({ state: "visible", timeout });
  await input.fill(`>${title}`);
  const row = page
    .locator(".quick-input-widget .monaco-list-row")
    .filter({ hasText: title })
    .first();
  await row.click({ timeout });
}

/** Reload the VS Code workbench window and wait until the reloaded workbench is ready. */
export async function reloadWindow(
  page: Page,
  { timeout = 60_000 }: { timeout?: number } = {},
): Promise<void> {
  await Promise.all([
    page.waitForEvent("framenavigated", {
      predicate: (frame) => frame === page.mainFrame(),
      timeout,
    }),
    runCommand(page, "Developer: Reload Window", { timeout }),
  ]);
  await page.waitForLoadState("domcontentloaded", { timeout });
  await page.locator(".monaco-workbench").waitFor({
    state: "visible",
    timeout,
  });
}

export type Pochi = {
  page: Page;
  /** Content of the Pochi sidebar webview. */
  sidebar: FrameLocator;
  /** Content of the visible Pochi task tab. */
  taskTab: FrameLocator;
  /** Task rows in the sidebar task list. */
  taskRows: Locator;
  /** The sidebar task row of task `id`. */
  taskRow(id: string): Locator;
  /** Ids of the task rows currently in the sidebar. */
  taskIds(): Promise<string[]>;
  /** Wait for a sidebar task row whose id is not in `known`; returns its id. */
  waitForNewTask(known?: string[], timeout?: number): Promise<string>;
  /** Open task `id` from the sidebar and wait for its task tab to render. */
  openTask(id: string, options?: { timeout?: number }): Promise<void>;
  /** Toggle archive state of task `id`. */
  archiveTask(id: string): Promise<void>;
  /** Toggle "Archived tasks" in the task list filter. */
  toggleArchivedTasks(): Promise<void>;
  /** User / assistant messages in the visible task tab. */
  messages(role: "user" | "assistant"): Locator;
  /** Tool invocations in the visible task tab, optionally filtered by tool name. */
  toolCalls(toolName?: string): Locator;
  /** Wait until the visible task tab finishes its current turn cleanly. */
  waitForTaskFinish(options?: {
    timeout?: number;
  }): Promise<"completed" | "pending-input">;
  openSidebar(): Promise<void>;
  /** See `selectModel`; `model` matches the name, `group` the group title. */
  selectModel(options?: { model?: string; group?: string }): Promise<void>;
  /** Send a message from the sidebar, which creates a new task. */
  sendMessage(text: string): Promise<void>;
};

export function createPochi(page: Page): Pochi {
  const sidebar = sidebarFrame(page);
  return {
    page,
    sidebar,
    taskTab: taskTabFrame(page),
    taskRows: taskRows(sidebar),
    taskRow: (id) => taskRow(sidebar, id),
    taskIds: () => taskIds(sidebar),
    async waitForNewTask(known = [], timeout = 30_000) {
      const deadline = Date.now() + timeout;
      for (;;) {
        const id = (await taskIds(sidebar)).find((x) => !known.includes(x));
        if (id) return id;
        if (Date.now() > deadline) {
          throw new Error(
            `no new task row within ${timeout}ms (known: ${known.join(", ")})`,
          );
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    },
    openTask: (id, options) => openTask(page, id, options),
    archiveTask: (id) => archiveTask(sidebar, id),
    toggleArchivedTasks: () => toggleArchivedTasks(sidebar),
    messages: (role) => chatMessages(taskTabFrame(page), role),
    toolCalls: (toolName) => toolInvocations(taskTabFrame(page), toolName),
    waitForTaskFinish: (options) =>
      waitForTaskFinish(taskTabFrame(page), options),
    openSidebar: () => openPochiSidebar(page),
    selectModel: (options) => selectModel(sidebar, options),
    sendMessage: (text) => sendMessage(sidebar, text),
  };
}
