import type { JSONSchema7 } from "@ai-sdk/provider";
import z from "zod";

export const makeWebSearch = (getToken: () => Promise<string>) => ({
  description: `
- Allows Pochi to search the web and use the results to inform responses
- Provides up-to-date information for current events and recent data
- Returns search result information formatted as search result blocks, including links as markdown hyperlinks
- Searches are performed automatically within a single API call

CRITICAL REQUIREMENT - You MUST follow this:
  - After answering the user's question, you MUST include a "Sources:" section at the end of your response
  - In the Sources section, list all relevant URLs from the search results as markdown hyperlinks: [Title](URL)
  - This is MANDATORY - never skip including sources in your response
  - Example format:

    [Your answer here]

    Sources:
    - [Source Title 1](https://example.com/1)
    - [Source Title 2](https://example.com/2)

Usage notes:
  - Account for "Today's date" in <system-reminder>. For example, if <system-reminder> says "Today's date: 2025-07-01", and the user wants the latest docs, do not use 2024 in the search query. Use 2025.
  - To research several related facets in one round-trip, pass "query" as an array of up to 5 query strings instead of a single string. Prefer a single string for focused lookups.
`.trim(),
  inputSchema: {
    jsonSchema: z.toJSONSchema(
      z.object({
        query: z
          .union([z.string().min(2), z.array(z.string().min(2)).min(1).max(5)])
          .describe(
            "A single search query string, OR an array of up to 5 related query strings to batch in one request. Prefer a single string for focused lookups; use an array when you want to research several related facets in one call.",
          ),
        country: z
          .string()
          .optional()
          .describe(
            "Country code to filter search results by, e.g. 'US', 'GB', 'JP'",
          ),
        searchDomainFilter: z
          .array(z.string())
          .optional()
          .describe(
            "List of domains to filter search results. Use allowlist mode (e.g. ['github.com', 'stackoverflow.com']) to include only those domains, or denylist mode (e.g. ['-reddit.com', '-pinterest.com']) to exclude domains. Cannot mix both modes. Maximum 20 domains.",
          ),
      }),
    ) as JSONSchema7,
  },
  execute: async (args: {
    query: string | string[];
    country?: string;
    searchDomainFilter?: string[];
  }) => {
    const { searchDomainFilter, ...rest } = args;
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
          ...rest,
          ...(searchDomainFilter && searchDomainFilter.length > 0
            ? { search_domain_filter: searchDomainFilter }
            : {}),
          max_tokens_per_page: 256,
        }),
      },
    );
    if (response.ok) {
      const { results } = (await response.json()) as SearchResults;
      if (results.length === 0) {
        throw new Error("No results found");
      }
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
