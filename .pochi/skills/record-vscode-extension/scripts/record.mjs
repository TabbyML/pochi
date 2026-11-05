#!/usr/bin/env node
// Record a run of the local Pochi VS Code extension (an instance
// started with the run-vscode-extension skill) as one shareable Jam
// (https://jam.dev): a video of the window, marks and check results as
// timestamped comments, a pass/fail description, and a console that also
// holds the Pochi webview console and Pochi.log.
//
// `jam record --cdp` only captures the workbench page console, so a detached
// recorder process attaches to the webview targets over CDP, tails Pochi.log,
// and replays both into the workbench page console. The other commands talk to
// the recorder over a unix socket.
import { execFile, execFileSync, spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const usage = `Usage: node record.mjs [--port 9233] <command> [args]

Recording (the VS Code instance from run-vscode-extension must be running):
  start [title] [--video screencast|screen]
                      start a Jam recording; a recorder keeps running in the background
  mark <label>        step marker, becomes a comment at this point of the video
  stop [--verdict pass|fail] [--summary <md> | --summary-file <file>]
       [--resource <url> [--resource-label <text>]]
                      upload; prints the Jam URL
  cancel              discard the recording
  status

Assertions (recorded as ✅/❌ comments while recording; exit 1 on failure):
  check <name> [--expect <output>] -- <webview.mjs args>
                      run a run-vscode-extension webview.mjs command; passes if it exits 0
                      and, with --expect, its trimmed output equals <output>
  check <name> --pass|--fail [--note <text>]
                      record a judgement made another way (screenshot, file, log)
`;

const execFileAsync = promisify(execFile);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const scriptPath = fileURLToPath(import.meta.url);
const webviewScript = path.resolve(
  path.dirname(scriptPath),
  "../../run-vscode-extension/scripts/webview.mjs",
);
const stateDir = (port) => `/tmp/pochi-vscode-debug-${port}`;
const socketPath = (port) => `${stateDir(port)}/record.sock`;
const logPath = (port) => `${stateDir(port)}/record.log`;

function parseArgs(argv) {
  let port = Number(process.env.POCHI_VSCODE_CDP_PORT ?? 9233);
  let help = false;
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--") {
      rest.push(...argv.slice(i));
      break;
    }
    if (arg === "--port") port = Number(argv[++i]);
    else if (arg === "-h" || arg === "--help") help = true;
    else rest.push(arg);
  }
  const [command, ...args] = rest;
  return { port, help, command, args };
}

// `--name value` and boolean `--name` flags; everything else is positional.
function splitFlags(args, booleans = []) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    const name = args[i].match(/^--([\w-]+)$/)?.[1];
    if (!name) positional.push(args[i]);
    else if (booleans.includes(name)) flags[name] = true;
    else if (args[i + 1] === undefined)
      throw new Error(`--${name} needs a value`);
    else flags[name] = args[++i];
  }
  return { flags, positional };
}

const quote = (arg) => (/[\s"'$`]/.test(arg) ? JSON.stringify(arg) : arg);

// ---------------------------------------------------------------------------
// Jam CLI
// ---------------------------------------------------------------------------

const jamBins = () =>
  [
    process.env.JAM_BIN,
    "jam",
    path.join(os.homedir(), ".local/bin/jam"),
  ].filter(Boolean);
const jamMissing =
  "jam CLI not found: install it with `curl -fsSL https://native.jam.dev/install | bash`, then run `jam auth login`";

function parseJamOutput(stdout) {
  const text = stdout.trim();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return JSON.parse(text.split("\n").at(-1));
  }
}

async function jam(args, cwd) {
  for (const bin of jamBins()) {
    try {
      const { stdout } = await execFileAsync(bin, ["--json", ...args], {
        cwd,
        maxBuffer: 16 << 20,
        timeout: 600_000,
      });
      return parseJamOutput(stdout);
    } catch (error) {
      if (error.code === "ENOENT") continue;
      const detail =
        `${error.stderr ?? ""}\n${error.stdout ?? ""}`.trim() || error.message;
      throw new Error(`jam ${args.slice(0, 2).join(" ")} failed: ${detail}`);
    }
  }
  throw new Error(jamMissing);
}

function jamSync(args) {
  for (const bin of jamBins()) {
    try {
      execFileSync(bin, args, { stdio: "ignore", timeout: 30_000 });
      return;
    } catch (error) {
      if (error.code !== "ENOENT") return;
    }
  }
}

// ---------------------------------------------------------------------------
// CDP (raw websocket: attaching to already loaded webview targets works here,
// unlike Playwright, so nothing has to be reloaded)
// ---------------------------------------------------------------------------

async function connectCdp(port) {
  const response = await fetch(`http://127.0.0.1:${port}/json/version`).catch(
    () => undefined,
  );
  if (!response?.ok) {
    throw new Error(
      `no VS Code with CDP on port ${port}; start it with run-vscode-extension's launch.sh`,
    );
  }
  const { webSocketDebuggerUrl } = await response.json();
  const ws = new WebSocket(webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener(
      "error",
      () => reject(new Error("CDP websocket error")),
      { once: true },
    );
  });
  let lastId = 0;
  const pending = new Map();
  const listeners = [];
  ws.addEventListener("message", ({ data }) => {
    const message = JSON.parse(data);
    if (message.id !== undefined) {
      const request = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) request?.reject(new Error(message.error.message));
      else request?.resolve(message.result);
      return;
    }
    for (const listener of listeners) listener(message);
  });
  return {
    send: (method, params, sessionId) =>
      new Promise((resolve, reject) => {
        const id = ++lastId;
        pending.set(id, { resolve, reject });
        ws.send(
          JSON.stringify({ id, method, params: params ?? {}, sessionId }),
        );
      }),
    on: (listener) => listeners.push(listener),
    onClose: (listener) => ws.addEventListener("close", listener),
  };
}

