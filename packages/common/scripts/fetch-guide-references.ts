import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const AgentsDir = join(import.meta.dirname, "..", "src/base/agents");
const ReferencesDir = join(AgentsDir, "guide", "references");

const Urls = {
  docs: "https://docs.getpochi.com/llms.txt",
  schema: "https://getpochi.com/config.schema.json",
} as const;

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch ${url}: ${response.status} ${response.statusText}`,
    );
  }
  return response.text();
}

function renderConfigSchemaMarkdown(schemaJson: string): string {
  return `## Configuration Schema

\`~/.pochi/config.jsonc\` uses JSONC format (JSON with comments).

\`\`\`json
${JSON.stringify(JSON.parse(schemaJson), null, 2)}
\`\`\`
`;
}

async function main() {
  console.log("Fetching guide references...");

  mkdirSync(ReferencesDir, { recursive: true });

  console.log(`  Fetching ${Urls.docs}...`);
  const docs = await fetchText(Urls.docs);
  console.log(`  Fetching ${Urls.schema}...`);
  const schemaJson = await fetchText(Urls.schema);

  writeFileSync(join(ReferencesDir, "llms-txt.md"), docs, "utf-8");
  console.log(`  Saved to ${join(ReferencesDir, "llms-txt.md")}`);

  writeFileSync(
    join(ReferencesDir, "config-schema.md"),
    renderConfigSchemaMarkdown(schemaJson),
    "utf-8",
  );
  console.log(`  Saved to ${join(ReferencesDir, "config-schema.md")}`);

  console.log("Done!");
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
