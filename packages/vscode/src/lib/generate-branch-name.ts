import { createVertexWithoutCredentials } from "@ai-sdk/google-vertex/edge";
import { getVendor } from "@getpochi/common/vendor";
import type { PochiCredentials } from "@getpochi/common/vscode-webui-bridge";
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
    model = createModel();
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
    maxOutputTokens: 64,
    stopSequences: ["\n", " "],
  };

  logger.trace("Gen branch name request:", request);

  const result = await generateText({
    ...request,
    model,
    abortSignal: params.abortSignal,
  });

  logger.trace("Gen branch name response:", result.response.body);

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

const patchString = (str: string) => {
  return str.replace("/publishers/google/models", "/endpoints");
};

function createModel() {
  const vertexModel = createVertexWithoutCredentials({
    project: "placeholder",
    location: "placeholder",
    baseURL:
      "https://api-gateway.getpochi.com/https/us-central1-aiplatform.googleapis.com/v1/projects/gen-lang-client-0005535210/locations/us-central1/publishers/google",
    fetch: async (
      requestInfo: Request | URL | string,
      requestInit?: RequestInit,
    ) => {
      const { jwt } = (await getVendor(
        "pochi",
      ).getCredentials()) as PochiCredentials;
      const headers = new Headers(requestInit?.headers);
      headers.append("Authorization", `Bearer ${jwt}`);
      const patchedRequestInit = {
        ...requestInit,
        headers,
      };

      let finalUrl: URL;
      if (requestInfo instanceof URL) {
        finalUrl = new URL(requestInfo);
        finalUrl.pathname = patchString(finalUrl.pathname);
      } else if (requestInfo instanceof Request) {
        const patchedUrl = patchString(requestInfo.url);
        finalUrl = new URL(patchedUrl);
      } else if (typeof requestInfo === "string") {
        const patchedUrl = patchString(requestInfo);
        finalUrl = new URL(patchedUrl);
      } else {
        throw new Error(`Unexpected requestInfo type: ${typeof requestInfo}`);
      }
      return fetch(finalUrl, patchedRequestInit);
    },
  })(ModelId);
  return vertexModel;
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

// FIXME(zhiming): This is the nes model, change this to a common model or a model tuned for branch name
const ModelId = "654670113898758144";
