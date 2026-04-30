import * as assert from "node:assert";
import { describe, it } from "mocha";
import { sanitizeMemoryRepoKey } from "../auto-memory";

describe("long-term memory helpers", () => {
  it("creates stable filesystem-safe repo keys from the project basename", () => {
    const key = sanitizeMemoryRepoKey("/Users/test/project repo");

    assert.match(key, /^[A-Za-z0-9._-]+-[a-f0-9]{10}$/);
    // Basename-only slug — parent directories are encoded in the hash.
    assert.ok(key.startsWith("project-repo-"));
    assert.ok(!key.includes("Users"));
  });

  it("disambiguates same-basename repos via the hash suffix", () => {
    const a = sanitizeMemoryRepoKey("/Users/me/work/pochi");
    const b = sanitizeMemoryRepoKey("/Users/me/oss/pochi");

    assert.ok(a.startsWith("pochi-"));
    assert.ok(b.startsWith("pochi-"));
    assert.notStrictEqual(a, b);
  });

  it("caps the slug length and falls back to 'repo' for empty basenames", () => {
    const long = sanitizeMemoryRepoKey(`/tmp/${"x".repeat(100)}`);
    assert.match(long, /^x{1,32}-[a-f0-9]{10}$/);

    const root = sanitizeMemoryRepoKey("/");
    assert.match(root, /^repo-[a-f0-9]{10}$/);
  });
});
