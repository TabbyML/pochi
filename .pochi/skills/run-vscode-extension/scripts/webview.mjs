#!/usr/bin/env node
// Drive the Pochi webview (and the VS Code workbench) of a VS Code window
// started by launch.sh, using Playwright over CDP. Run with node, not bun.
//
// VS Code webviews are out-of-process iframes with the app in a nested
// `#active-frame`; Playwright resolves both levels, so selectors work without
// coordinates. Playwright only tracks out-of-process iframes that load *after*
// it connects (it ignores the frame tree of pre-existing ones), so a long-lived
// `serve` daemon holds a single connection, reloads the webviews once so they
// are tracked, and the other commands talk to it over a unix socket.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { pathToFileURL } from "node:url";
// playwright-core: the CDP client only, no bundled browsers (root devDependency).
import { chromium } from "playwright-core";

const usage = `Usage: node webview.mjs [--port 9233] [-w <webview>] [--timeout <sec>] <command> [args]

Daemon:
  serve                     hold the CDP connection (run as a background job)
  wait-ready [sec]          wait until the daemon is connected and the Pochi sidebar renders
  status                    daemon state and Pochi webviews

Webview (-w): sidebar (default) | editor | workbench | <index from \`list\`>

Commands (sent to the daemon):
  list                      list Pochi webviews (index, kind, visibility, title)
  snapshot [locator]        ARIA snapshot of the webview (or of a locator)
  click <locator>           click (real, trusted input)
  hover <locator>
  fill <locator> <text>     replace text (inputs and the ProseMirror editor)
  type <locator> <text>     type with real keystrokes
  press <key> [locator]     e.g. Enter, Escape, Meta+a
  text [locator]            print innerText (default: body)
  count <locator>           number of matches
  wait <locator>            wait until visible
  wait-text <text>          wait until text is visible
  eval <js>                 evaluate an expression in the webview, print JSON
  screenshot <file>         screenshot of the webview (or full window with -w workbench)
  command <title>           run a Command Palette entry, e.g. "Developer: Reload Webviews"
  logs [--clear]            console messages and page errors buffered by the daemon
  run <script.mjs>          call the script's default export with { page, frame, webviews, locator, log }

Locators: Playwright selectors, plus label=<aria-label or label, exact>.
  label=model-select   role=button[name="Submit"]   text=Task Completed
  .ProseMirror   [aria-label="Add"]   role=menuitem[name="x"] >> nth=0`;

function parseArgs(argv) {
  const opts = {
    port: Number(process.env.POCHI_VSCODE_CDP_PORT || 9233),
    webview: "sidebar",
    timeout: 15,
  };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--port") opts.port = Number(argv[++i]);
    else if (arg === "-w" || arg === "--webview") opts.webview = argv[++i];
    else if (arg === "--timeout") opts.timeout = Number(argv[++i]);
    else if (arg === "-h" || arg === "--help") opts.help = true;
    else rest.push(arg);
  }
  return { opts, command: rest[0], args: rest.slice(1) };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const formatError = (error) =>
  String(error?.message ?? error)
    // biome-ignore lint/suspicious/noControlCharactersInRegex: strips ANSI color codes from Playwright errors
    .replace(/\x1b\[[0-9;]*m/g, "")
    .split("\n")
    .slice(0, 25)
    .join("\n");
const socketPath = (port) => `/tmp/pochi-vscode-debug-${port}/webview.sock`;

// ---------------------------------------------------------------------------
// Playwright helpers (daemon side)
// ---------------------------------------------------------------------------

async function connect(port, seconds) {
  const deadline = Date.now() + seconds * 1000;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const browser = await chromium.connectOverCDP(
        `http://127.0.0.1:${port}`,
        {
          timeout: 10_000,
        },
      );
      const page = browser
        .contexts()
        .flatMap((context) => context.pages())
        .find((p) => p.url().includes("workbench"));
      if (page) return { browser, page };
      lastError = new Error("VS Code workbench page not found");
    } catch (error) {
      lastError = error;
    }
    await sleep(1000);
  }
  throw new Error(`cannot connect to CDP port ${port}: ${lastError?.message}`);
}

const pochiIframes = (page) =>
  page.locator('iframe.webview[src*="extensionId=TabbyML.pochi" i]');

