import { formatPlaceholders } from "@/code-completion/utils/strings";
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

  logger.trace("Completion response:", result.response.body);

  if (result.finishReason !== "stop") {
    return undefined;
  }
  if (result.text.length < MinChars || result.text === NoResultTag) {
    return undefined;
  }
  return result.text;
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
const NoResultTag = "no-branch-name-generated";

const SystemPrompt = `You are an AI coding assistant that helps generate git branch names. Your goal is to create a concise, descriptive, and well-formatted branch name based on the user's request.

### Rules
1.  **Analyze Intent**: Analyze the user message and any attachments to understand the core coding task.
2.  **Follow Naming Convention**: Generate a branch name using the \`type/short-description\` format (e.g., \`feat/add-user-authentication\`).
    *   **type**: Use one of the following: \`feat\`, \`fix\`, \`docs\`, \`style\`, \`refactor\`, \`test\`, \`chore\`.
    *   **short-description**: A few words connected by hyphens.
3.  **Length Requirement**: The generated branch name must be longer than ${MinChars} characters.
4.  **Mimic Existing Style**: If a list of current branch names is provided, follow their naming style and conventions.
5.  **Avoid Duplicates**: Do not generate a name that already exists in the provided list of branches.
6.  **Handle Non-Tasks**: If the user message is a general question or has no clear coding task, respond with \`${NoResultTag}\`.

### Examples

**Example 1: User message is about adding a new feature**
*   **User Message**: "Can you add a new endpoint to fetch user profiles?"
*   **Generated Branch Name**: \`feat/get-user-profiles-endpoint\`

**Example 2: User message is about fixing a bug**
*   **User Message**: "The login page is crashing when I enter a wrong password."
*   **Generated Branch Name**: \`fix/login-page-crash-on-wrong-password\`

### Output Format
Only respond with the git branch name in plaintext, without markdown formatting or any additional explanations.
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
