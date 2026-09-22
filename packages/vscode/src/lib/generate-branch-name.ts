import { getVendor } from "@getpochi/common/vendor";
import { createModel } from "@getpochi/common/vendor/edge";
import "@getpochi/vendor-pochi/edge";
import {
  type CallSettings,
  type ModelMessage,
  type Prompt,
  generateText,
} from "ai";
import { getLogger } from "../lib/logger";

const logger = getLogger("GenerateBranchName");

let model: ReturnType<typeof createModel> | undefined = undefined;

export async function generateBranchName(params: {
  prompt: string;
  files?: {
    name: string;
    contentType: string;
    url: string;
  }[];
  existingBranches?: string[];
  abortSignal?: AbortSignal | undefined;
}): Promise<string | undefined> {
  if (!model) {
    model = createBranchNameModel();
  }

  const message: ModelMessage = {
    role: "user",
    content: [
      ...(params.files?.flatMap((file) => {
        return [
          {
            type: "text" as const,
            text: `Attached file: ${file.name}`,
          },
          {
            type: "file" as const,
            data: file.url,
            filename: file.name,
            mediaType: file.contentType,
          },
        ];
      }) ?? []),
      ...(params.existingBranches && params.existingBranches.length > 0
        ? [
            {
              type: "text" as const,
              text: formatPlaceholders(UserPrompt.branches, {
                branches: params.existingBranches.join("\n"),
              }),
            },
          ]
        : []),
      {
        type: "text" as const,
        text: formatPlaceholders(UserPrompt.prompt, {
          message: params.prompt,
        }),
      },
    ],
  };

  const request: CallSettings & Prompt = {
    system: SystemPrompt,
    messages: [message],
    maxOutputTokens: 1024,
    stopSequences: ["\n", " "],
  };

  const result = await generateText({
    ...request,
    model,
    providerOptions: {
      google: {
        thinkingConfig: {
          thinkingLevel: "minimal",
        },
      },
    },
    abortSignal: params.abortSignal,
  });

  logger.info("Gen branch name response:", {
    modelId: ModelId,
    text: result.text,
    finishReason: result.finishReason,
    inputTokens: result.usage.inputTokens,
    outputTokens: result.usage.outputTokens,
    reasoningTokens: result.usage.outputTokenDetails.reasoningTokens,
  });

  if (result.finishReason !== "stop") {
    return undefined;
  }
  if (result.text.length < MinChars || result.text === NoResultTag) {
    return undefined;
  }
  return result.text;
}

function formatPlaceholders(
  template: string,
  replacements: Record<string, string>,
): string {
  const patterns = Object.keys(replacements)
    .map((key) => `{{${key}}}`)
    .join("|");
  const regexp = new RegExp(patterns, "g");
  return template.replace(regexp, (pattern: string) => {
    const key = pattern.slice(2, -2);
    return replacements[key] ?? "";
  });
}

function createBranchNameModel() {
  return createModel("pochi", {
    modelId: ModelId,
    getCredentials: () => getVendor("pochi").getCredentials(),
  });
}

const MinChars = 5;
const MaxChars = 32;
const NoResultTag = "no-branch-name-generated";

const SystemPrompt = `You are an AI that generates concise git branch names. Create a short, descriptive branch name based on the user's request.

### Rules
1.  **Analyze Intent**: Understand the core coding task from the user message and attachments.
2.  **Format**: Use \`type/description\` format.
    *   **type**: Choose one: \`feat\`, \`fix\`, \`docs\`, \`style\`, \`refactor\`, \`test\`, \`chore\`.
    *   **description**: 2-4 words max, connected by hyphens. Use abbreviations when needed.
3.  **Length**: Must be ${MinChars}-${MaxChars} characters total. Keep it SHORT.
4.  **Style**: If existing branches are provided, match their style.
5.  **No Duplicates**: Don't use existing branch names from the provided list.
6.  **Non-Tasks**: If the message isn't a coding task, respond with \`${NoResultTag}\`.

### Examples
*   "Add user profile endpoint" → \`feat/user-profiles\`
*   "Fix login crash on wrong password" → \`fix/login-crash\`
*   "Update README documentation" → \`docs/readme\`
*   "Refactor auth module" → \`refactor/auth\`

### Output
Only output the branch name in plaintext, no markdown or explanations.
`;

const UserPrompt = {
  branches: `List of branches:

{{branches}}
`,
  prompt: `User Message:

{{message}}
`,
};

const ModelId = "google/gemini-3.5-flash";
