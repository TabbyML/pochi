import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";

export interface ModelRequest {
  tools?: unknown[];
  stream?: boolean;
  messages: {
    role: string;
    content: unknown;
    tool_call_id?: string;
    tool_calls?: {
      id: string;
      function: { name: string; arguments: string };
    }[];
  }[];
}

export interface ToolResponse {
  name: string;
  input: Record<string, unknown>;
}

/** Exercise the compiled CLI, real HTTP streaming, store, tools and processes. */
export async function runScriptedCli(
  respond: (
    request: ModelRequest,
    index: number,
    cwd: string,
  ) => ToolResponse[] | Promise<ToolResponse[]>,
  options: {
    waitTimeout?: number;
    signalAfterRequest?: number;
    terminal?: boolean;
  } = {},
) {
  const cwd = await mkdtemp(join(tmpdir(), "pochi-cli-background-e2e-"));
  const requests: ModelRequest[] = [];
  const errors: unknown[] = [];
  const taskId = randomUUID();
  const taskIds = new Set<string>([taskId]);
  const trajectoryPath = join(cwd, "trajectory.jsonl");
  let child: ReturnType<typeof spawn> | undefined;
  const server = createServer(async (request, response) => {
    try {
      let body = "";
      for await (const chunk of request) body += chunk;
      const modelRequest = JSON.parse(body) as ModelRequest;
      for (const message of modelRequest.messages) {
        if (message.role !== "tool") continue;
        for (const match of JSON.stringify(message.content).matchAll(
          /bgjob-task-([a-zA-Z0-9-]+)/g,
        )) {
          taskIds.add(match[1]);
        }
      }
      if (!modelRequest.tools?.length) {
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(
          JSON.stringify({
            id: randomUUID(),
            object: "chat.completion",
            created: 0,
            model: "regression",
            choices: [
              {
                index: 0,
                message: {
                  role: "assistant",
                  content: "Background regression",
                },
                finish_reason: "stop",
              },
            ],
          }),
        );
        return;
      }
      requests.push(modelRequest);
      const calls = await respond(modelRequest, requests.length - 1, cwd);
      response.writeHead(200, { "Content-Type": "text/event-stream" });
      const chunk = (delta: unknown, finishReason: string | null = null) => {
        response.write(
          `data: ${JSON.stringify({
            id: randomUUID(),
            object: "chat.completion.chunk",
            created: Math.floor(Date.now() / 1000),
            model: "regression",
            choices: [{ index: 0, delta, finish_reason: finishReason }],
          })}\n\n`,
        );
      };
      chunk({
        role: "assistant",
        tool_calls: calls.map((call, index) => ({
          index,
          id: `call_${randomUUID()}`,
          type: "function",
          function: { name: call.name, arguments: JSON.stringify(call.input) },
        })),
      });
      chunk({}, "tool_calls");
      response.end("data: [DONE]\n\n");
      if (requests.length === options.signalAfterRequest) child?.kill("SIGINT");
    } catch (error) {
      errors.push(error);
      response.writeHead(500);
      response.end("Scripted model failed");
      child?.kill("SIGTERM");
    }
  });
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("No server address");
    await mkdir(join(cwd, ".pochi"));
    const config = JSON.stringify({
      providers: {
        regression: {
          kind: "openai",
          baseURL: `http://127.0.0.1:${address.port}/v1`,
          apiKey: "regression-only",
          models: { regression: { contextWindow: 32000 } },
        },
      },
    });
    await Promise.all(
      ["config.jsonc", "dev-config.jsonc"].map((file) =>
        writeFile(join(cwd, ".pochi", file), config),
      ),
    );
    const {
      POCHI_LIVEKIT_SYNC_ON: _sync,
      POCHI_API_KEY: _key,
      NO_COLOR: _noColor,
      ...env
    } = process.env;
    const cli = resolve(import.meta.dirname, "../../dist/pochi");
    const args = [
      "--no-mcp",
      "-m",
      "regression/regression",
      "-p",
      "Run the background regression scenario.",
      "--max-steps",
      "12",
      "--max-retries",
      "1",
      "--async-wait-timeout",
      String(options.waitTimeout ?? 5000),
      "--experimental-stream-trajectory",
      trajectoryPath,
      "--blobs-dir",
      join(cwd, "blobs"),
    ];
    child = spawn(
      options.terminal ? "/usr/bin/script" : cli,
      options.terminal
        ? [
            "-q",
            "/dev/null",
            "/bin/sh",
            "-c",
            'stty cols 100 rows 30; exec "$@"',
            "pochi-terminal-test",
            cli,
            ...args,
          ]
        : args,
      {
        cwd,
        env: {
          ...env,
          POCHI_TASK_ID: taskId,
          ...(options.terminal
            ? { TERM: "xterm-256color", FORCE_COLOR: "1" }
            : {}),
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (data) => {
      stdout += data;
    });
    child.stderr?.on("data", (data) => {
      stderr += data;
    });
    const processResult = await new Promise<{
      exitCode: number | null;
      signal: string | null;
    }>((resolve, reject) => {
      const timer = setTimeout(() => {
        child?.kill("SIGKILL");
        reject(new Error(`CLI timed out.\n${stdout}\n${stderr}`));
      }, 20000);
      child?.once("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child?.once("close", (exitCode, signal) => {
        clearTimeout(timer);
        resolve({ exitCode, signal });
      });
    });
    if (errors.length) throw errors[0];
    const trajectory = await readFile(trajectoryPath, "utf8").catch(() => "");
    return { ...processResult, stdout, stderr, requests, trajectory };
  } finally {
    child?.kill("SIGKILL");
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(cwd, { recursive: true, force: true });
    await Promise.all(
      [...taskIds].map((id) =>
        rm(join(homedir(), ".pochi", "tasks", id), {
          recursive: true,
          force: true,
        }),
      ),
    );
  }
}

export const complete = (result: string): ToolResponse[] => [
  { name: "attemptCompletion", input: { result } },
];

export function toolOutputs(request: ModelRequest) {
  return request.messages
    .filter((message) => message.role === "tool")
    .map((message) => {
      const content =
        typeof message.content === "string"
          ? message.content
          : JSON.stringify(message.content);
      return JSON.parse(content);
    });
}
