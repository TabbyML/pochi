import * as path from "node:path";
import { describe, it, expect } from "vitest";
import {
  compileToolPolicies,
  parseToolSpec,
  validateExecuteCommandRules,
  validateToolPolicy,
} from "../utils";

describe("validateExecuteCommandRules", () => {
  it("should correctly parse commands with semicolons inside quotes", () => {
    expect(() => {
      validateExecuteCommandRules(
        'uv run python -c "def fib(n): a,b=0,1; [a:=b or b:=a+b for _ in range(n)]; return a; print(fib(21))"',
        ["uv *"]
      );
    }).not.toThrow();
  });

  it("should split commands outside quotes", () => {
    expect(() => {
      validateExecuteCommandRules(
        'uv run python -c "test" ; echo "hello"',
        ["uv *", "echo *"]
      );
    }).not.toThrow();
  });

  it("should correctly parse multi-line commands inside quotes", () => {
    expect(() => {
      validateExecuteCommandRules(
        `uv run --quiet python3 -c "
def fibonacci(n):
    a, b = 0, 1
    for _ in range(n - 1):
        a, b = b, a + b
"`,
        ["uv *"]
      );
    }).not.toThrow();
  });

  it("should throw for not allowed commands", () => {
    expect(() => {
      validateExecuteCommandRules(
        'uv run python -c "test" ; rm -rf /',
        ["uv *", "echo *"]
      );
    }).toThrow();
  });
});

describe("path pattern policies", () => {
  it("should reject string tool declarations with multiple rules", () => {
    expect(() => parseToolSpec("readFile(src/**, pochi://-/plan.md)")).toThrow(
      'Invalid tool declaration "readFile(src/**, pochi://-/plan.md)". Use one declaration per tool rule, for example: readFile(src/**), readFile(pochi://-/plan.md).',
    );
  });

  it("should preserve multiple executeCommand patterns from object tool specs", () => {
    const policies = compileToolPolicies([
      {
        name: "executeCommand",
        rules: ["git status", "npm *"],
      },
    ]);

    expect(policies?.executeCommand).toEqual({
      kind: "command-pattern",
      patterns: ["git status", "npm *"],
    });
  });

  it("should compile workspace path patterns for file tools", () => {
    const policies = compileToolPolicies(["readFile(src/**)"]);

    expect(policies?.readFile).toEqual({
      kind: "path-pattern",
      patterns: ["src/**"],
    });
  });

  it("should compile virtual path patterns for file tools", () => {
    const policies = compileToolPolicies(["writeToFile(pochi://-/plan.md)"]);

    expect(policies?.writeToFile).toEqual({
      kind: "path-pattern",
      patterns: ["pochi://-/plan.md"],
    });
  });

  it("should allow mixed workspace and virtual path patterns in same policy", () => {
    const policies = compileToolPolicies([
      "readFile(src/**)",
      "readFile(pochi://-/plan.md)",
    ]);

    expect(policies?.readFile).toEqual({
      kind: "path-pattern",
      patterns: ["src/**", "pochi://-/plan.md"],
    });
  });

  it("should allow workspace paths that match configured patterns", () => {
    const cwd = path.join(process.cwd(), "workspace-root");

    expect(() =>
      validateToolPolicy(
        "readFile",
        {
          path: path.join(cwd, "src", "index.ts"),
        },
        {
          readFile: {
            kind: "path-pattern",
            patterns: ["src/**"],
          },
        },
        { cwd },
      ),
    ).not.toThrow();
  });

  it("should allow virtual paths that match configured patterns", () => {
    expect(() =>
      validateToolPolicy(
        "writeToFile",
        {
          path: "pochi://-/plan.md",
        },
        {
          writeToFile: {
            kind: "path-pattern",
            patterns: ["pochi://-/plan.md"],
          },
        },
        { cwd: process.cwd() },
      ),
    ).not.toThrow();
  });

  it("should allow virtual paths without a trailing slash to match pochi://-", () => {
    expect(() =>
      validateToolPolicy(
        "writeToFile",
        {
          path: "pochi://-",
        },
        {
          writeToFile: {
            kind: "path-pattern",
            patterns: ["pochi://-"],
          },
        },
        { cwd: process.cwd() },
      ),
    ).not.toThrow();
  });

  it("should reject workspace paths outside the workspace root when they do not match configured patterns", () => {
    const cwd = path.join(process.cwd(), "workspace-root");

    expect(() =>
      validateToolPolicy(
        "readFile",
        {
          path: path.join(cwd, "..", "secret.txt"),
        },
        {
          readFile: {
            kind: "path-pattern",
            patterns: ["src/**"],
          },
        },
        { cwd },
      ),
    ).toThrow("Path is not allowed by the configured path rules.");
  });

  it("should validate mixed workspace and virtual path patterns correctly", () => {
    const cwd = path.join(process.cwd(), "workspace-root");
    const mixedPolicy = compileToolPolicies([
      "readFile(src/**)",
      "readFile(pochi://-/plan.md)",
    ]);

    // Should allow workspace paths that match workspace pattern
    expect(() =>
      validateToolPolicy(
        "readFile",
        {
          path: path.join(cwd, "src", "index.ts"),
        },
        mixedPolicy,
        { cwd },
      ),
    ).not.toThrow();

    // Should allow virtual paths that match virtual pattern
    expect(() =>
      validateToolPolicy(
        "readFile",
        {
          path: "pochi://-/plan.md",
        },
        mixedPolicy,
        { cwd },
      ),
    ).not.toThrow();

    // Should reject workspace paths that don't match
    expect(() =>
      validateToolPolicy(
        "readFile",
        {
          path: path.join(cwd, "other", "file.ts"),
        },
        mixedPolicy,
        { cwd },
      ),
    ).toThrow();

    // Should reject virtual paths that don't match
    expect(() =>
      validateToolPolicy(
        "readFile",
        {
          path: "pochi://-/other.md",
        },
        mixedPolicy,
        { cwd },
      ),
    ).toThrow();
  });
});

