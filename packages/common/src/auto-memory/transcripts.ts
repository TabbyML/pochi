import fs from "node:fs/promises";
import path from "node:path";
import type { AutoMemoryDreamCandidate } from "../base";
import { parseMarkdownWithFrontmatter } from "../tool-utils/markdown-frontmatter";

export async function listTranscriptCandidates(
  transcriptDir: string,
  { requireComplete = false } = {},
): Promise<AutoMemoryDreamCandidate[]> {
  const entries = await fs
    .readdir(transcriptDir, { withFileTypes: true })
    .catch((error) => {
      if (error.code === "ENOENT") return [];
      throw error;
    });
  const candidates = new Map<string, AutoMemoryDreamCandidate>();
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    const filePath = path.join(transcriptDir, entry.name);
    const parsed = await parseMarkdownWithFrontmatter(filePath, async () => {
      // Read only the metadata header: a complete transcript can be large.
      const file = await fs.open(filePath, "r");
      try {
        const lines: string[] = [];
        for await (const line of file.readLines()) {
          if (lines.length === 0 && line !== "---") return "";
          lines.push(line);
          if (lines.length > 1 && line === "---") return lines.join("\n");
        }
        return "";
      } finally {
        await file.close();
      }
    });
    if (!parsed.ok) {
      // Malformed transcripts are not candidates. An I/O error makes the
      // listing incomplete, so do not persist it over the last good index.
      if (requireComplete && parsed.error === "readError")
        throw new Error(parsed.message);
      continue;
    }
    const { taskId, cwd, title, updatedAt } = parsed.frontmatter;
    if (typeof taskId !== "string" || !taskId) continue;
    const timestamp =
      updatedAt instanceof Date
        ? updatedAt.getTime()
        : typeof updatedAt === "string"
          ? Date.parse(updatedAt)
          : Number.NaN;
    if (!Number.isFinite(timestamp)) continue;
    const existing = candidates.get(taskId);
    if (existing && existing.updatedAt >= timestamp) continue;
    candidates.set(taskId, {
      taskId,
      updatedAt: timestamp,
      cwd: typeof cwd === "string" ? cwd : undefined,
      title: typeof title === "string" ? title : undefined,
      transcriptFilename: entry.name,
    });
  }
  return [...candidates.values()];
}
