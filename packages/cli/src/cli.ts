#!/usr/bin/env bun
// Workaround for https://github.com/oven-sh/bun/issues/18145
import "@livestore/wa-sqlite/dist/wa-sqlite.node.wasm" with { type: "file" };

// Register the vendor
import "@getpochi/vendor-pochi";
import "@getpochi/vendor-gemini-cli";
import "@getpochi/vendor-claude-code";
import "@getpochi/vendor-codex";
import "@getpochi/vendor-github-copilot";

// Register the models
import "@getpochi/vendor-pochi/edge";
import "@getpochi/vendor-gemini-cli/edge";
import "@getpochi/vendor-claude-code/edge";
import "@getpochi/vendor-codex/edge";
import "@getpochi/vendor-github-copilot/edge";

import { Command } from "@commander-js/extra-typings";
import { constants, getLogger } from "@getpochi/common";
import { pochiConfig } from "@getpochi/common/configuration";
import { getVendor, getVendors } from "@getpochi/common/vendor";
import { createModel } from "@getpochi/common/vendor/edge";
import type { LLMRequestData } from "@getpochi/livekit";
import { type Duration, Effect, Stream } from "@livestore/utils/effect";
import chalk from "chalk";
import * as commander from "commander";
import packageJson from "../package.json";
import { registerAuthCommand } from "./auth";

import type { Store } from "@livestore/livestore";
import { initializeShellCompletion } from "./completion";
import { findRipgrep } from "./lib/find-ripgrep";
import { loadAgents } from "./lib/load-agents";
import { createCliMcpHub } from "./lib/mcp-hub-factory";
import { shutdownStoreAndExit } from "./lib/store-utils";
import {
  containsWorkflowReference,
  extractWorkflowNames,
  parseWorkflowFrontmatter,
  replaceWorkflowReferences,
} from "./lib/workflow-loader";
import { createStore } from "./livekit/store";
import { initializeMcp, registerMcpCommand } from "./mcp";
import { registerModelCommand } from "./model";
import { OutputRenderer } from "./output-renderer";
import { registerTaskCommand } from "./task";
import { TaskRunner } from "./task-runner";
import { checkForUpdates, registerUpgradeCommand } from "./upgrade";

