import { describe, it, expect } from "vitest";
import { validateExecuteCommandWhitelist } from "../utils";

describe("validateExecuteCommandWhitelist", () => {
  it("should correctly parse commands with semicolons inside quotes", () => {
    expect(() => {
      validateExecuteCommandWhitelist(
        'uv run python -c "def fib(n): a,b=0,1; [a:=b or b:=a+b for _ in range(n)]; return a; print(fib(21))"',
        ["uv *"]
      );
    }).not.toThrow();
  });

  it("should split commands outside quotes", () => {
    expect(() => {
      validateExecuteCommandWhitelist(
        'uv run python -c "test" ; echo "hello"',
        ["uv *", "echo *"]
      );
    }).not.toThrow();
  });

  it("should correctly parse multi-line commands inside quotes", () => {
    expect(() => {
      validateExecuteCommandWhitelist(
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
      validateExecuteCommandWhitelist(
        'uv run python -c "test" ; rm -rf /',
        ["uv *", "echo *"]
      );
    }).toThrow();
  });
});
