import * as crypto from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { expect, test } from "../../fixtures";

test.use({ workspace: "git" });

test("reads, creates, and edits workspace files with built-in file tools", async ({
  pochi,
  workspacePath,
}) => {
  if (!workspacePath) throw new Error("expected workspacePath");

  const token = `CHANNEL_${crypto.randomUUID().slice(0, 8)}`;
  const srcDir = path.join(workspacePath, "src");
  await fs.mkdir(srcDir, { recursive: true });
  await fs.writeFile(
    path.join(srcDir, "config.ts"),
    `export const releaseChannel = "${token}";\n`,
  );
  await fs.writeFile(
    path.join(srcDir, "banner.ts"),
    [
      "export const bannerConfig = {",
      '  id: "release-banner",',
      '  title: "Pochi Draft",',
      "  enabled: false,",
      "  dismissible: true,",
      "};",
      "",
    ].join("\n"),
  );

  await pochi.selectModel({ group: "Swift" });
  await pochi.sendMessage(
    "Read src/config.ts and src/banner.ts with readFile, create src/summary.txt with writeToFile containing the releaseChannel value from src/config.ts, and update src/banner.ts with applyDiff so enabled is true while keeping the other fields unchanged.",
  );

  await pochi.waitForTaskFinish();

  await expect(pochi.toolCalls("readFile").first()).toHaveAttribute(
    "data-tool-state",
    "output-available",
  );
  await expect(pochi.toolCalls("writeToFile").first()).toHaveAttribute(
    "data-tool-state",
    "output-available",
  );
  await expect(pochi.toolCalls("applyDiff").first()).toHaveAttribute(
    "data-tool-state",
    "output-available",
  );

  await expect
    .poll(() =>
      fs
        .readFile(path.join(srcDir, "summary.txt"), "utf8")
        .catch(() => undefined),
    )
    .toContain(token);

  const updatedBanner = await fs.readFile(
    path.join(srcDir, "banner.ts"),
    "utf8",
  );
  expect(updatedBanner).toContain('title: "Pochi Draft"');
  expect(updatedBanner).toContain("enabled: true");
  expect(updatedBanner).not.toContain("enabled: false");
});
