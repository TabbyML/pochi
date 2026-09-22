import { mkdtemp, readFile as readFileFromDisk, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  BackgroundCommandRunningHint,
  FileStateCache,
  FileUnchangedStub,
} from "@getpochi/common/tool-utils";
import { describe, expect, it } from "vitest";
import {
  createTestCliAdaptor,
  nextCommandResult,
} from "../../lib/__tests__/cli-adaptor";
import { LocalFileSystem } from "../../lib/file-system";
import type { ToolCallOptions } from "../../types";
import { readFile } from "../read-file";

const toolExecutionOptions = {
  toolCallId: "test-call-id",
  messages: [],
  cwd: process.cwd(),
};

function createReadFile(adaptor: ToolCallOptions["adaptor"]) {
  const options: ToolCallOptions = {
    taskId: "test-task",
    rg: "rg",
    fileSystem: new LocalFileSystem(process.cwd()),
    fileStateCache: new FileStateCache(),
    blobStore: {} as never,
    backgroundJobManager: {} as never,
    adaptor,
  };
  return readFile(options);
}

async function waitForOutput(outputFile: string, marker: string) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const content = await readFileFromDisk(outputFile, "utf8").catch(() => "");
    if (content.includes(marker)) return content;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for "${marker}" in ${outputFile}`);
}

function textContent(result: Awaited<ReturnType<ReturnType<typeof readFile>>>) {
  if (result.type === "media") throw new Error("Unexpected media result.");
  return result.content;
}

describe("readFile background command status", () => {
  it("reports liveness for a managed background command transcript", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "pochi-cli-read-file-"));
    // Mirror the production transcript layout: <task data>/background-jobs/.
    const adaptor = createTestCliAdaptor({
      commandOutputDir: join(outputDir, "background-jobs"),
    });
    try {
      const script =
        "process.stdout.write('tick\\n');setInterval(() => {}, 1000);";
      const { backgroundJobId, outputFile } = adaptor.startBackgroundCommand(
        "test-task",
        `${JSON.stringify(process.execPath)} -e ${JSON.stringify(script)}`,
        process.cwd(),
      );
      await waitForOutput(outputFile, "tick");

      const read = createReadFile(adaptor);

      const running = textContent(
        await read({ path: outputFile }, toolExecutionOptions),
      );
      expect(running).toContain("tick");
      expect(running.startsWith(BackgroundCommandRunningHint)).toBe(true);

      // An unchanged transcript must still report that the command is active.
      const unchanged = textContent(
        await read({ path: outputFile }, toolExecutionOptions),
      );
      expect(unchanged).toContain(FileUnchangedStub);
      expect(unchanged.startsWith(BackgroundCommandRunningHint)).toBe(true);

      const finished = nextCommandResult(adaptor, "test-task");
      await adaptor.commandAdaptor.kill(backgroundJobId);
      await finished;

      // Completion is reported by the notification, never by the read.
      const stopped = textContent(
        await read({ path: outputFile }, toolExecutionOptions),
      );
      expect(stopped).not.toContain(BackgroundCommandRunningHint);
    } finally {
      await adaptor.stopBackgroundCommands();
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  it("leaves ordinary files and unmanaged transcripts untouched", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "pochi-cli-read-file-"));
    const adaptor = createTestCliAdaptor({ commandOutputDir: outputDir });
    try {
      const fileSystem = new LocalFileSystem(process.cwd());
      await fileSystem.writeFile(join(outputDir, "notes.txt"), "plain content");
      await fileSystem.writeFile(
        join(outputDir, "terminals", "term-unknown.log"),
        "terminal content",
      );

      const read = createReadFile(adaptor);

      expect(
        textContent(
          await read({ path: join(outputDir, "notes.txt") }, toolExecutionOptions),
        ),
      ).toBe("plain content");
      expect(
        textContent(
          await read(
            { path: join(outputDir, "terminals", "term-unknown.log") },
            toolExecutionOptions,
          ),
        ),
      ).toBe("terminal content");
    } finally {
      await adaptor.stopBackgroundCommands();
      await rm(outputDir, { recursive: true, force: true });
    }
  });
});
