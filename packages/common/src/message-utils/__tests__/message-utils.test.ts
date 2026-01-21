import { describe, it, expect } from "vitest";
import { parseTitle, prepareLastMessageForRetry } from "..";
import type { UIMessage } from "ai";

describe("message-utils", () => {
  describe("toUIMessageTitle", () => {

    it("should return the correct ui title with workflow", () => {
      const rawTitle: string = '<workflow id="test" path="test">test\nworkflow</workflow> rest';
      const expectedTitle: string = "/test rest";
      const result = parseTitle(rawTitle);
      expect(result).toEqual(expectedTitle);
    });

    it("should return the correct ui title with file", () => {
      const rawTitle: string = "<file>/path/to/file</file> rest";
      const expectedTitle: string = "/path/to/file rest";
      const result = parseTitle(rawTitle);
      expect(result).toEqual(expectedTitle);
    });
  });

  describe("prepareLastMessageForRetry", () => {
    it("should keep last step", () => {
      const lastMessage: UIMessage = {
        "id": "a8ed4356-72ab-487a-9bb4-b98d61948eba",
        "metadata": {
          "kind": "assistant",
          "totalTokens": 22485,
          "finishReason": "stop"
        },
        "role": "assistant",
        "parts": [
          {
            "type": "step-start"
          },
          {
            "type": "text",
            "text": "Let me check the diff for a better understanding of the changes:\n\n",
            "state": "done"
          },
          {
            "type": "tool-executeCommand",
            "toolCallId": "call_defb0cfc20e415b9",
            "state": "output-available",
            "input": {
              "command": "git diff main..fix/diff-view-path-resolution | head -50"
            },
            "output": {
              "output": "diff --git a/packages/common/src/constants.ts b/packages/common/src/constants.ts\r\nindex f6a814b3..1a22fdd5 100644\r\n--- a/packages/common/src/constants.ts\r\n+++ b/packages/common/src/constants.ts\r\n@@ -1,7 +1,7 @@\r\n /**\r\n  * Known XML tags that should be preserved during processing\r\n  */\r\n-export const KnownTags = [\"file\", \"workflow\"] as const;\r\n+export const KnownTags = [\"file\", \"workflow\", \"compact\"] as const;\r\n \r\n const SandboxHome = \"/home/pochi\";\r\n const SandboxLogDir = `${SandboxHome}/.log`;\r\ndiff --git a/packages/common/src/message-utils.ts b/packages/common/src/message-utils.ts\r\nindex 0b37d038..55880a0a 100644\r\n--- a/packages/common/src/message-utils.ts\r\n+++ b/packages/common/src/message-utils.ts\r\n@@ -22,7 +22,7 @@ function escapeUnknownXMLTags(message: string): string {\r\n }\r\n \r\n export function parseTitle(title: string | null) {\r\n-  if (!title) return \"(Untitled)\";\r\n+  if (!title?.trim()) return \"(Untitled)\";\r\n \r\n   const formatXMLTags = (ast: Root) => {\r\n     function processNode(node: Parent) {\r\n@@ -50,7 +50,7 @@ export function parseTitle(title: string | null) {\r\n \r\n   const hast = rehype().parse(escapeUnknownXMLTags(title));\r\n   formatXMLTags(hast);\r\n-  return toText(hast).slice(0, 256);\r\n+  return toText(hast).slice(0, 256) || \"(Untitled)\";\r\n }\r\n \r\n export function hasAttemptCompletion(message: UIMessage): boolean {\r\ndiff --git a/packages/livekit/src/chat/compact-task.ts b/packages/livekit/src/chat/compact-task.ts\r\nindex f34bc418..6894fa78 100644\r\n--- a/packages/livekit/src/chat/compact-task.ts\r\n+++ b/packages/livekit/src/chat/compact-task.ts\r\n@@ -5,23 +5,37 @@ import { requestLLM } from \"./llm\";\r\n export async function compactTask({\r\n   getLLM,\r\n   messages,\r\n-}: { getLLM: () => Promise<RequestData[\"llm\"]>; messages: Message[] }) {\r\n+  overwrite,\r\n+}: {\r\n+  getLLM: () => Promise<RequestData[\"llm\"]>;\r\n+  messages: Message[];\r\n+  overwrite: boolean;\r\n+}): Promise<string | undefined> {\r\n",
              "isTruncated": false
            }
          },
          {
            "type": "step-start"
          },
          {
            "type": "text",
            "text": "Let me check if we need to push the current branch first:\n\n",
            "state": "streaming"
          },
          {
            "type": "tool-executeCommand",
            "toolCallId": "call_40b5642fd5df5c63",
            "state": "input-streaming",
            "input": null
          }
        ]
      }

      const before = lastMessage?.parts.filter((part) => part.type === "step-start").length || 0;
      expect(before).toBe(2);
      const message = prepareLastMessageForRetry(lastMessage)
      const after = message?.parts.filter((part) => part.type === "step-start").length || 0;
      expect(after).toBe(1);
    })
  })
})