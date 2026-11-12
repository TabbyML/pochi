import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import {
  type ElectronApplication,
  type Page,
  test as base,
  _electron as electron,
} from "@playwright/test";
import { type Pochi, createPochi } from "./lib/pochi";
import { downloadVSCode, extensionPath } from "./lib/vscode";
import { type WorkspaceKind, createWorkspace } from "./lib/workspace";

export { expect } from "@playwright/test";
export type { Pochi } from "./lib/pochi";
export type { WorkspaceKind } from "./lib/workspace";

type TestFixtures = {
  /** Workspace to open; set per spec with `test.use({ workspace: "git" })`. */
  workspace: WorkspaceKind;
  /** Model to select, matched against the model name; default: keep or pick the first one. */
  model: string | undefined;
  /** Folder opened in VS Code (undefined for `none`). */
  workspacePath: string | undefined;
  electronApp: ElectronApplication;
  /** The VS Code workbench window. */
  page: Page;
  /** Pochi sidebar opened with a model selected. */
  pochi: Pochi;
};

type WorkerFixtures = {
  /** VS Code executable, downloaded once by global-setup.ts. */
  vscodeExecutable: string;
};

export const test = base.extend<TestFixtures, WorkerFixtures>({
  workspace: ["git", { option: true }],
  model: [process.env.POCHI_E2E_MODEL || undefined, { option: true }],

  vscodeExecutable: [
    // biome-ignore lint/correctness/noEmptyPattern: Playwright requires object destructuring
    async ({}, use) => {
      // Normally set by global-setup.ts; download here when running without it.
      await use(
        process.env.POCHI_E2E_VSCODE_EXECUTABLE || (await downloadVSCode()),
      );
    },
    { scope: "worker" },
  ],

  workspacePath: async ({ workspace }, use, testInfo) => {
    const root = testInfo.outputPath("workspace");
    await use(await createWorkspace(workspace, root));
  },

  electronApp: async ({ vscodeExecutable, workspacePath }, use, testInfo) => {
    // VS Code puts its IPC socket in the user data dir, and Unix socket paths
    // are limited to ~103 characters, so keep it short and out of the repo.
    const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "pochi-e2e-"));
    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
      // ELECTRON_RUN_AS_NODE is set in terminals spawned from VS Code and
      // breaks launching Electron.
      if (value !== undefined && key !== "ELECTRON_RUN_AS_NODE") {
        env[key] = value;
      }
    }
    env.POCHI_TEST = "true";

    const app = await electron.launch({
      executablePath: vscodeExecutable,
      args: [
        ...(workspacePath ? [workspacePath] : []),
        `--extensionDevelopmentPath=${extensionPath}`,
        `--user-data-dir=${path.join(stateDir, "user-data")}`,
        `--extensions-dir=${path.join(stateDir, "extensions")}`,
        "--disable-workspace-trust",
        "--skip-welcome",
        "--skip-release-notes",
        "--disable-updates",
        "--new-window",
        ...(process.platform === "linux"
          ? [
              "--no-sandbox",
              "--disable-dev-shm-usage",
              "--password-store=basic",
            ]
          : []),
      ],
      env,
      // No `recordVideo`: with VS Code's Electron the first window never
      // finishes loading when it's on. The trace has a screenshot filmstrip.
    });
    await app
      .context()
      .tracing.start({ screenshots: true, snapshots: true, sources: true });

    await use(app);

    const failed = testInfo.status !== testInfo.expectedStatus;
    if (failed) {
      const tracePath = testInfo.outputPath("trace.zip");
      await app.context().tracing.stop({ path: tracePath });
      await testInfo.attach("trace", {
        path: tracePath,
        contentType: "application/zip",
      });
      const window = app.windows()[0];
      if (window) {
        await testInfo.attach("screenshot", {
          body: await window.screenshot().catch(() => Buffer.alloc(0)),
          contentType: "image/png",
        });
      }
    } else {
      await app.context().tracing.stop();
    }

    await app.close();
    await fs.rm(stateDir, { recursive: true, force: true }).catch(() => {});
  },

  page: async ({ electronApp }, use) => {
    const page = await electronApp.firstWindow();
    await page.waitForLoadState("domcontentloaded");
    await page.locator(".monaco-workbench").waitFor({ state: "visible" });
    await use(page);
  },

  pochi: async ({ page, model }, use) => {
    const pochi = createPochi(page);
    await pochi.openSidebar();
    await pochi.selectModel(model);
    await use(pochi);
  },
});
