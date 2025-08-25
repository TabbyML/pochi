#!/usr/bin/env bun
// Workaround for https://github.com/oven-sh/bun/issues/18145
import "@livestore/wa-sqlite/dist/wa-sqlite.node.wasm" with { type: "file" };

import { Command } from "@commander-js/extra-typings";
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

const userAgent = `PochiCli/${packageJson.version} ${`Node/${process.version}`} (${process.platform}; ${process.arch})`;

const parsePositiveInt = (input: string) => {
  if (!input) {
    return undefined;
  }
  const result = Number.parseInt(input);
  if (Number.isNaN(result) || result <= 0) {
    program.error("error: Option must be a positive integer");
  }
  return result;
};

const program = new Command()
  .name("pochi")
  .description(`${chalk.bold("Pochi Cli")} v${packageJson.version}`)
  .optionsGroup("Specify Task:")
  .option(
    "--task <uid>",
    "The uid of the task to execute. Can also be provided via the POCHI_TASK_ID environment variable.",
  )
  .option(
    "-p, --prompt <prompt>",
    "Create a new task with the given prompt. You can also pipe input to use as a prompt, for example: `cat .pochi/workflows/create-pr.md | pochi`",
  )
  .optionsGroup("Options:")
  .requiredOption(
    "--cwd <cwd>",
    "The current working directory.",
    process.cwd(),
  )
  .requiredOption(
    "--rg <path>",
    "The path to the ripgrep binary.",
    findRipgrep() || undefined,
  )
  .requiredOption("--url <url>", "The Pochi server URL.", prodServerUrl)
  .option(
    "--token <token>",
    "The Pochi session token. Can also be provided via the POCHI_SESSION_TOKEN environment variable or from the shared credentials file (`~/.pochi/credentials.json`).",
  )
  .option(
    "--model <model>",
    "The model to use for the task. Options: `google/gemini-2.5-pro`, `google/gemini-2.5-flash`, `anthropic/claude-4-sonnet`",
  )
  .option("--model-endpoint-id <modelEndpointId>")
  .option(
    "--max-rounds <number>",
    "Force the runner to stop if the number of rounds exceeds this value.",
    parsePositiveInt,
  )
  .option(
    "--max-retries <number>",
    "Force the runner to stop if the number of retries in a single round exceeds this value.",
    parsePositiveInt,
  )
  .optionsGroup("Model:")
  .option("--base-url <baseURL>", "The base URL to use for BYOK requests.")
  .option("--api-key <apikey>", "The API key to use for BYOK requests.")
  .option(
    "--max-output-tokens <number>",
    "The max output tokens to use for BYOK model.",
    parsePositiveInt,
  )
  .option(
    "--context-window <number>",
    "The context window limit for BYOK model.",
    parsePositiveInt,
  )
  .action(async (options) => {
    const { uid = crypto.randomUUID(), prompt } = await parseTaskInput(
      options,
      program,
    );

    const apiClient = await createApiClient(options, program);

    const store = await createStore(options.cwd);

    const llm = createLLMConfig({ options, apiClient, program });

    const runner = new TaskRunner({
      uid,
      apiClient,
      store,
      llm,
      prompt,
      cwd: options.cwd,
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

async function createApiClient(
  options: ProgramOpts,
  program: Program,
): Promise<PochiApiClient> {
  let token = options.token ?? process.env.POCHI_SESSION_TOKEN;
  if (!token) {
    const credentialStorage = new CredentialStorage({
      isDev: options.url !== prodServerUrl,
    });
    token = await credentialStorage.read();
  }

  if (!token) {
    program.error(
      "error: No token provided. Please use the --token option, set POCHI_SESSION_TOKEN, or confirm `~/.pochi/credentials.json` exists (login with the Pochi VSCode extension to obtain it).",
    );
  }

  return hc<PochiApi>(options.url, {
    fetch(input: string | URL | Request, init?: RequestInit) {
      const headers = new Headers(init?.headers);
      headers.append("Authorization", `Bearer ${token}`);
      headers.set("User-Agent", userAgent);
      return fetch(input, {
        ...init,
        headers,
      });
    },
  });
}

function createLLMConfig({
  apiClient,
  program,
  options,
}: {
  apiClient: PochiApiClient;
  program: Program;
  options: ProgramOpts;
}): LLMRequestData {
  let openai:
    | {
        apiKey?: string;
        baseURL: string;
        maxOutputTokens: number;
        contextWindow: number;
      }
    | undefined;

  if (options.baseUrl) {
    if (options.maxOutputTokens && options.model && options.contextWindow) {
      openai = {
        apiKey: options.apiKey,
        baseURL: options.baseUrl,
        maxOutputTokens: options.maxOutputTokens,
        contextWindow: options.contextWindow,
      };
    } else {
      return program.error(
        "error: --base-url requires --max-output-tokens, --model and --context-window to be set.",
      );
    }
  }

  return (
    openai
      ? {
          type: "openai",
          modelId: options.model || "<default>",
          baseURL: openai.baseURL,
          apiKey: openai.apiKey,
          contextWindow: openai.contextWindow,
          maxOutputTokens: openai.maxOutputTokens,
        }
      : {
          type: "pochi",
          modelId: options.model,
          apiClient,
        }
  ) satisfies LLMRequestData;
}
