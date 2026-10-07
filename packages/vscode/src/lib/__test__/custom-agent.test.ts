import assert from "assert";
import "reflect-metadata";
import { ModelRegistry } from "@getpochi/common";
import { signal } from "@preact/signals-core";
import * as vscode from "vscode";
import type { PochiConfiguration } from "../../integrations/configuration";
import { CustomAgentManager } from "../custom-agent";
import type { WorkspaceScope } from "../workspace-scoped";

describe("CustomAgentManager", () => {
  let extensionUri: vscode.Uri;
  let manager: CustomAgentManager | undefined;

  beforeEach(async () => {
    extensionUri = vscode.Uri.file(
      `/tmp/pochi-custom-agent-test-${Date.now()}-${Math.random()}`,
    );
    await vscode.workspace.fs.createDirectory(
      vscode.Uri.joinPath(extensionUri, "assets", "agents"),
    );
  });

  afterEach(async () => {
    manager?.dispose();
    manager = undefined;
    await vscode.workspace.fs.delete(extensionUri, {
      recursive: true,
      useTrash: false,
    });
  });

  async function loadExploreAgent(frontmatter: string) {
    await vscode.workspace.fs.writeFile(
      vscode.Uri.joinPath(extensionUri, "assets", "agents", "explore.md"),
      new TextEncoder().encode(
        `---\nname: explore\ndescription: Explore agent\n${frontmatter}---\n\nExplore instructions.`,
      ),
    );

    manager = new CustomAgentManager(
      { cwd: undefined } as unknown as WorkspaceScope,
      { advancedSettings: signal({}) } as unknown as PochiConfiguration,
      { extensionUri } as vscode.ExtensionContext,
    );

    for (let i = 0; i < 50; i++) {
      const agent = manager.agents.value.find((x) => x.name === "explore");
      if (agent) return agent;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error("[Test Debug] explore agent was not loaded");
  }

  it("should pin built-in agent models from the model registry", async () => {
    const agent = await loadExploreAgent("");
    assert.strictEqual(agent.model, ModelRegistry.builtinAgents.explore);
    assert.strictEqual(agent.isBuiltIn, true);
  });

  it("should prefer the model declared in built-in agent frontmatter", async () => {
    const agent = await loadExploreAgent("model: custom/model\n");
    assert.strictEqual(agent.model, "custom/model");
  });
});
