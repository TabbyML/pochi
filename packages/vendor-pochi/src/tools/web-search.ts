import type { JSONSchema7 } from "@ai-sdk/provider";
import z from "zod/v4";

export const makeWebSearch = (getToken: () => Promise<string>) => ({
  description: `
- Allows Pochi to search the web and use the results to inform responses
- Provides up-to-date information for current events and recent data
- Returns search result information formatted as search result blocks
- Searches are performed automatically within a single API call
`.trim(),
  inputSchema: {
    jsonSchema: z.toJSONSchema(
      z.object({
        query: z.string().describe("The search query to perform"),
        country: z
          .string()
          .optional()
          .describe(
            "Country code to filter search results by, e.g. 'US', 'GB', 'JP'",
          ),
      }),
    ) as JSONSchema7,
  },
  execute: async (args: { query: string; country?: string }) => {
    const token = await getToken();
    const response = await fetch(
      "https://api-gateway.getpochi.com/https/api.perplexity.ai/search",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...args,
          max_tokens_per_page: 256,
        }),
      },
    );
    if (response.ok) {
      const { results } = (await response.json()) as SearchResults;
      return {
        content: results.map((result) => ({
          type: "text",
          text: `# ${result.title}\ncreated: ${result.date}, last updated: ${result.last_updated}, [Read more](${result.url})\n\n${result.snippet}`,
        })),
      };
    }

    throw new Error(`Failed to fetch: ${response.statusText}`);
  },
});

type SearchResults = {
  results: {
    title: string;
    url: string;
    snippet: string;
    date: string;
    last_updated: string;
  }[];
};
