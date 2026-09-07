import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { type PastedTextFile, getPastedTextTitle } from "../base/message";
import { getTaskDataDir } from "./pochi-paths";

export async function persistPastedTextFiles(
  taskId: string,
  texts: readonly string[],
): Promise<PastedTextFile[]> {
  if (texts.length === 0) return [];

  const dir = path.join(getTaskDataDir(taskId), "pasted-texts");
  await fs.mkdir(dir, { recursive: true });

  return Promise.all(
    texts.map(async (text) => {
      const filePath = path.join(dir, `pasted-text-${randomUUID()}.txt`);
      await fs.writeFile(filePath, text, {
        encoding: "utf8",
        mode: 0o600,
        flag: "wx",
      });
      return {
        filePath,
        title: getPastedTextTitle(text),
      };
    }),
  );
}
