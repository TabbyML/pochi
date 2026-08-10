import * as assert from "node:assert";
import { describe, it } from "mocha";
import { EditorPredictionsAvailable } from "../feature-availability";

describe("editor prediction availability", () => {
  it("keeps editor predictions unavailable", () => {
    assert.strictEqual(EditorPredictionsAvailable, false);
  });
});
