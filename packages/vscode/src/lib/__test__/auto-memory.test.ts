import * as assert from "node:assert";
import { describe, it } from "mocha";
import { sanitizeMemoryRepoKey } from "../auto-memory";

describe("long-term memory helpers", () => {
  it("creates stable filesystem-safe repo keys", () => {
    const key = sanitizeMemoryRepoKey("/Users/test/project repo");

    assert.match(key, /^[A-Za-z0-9._-]+-[a-f0-9]{10}$/);
    assert.ok(key.includes("project-repo"));
  });
});