function describeValue(arg) {
  if (arg.type === "string") return arg.value;
  if (arg.value !== undefined) return JSON.stringify(arg.value);
  if (arg.unserializableValue) return arg.unserializableValue;
  const preview = arg.preview;
  if (preview?.properties) {
    const items = preview.properties.map((p) =>
      preview.subtype === "array" ? p.value : `${p.name}: ${p.value}`,
    );
    if (preview.overflow) items.push("…");
    return preview.subtype === "array"
      ? `[${items.join(", ")}]`
      : `{${items.join(", ")}}`;
  }
  return arg.description ?? arg.type;
}

// Drop `%c` placeholders and the CSS arguments they consume.
function formatConsoleArgs(args) {
  const values = args.map(describeValue);
  if (args[0]?.type === "string") {
    const styles = (args[0].value.match(/%c/g) ?? []).length;
    if (styles) {
      values[0] = values[0].replace(/%c/g, "");
      values.splice(1, styles);
    }
  }
  return values.join(" ");
}

const consoleLevels = {
  error: "error",
  assert: "error",
  warning: "warn",
  info: "info",
  debug: "debug",
};

// ---------------------------------------------------------------------------
// Pochi.log
// ---------------------------------------------------------------------------

// Newest Pochi output channel log of the instance (a Reload Window may start a
// new one).
function findPochiLog(port) {
  const root = path.join(stateDir(port), "user-data/logs");
  const list = (dir) => {
    try {
      return fs.readdirSync(dir);
    } catch {
      return [];
    }
  };
  let best;
  for (const session of list(root)) {
    for (const window of list(path.join(root, session))) {
      const file = path.join(
        root,
        session,
        window,
        "exthost/TabbyML.pochi/Pochi.log",
      );
      try {
        const { mtimeMs } = fs.statSync(file);
        if (!best || mtimeMs > best.mtimeMs) best = { file, mtimeMs };
      } catch {}
    }
  }
  return best?.file;
}

const pochiLogLevels = {
  error: "error",
  warning: "warn",
  info: "info",
  debug: "debug",
  trace: "debug",
};

function pollPochiLog(log, port, mirror) {
  const file = findPochiLog(port);
  if (!file) return;
  if (file !== log.file) Object.assign(log, { file, offset: 0, carry: "" });
  const size = fs.statSync(file).size;
  if (size < log.offset) log.offset = 0;
  if (size === log.offset) return;
  const buffer = Buffer.alloc(size - log.offset);
  const fd = fs.openSync(file, "r");
  try {
    fs.readSync(fd, buffer, 0, buffer.length, log.offset);
  } finally {
    fs.closeSync(fd);
  }
  log.offset = size;
  const lines = (log.carry + buffer.toString("utf8")).split("\n");
  log.carry = lines.pop() ?? "";
  for (const line of lines) {
    if (!line.trim()) continue;
    const level = line.match(/^\d{4}-\d\d-\d\d [\d:.]+ \[(\w+)\]/)?.[1];
    if (level) log.level = pochiLogLevels[level] ?? "log";
    mirror(log.level, `[ext] ${line}`);
  }
}

