#!/usr/bin/env bun
// Workaround for https://github.com/oven-sh/bun/issues/18145
import "@livestore/wa-sqlite/dist/wa-sqlite.node.wasm" with { type: "file" };

import { Command, Option } from "@commander-js/extra-typings";
import { getLogger } from "@getpochi/common";
import type { PochiApi, PochiApiClient } from "@getpochi/common/pochi-api";
import { CredentialStorage } from "@getpochi/common/tool-utils";
import type { LLMRequestData } from "@getpochi/livekit";
import chalk from "chalk";
import * as commander from "commander";
import { hc } from "hono/client";
import packageJson from "../package.json";
import { findRipgrep } from "./lib/find-ripgrep";
import { createStore } from "./livekit/store";
import { OutputRenderer } from "./output-renderer";
import { TaskRunner } from "./task-runner";
import { waitUntil } from "./wait-until";

const logger = getLogger("Pochi");
logger.debug(`pochi v${packageJson.version}`);

const prodServerUrl = "https://app.getpochi.com";

const userAgent = `Pochi/${packageJson.version} ${`Node/${process.version}`} (${process.platform}; ${process.arch})`;

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
  .description(`${chalk.bold("Pochi Cli")} v${packageJson.version}`)
  .optionsGroup("Specify Task:")
  .option(
    "--task <uid>",
    "The UID of the task to execute. Can also be provided via the POCHI_TASK_ID environment variable.",
  )
  .option(
    "-p, --prompt <prompt>",
    "Create a new task with the given prompt. You can also pipe input to use as a prompt, for example: `cat .pochi/workflows/create-pr.md | pochi`",
  )
  .optionsGroup("Options:")
  .addOption(
    new Option("--rg <path>", "The path to the ripgrep binary.")
      .default(findRipgrep() || undefined)
      .makeOptionMandatory()
      .hideHelp(),
  )
  .option(
    "--max-rounds <number>",
    "Force the runner to stop if the number of rounds exceeds this value.",
    parsePositiveInt,
    24,
  )
  .option(
    "--max-retries <number>",
    "Force the runner to stop if the number of retries in a single round exceeds this value.",
    parsePositiveInt,
    3,
  )
  .optionsGroup("Model:")
  .option(
    "--model <model>",
    "The model to use for the task. Available options: `google/gemini-2.5-pro`, `google/gemini-2.5-flash`, `anthropic/claude-4-sonnet`",
    "qwen/qwen3-coder",
  )
  .requiredOption(
    "--model-type <modelType>",
    "The type of model to use for the task. Available options: `pochi`, `openai`, `google-vertex-tuning`, `ai-gateway` ",
    "pochi",
  )
  .option(
    "--model-base-url <baseURL>",
    "The base URL to use for the model API.",
    prodServerUrl,
  )
  .option(
    "--model-api-key <modelApiKey>",
    "The API key to use for authentication. Only meant to be set for `openai` models.",
  )
  .option(
    "--model-max-output-tokens <number>",
    "The maximum number of output tokens to use. Only meant to be set for `openai` models.",
    parsePositiveInt,
    4096,
  )
  .option(
    "--model-context-window <number>",
    "The maximum context window size in tokens. Only meant to be set for `openai` models.",
    parsePositiveInt,
    100_000, // 100K
  )
  .action(async (options) => {
    const { uid = crypto.randomUUID(), prompt } = await parseTaskInput(
      options,
      program,
    );

    const apiClient = await createApiClient(options);

    const store = await createStore(process.cwd());

    const llm = createLLMConfig({ options, apiClient, program });
    console.log("llm", llm);

    const runner = new TaskRunner({
      uid,
      apiClient,
      store,
      llm,
      prompt,
      cwd: process.cwd(),
      rg: options.rg,
      maxRounds: options.maxRounds,
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

program.parse(process.argv);

type Program = typeof program;
type ProgramOpts = ReturnType<(typeof program)["opts"]>;

async function parseTaskInput(options: ProgramOpts, program: Program) {
  const uid = options.task ?? process.env.POCHI_TASK_ID;

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

  if (!uid && !prompt) {
    return program.error(
      "error: Either a task uid or a prompt must be provided",
    );
  }

  return { uid, prompt };
}

async function createApiClient(options: ProgramOpts): Promise<PochiApiClient> {
  let token = process.env.POCHI_SESSION_TOKEN;
  if (!token) {
    const credentialStorage = new CredentialStorage({
      isDev:
        options.modelType === "pochi" && options.modelBaseUrl !== prodServerUrl,
    });
    token = await credentialStorage.read();
  }

  const authClient: PochiApiClient = hc<PochiApi>(options.modelBaseUrl, {
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

  authClient.authenticated = !!token;
  return authClient;
}

function createLLMConfig({
  apiClient,
  options,
}: {
  apiClient: PochiApiClient;
  program: Program;
  options: ProgramOpts;
}): LLMRequestData {
  if (options.modelType === "openai") {
    return {
      type: "openai",
      modelId: options.model || "<default>",
      baseURL: options.modelBaseUrl,
      apiKey: options.modelApiKey,
      contextWindow: options.modelContextWindow,
      maxOutputTokens: options.modelMaxOutputTokens,
    };
  }

  if (options.modelType === "ai-gateway") {
    return {
      type: "ai-gateway",
      modelId: options.model || "<default>",
      apiKey: options.modelApiKey,
      contextWindow: options.modelContextWindow,
      maxOutputTokens: options.modelMaxOutputTokens,
    };
  }

  if (options.modelType === "google-vertex-tuning") {
    if (!options.modelApiKey) {
      return program.error(
        "--model-api-key is required for google-vertex-tuning",
      );
    }

    return {
      type: "google-vertex-tuning",
      modelId: options.model || "<default>",
      credentials: options.modelApiKey,
      contextWindow: options.modelContextWindow,
      maxOutputTokens: options.modelMaxOutputTokens,
      // FIXME: hardcoded for now
      location: "us-central1",
    };
  }

  return {
    type: "pochi",
    modelId: options.model,
    apiClient,
  } satisfies LLMRequestData;
}
