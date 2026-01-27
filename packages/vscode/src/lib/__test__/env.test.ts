import * as assert from "assert";
import * as vscode from "vscode";
import sinon from "sinon";
import proxyquire from "proxyquire";
import * as nodePath from "node:path";
import * as nodeOs from "node:os";
import { beforeEach, describe, it, afterEach, before, after } from "mocha";

// Assuming env.ts exports functions like getSystemInfo, collectCustomRules
import * as envModuleType from "../env";

// Helper to create a file
async function createFile(uri: vscode.Uri, content = ""): Promise<void> {
  await vscode.workspace.fs.writeFile(uri, Buffer.from(content));
}

// Helper to create a directory
async function createDirectory(uri: vscode.Uri): Promise<void> {
  try {
    await vscode.workspace.fs.createDirectory(uri);
  } catch (error) {
    if (error instanceof vscode.FileSystemError && error.code === "FileExists") {
      // console.warn(`Directory already exists: ${uri.fsPath}`);
    } else {
      // console.warn(`Failed to create directory ${uri.fsPath}:`, error);
    }
  }
}

describe("env.ts", () => {
  let testSuiteRootTempDir: vscode.Uri;
  let currentTestTempDirUri: vscode.Uri;
  let testWorkspaceUri: vscode.Uri;
  let testHomeDirUri: vscode.Uri; // Simulated home directory for tests (used by collectCustomRules)

  let env: typeof envModuleType;
  let mockOsHomedirStub: sinon.SinonStub;

  let mockVscodeWindowShowErrorStub: sinon.SinonStub;
  let mockVscodeWindowShowInfoStub: sinon.SinonStub;
  let mockVscodeWindowWithProgressStub: sinon.SinonStub;

  let originalProcessPlatform: NodeJS.Platform;

  before(async () => {
    const rootPath = nodePath.join(
      nodeOs.tmpdir(),
      `vscode-ragdoll-env-suite-${Date.now()}`
    );
    testSuiteRootTempDir = vscode.Uri.file(rootPath);
    await createDirectory(testSuiteRootTempDir);

    originalProcessPlatform = process.platform; // Store original platform

    mockOsHomedirStub = sinon.stub();
    mockVscodeWindowShowErrorStub = sinon.stub();
    mockVscodeWindowShowInfoStub = sinon.stub();
    mockVscodeWindowWithProgressStub = sinon.stub().callsFake(async (_options, task) => {
        return await task({ report: sinon.stub() }, { isCancellationRequested: false, onCancellationRequested: sinon.stub() });
    });

    const vscodeStub = {
      Uri: vscode.Uri,
      FileType: vscode.FileType,
      workspace: {
        fs: vscode.workspace.fs,
        get workspaceFolders() {
          return currentTestWorkspaceFolders;
        },
        asRelativePath: (pathOrUri: string | vscode.Uri, _includeWorkspaceFolder?: boolean) => {
          // Simplified mock: attempts to mimic behavior based on currentTestWorkspaceFolders
          const path = typeof pathOrUri === 'string' ? pathOrUri : pathOrUri.fsPath;
          if (currentTestWorkspaceFolders && currentTestWorkspaceFolders.length > 0) {
            const workspaceFolderPath = currentTestWorkspaceFolders[0].uri.fsPath;
            if (path.startsWith(workspaceFolderPath)) {
              // Return path relative to the first workspace folder
              return nodePath.relative(workspaceFolderPath, path);
            }
          }
          // Fallback if not in a workspace folder or for simpler cases
          return nodePath.basename(path);
        }
      },
      window: {
        showErrorMessage: mockVscodeWindowShowErrorStub,
        showInformationMessage: mockVscodeWindowShowInfoStub,
        withProgress: mockVscodeWindowWithProgressStub,
      },
      ProgressLocation: vscode.ProgressLocation,
    };

    // Mock the common module functions
    const commonStub = {
      collectAllRuleFiles: async (cwd: string, readFileContent: (filePath: string) => Promise<string | null>) => {
        const files: { filePath: string, label: string }[] = [];
        const visited = new Set<string>();

        const processFile = async (filePath: string, label: string) => {
          if (visited.has(filePath)) {
            return;
          }
          visited.add(filePath);

          try {
            const content = await readFileContent(filePath);
            if (content !== null) {
              files.push({ filePath, label });
              const importRegex = /@([./\\\w-]+.md)/gm;
              for (const match of content.matchAll(importRegex)) {
                const importPath = nodePath.resolve(nodePath.dirname(filePath), match[1]);
                await processFile(importPath, match[1]);
              }
            }
          } catch {}
        };

        // Start processing from the main README file.
        const mainReadmePath = nodePath.join(cwd, "README.pochi.md");
        await processFile(mainReadmePath, "README.pochi.md");

        return files;
      },
      getSystemInfo: (cwd?: string) => {
        const platform = process.platform;
        const homedir = mockOsHomedirStub();
        const shell = process.env.SHELL || "";
        const currentWorkingDirectory = cwd || process.cwd();

        return {
          cwd: currentWorkingDirectory,
          shell,
          os: platform,
          homedir,
        };
      },
      collectCustomRules: async (cwd: string, readFileContent: (filePath: string) => Promise<string | null>, customRuleFiles: string[] = [], includeDefaultRules: boolean = true) => {
        // Mock implementation that properly reads files using VSCode APIs for test compatibility
        let rules = "";
        const allRuleFiles = [...customRuleFiles];

        // Add default README.pochi.md if requested
        if (includeDefaultRules) {
          allRuleFiles.push(nodePath.join(cwd, "README.pochi.md"));
        }

        // Read all rule files using VSCode APIs (which work in test environment)
        for (const rulePath of allRuleFiles) {
          try {
            const content = await readFileContent(rulePath);
            if (content && content.trim().length > 0) {
              const fileName = nodePath.basename(rulePath);
              rules += `# Rules from ${fileName}\n${content}\n`;
            }
          } catch {
            // Ignore files that can't be read
          }
        }

        return rules;
      }
    };

    const fsStub = {
      readFileContent: async (filePath: string) => {
        try {
          const fileUri = vscode.Uri.file(filePath);
          const fileContent = await vscode.workspace.fs.readFile(fileUri);
          return Buffer.from(fileContent).toString("utf8");
        } catch (error) {
          return null;
        }
      },
      getWorkspaceFolder: () => {
        if (!currentTestWorkspaceFolders || currentTestWorkspaceFolders.length === 0) {
          throw new Error("No workspace folder found. Please open a workspace.");
        }
        return currentTestWorkspaceFolders[0];
      }
    };

    const proxiedEnv = proxyquire("../env", {
      "vscode": vscodeStub,
      "@getpochi/common/tool-utils": commonStub,
      "./fs": fsStub,
    });
    env = proxiedEnv as typeof envModuleType;
  });

  after(async () => {
    if (testSuiteRootTempDir) {
      try {
        await vscode.workspace.fs.delete(testSuiteRootTempDir, { recursive: true, useTrash: false });
      } catch (error) {
        console.error(`Failed to delete test suite root temp dir: ${testSuiteRootTempDir.fsPath}`, error);
      }
    }
    Object.defineProperty(process, "platform", {
      value: originalProcessPlatform,
      writable: true,
    });
  });

  let originalProcessEnv: NodeJS.ProcessEnv;
  let originalProcessCwd: () => string;
  let currentTestWorkspaceFolders: vscode.WorkspaceFolder[] | undefined;

  beforeEach(async () => {
    originalProcessEnv = { ...process.env };
    originalProcessCwd = process.cwd;
    Object.defineProperty(process, "platform", {
      value: originalProcessPlatform,
      writable: true,
    });

    const testDirName = `test-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    currentTestTempDirUri = vscode.Uri.joinPath(testSuiteRootTempDir, testDirName);
    await createDirectory(currentTestTempDirUri);

    testWorkspaceUri = vscode.Uri.joinPath(currentTestTempDirUri, "workspace");
    await createDirectory(testWorkspaceUri);
    currentTestWorkspaceFolders = [{ uri: testWorkspaceUri, name: "test-workspace", index: 0 }];

    // Default stub for os.homedir() for collectCustomRules and other tests if needed
    testHomeDirUri = vscode.Uri.joinPath(currentTestTempDirUri, "home");
    await createDirectory(testHomeDirUri);
    mockOsHomedirStub.returns(testHomeDirUri.fsPath);

    mockOsHomedirStub.resetHistory(); // Reset history for all stubs
    mockVscodeWindowShowErrorStub.resetHistory();
    mockVscodeWindowShowInfoStub.resetHistory();
    mockVscodeWindowWithProgressStub.resetHistory();
  });

  afterEach(async () => {
    process.env = originalProcessEnv;
    process.cwd = originalProcessCwd;
    currentTestWorkspaceFolders = undefined;

    if (currentTestTempDirUri) {
      try {
        await vscode.workspace.fs.delete(currentTestTempDirUri, { recursive: true, useTrash: false });
      } catch (error) {
        console.error(`Failed to delete current test temp dir: ${currentTestTempDirUri.fsPath}`, error);
      }
    }
  });

  describe("getSystemInfo", () => {
    const MOCK_HOMEDIR_FOR_GETSYSTEMINFO = "/mock/user/home";

    beforeEach(() => {
      // Override os.homedir() stub specifically for getSystemInfo tests
      // This will be reset for each test within this describe block.
      mockOsHomedirStub.returns(MOCK_HOMEDIR_FOR_GETSYSTEMINFO);
    });

    it("should return system info with vscode workspace", () => {
      Object.defineProperty(process, "platform", { value: "darwin", writable: true });
      process.env.SHELL = "/bin/zsh";

      const info = env.getSystemInfo(testWorkspaceUri.fsPath);
      assert.deepStrictEqual(info, {
        cwd: testWorkspaceUri.fsPath,
        shell: "/bin/zsh",
        os: "darwin",
        homedir: MOCK_HOMEDIR_FOR_GETSYSTEMINFO,
      });
    });

    it("should return system info using process.cwd if workspaceFolders is undefined", () => {
      Object.defineProperty(process, "platform", { value: "linux", writable: true });
      process.env.SHELL = "/bin/bash";
      process.cwd = () => "/current/dir_process";
      currentTestWorkspaceFolders = undefined;

      const info = env.getSystemInfo("/current/dir_process");
      assert.deepStrictEqual(info, {
        cwd: "/current/dir_process",
        shell: "/bin/bash",
        os: "linux",
        homedir: MOCK_HOMEDIR_FOR_GETSYSTEMINFO,
      });
    });

    it("should return system info using process.cwd if workspaceFolders is empty", () => {
      Object.defineProperty(process, "platform", { value: "win32", writable: true });
      const MOCK_WINDOWS_HOMEDIR = "C:\\Users\\TestUser";
      mockOsHomedirStub.returns(MOCK_WINDOWS_HOMEDIR); // Re-stub for this specific test case
      process.env.SHELL = "powershell.exe";
      process.cwd = () => "C:\\project_process";
      currentTestWorkspaceFolders = [];

      const info = env.getSystemInfo("C:\\project_process");
      assert.deepStrictEqual(info, {
        cwd: "C:\\project_process",
        shell: "powershell.exe",
        os: "win32",
        homedir: MOCK_WINDOWS_HOMEDIR, // Expecting Windows-style path
      });
    });

    it("should handle missing SHELL env variable", () => {
      Object.defineProperty(process, "platform", { value: "darwin", writable: true });
      delete process.env.SHELL;
      process.cwd = () => "/fallback/cwd_process";
      currentTestWorkspaceFolders = undefined;

      const info = env.getSystemInfo("/fallback/cwd_process");
      assert.deepStrictEqual(info, {
        cwd: "/fallback/cwd_process",
        shell: "",
        os: "darwin",
        homedir: MOCK_HOMEDIR_FOR_GETSYSTEMINFO,
      });
    });
  });

  describe("collectCustomRules", () => {
    let workspaceReadmeUri: vscode.Uri;

    beforeEach(async () => {
      workspaceReadmeUri = vscode.Uri.joinPath(testWorkspaceUri, "README.pochi.md");
    });

    it("should collect rules from workspace README.pochi.md", async () => {
      const workspaceRuleContent = "workspace rule content";
      await createFile(workspaceReadmeUri, workspaceRuleContent);

      const rules = await env.collectCustomRules(testWorkspaceUri.fsPath, []);
      assert.ok(rules.includes(workspaceRuleContent), `Rules should include workspace rule content. Got: ${rules}`);
      // Check that the path is somewhat correct, using basename as asRelativePath mock does
      assert.ok(rules.includes(`# Rules from ${nodePath.basename(workspaceReadmeUri.fsPath)}`), "Rule header for workspace should be present");
    });

    it("should collect rules from custom rule files", async () => {
      const customRuleFile1Path = nodePath.join(currentTestTempDirUri.fsPath, "custom-rule-1.md");
      const customRuleContent = "custom rule 1 content";
      await createFile(vscode.Uri.file(customRuleFile1Path), customRuleContent);

      const rules = await env.collectCustomRules(testWorkspaceUri.fsPath, [customRuleFile1Path]);
      assert.ok(rules.includes(customRuleContent), `Rules should include custom rule 1 content. Got: ${rules}`);
      assert.ok(rules.includes(`# Rules from ${nodePath.basename(customRuleFile1Path)}`), "Rule header for custom rule 1 should be present");
    });

    it("should collect rules from two custom rule files", async () => {
      const customRuleFile1Path = nodePath.join(currentTestTempDirUri.fsPath, "custom-rule-A.md");
      const customRuleFile2Path = nodePath.join(currentTestTempDirUri.fsPath, "custom-rule-B.md");
      const ruleAContent = "Rule A content";
      const ruleBContent = "Rule B content";
      await createFile(vscode.Uri.file(customRuleFile1Path), ruleAContent);
      await createFile(vscode.Uri.file(customRuleFile2Path), ruleBContent);

      const rules = await env.collectCustomRules(testWorkspaceUri.fsPath, [customRuleFile1Path, customRuleFile2Path]);

      assert.ok(rules.includes(ruleAContent), `Rules should include custom rule A content. Got: ${rules}`);
      assert.ok(rules.includes(ruleBContent), `Rules should include custom rule B content. Got: ${rules}`);
      assert.ok(rules.includes(`# Rules from ${nodePath.basename(customRuleFile1Path)}`), "Rule header for custom rule A should be present");
      assert.ok(rules.includes(`# Rules from ${nodePath.basename(customRuleFile2Path)}`), "Rule header for custom rule B should be present");
    });

    it("should collect rules from all sources", async () => {
      const wsRuleContent = "ws rule";
      const customCRuleContent = "custom C";

      await createFile(workspaceReadmeUri, wsRuleContent);
      const customRuleFile1Path = nodePath.join(currentTestTempDirUri.fsPath, "custom-rule-C.md");
      await createFile(vscode.Uri.file(customRuleFile1Path), customCRuleContent);

      // Pass homeReadmeUri.fsPath and customRuleFile1Path as custom rules
      const rules = await env.collectCustomRules(testWorkspaceUri.fsPath, [customRuleFile1Path]);

      assert.ok(rules.includes(wsRuleContent), "Should include workspace rule content");
      assert.ok(rules.includes(customCRuleContent), "Should include custom C rule content");

      assert.ok(rules.includes(`# Rules from ${nodePath.basename(workspaceReadmeUri.fsPath)}`), "Rule header for workspace should be present");
      assert.ok(rules.includes(`# Rules from ${nodePath.basename(customRuleFile1Path)}`), "Rule header for custom C rule should be present");
    });

    it("should return empty string if no rules are found", async () => {
      // Ensure no workspace README exists for this test
      try { await vscode.workspace.fs.delete(workspaceReadmeUri); } catch (e) {}
      const rules = await env.collectCustomRules(testWorkspaceUri.fsPath, []);
      assert.strictEqual(rules, "");
    });

    it("should handle error when reading a custom rule file but still load others", async () => {
      const wsRuleContent = "ws rule before custom error";
      await createFile(workspaceReadmeUri, wsRuleContent);
      const customRuleNonExistent = nodePath.join(currentTestTempDirUri.fsPath, "non-existent-custom.md");

      const rules = await env.collectCustomRules(testWorkspaceUri.fsPath, [customRuleNonExistent]);
      assert.ok(rules.includes(wsRuleContent));
      assert.ok(!rules.includes(nodePath.basename(customRuleNonExistent)));
    });
  });

  describe("collectRuleFiles", () => {
    let workspaceReadmeUri: vscode.Uri;

    beforeEach(async () => {
      workspaceReadmeUri = vscode.Uri.joinPath(testWorkspaceUri, "README.pochi.md");
    });

    it("should collect rules from imported files", async () => {
      // Create main workspace README with import statement
      const mainRuleContent = "main rule content\n@imported-rule.md";
      await createFile(workspaceReadmeUri, mainRuleContent);
      
      // Create imported rule file
      const importedRuleUri = vscode.Uri.joinPath(testWorkspaceUri, "imported-rule.md");
      const importedRuleContent = "imported rule content";
      await createFile(importedRuleUri, importedRuleContent);

      const ruleFiles = await env.collectRuleFiles(testWorkspaceUri.fsPath);
      
      // Should have both the main file and the imported file
      assert.strictEqual(ruleFiles.length, 2, "Should have 2 rule files");
      
      // Check that both files are included
      const mainFile = ruleFiles.find(f => f.filepath === workspaceReadmeUri.fsPath);
      const importedFile = ruleFiles.find(f => f.filepath === importedRuleUri.fsPath);
      
      assert.ok(mainFile, "Main rule file should be included");
      assert.ok(importedFile, "Imported rule file should be included");
      
      // Check that the imported file has the correct label
      if (importedFile && "label" in importedFile) {
        assert.strictEqual(importedFile.label, "imported-rule.md");
      }
    });

    it("should handle nested imports", async () => {
      // Create main workspace README with import statement
      const mainRuleContent = "main rule content\n@imported-rule.md";
      await createFile(workspaceReadmeUri, mainRuleContent);
      
      // Create imported rule file with another import
      const importedRuleUri = vscode.Uri.joinPath(testWorkspaceUri, "imported-rule.md");
      const importedRuleContent = "imported rule content\n@nested-rule.md";
      await createFile(importedRuleUri, importedRuleContent);
      
      // Create nested rule file
      const nestedRuleUri = vscode.Uri.joinPath(testWorkspaceUri, "nested-rule.md");
      const nestedRuleContent = "nested rule content";
      await createFile(nestedRuleUri, nestedRuleContent);

      const ruleFiles = await env.collectRuleFiles(testWorkspaceUri.fsPath);
      
      // Should have all three files
      assert.strictEqual(ruleFiles.length, 3, "Should have 3 rule files");
      
      // Check that all files are included
      const mainFile = ruleFiles.find(f => f.filepath === workspaceReadmeUri.fsPath);
      const importedFile = ruleFiles.find(f => f.filepath === importedRuleUri.fsPath);
      const nestedFile = ruleFiles.find(f => f.filepath === nestedRuleUri.fsPath);
      
      assert.ok(mainFile, "Main rule file should be included");
      assert.ok(importedFile, "Imported rule file should be included");
      assert.ok(nestedFile, "Nested rule file should be included");
    });

    it("should handle circular imports gracefully", async () => {
      // Create main workspace README with import statement
      const mainRuleContent = "main rule content\n@imported-rule.md";
      await createFile(workspaceReadmeUri, mainRuleContent);
      
      // Create imported rule file that imports back to main
      const importedRuleUri = vscode.Uri.joinPath(testWorkspaceUri, "imported-rule.md");
      const importedRuleContent = "imported rule content\n@README.pochi.md";
      await createFile(importedRuleUri, importedRuleContent);

      const ruleFiles = await env.collectRuleFiles(testWorkspaceUri.fsPath);
      
      // Should have both files without infinite loop
      assert.strictEqual(ruleFiles.length, 2, "Should have 2 rule files");
      
      // Check that both files are included
      const mainFile = ruleFiles.find(f => f.filepath === workspaceReadmeUri.fsPath);
      const importedFile = ruleFiles.find(f => f.filepath === importedRuleUri.fsPath);
      
      assert.ok(mainFile, "Main rule file should be included");
      assert.ok(importedFile, "Imported rule file should be included");
    });

    it("should ignore non-existent imported files", async () => {
      // Create main workspace README with import statement to non-existent file
      const mainRuleContent = "main rule content\n@non-existent-rule.md";
      await createFile(workspaceReadmeUri, mainRuleContent);

      const ruleFiles = await env.collectRuleFiles(testWorkspaceUri.fsPath);
      
      // Should only have the main file
      assert.strictEqual(ruleFiles.length, 1, "Should have 1 rule file");
      
      const mainFile = ruleFiles.find(f => f.filepath === workspaceReadmeUri.fsPath);
      assert.ok(mainFile, "Main rule file should be included");
    });

    it("should ignore non-markdown imported files", async () => {
      // Create main workspace README with import statement to non-md file
      const mainRuleContent = "main rule content\n@imported-rule.txt";
      await createFile(workspaceReadmeUri, mainRuleContent);
      
      // Create imported rule file with wrong extension
      const importedRuleUri = vscode.Uri.joinPath(testWorkspaceUri, "imported-rule.txt");
      const importedRuleContent = "imported rule content";
      await createFile(importedRuleUri, importedRuleContent);

      const ruleFiles = await env.collectRuleFiles(testWorkspaceUri.fsPath);
      
      // Should only have the main file since imported file is not .md
      assert.strictEqual(ruleFiles.length, 1, "Should have 1 rule file");
      
      const mainFile = ruleFiles.find(f => f.filepath === workspaceReadmeUri.fsPath);
      assert.ok(mainFile, "Main rule file should be included");
    });
  });
});
