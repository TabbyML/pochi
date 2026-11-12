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
 * may have none. With `model`, picks the first entry whose name contains it;
 * otherwise keeps a valid selection (models load asynchronously, so it waits
 * a moment for one) or picks the first entry.
 */
export async function selectModel(
  frame: FrameLocator,
  { model, timeout = 30_000 }: { model?: string; timeout?: number } = {},
): Promise<void> {
  const select = modelSelect(frame);
  await select.waitFor({ state: "visible", timeout });
  if (!model && (await waitForModelReady(select, 5_000))) return;

  await select.click();
  // The menu's accessible name comes from the trigger, so match the attribute.
  const items = frame
    .locator('[aria-label="model-select-menu"]')
    .getByRole("menuitemradio");
  const item = model ? items.filter({ hasText: model }).first() : items.first();
  await item.click({ timeout });

  if (!(await waitForModelReady(select, timeout))) {
    throw new Error(
      `model select did not become ready (model: ${model ?? "first"})`,
    );
  }
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

export type Pochi = {
  page: Page;
  /** Content of the Pochi sidebar webview. */
  sidebar: FrameLocator;
  /** Content of the visible Pochi task tab. */
  taskTab: FrameLocator;
  /** Task rows in the sidebar task list. */
  taskRows: Locator;
  openSidebar(): Promise<void>;
  selectModel(model?: string): Promise<void>;
  /** Send a message from the sidebar, which creates a new task. */
  sendMessage(text: string): Promise<void>;
};

export function createPochi(page: Page): Pochi {
  const sidebar = sidebarFrame(page);
  return {
    page,
    sidebar,
    taskTab: taskTabFrame(page),
    taskRows: sidebar.getByLabel("task-row", { exact: true }),
    openSidebar: () => openPochiSidebar(page),
    selectModel: (model) => selectModel(sidebar, { model }),
    sendMessage: (text) => sendMessage(sidebar, text),
  };
}