describe("webFetch domain policies", () => {
  it("should compile domain pattern rules for webFetch", () => {
    const policies = compileToolPolicies([
      "webFetch(domain:example.com)",
      "webFetch(domain:*.tabbyml.com)",
    ]);

    expect(policies?.webFetch).toEqual({
      kind: "domain-pattern",
      patterns: ["example.com", "*.tabbyml.com"],
    });
  });

  it("should reject invalid webFetch rule declarations", () => {
    expect(() => compileToolPolicies(["webFetch(example.com)"])).toThrow(
      'Invalid webFetch rule "example.com". Use webFetch(domain:example.com).',
    );
  });

  it("should allow webFetch URLs matching configured domain rules", () => {
    const policies = compileToolPolicies([
      "webFetch(domain:example.com)",
      "webFetch(domain:*.tabbyml.com)",
    ]);

    expect(() =>
      validateToolPolicy(
        "webFetch",
        {
          url: "https://example.com/docs",
        },
        policies,
        { cwd: process.cwd() },
      ),
    ).not.toThrow();

    expect(() =>
      validateToolPolicy(
        "webFetch",
        {
          url: "https://api.tabbyml.com/v1/health",
        },
        policies,
        { cwd: process.cwd() },
      ),
    ).not.toThrow();
  });

  it("should reject webFetch URLs outside configured domain rules", () => {
    const policies = compileToolPolicies([
      "webFetch(domain:example.com)",
      "webFetch(domain:*.tabbyml.com)",
    ]);

    expect(() =>
      validateToolPolicy(
        "webFetch",
        {
          url: "https://google.com",
        },
        policies,
        { cwd: process.cwd() },
      ),
    ).toThrow("URL domain is not allowed by the configured webFetch domain rules.");
  });
});
