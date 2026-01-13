#!/usr/bin/env bun
// Workaround for https://github.com/oven-sh/bun/issues/18145
import "@livestore/wa-sqlite/dist/wa-sqlite.node.wasm" with { type: "file" };

// Register the vendor
import "@getpochi/vendor-pochi";
import "@getpochi/vendor-gemini-cli";
import "@getpochi/vendor-codex";
import "@getpochi/vendor-github-copilot";
import "@getpochi/vendor-qwen-code";

// Register the models
import "@getpochi/vendor-pochi/edge";
import "@getpochi/vendor-gemini-cli/edge";
import "@getpochi/vendor-codex/edge";
import "@getpochi/vendor-github-copilot/edge";
import "@getpochi/vendor-qwen-code/edge";

import fs from "node:fs/promises";
import path from "node:path";
import { Command, Option } from "@commander-js/extra-typings";
import { constants, getLogger, prompts } from "@getpochi/common";
import {
  pochiConfig,
  setPochiConfigWorkspacePath,
} from "@getpochi/common/configuration";
import { getVendor, getVendors } from "@getpochi/common/vendor";
import { createModel } from "@getpochi/common/vendor/edge";
import {
  type LLMRequestData,
  type Message,
  fileToUri,
} from "@getpochi/livekit";
import chalk from "chalk";
import * as commander from "commander";
import z from "zod/v4";
import packageJson from "../package.json";
import { registerAuthCommand } from "./auth";
import { handleShellCompletion } from "./completion";
import { findRipgrep } from "./lib/find-ripgrep";
import { loadAgents } from "./lib/load-agents";
import { type Workflow, loadWorkflows } from "./lib/workflow-loader";

import type {
  CustomAgentFile,
  ValidCustomAgentFile,
} from "@getpochi/common/vscode-webui-bridge";
import type { FileUIPart } from "ai";
import { JsonRenderer } from "./json-renderer";
import {
  containsSlashCommandReference,
  getModelFromSlashCommand,
  replaceSlashCommandReferences,
} from "./lib/match-slash-command";
import {
  createAbortControllerWithGracefulShutdown,
  shutdownStoreAndExit,
} from "./lib/shutdown";
import { createStore } from "./livekit/store";
import { initializeMcp, registerMcpCommand } from "./mcp";
import { registerModelCommand } from "./model";
import { OutputRenderer } from "./output-renderer";
import { TaskRunner } from "./task-runner";
import { checkForUpdates, registerUpgradeCommand } from "./upgrade";

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

const program = new Command()
  .name("pochi")
  .description(
    `${chalk.bold("Pochi")} v${packageJson.version} - A powerful CLI tool for AI-driven development.`,
  )
  .optionsGroup("Prompt:")
  .option(
    "-p, --prompt <prompt>",
    "Create a new task with a given prompt. Input can also be piped. For example: `cat my-prompt.md | pochi`. Workflows can be triggered with `/workflow-name`, like `pochi -p /create-pr`.",
  )
  .option(
    "-a, --attach <path...>",
    "Attach one or more files to the prompt, e.g images",
  )
  .optionsGroup("Options:")
  .option(
    "--stream-json",
    "Stream the output in JSON format. This is useful for parsing the output in scripts.",
  )
  .option(
    "-x, --output-result",
    "Output the result from attemptCompletion to stdout. This is useful for scripts that need to capture the final result.",
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
  .addOption(
    new Option(
      "--experimental-output-schema <schema>",
      "Specify a JSON schema for the output of the task. The task will be validated against this schema.",
    ).hideHelp(),
  )
  .optionsGroup("Model:")
  .option(
    "-m, --model <model>",
    "Specify the model to be used for the task.",
    "google/gemini-2.5-flash",
  )
  .optionsGroup("MCP:")
  .option(
    "--no-mcp",
    "Disable MCP (Model Context Protocol) integration completely.",
  )
  .action(async (options) => {
    // Load custom agents
    const customAgents = await loadAgents(process.cwd());
    const workflows = await loadWorkflows(process.cwd());

    const { uid, prompt, attachments } = await parseTaskInput(
      options,
      program,
      {
        customAgents: customAgents,
        workflows,
      },
    );

    const store = await createStore(uid);

    const parts: Message["parts"] = [];
    if (attachments && attachments.length > 0) {
      for (const attachmentPath of attachments) {
        try {
          const absolutePath = path.resolve(process.cwd(), attachmentPath);
          const buffer = await fs.readFile(absolutePath);
          const mimeType = getMimeType(attachmentPath);
          const dataUrl = await fileToUri(
            store,
            new File([buffer], attachmentPath, {
              type: mimeType,
            }),
          );
          parts.push({
            type: "text",
            text: prompts.createSystemReminder(
              `Attached file: ${path.relative(process.cwd(), absolutePath)}`,
            ),
          });
          parts.push({
            type: "file",
            mediaType: mimeType,
            filename: path.basename(absolutePath),
            url: dataUrl,
          } satisfies FileUIPart);
        } catch (error) {
          program.error(
            `Failed to read attachment: ${attachmentPath}\n${error}`,
          );
        }
      }
    }

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

    const onSubTaskCreated = (runner: TaskRunner) => {
      renderer.renderSubTask(runner);
    };

    // Create MCP Hub for accessing MCP server tools (only if MCP is enabled)
    const mcpHub = options.mcp ? await initializeMcp(program) : undefined;

    // Create AbortController for task cancellation with graceful shutdown
    const abortController = createAbortControllerWithGracefulShutdown();

    const llm = await createLLMConfig(program, options, {
      workflows,
      customAgents,
    });

    const runner = new TaskRunner({
      uid,
      store,
      llm,
      parts,
      cwd: process.cwd(),
      rg,
      maxSteps: options.maxSteps,
      maxRetries: options.maxRetries,
      onSubTaskCreated,
      customAgents,
      mcpHub,
      abortSignal: abortController.signal,
      outputSchema: options.experimentalOutputSchema
        ? parseOutputSchema(options.experimentalOutputSchema)
        : undefined,
    });

    const renderer = new OutputRenderer(runner.state);
    let jsonRenderer: JsonRenderer | undefined;
    if (options.streamJson) {
      jsonRenderer = new JsonRenderer(store, runner.state, { mode: "full" });
    } else if (options.outputResult) {
      jsonRenderer = new JsonRenderer(store, runner.state, {
        mode: "result-only",
      });
    }

    await runner.run();

    // Cleanup resources after task completion
    renderer.shutdown();
    if (mcpHub) {
      mcpHub.dispose();
    }
    if (jsonRenderer) {
      jsonRenderer.shutdown();
    }
    await shutdownStoreAndExit(store);
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
    workflows: Workflow[];
    customAgents: CustomAgentFile[];
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
    workflows: Workflow[];
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

function getMimeType(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();
  switch (extension) {
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".gif":
      return "image/gif";
    case ".webp":
      return "image/webp";
    case ".svg":
      return "image/svg+xml";
    default:
      return "application/octet-stream";
  }
}