const logger = getLogger("Pochi");
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
  .optionsGroup("Options:")
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
  .optionsGroup("Model:")
  .option("-m, --model <model>", "Specify the model to be used for the task.")
  .action(async (options) => {
    const { uid, prompt } = await parseTaskInput(options, program);

    const store = await createStore();

    const llm = await createLLMConfig(program, options);
    const rg = findRipgrep();
    if (!rg) {
      return program.error(
        "ripgrep is not installed or not found in your $PATH. Please install it to continue.",
      );
    }

    const onSubTaskCreated = (runner: TaskRunner) => {
      renderer.renderSubTask(runner);
    };

    // Load custom agents
    const customAgents = await loadAgents(process.cwd());

    // Create MCP Hub for accessing MCP server tools
    const mcpHub = createCliMcpHub();

    // Initialize MCP connections
    await initializeMcp(mcpHub);

    const runner = new TaskRunner({
      uid,
      store,
      llm,
      prompt,
      cwd: process.cwd(),
      rg,
      maxSteps: options.maxSteps,
      maxRetries: options.maxRetries,
      onSubTaskCreated,
      customAgents,
      mcpHub,
    });

    const renderer = new OutputRenderer(runner.state);

    await runner.run();

    const shareId = runner.shareId;
    if (shareId) {
      // FIXME(zhiming): base url is hard code, should use options.url
      const shareUrl = chalk.underline(
        `https://app.getpochi.com/share/${shareId}`,
      );
      console.log(`\n${chalk.bold("Task link: ")} ${shareUrl}`);
    }

    renderer.shutdown();
    mcpHub.dispose();
    await waitForSync(store, "2 second").catch(console.error);
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
  .showHelpAfterError()
  .showSuggestionAfterError()
  .configureOutput({
    outputError: (str, write) => write(chalk.red(str)),
  });

// Run version check on every invocation before any command executes
program.hook("preAction", async () => {
  await Promise.all([
    checkForUpdates().catch(() => {}),
    waitForSync().catch(console.error),
  ]);
});

registerAuthCommand(program);

registerModelCommand(program);
registerMcpCommand(program);
registerTaskCommand(program);

registerUpgradeCommand(program);

// Initialize auto-completion after all commands are registered
initializeShellCompletion(program);

program.parse(process.argv);

type Program = typeof program;
type ProgramOpts = ReturnType<(typeof program)["opts"]>;
type ResolvedProgramOpts = ProgramOpts & { model: string };

async function parseTaskInput(options: ProgramOpts, program: Program) {
  const uid = process.env.POCHI_TASK_ID || crypto.randomUUID();

  let prompt = options.prompt?.trim();
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

  if (!prompt) {
    return program.error(
      "A prompt is required. Please provide one using the --prompt option or by piping input.",
    );
  }

  // Check if the prompt contains workflow references
  if (containsWorkflowReference(prompt)) {
    const { prompt: updatedPrompt } = await replaceWorkflowReferences(
      prompt,
      process.cwd(),
    );
    prompt = updatedPrompt;
  }

  return { uid, prompt };
}

async function resolveModelOption(
  options: ProgramOpts,
): Promise<ResolvedProgramOpts> {
  // Create a mutable copy of the options to avoid side effects.
  const newOptions = { ...options };
  const prompt = options.prompt;
  // Determine the model to use based on a clear precedence:
  // 1. User-provided model via the `--model` flag.
  // 2. Model specified in the referenced workflow's frontmatter.
  // 3. The default model as a fallback.

  // If the user has explicitly specified a model, it takes the highest precedence.
  if (options.model) {
    console.debug(`Using user-specified model: ${options.model}`);
    return newOptions as ResolvedProgramOpts;
  }
  // If no model is specified by the user, check for a model in the workflow frontmatter.
  if (prompt && containsWorkflowReference(prompt)) {
    const workflowNames = extractWorkflowNames(prompt);
    if (workflowNames.length > 0) {
      const { model: workflowModel } = await parseWorkflowFrontmatter(
        workflowNames[0],
      );
      // If a valid model is found in the workflow, use it.
      if (workflowModel && (await isValidModel(workflowModel))) {
        console.debug(`Using model from workflow: ${workflowModel}`);
        newOptions.model = workflowModel;
        return newOptions as ResolvedProgramOpts;
      }
    }
  }

  // If no model is specified by the user or in the workflow, use the default model.
  const defaultModel = "qwen/qwen3-coder";
  console.debug(`Using default model: ${defaultModel}`);
  newOptions.model = defaultModel;

  return newOptions as ResolvedProgramOpts;
}

async function createLLMConfig(
  program: Program,
  options: ProgramOpts,
): Promise<LLMRequestData> {
  const resolvedOptions = await resolveModelOption(options);
  const llm =
    (await createLLMConfigWithVendors(program, resolvedOptions)) ||
    (await createLLMConfigWithPochi(resolvedOptions)) ||
    (await createLLMConfigWithProviders(program, resolvedOptions));
  if (!llm) {
    return program.error(
      `Model '${resolvedOptions.model}' not found. Please check your configuration or run 'pochi model list' to see available models.`,
    );
  }

  return llm;
}

async function createLLMConfigWithVendors(
  program: Program,
  options: ResolvedProgramOpts,
): Promise<LLMRequestData | undefined> {
  const sep = options.model.indexOf("/");
  const vendorId = options.model.slice(0, sep);
  const modelId = options.model.slice(sep + 1);

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
      type: "vendor",
      useToolCallMiddleware: options.useToolCallMiddleware,
      getModel: (id: string) =>
        createModel(vendorId, {
          id,
          modelId,
          getCredentials: vendor.getCredentials,
        }),
    } satisfies LLMRequestData;
  }
}

