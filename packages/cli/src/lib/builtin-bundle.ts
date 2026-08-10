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

const SkillsMarker = "/skills/";
const AgentsMarker = "/agents/";

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

function classifyBlob(blob: EmbeddedBlob): ClassifiedBlob | undefined {
  const name = blob.name ?? "";
  const skillIdx = name.lastIndexOf(SkillsMarker);
  const agentIdx = name.lastIndexOf(AgentsMarker);

  if (skillIdx !== -1 && skillIdx > agentIdx) {
    return {
      blob,
      relativePath: name.slice(skillIdx + SkillsMarker.length),
      kind: "skill",
    };
  }

  if (!name.toLowerCase().endsWith(".md")) return undefined;

  if (agentIdx !== -1) {
    return {
      blob,
      relativePath: name.slice(agentIdx + AgentsMarker.length),
      kind: "agent",
    };
  }
  return undefined;
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
