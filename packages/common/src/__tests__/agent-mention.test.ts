import { describe, expect, it } from "vitest";
import { serializeCustomAgentMention } from "../agent-mention";

describe("serializeCustomAgentMention", () => {
  it("serializes a readable structured custom-agent mention", () => {
    expect(serializeCustomAgentMention("tester", "/agents/tester.md")).toBe(
      '<custom-agent id="tester" path="/agents/tester.md">/tester</custom-agent>',
    );
  });

  it("escapes attribute and fallback text content", () => {
    expect(serializeCustomAgentMention('a&b"<c>', '/agents/"<&>')).toBe(
      '<custom-agent id="a&amp;b&quot;&lt;c&gt;" path="/agents/&quot;&lt;&amp;&gt;">/a&amp;b"&lt;c&gt;</custom-agent>',
    );
  });
});
