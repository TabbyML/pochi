import type { JSONSchema7 } from "@ai-sdk/provider";
import z from "zod";

export const makeWebFetch = (getToken: () => Promise<string>) => ({
  description: `
- Fetches content from a specified URL and converts HTML to markdown
- Use this tool when you need to retrieve and analyze web content

Usage notes:
  - IMPORTANT: If an MCP-provided web fetch tool is available, prefer using that tool instead of this one, as it may have fewer restrictions.
  - The URL must be a fully-formed valid URL
  - The prompt should describe what information you want to extract from the page
  - This tool is read-only and does not modify any files
  - Includes a self-cleaning 10-minute cache for faster responses when repeatedly accessing the same URL
`.trim(),
  inputSchema: {
    jsonSchema: z.toJSONSchema(
      z.object({
        url: z.url(),
      }),
    ) as JSONSchema7,
  },
  execute: async (args: { url: string }) => {
    const token = await getToken();
    const response = await fetch(
      "https://api-gateway.getpochi.com/https/r.jina.ai",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(args),
      },
    );
    if (response.ok) {
      const content = await response.text();
      return {
        content: [
          {
            type: "text",
            text: content,
          },
        ],
      };
    }

    throw new Error(`Failed to fetch: ${response.statusText}`);
  },
});
