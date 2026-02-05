import * as readline from "node:readline/promises";
import { getLogger } from "@getpochi/common";
import type { UserInfo } from "@getpochi/common/configuration";
import {
  type AuthOutput,
  type ModelOptions,
  VendorBase,
} from "@getpochi/common/vendor";
import type { PochiCredentials } from "@getpochi/common/vscode-webui-bridge";
import { type TabbyCredentials, VendorId } from "./types";

const logger = getLogger("TabbyVendor");

async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    initialDelay?: number;
    maxDelay?: number;
    delayMultiplier?: number;
  } = {},
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    maxDelay = 10000,
    delayMultiplier = 2,
  } = options;

  let lastError: Error | undefined;
  let delay = initialDelay;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay = Math.min(delay * delayMultiplier, maxDelay);
      }
    }
  }

  throw lastError;
}

interface AgentEndpointInfo {
  name: string;
  metadata?: Record<string, Record<string, string>>;
}

export class Tabby extends VendorBase {
  private cachedModels?: Record<string, ModelOptions>;

  constructor() {
    super(VendorId);
  }

  override async authenticate(): Promise<AuthOutput> {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    try {
      const urlInput = await rl.question(
        "Enter Tabby Server URL (default: http://localhost:8080): ",
      );
      const url = urlInput.trim().replace(/\/$/, "") || "http://localhost:8080";
      const token = await rl.question("Enter Tabby Token: ");

      return {
        url: "",
        credentials: Promise.resolve({
          url,
          token: token.trim(),
        }),
      };
    } finally {
      rl.close();
    }
  }

  private async fetchEndpoints(
    creds: TabbyCredentials,
  ): Promise<AgentEndpointInfo[]> {
    const response = await fetch(`${creds.url}/v2/endpoints`, {
      headers: {
        Authorization: `Bearer ${creds.token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch endpoints: ${response.statusText}`);
    }

    return response.json() as Promise<AgentEndpointInfo[]>;
  }

  private async fetchOpenAIModels(
    name: string,
    creds: TabbyCredentials,
  ): Promise<Record<string, ModelOptions>> {
    const data = await withRetry(
      async () => {
        const response = await fetch(
          `${creds.url}/v2/endpoints/${name}/v1/models`,
          {
            headers: {
              Authorization: `Bearer ${creds.token}`,
            },
          },
        );

        if (!response.ok) {
          throw new Error(`Failed to fetch models: ${response.statusText}`);
        }

        return response.json() as Promise<{
          data: Array<{ id: string }>;
        }>;
      },
      {
        maxRetries: 3,
        initialDelay: 1000,
      },
    ).catch((error: Error) => {
      logger.error(`Failed to fetch models: ${error.message}`);
      return { data: [] }; // Return an empty array on error
    });

    return Object.fromEntries(
      data.data
        .filter((x) => x.id.startsWith("gpt-5")) // FIXME(wei): filter models that start with "gpt-5" for dev
        .map((x) => [
          x.id,
          {
            useToolCallMiddleware: false,
          } satisfies ModelOptions,
        ]),
    );
  }

  override async fetchModels(): Promise<Record<string, ModelOptions>> {
    if (!this.cachedModels || Object.keys(this.cachedModels).length === 0) {
      const creds = (await this.getCredentials()) as TabbyCredentials;

      const endpoints = await withRetry(() => this.fetchEndpoints(creds), {
        maxRetries: 3,
        initialDelay: 1000,
      }).catch((error: Error) => {
        logger.error(`Failed to fetch endpoints: ${error.message}`);
        return [];
      });

      const chatEndpoint = endpoints.find(
        (e) => e.metadata?.pochi?.use_case === "chat",
      );
      if (!chatEndpoint) {
        logger.warn("No chat endpoint found");
        this.cachedModels = {};
        return this.cachedModels;
      }

      const provider = chatEndpoint?.metadata?.pochi?.provider;
      switch (provider) {
        case "openai":
          this.cachedModels = await this.fetchOpenAIModels(
            chatEndpoint.name,
            creds,
          );
          break;
        default:
          logger.warn(`Unsupported provider: ${provider}`);
          this.cachedModels = {};
          break;
      }
    }

    return this.cachedModels || {};
  }

  protected override async renewCredentials(
    credentials: PochiCredentials,
  ): Promise<PochiCredentials> {
    // Tabby does not need to renew the credentials
    return credentials;
  }

  protected override async fetchUserInfo(
    credentials: PochiCredentials,
  ): Promise<UserInfo> {
    const creds = credentials as TabbyCredentials;
    const response = await fetch(`${creds.url}/graphql`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${creds.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        operationName: "MeQuery",
        query: `query MeQuery {
  me {
    id
    email
    name
  }
}`,
      }),
    });

    const data = (await response.json()) as {
      data: { me: { id: string; email: string; name: string } };
    };

    const avatarUrl = `${creds.url}/avatar/${data.data.me.id}`;
    const avatarResponse = await fetch(avatarUrl, {
      method: "HEAD",
      headers: {
        Authorization: `Bearer ${creds.token}`,
      },
    });

    return {
      name: data.data.me.name,
      email: data.data.me.email,
      image: avatarResponse.status === 200 ? avatarUrl : undefined,
    };
  }
}
