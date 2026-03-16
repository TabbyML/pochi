#!/usr/bin/env bun
// Workaround for https://github.com/oven-sh/bun/issues/18145
import "@livestore/wa-sqlite/dist/wa-sqlite.node.wasm" with { type: "file" };

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Command, Option } from "@commander-js/extra-typings";
import chalk from "chalk";
import * as commander from "commander";
import z from "zod/v4";

// Register the vendor
import "@getpochi/vendor-tabby";
import "@getpochi/vendor-pochi";
import "@getpochi/vendor-gemini-cli";
import "@getpochi/vendor-codex";
import "@getpochi/vendor-github-copilot";
import "@getpochi/vendor-qwen-code";

// Register the models
import "@getpochi/vendor-tabby/edge";
import "@getpochi/vendor-pochi/edge";
import "@getpochi/vendor-gemini-cli/edge";
import "@getpochi/vendor-codex/edge";
import "@getpochi/vendor-github-copilot/edge";
import "@getpochi/vendor-qwen-code/edge";

import { constants, getLogger } from "@getpochi/common";
import { BrowserSessionStore } from "@getpochi/common/browser";
import {
  pochiConfig,
  setPochiConfigWorkspacePath,
} from "@getpochi/common/configuration";
import { getVendor, getVendors } from "@getpochi/common/vendor";
import { createModel } from "@getpochi/common/vendor/edge";
import type {
  CustomAgentFile,
  SkillFile,
  ValidCustomAgentFile,
} from "@getpochi/common/vscode-webui-bridge";
import type { LLMRequestData, Message } from "@getpochi/livekit";

import packageJson from "../package.json";
import { processAttachments } from "./attachment-utils";
import { registerAuthCommand } from "./auth";
import { handleShellCompletion } from "./completion";
import { JsonRenderer } from "./json-renderer";
import { setFfmpegPath } from "./lib/ffmpeg-mjpeg-to-mp4";
import {
  CompoundFileSystem,
  LocalFileSystem,
  TaskFileSystem,
} from "./lib/file-system";
import { findRipgrep } from "./lib/find-ripgrep";
import { loadAgents } from "./lib/load-agents";
import { loadSkills } from "./lib/load-skills";
import {
  containsSlashCommandReference,
  getModelFromSlashCommand,
  replaceSlashCommandReferences,
} from "./lib/match-slash-command";
import {
  ProcessAbortError,
  createAbortControllerWithGracefulShutdown,
} from "./lib/shutdown";
import { createStore } from "./livekit/store";
import { initializeMcp, registerMcpCommand } from "./mcp";
import { registerModelCommand } from "./model";
import { NodeBlobStore } from "./node-blob-store";
import { OutputRenderer } from "./output-renderer";
import { TaskRunner } from "./task-runner";
import { checkForUpdates, registerUpgradeCommand } from "./upgrade";

// Turn off AI SDK logs
globalThis.AI_SDK_LOG_WARNINGS = false;

const logger = getLogger("Pochi");
globalThis.POCHI_CLIENT = `PochiCli/${packageJson.version}`;
logger.debug(`pochi v${packageJson.version}`);

const parsePositiveInt = (input: string): number => {
  if (!input) {
    return program.error(
      "The value for this option must be a positive integer.",
    );
  }
  const result = Number.parseInt(input);
  if (Number.isNaN(result) || result <= 0) {
    return program.error(
      "The value for this option must be a positive integer.",
    );
  }
  return result;
};

const parseNonNegativeInt = (input: string): number => {
  if (!input) {
    return program.error(
      "The value for this option must be a non-negative integer.",
    );
  }
  const result = Number.parseInt(input);
  if (Number.isNaN(result) || result < 0) {
    return program.error(
      "The value for this option must be a non-negative integer.",
    );
  }
  return result;
};