async function listWebviews(page) {
  const webviews = [];
  const elements = await pochiIframes(page).elementHandles();
  for (const element of elements) {
    const url = (await element.getAttribute("src")) ?? "";
    const outer = await element.contentFrame();
    const innerElement = await outer
      ?.waitForSelector("#active-frame", { state: "attached", timeout: 2000 })
      .catch(() => null);
    const inner = await innerElement?.contentFrame();
    if (!inner) continue;
    let visible = false;
    try {
      const box = await element.boundingBox();
      visible =
        !!box && box.width > 0 && box.height > 0 && (await element.isVisible());
    } catch {}
    const textLength = await inner
      .evaluate(() => document.body?.innerText.trim().length ?? 0)
      .catch(() => 0);
    webviews.push({
      index: webviews.length,
      kind: url.includes("purpose=webviewView") ? "sidebar" : "editor",
      visible,
      rendered: textLength > 0,
      title: await inner.title().catch(() => ""),
      id: new URL(url).searchParams.get("id"),
      element,
      inner,
    });
  }
  // Iframes Playwright cannot see into (loaded before the connection, or
  // still loading).
  webviews.untracked = elements.length - webviews.length;
  return webviews;
}

function describe(webviews) {
  const lines = webviews.map(
    (w) =>
      `[${w.index}] ${w.kind.padEnd(7)} ${w.visible ? "visible" : "hidden "} ${w.rendered ? "rendered" : "blank   "} title=${JSON.stringify(w.title)} id=${w.id}`,
  );
  if (!lines.length) lines.push("(no Pochi webviews)");
  if (webviews.untracked > 0) {
    lines.push(
      `(${webviews.untracked} Pochi webview(s) still loading or not trackable; if this persists, run \`command "Developer: Reload Webviews"\`)`,
    );
  }
  return lines.join("\n");
}

function pickWebview(webviews, spec) {
  if (/^\d+$/.test(spec)) {
    const found = webviews[Number(spec)];
    if (!found) throw new Error(`no webview with index ${spec}; run \`list\``);
    return found;
  }
  if (spec === "sidebar" || spec === "editor") {
    const ofKind = webviews.filter((w) => w.kind === spec);
    const found = ofKind.filter((w) => w.visible).at(-1);
    if (found) return found;
    throw new Error(
      ofKind.length
        ? `the ${spec} Pochi webview is not visible; bring it to the front first`
        : `no ${spec} Pochi webview${spec === "editor" ? "; open a task tab first" : ""}`,
    );
  }
  const found = webviews.find((w) => w.title.includes(spec));
  if (!found) throw new Error(`no webview whose title contains "${spec}"`);
  return found;
}

function locate(frame, selector) {
  const label = selector.match(/^label=(.*)$/s);
  if (label) return frame.getByLabel(label[1], { exact: true });
  return frame.locator(selector);
}

async function openPochiSidebar(page) {
  const tab = page.getByRole("tab", { name: /^Pochi/ }).first();
  await tab.waitFor({ state: "attached", timeout: 30_000 });
  if ((await tab.getAttribute("aria-selected")) !== "true") await tab.click();
}

async function runPaletteCommand(page, title, timeout) {
  // Keyboard input goes to the focused frame; pull focus out of any webview.
  await page.evaluate(() => {
    const active = document.activeElement;
    if (active && active.tagName === "IFRAME") active.blur();
  });
  await page.keyboard.press("F1");
  const input = page.locator(".quick-input-widget .quick-input-box input");
  await input.waitFor({ state: "visible", timeout });
  await input.fill(`>${title}`);
  const rows = page.locator(".quick-input-widget .monaco-list-row");
  await rows.first().waitFor({ state: "visible", timeout });
  const label = (await rows.first().getAttribute("aria-label")) ?? "";
  if (!label.toLowerCase().includes(title.toLowerCase())) {
    const labels = await rows.evaluateAll((all) =>
      all.slice(0, 5).map((r) => r.getAttribute("aria-label")),
    );
    await input.press("Escape");
    throw new Error(
      `no command matching "${title}"; top results: ${JSON.stringify(labels)}`,
    );
  }
  await input.press("Enter");
  return label;
}

async function waitForSidebar(page, seconds) {
  const deadline = Date.now() + seconds * 1000;
  let webviews = [];
  while (Date.now() < deadline) {
    webviews = await listWebviews(page);
    if (webviews.some((w) => w.kind === "sidebar" && w.visible && w.rendered)) {
      return webviews;
    }
    await sleep(1000);
  }
  throw new Error(
    `Pochi sidebar did not render within ${seconds}s\n${describe(webviews)}`,
  );
}