// ---------------------------------------------------------------------------
// Description
// ---------------------------------------------------------------------------

async function gitSummary(cwd) {
  const git = async (...args) =>
    (await execFileAsync("git", args, { cwd })).stdout.trim();
  try {
    const branch = await git("rev-parse", "--abbrev-ref", "HEAD");
    const commit = await git("rev-parse", "--short", "HEAD");
    const subject = await git("log", "-1", "--format=%s");
    const changed = (await git("status", "--porcelain"))
      .split("\n")
      .filter(Boolean).length;
    const stat = changed ? await git("diff", "HEAD", "--shortstat") : "";
    let line = `\`${branch}\` @ \`${commit}\` (${subject})`;
    line += changed
      ? `, plus uncommitted changes in ${changed} file(s)${stat ? `: ${stat}` : ""}`
      : ", no uncommitted changes";
    return line;
  } catch {
    return undefined;
  }
}

async function jamDescription({ checks, verdict, summary, webview, cwd }) {
  const failed = checks.filter((c) => !c.ok).length;
  const lines = [
    {
      pass: "## ✅ PASS",
      fail: "## ❌ FAIL",
      none: "## ⚪ No verdict",
    }[verdict],
    "",
  ];
  if (summary?.trim()) lines.push(summary.trim(), "");
  if (checks.length) {
    lines.push(
      `**Checks: ${checks.length - failed} passed, ${failed} failed**`,
      "",
    );
    for (const check of checks) {
      const reason = check.ok ? "" : `: \`${check.reason}\``;
      lines.push(`- ${check.ok ? "✅" : "❌"} ${check.name}${reason}`);
    }
    lines.push("");
  }
  const git = await gitSummary(cwd);
  if (git) lines.push(`**Code**: ${git}`, "");
  if (webview) {
    lines.push(
      `**Webview**: ${webview}, VS Code Extension Development Host`,
      "",
    );
  }
  lines.push(
    "Console: `[mark]` steps, `[check]` assertions, `[webview]` Pochi webview console, `[ext]` Pochi.log; the rest is the VS Code workbench.",
  );
  return lines.join("\n");
}

// Markdown would turn a leading "2. " into an ordered list rendered as "1.".
const markLabel = (label) => label.replace(/^(\s*)(\d+)[.)](\s)/, "$1[$2]$3");

// ---------------------------------------------------------------------------
// Recorder (detached background process started by `start`)
// ---------------------------------------------------------------------------

