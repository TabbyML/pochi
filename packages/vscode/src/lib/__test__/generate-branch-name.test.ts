import * as assert from "node:assert";
import { ModelRegistry } from "@getpochi/common";
import { afterEach, beforeEach, describe, it } from "mocha";
import proxyquire from "proxyquire";
import * as sinon from "sinon";

describe("generateBranchName", () => {
  let generateTextStub: sinon.SinonStub;
  let createModelStub: sinon.SinonStub;
  let generateBranchName: typeof import("../generate-branch-name").generateBranchName;
  const fakeModel = { modelId: ModelRegistry.generateBranchName };

  beforeEach(() => {
    generateTextStub = sinon.stub().resolves({
      text: "feat/user-profiles",
      finishReason: "stop",
      usage: {
        inputTokens: 10,
        outputTokens: 5,
        outputTokenDetails: { reasoningTokens: 0 },
      },
    });
    createModelStub = sinon.stub().returns(fakeModel);

    ({ generateBranchName } = proxyquire.noCallThru()(
      "../generate-branch-name",
      {
        ai: { generateText: generateTextStub },
        "@getpochi/common/vendor": {
          getVendor: sinon.stub().returns({
            getCredentials: sinon.stub().resolves({}),
          }),
        },
        "@getpochi/common/vendor/edge": { createModel: createModelStub },
        "@getpochi/vendor-pochi/edge": {},
      },
    ));
  });

  afterEach(() => {
    sinon.restore();
  });

  it("uses the pochi vendor with the registry branch name model", async () => {
    await generateBranchName({ prompt: "Add user profile endpoint" });

    assert.ok(createModelStub.calledOnce);
    const [vendorId, options] = createModelStub.firstCall.args;
    assert.strictEqual(vendorId, "pochi");
    assert.strictEqual(options.modelId, ModelRegistry.generateBranchName);
  });

  it("sends a thinkingLevel supported by the Pochi Gemini models", async () => {
    const result = await generateBranchName({
      prompt: "Add user profile endpoint",
    });

    assert.strictEqual(result, "feat/user-profiles");
    assert.ok(generateTextStub.calledOnce);
    const request = generateTextStub.firstCall.args[0];
    assert.strictEqual(request.model, fakeModel);
    assert.deepStrictEqual(request.providerOptions, {
      google: {
        thinkingConfig: {
          thinkingLevel: "low",
        },
      },
    });
  });

  it("does not send budget-style thinking or sampling settings", async () => {
    await generateBranchName({ prompt: "Fix login crash" });

    const request = generateTextStub.firstCall.args[0];
    assert.strictEqual(
      request.providerOptions.google.thinkingConfig.thinkingBudget,
      undefined,
    );
    for (const key of [
      "temperature",
      "topP",
      "topK",
      "frequencyPenalty",
      "presencePenalty",
    ]) {
      assert.strictEqual(request[key], undefined, `${key} should be unset`);
    }
  });
});
