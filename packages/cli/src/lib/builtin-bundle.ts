import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { getLogger } from "@getpochi/common";

const logger = getLogger("BuiltInBundle");

interface MaterializedBundle {
  skillsDir: string;
  agentsDir: string;
}

const SkillsPrefix = "skills__";
const AgentsPrefix = "agents__";
const PathSeparatorEncoding = "__";

type EmbeddedBlob = Blob & { name?: string };

interface ClassifiedBlob {
  blob: EmbeddedBlob;
  relativePath: string;
  kind: "skill" | "agent";
}

function getEmbeddedBlobs(): readonly EmbeddedBlob[] {
  const bunGlobal = (
    globalThis as { Bun?: { embeddedFiles?: readonly EmbeddedBlob[] } }
  ).Bun;
  return bunGlobal?.embeddedFiles ?? [];
}

function stripHashSuffix(stem: string): string {
  // Bun's default asset naming appends `-<hash>` before the extension. Drop
  // that suffix so the encoded prefix used at build time round-trips cleanly.
  return stem.replace(/-[a-z0-9]+$/i, "");
}

function classifyBlob(blob: EmbeddedBlob): ClassifiedBlob | undefined {
  const name = blob.name ?? "";
  if (!name.toLowerCase().endsWith(".md")) return undefined;

  const base = name.slice(name.lastIndexOf("/") + 1);
  const dotIdx = base.lastIndexOf(".");
  if (dotIdx <= 0) return undefined;
  const stem = stripHashSuffix(base.slice(0, dotIdx));
  const ext = base.slice(dotIdx);

  let kind: "skill" | "agent";
  let body: string;
  if (stem.startsWith(SkillsPrefix)) {
    kind = "skill";
    body = stem.slice(SkillsPrefix.length);
  } else if (stem.startsWith(AgentsPrefix)) {
    kind = "agent";
    body = stem.slice(AgentsPrefix.length);
  } else {
    return undefined;
  }

  const relativePath = `${body.split(PathSeparatorEncoding).join("/")}${ext}`;
  return { blob, relativePath, kind };
}

async function computeBundleHash(blobs: ClassifiedBlob[]): Promise<string> {
  const hash = createHash("sha256");
  const sorted = [...blobs].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind < b.kind ? -1 : 1;
    return a.relativePath < b.relativePath ? -1 : 1;
  });
  for (const item of sorted) {
    hash.update(item.kind);
    hash.update("\0");
    hash.update(item.relativePath);
    hash.update("\0");
    const buf = Buffer.from(await item.blob.arrayBuffer());
    hash.update(buf);
    hash.update("\0");
  }
  return hash.digest("hex").slice(0, 16);
}

async function materialize(
  blobs: ClassifiedBlob[],
): Promise<MaterializedBundle> {
  const digest = await computeBundleHash(blobs);
  const root = join(tmpdir(), `pochi-builtin-${digest}`);
  const skillsDir = join(root, "skills");
  const agentsDir = join(root, "agents");
  const marker = join(root, ".materialized");

  if (!existsSync(marker)) {
    logger.debug(`Materializing ${blobs.length} built-in files to ${root}`);
    mkdirSync(root, { recursive: true });
    for (const item of blobs) {
      const targetRoot = item.kind === "skill" ? skillsDir : agentsDir;
      const targetPath = join(targetRoot, item.relativePath);
      mkdirSync(dirname(targetPath), { recursive: true });
      const buf = Buffer.from(await item.blob.arrayBuffer());
      writeFileSync(targetPath, buf);
    }
    writeFileSync(marker, digest);
  }

  return { skillsDir, agentsDir };
}

let bundlePromise: Promise<MaterializedBundle | null> | undefined;

export function ensureBuiltInBundle(): Promise<MaterializedBundle | null> {
  if (!bundlePromise) {
    bundlePromise = (async () => {
      const blobs = getEmbeddedBlobs()
        .map(classifyBlob)
        .filter((item): item is ClassifiedBlob => item !== undefined);
      if (blobs.length === 0) return null;
      return materialize(blobs);
    })();
  }
  return bundlePromise;
}