async function recorder(port, { title, video, cwd }) {
  const sock = socketPath(port);
  fs.rmSync(sock, { force: true });
  const cdp = await connectCdp(port);

  const args = ["record", "start", "--cdp", String(port), "--title", title];
  if (video === "screen") {
    const { processInfo } = await cdp.send("SystemInfo.getProcessInfo");
    const main = processInfo.find((p) => p.type === "browser");
    if (!main) throw new Error("cannot find the VS Code main process id");
    args.push("--pid", String(main.id), "--no-outline");
  } else {
    args.push("--video-source", "screencast");
  }
  const { session } = await jam(args, cwd);
  console.log(`recording Jam session ${session} (${video})`);

  const state = {
    session,
    title,
    video,
    startedAt: Date.now(),
    marks: [],
    checks: [],

    pending: [],
  };
  let finished = false;
  const cancel = () => {
    if (finished) return;
    finished = true;
    jamSync(["record", "cancel", session]);
  };

  // Replay lines into the workbench page console.
  let pageSession;
  const mirror = (level, text) => {
    if (!finished) state.pending.push([level, String(text).slice(0, 8000)]);
  };
  const replay = (entries) => {
    for (const [level, text] of entries) (console[level] ?? console.log)(text);
  };
  let flushing = Promise.resolve();
  const flush = () => {
    flushing = flushing.then(async () => {
      if (!pageSession || !state.pending.length) return;
      const batch = state.pending.splice(0);
      await cdp
        .send(
          "Runtime.evaluate",
          { expression: `(${replay})(${JSON.stringify(batch)})` },
          pageSession,
        )
        .catch(() => {});
    });
    return flushing;
  };
  setInterval(flush, 300);

  // Webview console: attach to every webview (iframe) target, old and new.
  const attached = new Set();
  const sessions = new Map();
  const contexts = new Map();
  // The Pochi document (`#app`) loads its scripts from Vite in dev mode.
  const detectWebview = async () => {
    let mode;
    for (const { sessionId, contextId } of contexts.values()) {
      const response = await cdp
        .send(
          "Runtime.evaluate",
          {
            expression: `document.getElementById("app") ? (document.querySelector('script[src^="http://localhost"]') ? "dev (Vite)" : "prod bundle") : null`,
            contextId,
            returnByValue: true,
          },
          sessionId,
        )
        .catch(() => undefined);
      mode = response?.result?.value ?? mode;
      if (mode === "dev (Vite)") break;
    }
    return mode;
  };
  cdp.on(({ method, params, sessionId }) => {
    if (
      method === "Target.targetCreated" ||
      method === "Target.targetInfoChanged"
    ) {
      const target = params.targetInfo;
      const wanted =
        target.type === "iframe" ||
        (target.type === "page" && target.url.includes("/workbench/"));
      if (wanted && !attached.has(target.targetId)) {
        attached.add(target.targetId);
        cdp
          .send("Target.attachToTarget", {
            targetId: target.targetId,
            flatten: true,
          })
          .catch(() => attached.delete(target.targetId));
      }
    } else if (method === "Target.attachedToTarget") {
      sessions.set(params.sessionId, params.targetInfo);
      if (params.targetInfo.type === "page") pageSession = params.sessionId;
      else cdp.send("Runtime.enable", {}, params.sessionId).catch(() => {});
    } else if (method === "Target.detachedFromTarget") {
      const target = sessions.get(params.sessionId);
      sessions.delete(params.sessionId);
      if (target) attached.delete(target.targetId);
      if (params.sessionId === pageSession) pageSession = undefined;
      for (const [key, context] of contexts) {
        if (context.sessionId === params.sessionId) contexts.delete(key);
      }
    } else if (method === "Target.targetDestroyed") {
      attached.delete(params.targetId);
    } else if (method === "Runtime.executionContextCreated") {
      contexts.set(`${sessionId}:${params.context.id}`, {
        sessionId,
        contextId: params.context.id,
      });
    } else if (method === "Runtime.executionContextDestroyed") {
      contexts.delete(`${sessionId}:${params.executionContextId}`);
    } else if (method === "Runtime.executionContextsCleared") {
      for (const [key, context] of contexts) {
        if (context.sessionId === sessionId) contexts.delete(key);
      }
    } else if (method === "Runtime.consoleAPICalled") {
      // Runtime.enable replays earlier messages; keep only new ones.
      if (params.timestamp < state.startedAt || params.type === "endGroup")
        return;
      const text = formatConsoleArgs(params.args);
      if (text.trim()) {
        mirror(consoleLevels[params.type] ?? "log", `[webview] ${text}`);
      }
    } else if (method === "Runtime.exceptionThrown") {
      if (params.timestamp < state.startedAt) return;
      const details = params.exceptionDetails;
      mirror(
        "error",
        `[webview] uncaught ${details.exception?.description ?? details.text}`,
      );
    }
  });
  cdp.onClose(() => {
    console.log("CDP connection closed; cancelling the recording");
    cancel();
    fs.rmSync(sock, { force: true });
    process.exit(0);
  });
  await cdp.send("Target.setDiscoverTargets", { discover: true });

  const logFile = findPochiLog(port);
  const log = {
    file: logFile,
    offset: logFile ? fs.statSync(logFile).size : 0,
    carry: "",
    level: "info",
  };
  const logTimer = setInterval(() => {
    try {
      pollPochiLog(log, port, mirror);
    } catch {}
  }, 1000);
  mirror("info", `[mark] recording started: ${title}`);

  const stop = async (request, out) => {
    const { verdict, summary, resource, resourceLabel } = request;
    clearInterval(logTimer);
    const webview = await detectWebview();
    try {
      pollPochiLog(log, port, mirror);
    } catch {}
    mirror(
      verdict === "fail" ? "error" : "info",
      `[mark] recording stopped: ${verdict}`,
    );
    await flush();
    await sleep(500);
    finished = true;

    const marks = [
      ...state.marks,
      ...state.checks.map((c) => ({
        at: c.at,
        label: c.ok
          ? `✅ ${c.name}`
          : `❌ ${c.name}\n\n\`\`\`\n${c.detail}\n\`\`\``,
      })),
    ].sort((a, b) => a.at - b.at);
    const marksFile = path.join(stateDir(port), `jam-marks-${session}.jsonl`);
    fs.writeFileSync(
      marksFile,
      marks.map((m) => `${JSON.stringify(m)}\n`).join(""),
    );
    const stopArgs = ["record", "stop", session];
    if (marks.length) stopArgs.push("--marks", marksFile);
    let result;
    try {
      result = await jam(stopArgs, cwd);
    } catch (error) {
      throw new Error(
        `${error.message}\nretry with \`jam record stop ${session} --marks ${marksFile}\``,
      );
    }
    fs.rmSync(marksFile, { force: true });
    const { id, url } = result;
    out(`✓ Jam: ${url}`);
    out(
      `  verdict: ${verdict}, ${state.checks.length} check(s), ${state.marks.length} mark(s), ${Math.round((result.durationMs ?? 0) / 1000)}s`,
    );
    const description = await jamDescription({
      checks: state.checks,
      verdict,
      summary,
      webview,
      cwd,
    });
    try {
      await jam(["update", "jam", id, "--description", description], cwd);
    } catch (error) {
      out(`⚠ description not set: ${error.message}`);
    }
    if (resource) {
      const args = ["update", "jam", id, "--resource", resource];
      if (resourceLabel) args.push("--label", resourceLabel);
      try {
        await jam(args, cwd);
      } catch (error) {
        out(`⚠ resource not attached: ${error.message}`);
      }
    }
  };

  const handle = async (request, out) => {
    switch (request.command) {
      case "status": {
        const seconds = Math.round((Date.now() - state.startedAt) / 1000);
        out(
          `recording ${session} "${title}" (${video}) for ${seconds}s: ${state.marks.length} mark(s), ${state.checks.length} check(s)`,
        );
        return;
      }
      case "mark":
        state.marks.push({ at: Date.now(), label: request.label });
        mirror("info", `[mark] ${request.label}`);
        out(`✓ mark: ${request.label}`);
        return;
      case "check": {
        const { check } = request;
        state.checks.push(check);
        mirror(
          check.ok ? "info" : "error",
          `[check ${check.ok ? "✓" : "✗"}] ${check.name}: ${check.detail}`,
        );
        return;
      }
      case "cancel":
        cancel();
        out(`✓ discarded Jam session ${session}`);
        return "exit";
      case "stop": {
        const failed = state.checks.some((c) => !c.ok);
        const verdict =
          request.verdict ??
          (failed ? "fail" : state.checks.length ? "pass" : "none");
        await stop({ ...request, verdict }, out);
        return "exit";
      }
      default:
        throw new Error(`unknown recorder command: ${request.command}`);
    }
  };

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
        let next;
        try {
          next = await handle(JSON.parse(body || "{}"), (line) =>
            output.push(String(line)),
          );
        } catch (error) {
          ok = false;
          output.push(error.message);
        }
        res.end(JSON.stringify({ ok, output: output.join("\n") }), () => {
          if (next === "exit") {
            fs.rmSync(sock, { force: true });
            process.exit(0);
          }
        });
      });
    });
  });
  server.listen(sock, () => console.log(`listening on ${sock}`));
  const shutdown = () => {
    cancel();
    fs.rmSync(sock, { force: true });
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
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

const notRecording = "not recording; run `record.mjs start` first";

async function sendToRecorder(port, payload) {
  let response;
  try {
    response = await send(port, payload);
  } catch {
    throw new Error(notRecording);
  }
  if (!response.ok) throw new Error(response.output);
  return response.output;
}

async function start(port, args) {
  const { flags, positional } = splitFlags(args);
  const video = flags.video ?? "screencast";
  if (!["screencast", "screen"].includes(video)) {
    throw new Error(`--video must be screencast or screen, not ${video}`);
  }
  const recording = await send(port, { command: "status" }).catch(
    () => undefined,
  );
  if (recording?.ok) {
    throw new Error(
      `already ${recording.output}; run \`stop\` or \`cancel\` first`,
    );
  }
  fs.mkdirSync(stateDir(port), { recursive: true });
  const logFd = fs.openSync(logPath(port), "w");
  const options = {
    title: positional[0] ?? "Pochi VS Code run",
    video,
    cwd: process.cwd(),
  };
  // `screencast`: CDP capture of the workbench page (webviews included), no
  // Screen Recording permission, works while the window is covered.
  // `screen`: OS capture of the window, also shows native menus and dialogs.
  const child = spawn(
    process.execPath,
    [scriptPath, "--port", String(port), "_recorder", JSON.stringify(options)],
    { detached: true, stdio: ["ignore", logFd, logFd] },
  );
  child.unref();
  let exited = false;
  child.on("exit", () => {
    exited = true;
  });
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    await sleep(500);
    const status = await send(port, { command: "status" }).catch(
      () => undefined,
    );
    if (status?.ok) return `✓ ${status.output}`;
    if (exited) break;
  }
  const output = fs.readFileSync(logPath(port), "utf8").trim();
  throw new Error(`recorder did not start:\n${output || "(no output)"}`);
}