// ---------------------------------------------------------------------------
// Daemon
// ---------------------------------------------------------------------------

async function serve(port) {
  const sock = socketPath(port);
  fs.mkdirSync(path.dirname(sock), { recursive: true });
  fs.rmSync(sock, { force: true });

  const state = { ready: false, message: "connecting", logs: [] };
  const pushLog = (line) => {
    state.logs.push(`${new Date().toISOString().slice(11, 23)} ${line}`);
    if (state.logs.length > 2000)
      state.logs.splice(0, state.logs.length - 2000);
  };

  const { browser, page } = await connect(port, 120);
  console.log(`connected to CDP port ${port}`);
  page.on("console", (msg) => {
    const url = msg.location().url;
    pushLog(`[${msg.type()}] ${msg.text()}${url ? `  (${url})` : ""}`);
  });
  page.on("pageerror", (error) =>
    pushLog(`[pageerror] ${error.stack ?? error}`),
  );
  browser.on("disconnected", () => {
    console.log("CDP connection closed; exiting");
    fs.rmSync(sock, { force: true });
    process.exit(0);
  });

  let queue = Promise.resolve();
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      queue = queue.then(async () => {
        const output = [];
        let ok = true;
        try {
          const request = JSON.parse(body || "{}");
          await handle({ page, browser, state }, request, (line) =>
            output.push(String(line)),
          );
        } catch (error) {
          ok = false;
          output.push(formatError(error));
        }
        res.end(JSON.stringify({ ok, output: output.join("\n") }));
      });
    });
  });
  server.listen(sock, () => console.log(`listening on ${sock}`));
  const shutdown = () => {
    fs.rmSync(sock, { force: true });
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  // Make the Pochi webviews visible to this connection.
  try {
    state.message = "opening the Pochi sidebar";
    await openPochiSidebar(page);
    await pochiIframes(page)
      .first()
      .waitFor({ state: "attached", timeout: 30_000 });
    await sleep(3000); // let webviews created by opening the sidebar load
    if ((await listWebviews(page)).untracked > 0) {
      state.message = "reloading webviews so Playwright can track them";
      console.log(state.message);
      await runPaletteCommand(page, "Developer: Reload Webviews", 10_000);
    }
    state.message = "waiting for the Pochi sidebar to render";
    const webviews = await waitForSidebar(page, 60);
    state.ready = true;
    state.message = "ready";
    console.log(`ready\n${describe(webviews)}`);
  } catch (error) {
    const reload = '`command "Developer: Reload Webviews"`';
    state.message = `${error.message}\nhints: dev mode needs Vite on :4112, then run ${reload}; make sure Pochi is signed in.`;
    console.log(`not ready: ${state.message}`);
  }
}

