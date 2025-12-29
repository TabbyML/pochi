import * as path from "node:path";
import deepEqual from "fast-deep-equal";
import * as vscode from "vscode";

export function compareDiagnostics(
  oldDiagnostics: [vscode.Uri, vscode.Diagnostic[]][],
  newDiagnostics: [vscode.Uri, vscode.Diagnostic[]][],
): {
  newProblems: [vscode.Uri, vscode.Diagnostic[]][];
  resolvedProblems: [vscode.Uri, vscode.Diagnostic[]][];
} {
  const newProblems: [vscode.Uri, vscode.Diagnostic[]][] = [];
  const resolvedProblems: [vscode.Uri, vscode.Diagnostic[]][] = [];

  const oldMap = new Map(oldDiagnostics);
  const newMap = new Map(newDiagnostics);

  for (const [uri, newDiags] of newDiagnostics) {
    const oldDiags = oldMap.get(uri) || [];
    const newProblemsForUri = newDiags.filter(
      (newDiag) => !oldDiags.some((oldDiag) => deepEqual(oldDiag, newDiag)),
    );

    if (newProblemsForUri.length > 0) {
      newProblems.push([uri, newProblemsForUri]);
    }
  }

  for (const [uri, oldDiags] of oldDiagnostics) {
    const newDiags = newMap.get(uri) || [];
    const resolvedProblemsForUri = oldDiags.filter(
      (oldDiag) => !newDiags.some((newDiag) => deepEqual(newDiag, oldDiag)),
    );

    if (resolvedProblemsForUri.length > 0) {
      resolvedProblems.push([uri, resolvedProblemsForUri]);
    }
  }

  return { newProblems, resolvedProblems };
}

// will return empty string if no problems with the given severity are found
export function diagnosticsToProblemsString(
  diagnostics: [vscode.Uri, vscode.Diagnostic[]][],
  severities: vscode.DiagnosticSeverity[],
  cwd: string,
): string | undefined {
  let result = "";
  for (const [uri, fileDiagnostics] of diagnostics) {
    const problems = fileDiagnostics.filter((d) =>
      severities.includes(d.severity),
    );
    if (problems.length > 0) {
      result += `\n\n${path.relative(cwd, uri.fsPath)}`;
      for (const diagnostic of problems) {
        let label: string;
        switch (diagnostic.severity) {
          case vscode.DiagnosticSeverity.Error:
            label = "Error";
            break;
          case vscode.DiagnosticSeverity.Warning:
            label = "Warning";
            break;
          case vscode.DiagnosticSeverity.Information:
            label = "Information";
            break;
          case vscode.DiagnosticSeverity.Hint:
            label = "Hint";
            break;
          default:
            label = "Diagnostic";
        }
        const line = diagnostic.range.start.line + 1; // VSCode lines are 0-indexed
        const source = diagnostic.source ? `${diagnostic.source} ` : "";
        result += `\n- [${source}${label}] Line ${line}: ${diagnostic.message}`;
      }
    }
  }
  result = result.trim();
  if (result.length > 0) {
    return result;
  }
}
