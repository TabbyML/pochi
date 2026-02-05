import { listWorkspaceFiles } from "@getpochi/common/tool-utils";
import * as vscode from "vscode";

export async function findDefaultTextDocument(
  cwd: string,
): Promise<vscode.TextDocument> {
  const cwdUri = vscode.Uri.file(cwd);
  const { files } = await listWorkspaceFiles({ cwd });

  if (files.length > 0) {
    const defaultFiles = [
      // Project description
      "README.md",
      "readme.md",
      "README.txt",
      "readme.txt",
      "README",
      "readme",
      "package.json",
      // Common entry points
      "index.html",
      "index.htm",
      "index.js",
      "index.ts",
      "main.js",
      "main.ts",
      "app.js",
      "app.ts",
      "src/index.js",
      "src/index.ts",
      "src/main.js",
      "src/main.ts",
      "src/app.js",
      "src/app.ts",
      "main.py",
      "app.py",
      "src/main.py",
      "app/main.py",
      "main.go",
      "src/main.go",
      "lib/main.rs",
      "src/main.rs",
      "src/lib.rs",
      "index.php",
      "src/index.php",
      "public/index.php",
      "Program.cs",
      "Startup.cs",
      "main.swift",
      "Package.swift",
      "Dockerfile",
    ];

    for (const defaultFile of defaultFiles) {
      if (files.includes(defaultFile)) {
        const fileUri = vscode.Uri.joinPath(cwdUri, defaultFile);
        return await vscode.workspace.openTextDocument(fileUri);
      }
    }

    const textFileExtensions = [
      ".md",
      ".txt",
      ".js",
      ".jsx",
      ".ts",
      ".tsx",
      ".c",
      ".cpp",
      ".h",
      ".hpp",
      ".cs",
      ".java",
      ".py",
      ".rb",
      ".go",
      ".rs",
      ".swift",
      ".kt",
      ".kts",
      ".scala",
      ".groovy",
      ".php",
      ".lua",
      ".r",
      ".dart",
      ".sh",
      ".bash",
      ".zsh",
      ".ps1",
      ".sql",
      ".html",
      ".htm",
      ".css",
      ".scss",
      ".sass",
      ".less",
      ".vue",
      ".svelte",
      ".json",
      ".xml",
      ".yml",
      ".yaml",
      ".toml",
      ".ini",
      ".cfg",
    ];
    for (const file of files) {
      if (textFileExtensions.some((ext) => file.endsWith(ext))) {
        const fileUri = vscode.Uri.joinPath(cwdUri, file);
        return await vscode.workspace.openTextDocument(fileUri);
      }
    }
  }

  return await vscode.workspace.openTextDocument({
    content: "",
    language: "plaintext",
  });
}