async function handle(ctx, request, out) {
  const { page, browser, state } = ctx;
  const { command, args = [], webview = "sidebar" } = request;
  const timeout = (request.timeout ?? 15) * 1000;

  if (command === "status") {
    out(`ready: ${state.ready} (${state.message})`);
    out(describe(await listWebviews(page)));
    return;
  }
  if (command === "list") {
    out(describe(await listWebviews(page)));
    return;
  }
  if (command === "command") {
    out(
      `✓ ran: ${await runPaletteCommand(page, requireArg(args, 0, "title"), timeout)}`,
    );
    return;
  }
  if (command === "logs") {
    out(state.logs.join("\n") || "(no logs)");
    if (args.includes("--clear")) state.logs.length = 0;
    return;
  }

  let webviews = await listWebviews(page);
  if (
    webview === "sidebar" &&
    !webviews.some((w) => w.kind === "sidebar" && w.visible)
  ) {
    // e.g. after "Developer: Reload Window" or switching to another view.
    await openPochiSidebar(page);
    webviews = await waitForSidebar(page, 30);
  }
  const target =
    webview === "workbench" ? undefined : pickWebview(webviews, webview);
  const frame = target ? target.inner : page.mainFrame();
  const locator = (selector) => locate(frame, selector);

  switch (command) {
    case "snapshot": {
      const root = args[0] ? locator(args[0]) : frame.locator("body");
      out(await root.ariaSnapshot({ timeout }));
      break;
    }
    case "click":
      await locator(requireArg(args, 0, "locator")).click({ timeout });
      out("✓ clicked");
      break;
    case "hover":
      await locator(requireArg(args, 0, "locator")).hover({ timeout });
      out("✓ hovered");
      break;
    case "fill":
      await locator(requireArg(args, 0, "locator")).fill(
        requireArg(args, 1, "text"),
        {
          timeout,
        },
      );
      out("✓ filled");
      break;
    case "type":
      await locator(requireArg(args, 0, "locator")).pressSequentially(
        requireArg(args, 1, "text"),
        { timeout },
      );
      out("✓ typed");
      break;
    case "press": {
      const key = requireArg(args, 0, "key");
      if (args[1]) await locator(args[1]).press(key, { timeout });
      else await page.keyboard.press(key);
      out(`✓ pressed ${key}`);
      break;
    }
    case "text":
      out(
        await (args[0] ? locator(args[0]) : frame.locator("body")).innerText({
          timeout,
        }),
      );
      break;
    case "count":
      out(await locator(requireArg(args, 0, "locator")).count());
      break;
    case "wait":
      await locator(requireArg(args, 0, "locator")).waitFor({
        state: "visible",
        timeout,
      });
      out("✓ visible");
      break;
    case "wait-text":
      await frame
        .getByText(requireArg(args, 0, "text"))
        .first()
        .waitFor({ state: "visible", timeout });
      out("✓ visible");
      break;
    case "eval":
      out(
        JSON.stringify(
          await frame.evaluate(requireArg(args, 0, "js")),
          null,
          2,
        ),
      );
      break;
    case "screenshot": {
      const file = path.resolve(
        request.cwd ?? ".",
        requireArg(args, 0, "file"),
      );
      if (target) await target.element.screenshot({ path: file });
      else await page.screenshot({ path: file });
      out(`✓ saved ${file}`);
      break;
    }
    case "run": {
      const file = path.resolve(
        request.cwd ?? ".",
        requireArg(args, 0, "script"),
      );
      const mod = await import(`${pathToFileURL(file).href}?t=${Date.now()}`);
      await mod.default({ browser, page, frame, webviews, locator, log: out });
      break;
    }
    default:
      throw new Error(`unknown command: ${command}\n\n${usage}`);
  }
}

function requireArg(args, index, name) {
  const value = args[index];
  if (value === undefined) throw new Error(`missing <${name}>`);
  return value;
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

function send(port, payload) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { socketPath: socketPath(port), method: "POST", path: "/" },
      (res) => {
        let body = "";
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => resolve(JSON.parse(body)));
      },
    );
    req.on("error", reject);
    req.end(JSON.stringify(payload));
  });
}

async function waitReady(port, seconds) {
  const deadline = Date.now() + seconds * 1000;
  let last =
    "daemon not running (start `webview.mjs serve` as a background job)";
  while (Date.now() < deadline) {
    try {
      const { output } = await send(port, { command: "status" });
      if (output.startsWith("ready: true")) return output;
      last = output;
      if (
        !output.includes("(connecting") &&
        !output.includes("(opening") &&
        !output.includes("(reloading") &&
        !output.includes("(waiting")
      ) {
        break; // daemon finished startup but is not ready
      }
    } catch {}
    await sleep(1000);
  }
  throw new Error(`not ready: ${last}`);
}

async function main() {
  const { opts, command, args } = parseArgs(process.argv.slice(2));
  if (opts.help || !command) {
    console.log(usage);
    return command ? 0 : 1;
  }
  if (command === "serve") {
    await serve(opts.port);
    return undefined; // keep running
  }
  if (command === "wait-ready") {
    console.log(await waitReady(opts.port, Number(args[0] ?? 120)));
    return 0;
  }
  let response;
  try {
    response = await send(opts.port, {
      command,
      args,
      webview: opts.webview,
      timeout: opts.timeout,
      cwd: process.cwd(),
    });
  } catch (error) {
    throw new Error(
      `cannot reach the daemon at ${socketPath(opts.port)} (${error.code ?? error.message}); start \`node webview.mjs serve\` as a background job`,
    );
  }
  if (response.ok) {
    console.log(response.output);
    return 0;
  }
  console.error(`✗ ${response.output}`);
  return 1;
}

// Never call browser.close(): with connectOverCDP it would tear down the
// VS Code window's contexts. Exit the process instead.
main().then(
  (code) => {
    if (code !== undefined) process.exit(code);
  },
  (error) => {
    console.error(`✗ ${formatError(error)}`);
    process.exit(1);
  },
);
