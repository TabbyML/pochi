#!/usr/bin/env bun
// Workaround for https://github.com/oven-sh/bun/issues/18145
import "@livestore/wa-sqlite/dist/wa-sqlite.node.wasm" with { type: "file" };

import { Command } from "@commander-js/extra-typings";
import { constants, getLogger } from "@getpochi/common";
import { pochiConfig } from "@getpochi/common/configuration";
import type { PochiApi, PochiApiClient } from "@getpochi/common/pochi-api";
import { getVendors } from "@getpochi/common/vendor/node";
import type { LLMRequestData } from "@getpochi/livekit";
import chalk from "chalk";
import * as commander from "commander";
import { hc } from "hono/client";
import packageJson from "../package.json";
import { registerAuthCommand } from "./auth";
import { findRipgrep } from "./lib/find-ripgrep";
import {
  containsWorkflowReference,
  replaceWorkflowReferences,
} from "./lib/workflow-loader";
import { createStore } from "./livekit/store";
import { registerModelCommand } from "./model";
import { OutputRenderer } from "./output-renderer";
import { TaskRunner } from "./task-runner";
import { registerUpgradeCommand } from "./upgrade";
import { waitUntil } from "./wait-until";

const logger = getLogger("Pochi");
logger.debug(`pochi v${packageJson.version}`);

const prodServerUrl = "https://app.getpochi.com";

const userAgent = `PochiCli/${packageJson.version} Node/${process.version} (${process.platform}; ${process.arch})`;

const parsePositiveInt = (input: string): number => {
  if (!input) {
    return program.error("error: Option must be a positive integer");
  }
  const result = Number.parseInt(input);
  if (Number.isNaN(result) || result <= 0) {
    return program.error("error: Option must be a positive integer");
  }
  return result;
};

const program = new Command()
  .name("pochi")
  .description(`${chalk.bold("Pochi")} v${packageJson.version}`)
  .optionsGroup("Prompt:")
  .option(
    "-p, --prompt <prompt>",
    'Create a new task with the given prompt. You can also pipe input to use as a prompt, for example: `cat .pochi/workflows/create-pr.md | pochi`. To use a workflow, use /workflow-name, for example: `pochi -p /create-pr`. Workflows can be embedded in larger prompts, for example: `pochi -p "please /create-pr with feat semantic convention"`',
  )
  .optionsGroup("Options:")
  .option(
    "--max-steps <number>",
    "Maximum number of stepsto run the task. If the task cannot be completed in this number of rounds, the runner will stop.",
    parsePositiveInt,
    24,
  )
  .option(
    "--max-retries <number>",
    "Maximum number of retries to run the task in a single step.",
    parsePositiveInt,
    3,
  )
  .optionsGroup("Model:")
  .option(
    "--model <model>",
    "The model to use for the task.",
    "qwen/qwen3-coder",
  )
  .action(async (options) => {
    const { uid, prompt } = await parseTaskInput(options, program);

    const apiClient = await createApiClient();

    const store = await createStore(process.cwd());

    const llm = await createLLMConfig(program, options);
    const rg = findRipgrep();
    if (!rg) {
      return program.error(
        "ripgrep is required to run the task. Please install it first and make sure it is available in your $PATH.",
      );
    }

    const runner = new TaskRunner({
      uid,
      apiClient,
      store,
      llm,
      prompt,
      cwd: process.cwd(),
      rg,
      maxSteps: options.maxSteps,
      maxRetries: options.maxRetries,
      waitUntil,
    });

    const renderer = new OutputRenderer(runner.state);

    await runner.run();

    renderer.shutdown();

    const shareId = runner.shareId;
    if (shareId) {
      // FIXME(zhiming): base url is hard code, should use options.url
      const shareUrl = chalk.underline(
        `https://app.getpochi.com/share/${shareId}`,
      );
      console.log(`\n${chalk.bold("Task link: ")} ${shareUrl}`);
    }

    await store.shutdown();
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

registerAuthCommand(program);
registerModelCommand(program);
registerUpgradeCommand(program);

program.parse(process.argv);

type Program = typeof program;
type ProgramOpts = ReturnType<(typeof program)["opts"]>;

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
    return program.error("error: A prompt must be provided");
  }

  // Check if the prompt contains workflow references
  if (containsWorkflowReference(prompt)) {
    const { prompt: updatedPrompt, missingWorkflows } =
      await replaceWorkflowReferences(prompt, process.cwd());
    prompt = updatedPrompt;

    // Handle missing workflows
    if (missingWorkflows.length > 0) {
      console.warn(
        `${chalk.yellow("warning:")} Workflow(s) '${missingWorkflows.join(", ")}' not found in .pochi/workflows/`,
      );
    }
  }

  return { uid, prompt };
}

async function createApiClient(): Promise<PochiApiClient> {
  const { credentials } = pochiConfig.value.vendors?.pochi || {};
  const token = credentials?.token;

  const apiClient: PochiApiClient = hc<PochiApi>(prodServerUrl, {
    fetch(input: string | URL | Request, init?: RequestInit) {
      const headers = new Headers(init?.headers);
      if (token) {
        headers.append("Authorization", `Bearer ${token}`);
      }
      headers.set("User-Agent", userAgent);
      return fetch(input, {
        ...init,
        headers,
      });
    },
  });

  const proxed = new Proxy(apiClient, {
    get(target, prop, receiver) {
      if (prop === "authenticated") {
        return !!token;
      }
      return Reflect.get(target, prop, receiver);
    },
  });

  return proxed;
}

async function createLLMConfig(
  program: Program,
  options: ProgramOpts,
): Promise<LLMRequestData> {
  const llm =
    (await createLLMConfigWithVendors(program, options)) ||
    (await createLLMConfigWithProviders(program, options));
  if (!llm) {
    return program.error(`Model ${options.model} not found in configuration`);
  }

  return llm;
}

async function createLLMConfigWithVendors(
  program: Program,
  options: ProgramOpts,
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
      return program.error(`Model ${modelId} not found`);
    }
    return {
      type: "vendor",
      vendorId: vendorId,
      modelId: modelId,
      options,
      getCredentials: vendor.getCredentials,
    } satisfies LLMRequestData;
  }

  const pochiModels = await vendors.pochi.fetchModels();
  const pochiModelOptions = pochiModels[options.model];
  if (pochiModelOptions) {
    return {
      type: "vendor",
      vendorId: "pochi",
      modelId: options.model,
      options: pochiModelOptions,
      getCredentials: vendors.pochi.getCredentials,
    };
  }
}

async function createLLMConfigWithProviders(
  program: Program,
  options: ProgramOpts,
): Promise<LLMRequestData | undefined> {
  const sep = options.model.indexOf("/");
  const providerId = options.model.slice(0, sep);
  const modelId = options.model.slice(sep + 1);

  const modelProvider = pochiConfig.value.providers?.[providerId];
  const modelSetting = modelProvider?.models?.[modelId];
  if (!modelProvider) return;

  if (!modelSetting) {
    return program.error(`Model ${options.model} not found in configuration`);
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
}