async function createLLMConfigWithPochi(
  options: ResolvedProgramOpts,
): Promise<LLMRequestData | undefined> {
  const vendor = getVendor("pochi");
  const pochiModels = await vendor.fetchModels();
  const pochiModelOptions = pochiModels[options.model];
  if (pochiModelOptions) {
    const vendorId = "pochi";
    return {
      type: "vendor",
      useToolCallMiddleware: pochiModelOptions.useToolCallMiddleware,
      getModel: (id: string) =>
        createModel(vendorId, {
          id,
          modelId: options.model,
          getCredentials: vendor.getCredentials,
        }),
    };
  }
}

async function createLLMConfigWithProviders(
  program: Program,
  options: ResolvedProgramOpts,
): Promise<LLMRequestData | undefined> {
  const sep = options.model.indexOf("/");
  const providerId = options.model.slice(0, sep);
  const modelId = options.model.slice(sep + 1);

  const modelProvider = pochiConfig.value.providers?.[providerId];
  const modelSetting = modelProvider?.models?.[modelId];
  if (!modelProvider) return;

  if (!modelSetting) {
    return program.error(
      `Model '${options.model}' not found. Please check your configuration or run 'pochi model' to see available models.`,
    );
  }

  if (modelProvider.kind === undefined || modelProvider.kind === "openai") {
    return {
      type: "openai",
      modelId,
      baseURL: modelProvider.baseURL,
      apiKey: modelProvider.apiKey,
      contextWindow:
        modelSetting.contextWindow ?? constants.DefaultContextWindow,
      maxOutputTokens:
        modelSetting.maxTokens ?? constants.DefaultMaxOutputTokens,
    };
  }

  if (modelProvider.kind === "ai-gateway") {
    return {
      type: "ai-gateway",
      modelId,
      apiKey: modelProvider.apiKey,
      contextWindow:
        modelSetting.contextWindow ?? constants.DefaultContextWindow,
      maxOutputTokens:
        modelSetting.maxTokens ?? constants.DefaultMaxOutputTokens,
    };
  }

  if (modelProvider.kind === "google-vertex-tuning") {
    return {
      type: "google-vertex-tuning",
      modelId,
      vertex: modelProvider.vertex,
      contextWindow:
        modelSetting.contextWindow ?? constants.DefaultContextWindow,
      maxOutputTokens:
        modelSetting.maxTokens ?? constants.DefaultMaxOutputTokens,
    };
  }

  if (modelProvider.kind === "openai-responses") {
    return {
      type: "openai-responses",
      modelId,
      baseURL: modelProvider.baseURL,
      apiKey: modelProvider.apiKey,
      contextWindow:
        modelSetting.contextWindow ?? constants.DefaultContextWindow,
      maxOutputTokens:
        modelSetting.maxTokens ?? constants.DefaultMaxOutputTokens,
      useToolCallMiddleware: modelSetting.useToolCallMiddleware,
    };
  }
  assertUnreachable(modelProvider.kind);
}

async function waitForSync(
  inputStore?: Store,
  timeoutDuration: Duration.DurationInput = "1 second",
) {
  const store = inputStore || (await createStore());

  await Effect.gen(function* (_) {
    while (true) {
      const nextChange = store.syncProcessor.syncState.changes.pipe(
        Stream.take(1),
        Stream.runCollect,
        Effect.as(false),
      );

      const timeout = Effect.sleep(timeoutDuration).pipe(Effect.as(true));

      if (yield* Effect.raceFirst(nextChange, timeout)) {
        break;
      }
    }
  }).pipe(Effect.runPromise);

  if (!inputStore) {
    await store.shutdown();
  }
}

async function isValidModel(model: string): Promise<boolean> {
  const sep = model.indexOf("/");
  const vendorId = model.slice(0, sep);
  const modelId = model.slice(sep + 1);

  const vendors = getVendors();
  if (vendorId in vendors) {
    const vendor = vendors[vendorId as keyof typeof vendors];
    const models = await vendor.fetchModels();
    return modelId in models;
  }

  const pochiVendor = getVendor("pochi");
  const pochiModels = await pochiVendor.fetchModels();
  if (model in pochiModels) {
    return true;
  }

  const modelProvider = pochiConfig.value.providers?.[vendorId];
  if (modelProvider?.models?.[modelId]) {
    return true;
  }

  return false;
}

function assertUnreachable(_x: never): never {
  throw new Error("Didn't expect to get here");
}
