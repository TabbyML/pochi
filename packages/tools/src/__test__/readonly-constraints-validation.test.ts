import { describe, expect, it } from "vitest";
import {
  checkReadOnlyConstraints,
  isReadonlyToolCall,
} from "../utils/readonly-constraints-validation";

describe("checkReadOnlyConstraints", () => {
  it("returns false for empty or whitespace-only input", () => {
    expect(checkReadOnlyConstraints("")).toBe(false);
    expect(checkReadOnlyConstraints("   ")).toBe(false);
  });

  it("returns false for command substitution $()", () => {
    expect(checkReadOnlyConstraints("echo $(cat /etc/passwd)")).toBe(false);
  });

  it("returns false for output redirect (>, >>)", () => {
    expect(checkReadOnlyConstraints("echo hello > /tmp/out.txt")).toBe(false);
    expect(checkReadOnlyConstraints("cat file.txt >> /tmp/out.txt")).toBe(false);
  });

  it("returns true for simple readonly commands", () => {
    expect(checkReadOnlyConstraints("cat file.txt")).toBe(true);
    expect(checkReadOnlyConstraints("find . -name '*.ts'")).toBe(true);
  });

  it("returns true for piped readonly commands", () => {
    expect(checkReadOnlyConstraints("cat file.txt | grep 'foo'")).toBe(true);
  });

  it("returns false for always-stateful commands (rm, sudo)", () => {
    expect(checkReadOnlyConstraints("rm -rf /tmp/foo")).toBe(false);
    expect(checkReadOnlyConstraints("sudo cat /etc/shadow")).toBe(false);
  });

  it("returns false for git write operations", () => {
    expect(checkReadOnlyConstraints("git commit -m 'test'")).toBe(false);
  });

  it("returns true for git read operations", () => {
    expect(checkReadOnlyConstraints("git diff HEAD")).toBe(true);
    expect(checkReadOnlyConstraints("git log --oneline -10")).toBe(true);
  });

  it("returns false for git branch <name> (creates branch)", () => {
    expect(checkReadOnlyConstraints("git branch new-feature")).toBe(false);
  });

  it("returns true for git branch with no positional args (list)", () => {
    expect(checkReadOnlyConstraints("git branch")).toBe(true);
    expect(checkReadOnlyConstraints("git branch -v")).toBe(true);
  });

  it("returns false for sed -i (in-place edit)", () => {
    expect(checkReadOnlyConstraints("sed -i 's/foo/bar/g' file.txt")).toBe(false);
  });

  it("returns true for sed without -i", () => {
    expect(checkReadOnlyConstraints("sed 's/foo/bar/g' file.txt")).toBe(true);
  });

  it("returns false for curl (always in AlwaysStatefulCommands)", () => {
    expect(checkReadOnlyConstraints("curl https://api.example.com/data")).toBe(false);
  });

  it("returns false when a pipe chain includes a stateful command", () => {
    expect(checkReadOnlyConstraints("cat file.txt && rm -rf /tmp/work")).toBe(false);
  });

  it("returns false for unquoted variable expansion", () => {
    expect(checkReadOnlyConstraints("cat $FILENAME")).toBe(false);
  });
});

describe("isReadonlyToolCall", () => {
  it("returns true for readFile", () => {
    expect(isReadonlyToolCall("readFile", {})).toBe(true);
  });

  it("returns true for listFiles", () => {
    expect(isReadonlyToolCall("listFiles", {})).toBe(true);
  });

  it("returns true for executeCommand with a readonly command", () => {
    expect(
      isReadonlyToolCall("executeCommand", { command: "cat README.md" }),
    ).toBe(true);
  });

  it("returns false for executeCommand with a stateful command", () => {
    expect(
      isReadonlyToolCall("executeCommand", { command: "rm -rf /tmp" }),
    ).toBe(false);
  });

  it("returns false for executeCommand with missing command field", () => {
    expect(isReadonlyToolCall("executeCommand", {})).toBe(false);
  });

  it("returns false for writeToFile", () => {
    expect(isReadonlyToolCall("writeToFile", {})).toBe(false);
  });

  it("returns false for applyDiff", () => {
    expect(isReadonlyToolCall("applyDiff", {})).toBe(false);
  });

  it("returns false for unknown tool", () => {
    expect(isReadonlyToolCall("someUnknownTool", {})).toBe(false);
  });
});