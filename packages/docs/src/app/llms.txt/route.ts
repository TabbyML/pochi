import { source } from "@/lib/source";
import { getLLMText } from "@/lib/get-llm-text";

// cached forever
export const revalidate = false;

export async function GET() {
  const scan = source
    .getPages()
    // exclude developer-updates and tutorials from LLM context
    .filter((page) => !page.url.includes("/developer-updates") && !page.url.includes("/tutorials"))
    .map(getLLMText);
  const scanned = await Promise.all(scan);

  return new Response(scanned.join("\n\n"));
}