const program = new Command()
  .name("pochi")
  .description(
    `${chalk.bold("Pochi")} v${packageJson.version} - A powerful CLI tool for AI-driven development.`,
  )
  .optionsGroup("Prompt:")
  .option(
    "-p, --prompt <prompt>",
    "Create a new task with a given prompt. Input can also be piped. For example: `cat my-prompt.md | pochi`.",
  )
  .option(
    "-a, --attach <path...>",
    "Attach one or more files to the prompt, e.g images",
  )
  .optionsGroup("Options:")
  .option(
    "--stream-json [filepath]",
    "Stream the output in JSON format. This is useful for parsing the output in scripts. If filepath is not specified, the output will be written to stdout, mixed with normal UI output. Cannot be used with --output-result.",
  )
  .option(
    "-x, --output-result [filepath]",
    "Output the result from attemptCompletion. This is useful for scripts that need to capture the final result. If filepath is not specified, the output will be written to stdout, mixed with normal UI output. Cannot be used with --stream-json.",
  )
  .option(
    "--max-steps <number>",
    "Set the maximum number of steps for a task. The task will stop if it exceeds this limit.",
    parsePositiveInt,
    24,
  )
  .option(
    "--max-retries <number>",
    "Set the maximum number of retries for a single step in a task.",
    parsePositiveInt,
    3,
  )
  .option(
    "--async-wait-timeout <ms>",
    "Wait for async subtasks and background jobs to complete before finalizing attemptCompletion. Set to 0 to disable waiting.",
    parseNonNegativeInt,
    60000,
  )
  .addOption(
    new Option(
      "--experimental-output-schema <schema>",
      "Specify a JSON schema for the output of the task. The task will be validated against this schema.",
    ).hideHelp(),
  )
  .addOption(
    new Option(
      "--attempt-completion-schema <schema>",
      "Specify a JSON schema that attempt-completion will enforce.",
    ).hideHelp(),
  )
  .addOption(
    new Option(
      "--attempt-completion-hook <command>",
      "Specify a command that attempt-completion will run",
    ).hideHelp(),
  )
  .addOption(
    new Option(
      "--ffmpeg <path>",
      "Specify the path to the ffmpeg executable for browser session recording. Pochi will try to use the ffmpeg executable in the system path if this option is not specified. Browser session recording is disabled when no ffmpeg executable available.",
    ).hideHelp(),
  )
  .addOption(
    new Option(
      "--blobs-dir <path>",
      "Specify the path to be used as a storage directory for blobs.",
    )
      .default(path.join(os.tmpdir(), "pochi", "blobs"))
      .hideHelp(),
  )
  .optionsGroup("Model:")
  .option(
    "-m, --model <model>",
    "Specify the model to be used for the task.",
    "google/gemini-3-flash",
  )
  .optionsGroup("MCP:")
  .option(
    "--no-mcp",
    "Disable MCP (Model Context Protocol) integration completely.",
  )
  .action(async (options) => {
    // Load custom agents and skills
    const customAgents = await loadAgents(process.cwd());
    const skills = await loadSkills(process.cwd());

    const { uid, prompt, attachments } = await parseTaskInput(
      options,
      program,
      {
        customAgents: customAgents,
        skills,
      },
    );

    const store = await createStore(uid);
    const blobStore = new NodeBlobStore(options.blobsDir);
    const parts: Message["parts"] = await processAttachments(
      attachments,
      blobStore,
      program,
    );

    if (prompt) {
      parts.push({ type: "text", text: prompt });
    }

    const rg = findRipgrep();
    if (!rg) {
      return program.error(
        "ripgrep is not installed or not found in your $PATH.\n" +
          "Some file search features require ripgrep to function properly.\n\n" +
          "To install ripgrep:\n" +
          "• macOS: brew install ripgrep\n" +
          "• Ubuntu/Debian: apt-get install ripgrep\n" +
          "• Windows: winget install BurntSushi.ripgrep.MSVC\n" +
          "• Or visit: https://github.com/BurntSushi/ripgrep#installation\n\n" +
          "Please install ripgrep and try again.",
      );
    }

    if (options.ffmpeg) {
      setFfmpegPath(options.ffmpeg);
    }

    let jsonOutputStream: fs.WriteStream | typeof process.stdout | undefined =
      undefined;
    if (options.streamJson && options.outputResult) {
      program.error(
        "Cannot use --stream-json and --output-result at same time.",
      );
    }
    if (options.streamJson === true) {
      jsonOutputStream = process.stdout;
    } else if (typeof options.streamJson === "string") {
      jsonOutputStream = fs.createWriteStream(options.streamJson);
    } else if (options.outputResult === true) {
      jsonOutputStream = process.stdout;
    } else if (typeof options.outputResult === "string") {
      jsonOutputStream = fs.createWriteStream(options.outputResult);
    }

    // Create MCP Hub for accessing MCP server tools (only if MCP is enabled)
    const mcpHub = options.mcp ? await initializeMcp(program) : undefined;

    // FIXME(zhiming): the abort logic does not work as intent in many cases, need more investigation
    // Create AbortController for task cancellation with graceful shutdown
    const abortController = createAbortControllerWithGracefulShutdown();

    const llm = await createLLMConfig(program, options, {
      customAgents,
    });

    const localFs = new LocalFileSystem(process.cwd());
    const taskFs = new TaskFileSystem(store);
    const filesystem = new CompoundFileSystem(localFs, taskFs);
    const browserSessionStore = new BrowserSessionStore();

    const runner = new TaskRunner({
      uid,
      store,
      blobStore,
      llm,
      parts,
      cwd: process.cwd(),
      rg,
      maxSteps: options.maxSteps,
      maxRetries: options.maxRetries,
      onSubTaskCreated: (runner: TaskRunner) => {
        outputRenderer.renderSubTask(runner);
      },
      customAgents,
      skills,
      mcpHub,
      abortSignal: abortController.signal,
      outputSchema: options.experimentalOutputSchema
        ? parseOutputSchema(options.experimentalOutputSchema)
        : undefined,
      attemptCompletionSchema: options.attemptCompletionSchema
        ? parseOutputSchema(options.attemptCompletionSchema)
        : undefined,
      attemptCompletionHook: options.attemptCompletionHook,
      asyncWaitTimeoutInMs: options.asyncWaitTimeout,
      filesystem,
      browserSessionStore,
    });

    const outputRenderer = new OutputRenderer(process.stdout, runner.state, {
      attemptCompletionSchemaOverride: !!options.attemptCompletionSchema,
    });

    let jsonRenderer: JsonRenderer | undefined = undefined;
    if (jsonOutputStream) {
      jsonRenderer = new JsonRenderer(
        jsonOutputStream,
        store,
        blobStore,
        runner.state,
        {
          mode: options.outputResult ? "result-only" : "full",
          attemptCompletionSchemaOverride: !!options.attemptCompletionSchema,
        },
      );
    }

    let runtimeError: Error | undefined = undefined;
    try {
      await runner.run();
    } catch (error) {
      runtimeError = error instanceof Error ? error : new Error(String(error));
    } finally {
      // Cleanup resources
      outputRenderer.shutdown();
      await jsonRenderer?.shutdown();
      if (jsonOutputStream && jsonOutputStream instanceof fs.WriteStream) {
        await new Promise<void>((resolve) => {
          jsonOutputStream.end(resolve);
        });
      }
      mcpHub?.dispose();
      browserSessionStore.dispose();
      await store.shutdownPromise();

      if (runtimeError) {
        program.error(runtimeError.message, {
          code:
            "code" in runtimeError && typeof runtimeError.code === "string"
              ? runtimeError.code
              : "C",
          exitCode:
            // FIXME(@zhiming): actually this does not work, as the caught error is always rethrown TaskError, never ProcessAbortError
            runtimeError instanceof ProcessAbortError
              ? runtimeError.exitCode
              : 1,
        });
      } else {
        // FIXME(@zhiming): address this comment moved from shutdown.ts
        // > FIXME: this is a hack to make sure the process exits
        // > mcpHub.dispose() is not working properly to close all subprocess, thus we have to do this.
        process.exit();
      }
    }
  });

