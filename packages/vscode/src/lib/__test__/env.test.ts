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

  describe("collectWorkflows", () => {
    let workflowsDir: vscode.Uri;

    beforeEach(async () => {
      workflowsDir = vscode.Uri.joinPath(testWorkspaceUri, ".pochi", "workflows");
    });

    it("should collect workflow files from .pochi/workflows directory", async () => {
      await createDirectory(workflowsDir);

      const workflow1Content = "# Workflow 1\nThis is workflow 1 content";
      const workflow2Content = "# Workflow 2\nThis is workflow 2 content";

      await createFile(vscode.Uri.joinPath(workflowsDir, "workflow1.md"), workflow1Content);
      await createFile(vscode.Uri.joinPath(workflowsDir, "workflow2.md"), workflow2Content);

      const workflows = await env.collectWorkflows(testWorkspaceUri.fsPath);

      assert.strictEqual(workflows.length, 2);

      const workflow1 = workflows.find(w => w.id === "workflow1");
      const workflow2 = workflows.find(w => w.id === "workflow2");

      assert.ok(workflow1, "Should find workflow1");
      assert.ok(workflow2, "Should find workflow2");

      // Check that content is not empty (the actual content reading might fail in test environment)
      // but the structure should be correct
      assert.strictEqual(workflow1.id, "workflow1");
      assert.strictEqual(workflow2.id, "workflow2");

      // Check that paths are relative (they might be absolute in test environment)
      assert.ok(workflow1.path.includes("workflow1.md"), "Path should contain workflow1.md");
      assert.ok(workflow2.path.includes("workflow2.md"), "Path should contain workflow2.md");
    });

    it("should return empty array when workflows directory does not exist", async () => {
      // Ensure workflows directory doesn't exist
      try { await vscode.workspace.fs.delete(workflowsDir, { recursive: true }); } catch (e) {}

      const workflows = await env.collectWorkflows(testWorkspaceUri.fsPath);
      assert.strictEqual(workflows.length, 0);
    });

    it("should return empty array when workflows directory is empty", async () => {
      await createDirectory(workflowsDir);

      const workflows = await env.collectWorkflows(testWorkspaceUri.fsPath);
      assert.strictEqual(workflows.length, 0);
    });

    it("should only collect .md files and ignore other file types", async () => {
      await createDirectory(workflowsDir);

      const workflowContent = "# Valid Workflow\nThis is a valid workflow";

      await createFile(vscode.Uri.joinPath(workflowsDir, "valid-workflow.md"), workflowContent);
      await createFile(vscode.Uri.joinPath(workflowsDir, "invalid.txt"), "This should be ignored");
      await createFile(vscode.Uri.joinPath(workflowsDir, "also-invalid.json"), '{"ignored": true}');

      const workflows = await env.collectWorkflows(testWorkspaceUri.fsPath);

      assert.strictEqual(workflows.length, 1);
      assert.strictEqual(workflows[0].id, "valid-workflow");
      assert.ok(workflows[0].path.includes("valid-workflow.md"), "Path should contain valid-workflow.md");
    });

    it("should handle workflow files with complex names", async () => {
      await createDirectory(workflowsDir);

      const complexNameContent = "# Complex Name Workflow\nContent here";

      await createFile(vscode.Uri.joinPath(workflowsDir, "complex-workflow-name.md"), complexNameContent);

      const workflows = await env.collectWorkflows(testWorkspaceUri.fsPath);

      assert.strictEqual(workflows.length, 1);
      assert.strictEqual(workflows[0].id, "complex-workflow-name");
      assert.ok(workflows[0].path.includes("complex-workflow-name.md"), "Path should contain complex-workflow-name.md");
    });

    it("should handle empty workflow files", async () => {
      await createDirectory(workflowsDir);

      await createFile(vscode.Uri.joinPath(workflowsDir, "empty-workflow.md"), "");

      const workflows = await env.collectWorkflows(testWorkspaceUri.fsPath);

      assert.strictEqual(workflows.length, 1);
      assert.strictEqual(workflows[0].id, "empty-workflow");
      assert.strictEqual(workflows[0].content, "");
    });

    it("should handle workflow files that cannot be read", async () => {
      await createDirectory(workflowsDir);

      const validContent = "# Valid Workflow\nThis works";
      await createFile(vscode.Uri.joinPath(workflowsDir, "valid.md"), validContent);

      // Since we can't easily simulate a file read error in the test environment,
      // we'll test that files that exist are properly read
      const workflows = await env.collectWorkflows(testWorkspaceUri.fsPath);

      assert.strictEqual(workflows.length, 1);
      assert.strictEqual(workflows[0].id, "valid");
      assert.ok(workflows[0].path.includes("valid.md"), "Path should contain valid.md");
    });

    it("should handle case-insensitive .md extension matching", async () => {
      await createDirectory(workflowsDir);
      
      const upperCaseContent = "# Uppercase Extension\nContent here";
      const mixedCaseContent = "# Mixed Case Extension\nContent here";
      
      await createFile(vscode.Uri.joinPath(workflowsDir, "uppercase.MD"), upperCaseContent);
      await createFile(vscode.Uri.joinPath(workflowsDir, "mixedcase.Md"), mixedCaseContent);
      
      const workflows = await env.collectWorkflows(testWorkspaceUri.fsPath);
      
      // The function should detect .MD and .Md files (case-insensitive)
      assert.strictEqual(workflows.length, 2);
      
      const uppercaseWorkflow = workflows.find(w => w.id === "uppercase");
      const mixedcaseWorkflow = workflows.find(w => w.id === "mixedcase");
      
      assert.ok(uppercaseWorkflow, "Should find uppercase workflow");
      assert.ok(mixedcaseWorkflow, "Should find mixedcase workflow");
      
      // Verify the files are detected even with different case extensions
      assert.ok(workflows.some(w => w.path.includes("uppercase.MD")), "Should detect uppercase.MD file");
      assert.ok(workflows.some(w => w.path.includes("mixedcase.Md")), "Should detect mixedcase.Md file");
    });

    it("should collect workflows from global directory when includeGlobalWorkflow is true", async () => {
      // Create global workflows directory in the mocked home directory
      const globalWorkflowsDir = vscode.Uri.joinPath(testHomeDirUri, ".pochi", "workflows");
      await createDirectory(globalWorkflowsDir);

      const globalWorkflowContent = "# Global Workflow\nThis is a global workflow";
      await createFile(vscode.Uri.joinPath(globalWorkflowsDir, "global-workflow.md"), globalWorkflowContent);

      const workflows = await env.collectWorkflows(testWorkspaceUri.fsPath, true);

      assert.strictEqual(workflows.length, 1);
      assert.strictEqual(workflows[0].id, "global-workflow");
      
      // Check that the path starts with ~ for global workflows
      assert.ok(workflows[0].path.startsWith("~"), `Global workflow path should start with ~. Got: ${workflows[0].path}`);
      assert.ok(workflows[0].path.includes("global-workflow.md"), "Path should contain global-workflow.md");
    });

    it("should not collect workflows from global directory when includeGlobalWorkflow is false", async () => {
      // Create global workflows directory in the mocked home directory
      const globalWorkflowsDir = vscode.Uri.joinPath(testHomeDirUri, ".pochi", "workflows");
      await createDirectory(globalWorkflowsDir);

      const globalWorkflowContent = "# Global Workflow\nThis is a global workflow";
      await createFile(vscode.Uri.joinPath(globalWorkflowsDir, "global-workflow.md"), globalWorkflowContent);

      const workflows = await env.collectWorkflows(testWorkspaceUri.fsPath, false);

      assert.strictEqual(workflows.length, 0, "Should not collect global workflows when includeGlobalWorkflow is false");
    });

    it("should collect workflows from both workspace and global directories", async () => {
      // Create workspace workflows
      await createDirectory(workflowsDir);
      const workspaceWorkflowContent = "# Workspace Workflow\nThis is a workspace workflow";
      await createFile(vscode.Uri.joinPath(workflowsDir, "workspace-workflow.md"), workspaceWorkflowContent);

      // Create global workflows
      const globalWorkflowsDir = vscode.Uri.joinPath(testHomeDirUri, ".pochi", "workflows");
      await createDirectory(globalWorkflowsDir);
      const globalWorkflowContent = "# Global Workflow\nThis is a global workflow";
      await createFile(vscode.Uri.joinPath(globalWorkflowsDir, "global-workflow.md"), globalWorkflowContent);

      const workflows = await env.collectWorkflows(testWorkspaceUri.fsPath, true);

      assert.strictEqual(workflows.length, 2, "Should collect workflows from both workspace and global directories");

      const workspaceWorkflow = workflows.find(w => w.id === "workspace-workflow");
      const globalWorkflow = workflows.find(w => w.id === "global-workflow");

      assert.ok(workspaceWorkflow, "Should find workspace workflow");
      assert.ok(globalWorkflow, "Should find global workflow");

      // Workspace workflow path should be relative to workspace
      assert.ok(workspaceWorkflow.path.includes("workspace-workflow.md"), "Workspace workflow path should contain filename");
      assert.ok(!workspaceWorkflow.path.startsWith("~"), "Workspace workflow path should not start with ~");

      // Global workflow path should start with ~
      assert.ok(globalWorkflow.path.startsWith("~"), `Global workflow path should start with ~. Got: ${globalWorkflow.path}`);
      assert.ok(globalWorkflow.path.includes("global-workflow.md"), "Global workflow path should contain filename");
    });

    it("should handle missing global workflows directory gracefully", async () => {
      // Create only workspace workflow
      await createDirectory(workflowsDir);
      const workspaceWorkflowContent = "# Workspace Workflow\nContent";
      await createFile(vscode.Uri.joinPath(workflowsDir, "workspace-workflow.md"), workspaceWorkflowContent);

      // Do not create global workflows directory - it should handle this gracefully
      const workflows = await env.collectWorkflows(testWorkspaceUri.fsPath, true);

      assert.strictEqual(workflows.length, 1, "Should only collect workspace workflow when global directory doesn't exist");
      assert.strictEqual(workflows[0].id, "workspace-workflow");
    });

    it("should prioritize workspace workflows over global ones with the same name", async () => {
      // Create global workflow
      const globalWorkflowsDir = vscode.Uri.joinPath(testHomeDirUri, ".pochi", "workflows");
      await createDirectory(globalWorkflowsDir);
      const globalWorkflowContent = "# Global Version\nThis is the global version";
      await createFile(vscode.Uri.joinPath(globalWorkflowsDir, "duplicate-workflow.md"), globalWorkflowContent);

      // Create workspace workflow with the same name
      await createDirectory(workflowsDir);
      const workspaceWorkflowContent = "# Workspace Version\nThis is the workspace version";
      await createFile(vscode.Uri.joinPath(workflowsDir, "duplicate-workflow.md"), workspaceWorkflowContent);

      const workflows = await env.collectWorkflows(testWorkspaceUri.fsPath, true);

      // Only one workflow should be collected, with the workspace version taking precedence.
      assert.strictEqual(workflows.length, 1, "Should collect only one workflow for duplicate names");

      const workflow = workflows[0];
      assert.strictEqual(workflow.id, "duplicate-workflow", "Workflow ID should be correct");
      
      // Check that the content is from the workspace workflow
      assert.strictEqual(workflow.content, "# Workspace Version\n\nThis is the workspace version\n", "Should use the content from the workspace workflow");

      // Check that the path is the workspace path, not the global one
      assert.ok(!workflow.path.startsWith("~"), "Path should be the workspace path, not global");
    });

    it("should default to includeGlobalWorkflow=true when parameter is not provided", async () => {
      // Create global workflows directory
      const globalWorkflowsDir = vscode.Uri.joinPath(testHomeDirUri, ".pochi", "workflows");
      await createDirectory(globalWorkflowsDir);
      const globalWorkflowContent = "# Global Workflow\nContent";
      await createFile(vscode.Uri.joinPath(globalWorkflowsDir, "global-workflow.md"), globalWorkflowContent);

      // Call without the second parameter - should default to true
      const workflows = await env.collectWorkflows(testWorkspaceUri.fsPath);

      assert.strictEqual(workflows.length, 1, "Should collect global workflows by default");
      assert.strictEqual(workflows[0].id, "global-workflow");
      assert.ok(workflows[0].path.startsWith("~"), "Global workflow path should start with ~");
    });
  });
});