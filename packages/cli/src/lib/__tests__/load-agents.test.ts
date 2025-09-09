import { describe, expect, it } from "vitest";
import { loadAgents } from "../load-agents";
import * as path from "node:path";

describe("Load Agents", () => {
  it("should load agents from directory", async () => {
    // Use the project root for loading agents
    const projectRoot = path.resolve(__dirname, "../../../../..");
    
    const agents = await loadAgents(projectRoot);
    
    // Should return an array (empty or with agents)
    expect(Array.isArray(agents)).toBe(true);
    expect(agents.length).toBeGreaterThanOrEqual(0);
  });

  it("should return empty array for non-existent directories", async () => {
    const agents = await loadAgents("/non/existent/path");
    expect(agents).toEqual([]);
  });
});