async function check(port, args) {
  const separator = args.indexOf("--");
  const own = separator < 0 ? args : args.slice(0, separator);
  const command = separator < 0 ? [] : args.slice(separator + 1);
  const { flags, positional } = splitFlags(own, ["pass", "fail"]);
  const name = positional[0];
  if (!name) throw new Error("missing <name>");
  let ok;
  let detail; // the command and its output
  let reason; // one line for the description
  if (flags.pass || flags.fail) {
    if (command.length)
      throw new Error("use either --pass/--fail or -- <command>");
    ok = !!flags.pass;
    detail = flags.note ?? (ok ? "passed" : "failed");
    reason = detail.split("\n")[0];
  } else {
    if (!command.length) {
      throw new Error("missing `-- <webview.mjs args>` (or --pass/--fail)");
    }
    const result = spawnSync(
      process.execPath,
      [webviewScript, "--port", String(port), ...command],
      { encoding: "utf8" },
    );
    const stdout = (result.stdout ?? "").trim();
    const output = `${stdout}\n${result.stderr ?? ""}`.trim();
    const shown = `w ${command.map(quote).join(" ")}`;
    ok =
      result.status === 0 &&
      (flags.expect === undefined || stdout === flags.expect);
    if (ok) detail = shown;
    else if (result.status === 0) {
      reason = `expected ${JSON.stringify(flags.expect)}, got ${JSON.stringify(stdout)}`;
      detail = `${shown}\n${reason}`;
    } else {
      const lines = output.split("\n").slice(0, 6);
      reason = (lines[0] ?? `exit ${result.status}`).replace(/^✗\s*/, "");
      detail = `${shown}\n${lines.join("\n")}`;
    }
  }
  const at = Date.now();
  await send(port, {
    command: "check",
    check: { at, name, ok, detail, reason },
  }).catch(() => {});
  if (ok) {
    console.log(`✓ check passed: ${name}`);
    return 0;
  }
  console.error(`✗ check failed: ${name}\n${detail}`);
  return 1;
}

