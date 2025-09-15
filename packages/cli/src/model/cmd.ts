import type { Command } from "@commander-js/extra-typings";
import { pochiConfig } from "@getpochi/common/configuration";
import type { CustomModelSetting } from "@getpochi/common/configuration";
import type { ModelOptions } from "@getpochi/common/vendor";
import { getVendors } from "@getpochi/common/vendor";
import chalk from "chalk";

// Format context window size for better readability
function formatContextWindow(size: number): string {
  const formatSize = () => {
    if (size >= 1000 * 1000) {
      return `${(size / (1000 * 1000)).toFixed(0)}M`;
    }

    if (size >= 1000) {
      return `${(size / 1000).toFixed(0)}K`;
    }

    return size.toString();
  };

  return `C ${chalk.cyan(formatSize())}`;
}

function formatToolCall(useToolCallMiddleware: boolean) {
  if (useToolCallMiddleware) {
    return `\tReAct ${chalk.green("✓")}`;
  }
  return "";
}

export function registerModelCommand(program: Command) {
  const modelCommand = program
    .command("model")
    .description("Manage and list available AI models.")
    .addHelpCommand(true);

  modelCommand
    .command("list", { isDefault: true })
    .description(
      "List all supported models from configured vendors and providers.",
    )
    .action(async () => {
      const vendors = getVendors();

      // Display models from all vendors
      for (const [vendorId, vendor] of Object.entries(vendors)) {
        if (vendor.authenticated) {
          const models = await vendor.fetchModels();
          displayModels(vendorId, models);
        }
      }

      // Display models from configuration providers
      const providers = pochiConfig.value.providers;
      if (providers) {
        for (const [providerId, provider] of Object.entries(providers)) {
          displayProviderModels(providerId, provider);
        }
      }
    });
}

function displayModels(vendorId: string, models: Record<string, ModelOptions>) {
  if (Object.keys(models).length === 0) {
    console.log(chalk.yellow(`No models found for ${vendorId}`));
    console.log();
    return;
  }

  console.log(chalk.yellow.underline(vendorId));
  console.log();

  // Sort models by ID for consistent display
  const sortedModelEntries = Object.entries(models).sort(([a], [b]) =>
    a.localeCompare(b),
  );

  for (const [modelId, modelInfo] of sortedModelEntries) {
    // Display model ID with proper alignment
    const padding = " ".repeat(
      Math.max(0, 35 - (modelInfo?.contextWindow ? modelId.length : 0)),
    );

    // Display context window size
    const contextWindow = modelInfo.contextWindow
      ? formatContextWindow(modelInfo.contextWindow)
      : "";

    console.log(
      `  ${modelId}${padding}${contextWindow}${formatToolCall(!!modelInfo.useToolCallMiddleware)}`,
    );
  }
  console.log();
}

function displayProviderModels(
  providerId: string,
  provider: CustomModelSetting,
) {
  const { models } = provider;
  if (Object.keys(models).length === 0) {
    console.log(chalk.yellow(`No models found for provider ${providerId}`));
    console.log();
    return;
  }

  console.log(
    `${chalk.underline(providerId)} ${chalk.gray(`[${provider.kind || "openai"}]`)}`,
  );
  console.log();

  // Sort models by ID for consistent display
  const sortedModelEntries = Object.entries(models).sort(([a], [b]) =>
    a.localeCompare(b),
  );

  for (const [modelId, modelInfo] of sortedModelEntries) {
    // Display model ID with proper alignment
    const padding = " ".repeat(
      Math.max(0, 35 - (modelInfo?.contextWindow ? modelId.length : 0)),
    );

    // Display context window size
    const contextWindow = modelInfo.contextWindow
      ? formatContextWindow(modelInfo.contextWindow)
      : "";

    console.log(
      `  ${modelId}${padding}${contextWindow}${formatToolCall(!!modelInfo.useToolCallMiddleware)}`,
    );
  }
  console.log();
}
