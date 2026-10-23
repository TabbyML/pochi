import * as assert from "node:assert";
import { Deferred } from "@/lib/defered";
import type { WorkspaceScope } from "@/lib/workspace-scoped";
import { afterEach, beforeEach, describe, it } from "mocha";
import * as sinon from "sinon";
import type * as vscode from "vscode";
import { CheckpointService } from "../checkpoint-service";
import { ShadowGitRepo } from "../shadow-git-repo";

describe("CheckpointService", () => {
  let service: CheckpointService;
  let shadowGit: sinon.SinonStubbedInstance<ShadowGitRepo>;
  let clock: sinon.SinonFakeTimers;

  beforeEach(() => {
    clock = sinon.useFakeTimers({
      toFake: ["setTimeout", "clearTimeout"],
    });
    shadowGit = sinon.createStubInstance(ShadowGitRepo);
    shadowGit.getLatestCommitHash.resolves("old-checkpoint");
    shadowGit.hasStagedChanges.resolves(true);
    shadowGit.pruneCheckpoints.resolves(false);
    shadowGit.stageAll.resolves(true);
    shadowGit.commit.resolves("new-checkpoint");
    shadowGit.getDiff.resolves([]);
    sinon.stub(ShadowGitRepo, "getOrCreate").resolves(shadowGit);

    service = new CheckpointService(
      { cwd: "/workspace" } as WorkspaceScope,
      {} as vscode.ExtensionContext,
    );
    sinon.stub(service, "getShadowGitPath").resolves("/shadow-git");
  });

  afterEach(() => {
    service.dispose();
    sinon.restore();
  });

  it("does not spend the save timeout waiting for a background diff", async () => {
    const diff = new Deferred<[]>();
    shadowGit.getDiff.returns(diff.promise);
    const edits = service.getCheckpointFileEdits("old-checkpoint");
    await clock.tickAsync(0);

    let settled = false;
    const checkpoint = service.saveCheckpoint("before-request").then((hash) => {
      settled = true;
      return hash;
    });
    await clock.tickAsync(20_000);

    assert.strictEqual(settled, false);
    sinon.assert.calledOnce(shadowGit.stageAll);
    sinon.assert.notCalled(shadowGit.commit);

    diff.resolve([]);
    await edits;
    assert.strictEqual(await checkpoint, "new-checkpoint");
    assert.strictEqual(service.latestCheckpoint.value, "new-checkpoint");
    sinon.assert.calledOnce(shadowGit.commit);
    assert.strictEqual(clock.countTimers(), 0);
  });

  it("keeps the index locked until a timed-out save actually finishes", async () => {
    const staged = new Deferred<boolean>();
    shadowGit.stageAll.onFirstCall().returns(staged.promise);
    const checkpoint = service.saveCheckpoint("slow-save");
    await clock.tickAsync(0);
    sinon.assert.calledOnce(shadowGit.stageAll);

    const baseline = service.saveUserEditBaseline();
    await clock.tickAsync(10_000);

    assert.strictEqual(await checkpoint, null);
    sinon.assert.calledOnce(shadowGit.stageAll);
    sinon.assert.notCalled(shadowGit.commit);

    staged.resolve(true);
    await baseline;
    sinon.assert.calledTwice(shadowGit.stageAll);
    sinon.assert.calledTwice(shadowGit.commit);
    assert.ok(
      shadowGit.commit.getCall(0).calledBefore(shadowGit.stageAll.getCall(1)),
    );
  });

  it("rejects a failed save and releases the index lock", async () => {
    shadowGit.hasStagedChanges.rejects(new Error("diff failed"));

    await assert.rejects(service.saveCheckpoint("failed-save"), /diff failed/);
    assert.strictEqual(clock.countTimers(), 0);
    assert.strictEqual(await service.saveUserEditBaseline(), "new-checkpoint");
    sinon.assert.calledOnce(shadowGit.commit);
  });

  it("skips the commit when staging records no change", async () => {
    shadowGit.hasStagedChanges.resolves(false);

    assert.strictEqual(await service.saveCheckpoint("no-change"), null);
    sinon.assert.calledOnce(shadowGit.stageAll);
    sinon.assert.notCalled(shadowGit.commit);

    assert.strictEqual(
      await service.saveCheckpoint("forced", { force: true }),
      "new-checkpoint",
    );
    sinon.assert.calledOnce(shadowGit.commit);
  });

  it("skips all checkpoint writers when staging refuses a snapshot", async () => {
    shadowGit.stageAll.resolves(false);

    assert.strictEqual(await service.saveCheckpoint("oversized"), null);
    assert.strictEqual(
      await service.saveCheckpoint("forced", { force: true }),
      null,
    );
    assert.strictEqual(await service.saveUserEditBaseline(), null);
    assert.strictEqual(
      await service.getCheckpointFileEdits("old-checkpoint"),
      null,
    );
    sinon.assert.notCalled(shadowGit.commit);
    sinon.assert.notCalled(shadowGit.hasStagedChanges);
    sinon.assert.notCalled(shadowGit.getDiff);
    assert.strictEqual(service.latestCheckpoint.value, "old-checkpoint");

    shadowGit.stageAll.resolves(true);
    assert.strictEqual(await service.saveCheckpoint("retry"), "new-checkpoint");
    sinon.assert.calledOnce(shadowGit.commit);
  });

  it("prunes old checkpoints after initializing", async () => {
    await service.ensureInitialized();

    sinon.assert.calledOnceWithExactly(
      shadowGit.pruneCheckpoints,
      90 * 24 * 60 * 60 * 1000,
      24 * 60 * 60 * 1000,
    );
  });
});
