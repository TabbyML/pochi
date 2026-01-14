import * as assert from "assert";
import * as vscode from "vscode";
import { compareDiagnostics, diagnosticsToProblemsString } from "../diagnostic";
import { describe, it } from "mocha";
import * as path from "node:path";

// Helper function to create a diagnostic
function createDiagnostic(
  line: number,
  char: number,
  message: string,
  severity: vscode.DiagnosticSeverity,
  source?: string,
  code?: string | number | { value: string | number; target: vscode.Uri },
): vscode.Diagnostic {
  const range = new vscode.Range(
    new vscode.Position(line, char),
    new vscode.Position(line, char + 5), // Arbitrary end position
  );
  const diag = new vscode.Diagnostic(range, message, severity);
  diag.source = source;
  diag.code = code;
  return diag;
}

describe("Diagnostic Utils", () => {
  const uri1 = vscode.Uri.file("/test/file1.ts");
  const uri2 = vscode.Uri.file("/test/file2.ts");

  const diag1Error = createDiagnostic(
    0,
    0,
    "Error 1",
    vscode.DiagnosticSeverity.Error,
    "eslint",
    "rule1",
  );
  const diag1Warning = createDiagnostic(
    1,
    5,
    "Warning 1",
    vscode.DiagnosticSeverity.Warning,
    "tsc",
  );
  const diag2Error = createDiagnostic(
    5,
    10,
    "Error 2",
    vscode.DiagnosticSeverity.Error,
    "eslint",
    "rule2",
  );
  const diag2Info = createDiagnostic(
    10,
    2,
    "Info 1",
    vscode.DiagnosticSeverity.Information,
  );
  const diag2Hint = createDiagnostic(
    15,
    0,
    "Hint 1",
    vscode.DiagnosticSeverity.Hint,
    "custom",
  );

  describe("compareDiagnostics", () => {
    it("should return all new diagnostics when old diagnostics are empty", () => {
      const oldDiagnostics: [vscode.Uri, vscode.Diagnostic[]][] = [];
      const newDiagnostics: [vscode.Uri, vscode.Diagnostic[]][] = [
        [uri1, [diag1Error, diag1Warning]],
        [uri2, [diag2Error]],
      ];
      const result = compareDiagnostics(oldDiagnostics, newDiagnostics);
      assert.deepStrictEqual(result.newProblems, newDiagnostics);
      assert.deepStrictEqual(result.resolvedProblems, []);
    });

    it("should return empty arrays when new diagnostics are the same as old", () => {
      const oldDiagnostics: [vscode.Uri, vscode.Diagnostic[]][] = [
        [uri1, [diag1Error, diag1Warning]],
        [uri2, [diag2Error]],
      ];
      const newDiagnostics: [vscode.Uri, vscode.Diagnostic[]][] = [
        [uri1, [diag1Error, diag1Warning]],
        [uri2, [diag2Error]],
      ];
      const result = compareDiagnostics(oldDiagnostics, newDiagnostics);
      assert.deepStrictEqual(result.newProblems, []);
      assert.deepStrictEqual(result.resolvedProblems, []);
    });

    it("should return only the truly new diagnostics", () => {
      const oldDiagnostics: [vscode.Uri, vscode.Diagnostic[]][] = [
        [uri1, [diag1Error]], // Only diag1Error is old
        [uri2, []],
      ];
      const newDiagnostics: [vscode.Uri, vscode.Diagnostic[]][] = [
        [uri1, [diag1Error, diag1Warning]], // diag1Warning is new
        [uri2, [diag2Error]], // diag2Error is new
      ];
      const expectedNew: [vscode.Uri, vscode.Diagnostic[]][] = [
        [uri1, [diag1Warning]],
        [uri2, [diag2Error]],
      ];
      const result = compareDiagnostics(oldDiagnostics, newDiagnostics);
      assert.deepStrictEqual(result.newProblems, expectedNew);
      assert.deepStrictEqual(result.resolvedProblems, []);
    });

    it("should return resolved diagnostics when they are missing in new", () => {
      const oldDiagnostics: [vscode.Uri, vscode.Diagnostic[]][] = [
        [uri1, [diag1Error, diag1Warning]],
        [uri2, [diag2Error]],
      ];
      const newDiagnostics: [vscode.Uri, vscode.Diagnostic[]][] = [
        [uri1, [diag1Error]], // diag1Warning is resolved
        // uri2's diag2Error is resolved
      ];
      const expectedResolved: [vscode.Uri, vscode.Diagnostic[]][] = [
        [uri1, [diag1Warning]],
        [uri2, [diag2Error]],
      ];
      const result = compareDiagnostics(oldDiagnostics, newDiagnostics);
      assert.deepStrictEqual(result.newProblems, []);
      assert.deepStrictEqual(result.resolvedProblems, expectedResolved);
    });

    it("should return new diagnostics when a file is added", () => {
      const oldDiagnostics: [vscode.Uri, vscode.Diagnostic[]][] = [
        [uri1, [diag1Error]],
      ];
      const newDiagnostics: [vscode.Uri, vscode.Diagnostic[]][] = [
        [uri1, [diag1Error]],
        [uri2, [diag2Error]], // uri2 is new
      ];
      const expectedNew: [vscode.Uri, vscode.Diagnostic[]][] = [
        [uri2, [diag2Error]],
      ];
      const result = compareDiagnostics(oldDiagnostics, newDiagnostics);
      assert.deepStrictEqual(result.newProblems, expectedNew);
      assert.deepStrictEqual(result.resolvedProblems, []);
    });

    it("should handle diagnostics with slightly different properties as new and resolved", () => {
      const diag1ErrorModified = createDiagnostic(
        0,
        0,
        "Error 1 modified", // Different message
        vscode.DiagnosticSeverity.Error,
        "eslint",
        "rule1",
      );
      const oldDiagnostics: [vscode.Uri, vscode.Diagnostic[]][] = [
        [uri1, [diag1Error]],
      ];
      const newDiagnostics: [vscode.Uri, vscode.Diagnostic[]][] = [
        [uri1, [diag1ErrorModified]],
      ];
      const result = compareDiagnostics(oldDiagnostics, newDiagnostics);
      assert.deepStrictEqual(result.newProblems, [[uri1, [diag1ErrorModified]]]);
      assert.deepStrictEqual(result.resolvedProblems, [[uri1, [diag1Error]]]);
    });
  });

  describe("diagnosticsToProblemsString", () => {
    const cwd = "/test";
    const diagnostics: [vscode.Uri, vscode.Diagnostic[]][] = [
      [uri1, [diag1Error, diag1Warning]],
      [uri2, [diag2Error, diag2Info, diag2Hint]],
    ];

    it("should return undefined for empty diagnostics", () => {
      const result = diagnosticsToProblemsString(
        [],
        [vscode.DiagnosticSeverity.Error],
        cwd,
      );
      assert.strictEqual(result, undefined);
    });

    it("should return empty string if no diagnostics match severity", () => {
      const result = diagnosticsToProblemsString(
        diagnostics,
        [vscode.DiagnosticSeverity.Hint], // Only filter Hints, but diag1 has none
        cwd,
      );
      // It should still include file2 which has a hint
      const expected = `file2.ts
- [custom Hint] Line 16: Hint 1`;
      assert.strictEqual(result, expected);
    });

    it("should format errors correctly", () => {
      const result = diagnosticsToProblemsString(
        diagnostics,
        [vscode.DiagnosticSeverity.Error],
        cwd,
      );
      const expected = `file1.ts
- [eslint Error] Line 1: Error 1

file2.ts
- [eslint Error] Line 6: Error 2`;
      assert.strictEqual(result, expected);
    });

    it("should format warnings correctly", () => {
      const result = diagnosticsToProblemsString(
        diagnostics,
        [vscode.DiagnosticSeverity.Warning],
        cwd,
      );
      const expected = `file1.ts
- [tsc Warning] Line 2: Warning 1`;
      assert.strictEqual(result, expected);
    });

    it("should format information and hints correctly", () => {
      const result = diagnosticsToProblemsString(
        diagnostics,
        [vscode.DiagnosticSeverity.Information, vscode.DiagnosticSeverity.Hint],
        cwd,
      );
      const expected = `file2.ts
- [Information] Line 11: Info 1
- [custom Hint] Line 16: Hint 1`;
      assert.strictEqual(result, expected);
    });

    it("should format multiple severities correctly", () => {
      const result = diagnosticsToProblemsString(
        diagnostics,
        [vscode.DiagnosticSeverity.Error, vscode.DiagnosticSeverity.Warning],
        cwd,
      );
      const expected = `file1.ts
- [eslint Error] Line 1: Error 1
- [tsc Warning] Line 2: Warning 1

file2.ts
- [eslint Error] Line 6: Error 2`;
      assert.strictEqual(result, expected);
    });

    it("should use relative paths", () => {
      const differentCwd = "/";
      const result = diagnosticsToProblemsString(
        diagnostics,
        [vscode.DiagnosticSeverity.Error],
        differentCwd,
      );
      const expected = `${path.join("test", "file1.ts")}
- [eslint Error] Line 1: Error 1

${path.join("test", "file2.ts")}
- [eslint Error] Line 6: Error 2`;
      assert.strictEqual(result, expected);
    });

     it("should handle diagnostics without source", () => {
       const diagNoSource = createDiagnostic(
         20, 0, "No source", vscode.DiagnosticSeverity.Warning
       );
       const diagnosticsWithNoSource: [vscode.Uri, vscode.Diagnostic[]][] = [
         [uri1, [diagNoSource]]
       ];
      const result = diagnosticsToProblemsString(
        diagnosticsWithNoSource,
        [vscode.DiagnosticSeverity.Warning],
        cwd,
      );
      const expected = `file1.ts
- [Warning] Line 21: No source`;
      assert.strictEqual(result, expected);
    });
  });
});
