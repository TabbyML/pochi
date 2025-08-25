import { describe, it, expect, assert } from "vitest";
import { parseTitle, prepareLastMessageForRetry } from "..";
import type { UIMessage } from "ai";
import { isAssistantMessageWithOutputError } from "../assistant-message";

describe("message-utils", () => {
  describe("toUIMessageTitle", () => {
    it("should return the correct ui title with workflow", () => {
      const rawTitle: string = '<workflow id="test" path="test">test\nworkflow</workflow> rest';
      const expectedTitle: string = "/test rest";
      const result = parseTitle(rawTitle);
      expect(result).toEqual(expectedTitle);
    });

    it("should return the correct ui title with file", () => {
      const rawTitle: string = "<file>/path/to/file</file> rest";
      const expectedTitle: string = "/path/to/file rest";
      const result = parseTitle(rawTitle);
      expect(result).toEqual(expectedTitle);
    });
  });

  describe("prepareLastMessageForRetry", () => {
    it("should keep last step", () => {
      const lastMessage: UIMessage = {
        "id": "a8ed4356-72ab-487a-9bb4-b98d61948eba",
        "metadata": {
          "kind": "assistant",
          "totalTokens": 22485,
          "finishReason": "stop"
        },
        "role": "assistant",
        "parts": [
          {
            "type": "step-start"
          },
          {
            "type": "text",
            "text": "Let me check the diff for a better understanding of the changes:\n\n",
            "state": "done"
          },
          {
            "type": "tool-executeCommand",
            "toolCallId": "call_defb0cfc20e415b9",
            "state": "output-available",
            "input": {
              "command": "git diff main..fix/diff-view-path-resolution | head -50"
            },
            "output": {
              "output": "diff --git a/packages/common/src/constants.ts b/packages/common/src/constants.ts\r\nindex f6a814b3..1a22fdd5 100644\r\n--- a/packages/common/src/constants.ts\r\n+++ b/packages/common/src/constants.ts\r\n@@ -1,7 +1,7 @@\r\n /**\r\n  * Known XML tags that should be preserved during processing\r\n  */\r\n-export const KnownTags = [\"file\", \"workflow\"] as const;\r\n+export const KnownTags = [\"file\", \"workflow\", \"compact\"] as const;\r\n \r\n const SandboxHome = \"/home/pochi\";\r\n const SandboxLogDir = `${SandboxHome}/.log`;\r\ndiff --git a/packages/common/src/message-utils.ts b/packages/common/src/message-utils.ts\r\nindex 0b37d038..55880a0a 100644\r\n--- a/packages/common/src/message-utils.ts\r\n+++ b/packages/common/src/message-utils.ts\r\n@@ -22,7 +22,7 @@ function escapeUnknownXMLTags(message: string): string {\r\n }\r\n \r\n export function parseTitle(title: string | null) {\r\n-  if (!title) return \"(empty)\";\r\n+  if (!title?.trim()) return \"(empty)\";\r\n \r\n   const formatXMLTags = (ast: Root) => {\r\n     function processNode(node: Parent) {\r\n@@ -50,7 +50,7 @@ export function parseTitle(title: string | null) {\r\n \r\n   const hast = rehype().parse(escapeUnknownXMLTags(title));\r\n   formatXMLTags(hast);\r\n-  return toText(hast).slice(0, 256);\r\n+  return toText(hast).slice(0, 256) || \"(empty)\";\r\n }\r\n \r\n export function hasAttemptCompletion(message: UIMessage): boolean {\r\ndiff --git a/packages/livekit/src/chat/compact-task.ts b/packages/livekit/src/chat/compact-task.ts\r\nindex f34bc418..6894fa78 100644\r\n--- a/packages/livekit/src/chat/compact-task.ts\r\n+++ b/packages/livekit/src/chat/compact-task.ts\r\n@@ -5,23 +5,37 @@ import { requestLLM } from \"./llm\";\r\n export async function compactTask({\r\n   getLLM,\r\n   messages,\r\n-}: { getLLM: () => Promise<RequestData[\"llm\"]>; messages: Message[] }) {\r\n+  overwrite,\r\n+}: {\r\n+  getLLM: () => Promise<RequestData[\"llm\"]>;\r\n+  messages: Message[];\r\n+  overwrite: boolean;\r\n+}): Promise<string | undefined> {\r\n",
              "isTruncated": false
            }
          },
          {
            "type": "step-start"
          },
          {
            "type": "text",
            "text": "Let me check if we need to push the current branch first:\n\n",
            "state": "streaming"
          },
          {
            "type": "tool-executeCommand",
            "toolCallId": "call_40b5642fd5df5c63",
            "state": "input-streaming",
            "input": null
          }
        ]
      }

      const before = lastMessage?.parts.filter((part) => part.type === "step-start").length || 0;
      expect(before).toBe(2);
      const message = prepareLastMessageForRetry(lastMessage)
      const after = message?.parts.filter((part) => part.type === "step-start").length || 0;
      expect(after).toBe(1);
    })
    it("should handle output-error", () => {
      const lastMessage: UIMessage = {
        "id": "4c414241-0fa0-43e1-a56e-e8f4539986cd",
        "role": "assistant",
        "parts": [
          {
            "type": "step-start"
          },
          {
            "type": "text",
            "text": "I'll extract the API client creation logic to a separate function called `createApiClient`. Let me first examine the current code to understand the full context.\n\n",
            "state": "done"
          },
          {
            "type": "tool-readFile",
            "toolCallId": "call_0a55ab4d8bc16bd9",
            "state": "output-available",
            "input": {
              "path": "packages/cli/src/cli.ts"
            },
            "output": {
              "content": "#!/usr/bin/env bun\n// Workaround for https://github.com/oven-sh/bun/issues/18145\nimport \"@livestore/wa-sqlite/dist/wa-sqlite.node.wasm\" with { type: \"file\" };\n\nimport { Console } from \"node:console\";\nimport { Command } from \"@commander-js/extra-typings\";\nimport { getLogger } from \"@getpochi/common\";\nimport type { PochiApi, PochiApiClient } from \"@getpochi/common/pochi-api\";\nimport { CredentialStorage } from \"@getpochi/common/tool-utils\";\nimport type { LLMRequestData } from \"@getpochi/livekit\";\nimport chalk from \"chalk\";\nimport * as commander from \"commander\";\nimport { hc } from \"hono/client\";\nimport packageJson from \"../package.json\";\nimport { findRipgrep } from \"./lib/find-ripgrep\";\nimport { createStore } from \"./livekit/store\";\nimport { TaskRunner } from \"./task-runner\";\nimport { TaskRunnerOutputStream } from \"./task-runner-output\";\nimport { TaskRunnerSupervisor } from \"./task-runner-supervisor\";\n\n// Redirect all logging output to stderr, make sure stdout is clean for display messages\nglobal.console = new Console({\n  stdout: process.stderr,\n  stderr: process.stderr,\n});\n\nconst logger = getLogger(\"Pochi\");\nlogger.debug(`pochi v${packageJson.version}`);\n\nconst prodServerUrl = \"https://app.getpochi.com\";\n\nconst userAgent = `PochiRunner/${packageJson.version} ${`Node/${process.version}`} (${process.platform}; ${process.arch})`;\n\nconst parsePositiveInt = (input: string) => {\n  if (!input) {\n    return undefined;\n  }\n  const result = Number.parseInt(input);\n  if (Number.isNaN(result) || result <= 0) {\n    program.error(\"error: Option must be a positive integer\");\n  }\n  return result;\n};\n\nconst program = new Command()\n  .name(\"pochi\")\n  .description(`${chalk.bold(\"Pochi Code\")} v${packageJson.version}`)\n  .optionsGroup(\"Specify Task:\")\n  .option(\n    \"--task <uid>\",\n    \"The uid of the task to execute. Can also be provided via the POCHI_TASK_ID environment variable.\",\n  )\n  .option(\n    \"-p, --prompt <prompt>\",\n    \"Create a new task with the given prompt. You can also pipe input to use as a prompt, for example: `cat .pochi/workflows/create-pr.md | pochi-runner`\",\n  )\n  .optionsGroup(\"Options:\")\n  .requiredOption(\n    \"--cwd <cwd>\",\n    \"The current working directory.\",\n    process.cwd(),\n  )\n  .requiredOption(\n    \"--rg <path>\",\n    \"The path to the ripgrep binary.\",\n    findRipgrep() || undefined,\n  )\n  .requiredOption(\"--url <url>\", \"The Pochi server URL.\", prodServerUrl)\n  .option(\n    \"--token <token>\",\n    \"The Pochi session token. Can also be provided via the POCHI_SESSION_TOKEN environment variable or from the shared credentials file (`~/.pochi/credentials.json`).\",\n  )\n  .option(\n    \"--model <model>\",\n    \"The model to use for the task. Options: `google/gemini-2.5-pro`, `google/gemini-2.5-flash`, `anthropic/claude-4-sonnet`\",\n  )\n  .option(\"--model-endpoint-id <modelEndpointId>\")\n  .option(\n    \"--max-rounds <number>\",\n    \"Force the runner to stop if the number of rounds exceeds this value.\",\n    parsePositiveInt,\n  )\n  .option(\n    \"--max-retries <number>\",\n    \"Force the runner to stop if the number of retries in a single round exceeds this value.\",\n    parsePositiveInt,\n  )\n  .optionsGroup(\"Model:\")\n  .option(\"--base-url <baseURL>\", \"The base URL to use for BYOK requests.\")\n  .option(\"--api-key <apikey>\", \"The API key to use for BYOK requests.\")\n  .option(\n    \"--max-output-tokens <number>\",\n    \"The max output tokens to use for BYOK model.\",\n    parsePositiveInt,\n  )\n  .option(\n    \"--context-window <number>\",\n    \"The context window limit for BYOK model.\",\n    parsePositiveInt,\n  )\n  .action(async (options) => {\n    const { uid, prompt } = await parseTaskInput(options, program);\n\n    let token = options.token ?? process.env.POCHI_SESSION_TOKEN;\n    if (!token) {\n      const credentialStorage = new CredentialStorage({\n        isDev: options.url !== prodServerUrl,\n      });\n      token = await credentialStorage.read();\n    }\n\n    if (!token) {\n      return program.error(\n        \"error: No token provided. Please use the --token option, set POCHI_SESSION_TOKEN, or confirm `~/.pochi/credentials.json` exists (login with the Pochi VSCode extension to obtain it).\",\n      );\n    }\n\n    const apiClient = hc<PochiApi>(options.url, {\n      fetch(input: string | URL | Request, init?: RequestInit) {\n        const headers = new Headers(init?.headers);\n        headers.append(\"Authorization\", `Bearer ${token}`);\n        headers.set(\"User-Agent\", userAgent);\n        return fetch(input, {\n          ...init,\n          headers,\n        });\n      },\n    });\n\n    const output = new TaskRunnerOutputStream(process.stdout);\n    let supervisor: TaskRunnerSupervisor | undefined = undefined;\n\n    process.on(\"SIGTERM\", () => handleShutdown(\"SIGTERM\"));\n    process.on(\"SIGINT\", () => handleShutdown(\"SIGINT\"));\n\n    const handleShutdown = (signal: \"SIGTERM\" | \"SIGINT\") => {\n      logger.debug(`Received ${signal}, shutting down gracefully...`);\n      if (supervisor) {\n        supervisor.stop(signal);\n        // process.exit will be handled by the supervisor\n      } else {\n        output.finish();\n        process.exit(signal === \"SIGINT\" ? 130 : 143);\n      }\n    };\n\n    const store = await createStore(options.cwd);\n\n    const llm = createLLMConfig({ options, apiClient, program });\n\n    const runner = new TaskRunner({\n      uid: uid || crypto.randomUUID(),\n      apiClient,\n      store,\n      llm,\n      prompt,\n      cwd: options.cwd,\n      rg: options.rg,\n      maxRounds: options.maxRounds,\n      maxRetries: options.maxRetries,\n    });\n\n    supervisor = new TaskRunnerSupervisor(runner, output);\n    supervisor.start();\n  });\n\nconst otherOptionsGroup = \"Others:\";\nprogram\n  .optionsGroup(otherOptionsGroup)\n  .version(packageJson.version, \"-V, --version\", \"Print the version string.\")\n  .addHelpOption(\n    new commander.Option(\"-h, --help\", \"Print this help message.\").helpGroup(\n      otherOptionsGroup,\n    ),\n  )\n  .configureHelp({\n    styleTitle: (title) => chalk.bold(title),\n  })\n  .showHelpAfterError()\n  .showSuggestionAfterError()\n  .configureOutput({\n    outputError: (str, write) => write(chalk.red(str)),\n  });\n\nprogram.parse(process.argv);\n\ntype Program = typeof program;\ntype ProgramOpts = ReturnType<(typeof program)[\"opts\"]>;\n\nasync function parseTaskInput(options: ProgramOpts, program: Program) {\n  const uid = options.task ?? process.env.POCHI_TASK_ID;\n\n  let prompt = options.prompt?.trim();\n  if (!prompt && !process.stdin.isTTY) {\n    const chunks = [];\n    for await (const chunk of process.stdin) {\n      chunks.push(chunk);\n    }\n    const stdinPrompt = Buffer.concat(chunks).toString(\"utf8\").trim();\n    if (stdinPrompt) {\n      prompt = stdinPrompt.trim();\n    }\n  }\n\n  if (!uid && !prompt) {\n    return program.error(\n      \"error: Either a task uid or a prompt must be provided\",\n    );\n  }\n\n  return { uid, prompt };\n}\n\nfunction createLLMConfig({\n  apiClient,\n  program,\n  options,\n}: {\n  apiClient: PochiApiClient;\n  program: Program;\n  options: ProgramOpts;\n}): LLMRequestData {\n  let openai:\n    | {\n        apiKey?: string;\n        baseURL: string;\n        maxOutputTokens: number;\n        contextWindow: number;\n      }\n    | undefined;\n\n  if (options.baseUrl) {\n    if (options.maxOutputTokens && options.model && options.contextWindow) {\n      openai = {\n        apiKey: options.apiKey,\n        baseURL: options.baseUrl,\n        maxOutputTokens: options.maxOutputTokens,\n        contextWindow: options.contextWindow,\n      };\n    } else {\n      return program.error(\n        \"error: --base-url requires --max-output-tokens, --model and --context-window to be set.\",\n      );\n    }\n  }\n\n  return (\n    openai\n      ? {\n          type: \"openai\",\n          modelId: options.model || \"<default>\",\n          baseURL: openai.baseURL,\n          apiKey: openai.apiKey,\n          contextWindow: openai.contextWindow,\n          maxOutputTokens: openai.maxOutputTokens,\n        }\n      : {\n          type: \"pochi\",\n          modelId: options.model,\n          apiClient,\n        }\n  ) satisfies LLMRequestData;\n}\n",
              "isTruncated": false
            }
          },
          {
            "type": "step-start"
          },
          {
            "type": "text",
            "text": "Now I'll extract the API client creation logic to a separate function. Let me make the necessary changes:\n\n",
            "state": "done"
          },
          {
            "type": "tool-multiApplyDiff",
            "toolCallId": "call_f7351b9b454add77",
            "state": "output-error",
            "input": "unknown",
            "rawInput": "debug",
            "errorText": "failed"
          }
        ]
      }
      assert(isAssistantMessageWithOutputError(lastMessage))
      const before = lastMessage?.parts.filter((part) => part.type === "step-start").length || 0;
      expect(before).toBe(2);
      const message = prepareLastMessageForRetry(lastMessage)
      const after = message?.parts.filter((part) => part.type === "step-start").length || 0;
      expect(after).toBe(1);
    })
  })
})
