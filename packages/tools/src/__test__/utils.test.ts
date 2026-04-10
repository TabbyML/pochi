import * as assert from "node:assert";
import { describe, it } from "mocha";
import { validateExecuteCommandWhitelist } from "../utils";

describe("validateExecuteCommandWhitelist", () => {
  it("should not split commands inside quotes", () => {
    assert.doesNotThrow(() => {
      validateExecuteCommandWhitelist(
        'uv run python -c "def fib(n): a,b=0,1; [a:=b or b:=a+b for _ in range(n)]; return a; print(fib(21))"',
        ["uv *"]
      );
    });
  });

  it("should split commands outside quotes", () => {
    assert.doesNotThrow(() => {
      validateExecuteCommandWhitelist(
        'uv run python -c "test" ; echo "hello"',
        ["uv *", "echo *"]
      );
    });
  });

  it("should correctly parse commands with semicolons inside quotes", () => {
    assert.doesNotThrow(() => {
      validateExecuteCommandWhitelist(
        'uv run python -c "def fib(n): a,b=0,1; [a:=b or b:=a+b for _ in range(n)]; return a; print(fib(21))"',
        ["uv *"]
      );
    });
  });

  it("should throw for not allowed commands", () => {
    assert.throws(() => {
      validateExecuteCommandWhitelist(
        'uv run python -c "test" ; rm -rf /',
        ["uv *", "echo *"]
      );
    });
  });
});