const otherOptionsGroup = "Others:";
program
  .optionsGroup(otherOptionsGroup)
  .version(packageJson.version, "-V, --version", "Print the version string.")
  .addHelpOption(
    new commander.Option("-h, --help", "Print this help message.").helpGroup(
      otherOptionsGroup,
    ),
  )
  .configureHelp({
    styleTitle: (title) => chalk.bold(title),
  })
  .showSuggestionAfterError()
  .configureOutput({
    outputError: (str, write) => write(chalk.red(str)),
  });

// Run version check on every invocation before any command executes
program.hook("preAction", async (_thisCommand) => {
  await Promise.all([
    checkForUpdates().catch(() => {}),
    setPochiConfigWorkspacePath(process.cwd()).catch(() => {}),
  ]);
});

registerAuthCommand(program);
registerModelCommand(program);
registerMcpCommand(program);
registerUpgradeCommand(program);

if (process.argv[2] === "--completion") {
  handleShellCompletion(program, process.argv);
  process.exit(0);
}

program.parse(process.argv);

type Program = typeof program;
type ProgramOpts = ReturnType<(typeof program)["opts"]>;

async function parseTaskInput(
  options: ProgramOpts,
  program: Program,
  slashCommandContext: {
    customAgents: CustomAgentFile[];
    skills: SkillFile[];
  },
) {
  const uid = process.env.POCHI_TASK_ID || crypto.randomUUID();

  let prompt = options.prompt?.trim() || "";
  const attachments = options.attach || [];
  if (!prompt && !process.stdin.isTTY) {
    const chunks = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk);
    }
    const stdinPrompt = Buffer.concat(chunks).toString("utf8").trim();
    if (stdinPrompt) {
      prompt = stdinPrompt.trim();
    }
  }

  if (prompt.length === 0 && attachments.length === 0) {
    return program.error(
      "A prompt or attachment is required. Please provide one using the -p and/or -a option or by piping input.",
    );
  }

  // Check if the prompt contains workflow references
  if (containsSlashCommandReference(prompt)) {
    const { prompt: updatedPrompt } = await replaceSlashCommandReferences(
      prompt,
      slashCommandContext,
    );
    prompt = updatedPrompt;
  }

  return { uid, prompt, attachments };
}