async function main() {
  const { port, help, command, args } = parseArgs(process.argv.slice(2));
  if (help || !command) {
    console.log(usage);
    return command ? 0 : 1;
  }
  switch (command) {
    case "_recorder":
      await recorder(port, JSON.parse(args[0]));
      return undefined; // keep running
    case "start":
      console.log(await start(port, args));
      return 0;
    case "check":
      return await check(port, args);
    case "mark": {
      const label = markLabel(args.join(" ").trim());
      if (!label) throw new Error("missing <label>");
      console.log(await sendToRecorder(port, { command: "mark", label }));
      return 0;
    }
    case "status": {
      const status = await send(port, { command: "status" }).catch(
        () => undefined,
      );
      console.log(status?.ok ? status.output : "not recording");
      return 0;
    }
    case "cancel":
      console.log(await sendToRecorder(port, { command: "cancel" }));
      return 0;
    case "stop": {
      const { flags } = splitFlags(args);
      if (flags.verdict && !["pass", "fail"].includes(flags.verdict)) {
        throw new Error(`--verdict must be pass or fail, not ${flags.verdict}`);
      }
      const summary = flags["summary-file"]
        ? fs.readFileSync(flags["summary-file"], "utf8")
        : flags.summary;
      console.log(
        await sendToRecorder(port, {
          command: "stop",
          verdict: flags.verdict,
          summary,
          resource: flags.resource,
          resourceLabel: flags["resource-label"],
        }),
      );
      return 0;
    }
    default:
      throw new Error(`unknown command: ${command}\n\n${usage}`);
  }
}

main().then(
  (code) => {
    if (code !== undefined) process.exit(code);
  },
  (error) => {
    console.error(`✗ ${error.message}`);
    process.exit(1);
  },
);