async function createLLMConfig(
  program: Program,
  options: ProgramOpts,
  slashCommandContext: {
    customAgents: ValidCustomAgentFile[];
  },
): Promise<LLMRequestData> {
  const model =
    (await getModelFromSlashCommand(options.prompt, slashCommandContext)) ||
    options.model;

  const llm =
    (await createLLMConfigWithVendors(program, model)) ||
    (await createLLMConfigWithPochi(model)) ||
    (await createLLMConfigWithProviders(program, model));
  if (!llm) {
    return program.error(
      `Model '${model}' not found. Please check your configuration or run 'pochi model list' to see available models.`,
    );
  }

  return llm;
}

async function createLLMConfigWithVendors(
  program: Program,
  model: string,
): Promise<LLMRequestData | undefined> {
  const sep = model.indexOf("/");
  const vendorId = model.slice(0, sep);
  const modelId = model.slice(sep + 1);

  const vendors = getVendors();
  if (vendorId in vendors) {
    const vendor = vendors[vendorId as keyof typeof vendors];
    const models =
      await vendors[vendorId as keyof typeof vendors].fetchModels();
    const options = models[modelId];
    if (!options) {
      return program.error(
        `Model '${modelId}' not found. Please run 'pochi model' to see available models.`,
      );
    }
    return {
      id: `${vendorId}/${modelId}`,
      type: "vendor",
      useToolCallMiddleware: options.useToolCallMiddleware,
      getModel: () =>
        createModel(vendorId, {
          modelId,
          getCredentials: vendor.getCredentials,
        }),
      contentType: options.contentType,
    } satisfies LLMRequestData;
  }
}

async function createLLMConfigWithPochi(
  model: string,
): Promise<LLMRequestData | undefined> {
  const vendor = getVendor("pochi");
  const pochiModels = await vendor.fetchModels();
  const pochiModelOptions = pochiModels[model];
  if (pochiModelOptions) {
    const vendorId = "pochi";
    return {
      id: `${vendorId}/${model}`,
      type: "vendor",
      useToolCallMiddleware: pochiModelOptions.useToolCallMiddleware,
      getModel: () =>
        createModel(vendorId, {
          modelId: model,
          getCredentials: vendor.getCredentials,
        }),
      contentType: pochiModelOptions.contentType,
    };
  }
}

async function createLLMConfigWithProviders(
  program: Program,
  model: string,
): Promise<LLMRequestData | undefined> {
  const sep = model.indexOf("/");
  const providerId = model.slice(0, sep);
  const modelId = model.slice(sep + 1);

  const modelProvider = pochiConfig.value.providers?.[providerId];
  const modelSetting = modelProvider?.models?.[modelId];
  if (!modelProvider) return;

  if (!modelSetting) {
    return program.error(
      `Model '${model}' not found. Please check your configuration or run 'pochi model' to see available models.`,
    );
  }

  if (modelProvider.kind === "ai-gateway") {
    return {
      id: `${providerId}/${modelId}`,
      type: "ai-gateway",
      modelId,
      apiKey: modelProvider.apiKey,
      contextWindow:
        modelSetting.contextWindow ?? constants.DefaultContextWindow,
      maxOutputTokens:
        modelSetting.maxTokens ?? constants.DefaultMaxOutputTokens,
      contentType: modelSetting.contentType,
    };
  }

  if (modelProvider.kind === "google-vertex-tuning") {
    return {
      id: `${providerId}/${modelId}`,
      type: "google-vertex-tuning",
      modelId,
      vertex: modelProvider.vertex,
      contextWindow:
        modelSetting.contextWindow ?? constants.DefaultContextWindow,
      maxOutputTokens:
        modelSetting.maxTokens ?? constants.DefaultMaxOutputTokens,
      useToolCallMiddleware: modelSetting.useToolCallMiddleware,
      contentType: modelSetting.contentType,
    };
  }

  if (
    modelProvider.kind === undefined ||
    modelProvider.kind === "openai" ||
    modelProvider.kind === "openai-responses" ||
    modelProvider.kind === "anthropic"
  ) {
    return {
      id: `${providerId}/${modelId}`,
      type: modelProvider.kind || "openai",
      modelId,
      baseURL: modelProvider.baseURL,
      apiKey: modelProvider.apiKey,
      contextWindow:
        modelSetting.contextWindow ?? constants.DefaultContextWindow,
      maxOutputTokens:
        modelSetting.maxTokens ?? constants.DefaultMaxOutputTokens,
      useToolCallMiddleware: modelSetting.useToolCallMiddleware,
      contentType: modelSetting.contentType,
    };
  }

  assertUnreachable(modelProvider.kind);
}

function assertUnreachable(_x: never): never {
  throw new Error("Didn't expect to get here");
}

function parseOutputSchema(outputSchema: string): z.ZodAny {
  const schema = Function(
    "...args",
    `function getZodSchema(z) { return ${outputSchema} }; return getZodSchema(...args);`,
  )(z);
  return schema;
}
