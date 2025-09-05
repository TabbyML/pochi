import * as assert from "assert";
import * as os from "node:os";
import * as _path from "node:path";
import { after, before, beforeEach, describe, it, afterEach } from "mocha";
import * as vscode from "vscode";
import sinon from "sinon";
import proxyquire from "proxyquire";

// Helper to create a file
async function createFile(uri: vscode.Uri, content = ""): Promise<void> {
  await vscode.workspace.fs.writeFile(uri, Buffer.from(content));
}

// Helper to create a directory
async function createDirectory(uri: vscode.Uri): Promise<void> {
  await vscode.workspace.fs.createDirectory(uri);
}

const mockScheme = "ragdoll-diff-origin";

describe("DiffView with real file system", () => {
  let testSuiteRootTempDir: vscode.Uri;
  let currentTestTempDirUri: vscode.Uri;
  let testFileUri: vscode.Uri;

  // Stubs
  let getLoggerStub: sinon.SinonStub;
  let decorationControllerStub: sinon.SinonStub;
  let activeLineControllerClearStub: sinon.SinonStub;
  let fadedOverlayControllerClearStub: sinon.SinonStub;
  let diffOriginContentProviderStub: any; // Allow setting 'scheme'
  let runExclusiveStub: sinon.SinonStubbedInstance<any>;
  let vscodeStubs: any;
  let fsStubs: any;
  let diagnosticStubs: any;

  let DiffView: any; // To be loaded with proxyquire
  let ActualDiffOriginContentProvider: any;

  before(async () => {
    const rootPath = _path.join(
      os.tmpdir(),
      `vscode-ragdoll-diffview-suite-${Date.now()}`,
    );
    testSuiteRootTempDir = vscode.Uri.file(rootPath);
    await createDirectory(testSuiteRootTempDir).catch(() => {
      /* Ignore if already exists */
    });
    // Load the real scheme value if possible, or use a consistent mock value.
    // This assumes the real provider is accessible for its scheme constant.
    try {
      ActualDiffOriginContentProvider = proxyquire(
        "../diff-origin-content-provider",
        { vscode: {} }, // Minimal mocks if only constants are needed
      ).DiffOriginContentProvider;
    } catch (e) {
      console.warn("Could not load actual DiffOriginContentProvider for scheme, using mockScheme.");
    }
  });

  after(async () => {
    if (testSuiteRootTempDir) {
      try {
        await vscode.workspace.fs.delete(testSuiteRootTempDir, {
          recursive: true,
          useTrash: false,
        });
      } catch (error) {
        console.error(
          `Error cleaning up test suite root directory ${testSuiteRootTempDir.fsPath}:`,
          error,
        );
      }
    }
  });

  beforeEach(async () => {
    const testDirName = `test-${Date.now()}-${Math.random()
      .toString(36)
      .substring(2, 7)}`;
    currentTestTempDirUri = vscode.Uri.joinPath(
      testSuiteRootTempDir,
      testDirName,
    );
    await createDirectory(currentTestTempDirUri);
    testFileUri = vscode.Uri.joinPath(currentTestTempDirUri, "test-file.txt");
    await createFile(testFileUri, "initial content\n");

    getLoggerStub = sinon.stub().returns({
      info: sinon.stub(),
      debug: sinon.stub(),
      error: sinon.stub(),
      warn: sinon.stub(),
    });

    activeLineControllerClearStub = sinon.stub();
    fadedOverlayControllerClearStub = sinon.stub();

    decorationControllerStub = sinon.stub();
    decorationControllerStub.onCall(0).returns({
      setActiveLine: sinon.stub(),
      updateOverlayAfterLine: sinon.stub(),
      clear: fadedOverlayControllerClearStub,
      dispose: sinon.stub(),
    });
    decorationControllerStub.onCall(1).returns({
      setActiveLine: sinon.stub(),
      updateOverlayAfterLine: sinon.stub(),
      clear: activeLineControllerClearStub,
      dispose: sinon.stub(),
    });
    decorationControllerStub.returns({
        setActiveLine: sinon.stub(),
        updateOverlayAfterLine: sinon.stub(),
        clear: sinon.stub(), 
        dispose: sinon.stub(),
    });

    // diffOriginContentProviderStub needs to have a 'scheme' property
    diffOriginContentProviderStub = {
        scheme: ActualDiffOriginContentProvider?.scheme ?? mockScheme,
    };

    runExclusiveStub = {
      createGroupRef: sinon.stub().returns({}),
      build: sinon.stub().callsFake((_group, fn) => fn), 
    };

    fsStubs = {
      ensureFileDirectoryExists: sinon.stub().resolves(undefined),
      getWorkspaceFolder: sinon
        .stub()
        .returns({ uri: currentTestTempDirUri, name: "test-ws", index: 0 }),
      isFileExists: sinon.stub().resolves(true),
      createPrettyPatch: sinon
        .stub()
        .callsFake((_fp: string, a: string, b: string) => `diff between ${a} and ${b}`),
      stat: sinon.stub().resolves({ type: vscode.FileType.File, ctime: 0, mtime: 0, size: 0 }),
      delete: sinon.stub().resolves(undefined),
      readFile: sinon.stub().resolves(Buffer.from("initial content\n")), 
      writeFile: sinon.stub().resolves(undefined),
      createDirectory: sinon.stub().resolves(undefined),
      readDirectory: sinon.stub().resolves([]),
      rename: sinon.stub().resolves(undefined),
      copy: sinon.stub().resolves(undefined),
    };

    diagnosticStubs = {
      diagnosticsToProblemsString: sinon.stub().returns(""),
      getNewDiagnostics: sinon.stub().returns([]),
    };
    
    // A basic constructor stub for TabInputTextDiff for `instanceof` checks
    // It needs to be a function/class for `instanceof` to work.
    const TabInputTextDiffStub = function(this: any, original: any, modified: any) {
        this.original = original;
        this.modified = modified;
    } as any;

    // A basic constructor stub for TabInputText for `instanceof` checks
    const TabInputTextStub = function(this: any, uri: any) {
        this.uri = uri;
    } as any;

    vscodeStubs = {
      languages: {
        getDiagnostics: sinon.stub().returns([]),
        createDiagnosticCollection: sinon.stub(),
      },
      workspace: {
        fs: fsStubs,
        openTextDocument: sinon.stub().resolves({
          getText: sinon.stub().returns("initial content\n"),
          isDirty: false,
          save: sinon.stub().resolves(true),
          uri: testFileUri,
          lineCount: 1,
        } as any),
        applyEdit: sinon.stub().resolves(true),
        onDidCloseTextDocument: sinon.stub().returns({ dispose: sinon.stub() }),
        getConfiguration: sinon.stub().returns({
          get: sinon.stub(),
        }),
        onDidChangeTextDocument: sinon.stub().returns({ dispose: sinon.stub() }),
      },
      window: {
        showTextDocument: sinon.stub().resolves({
          document: {
            uri: testFileUri,
            getText: sinon.stub().returns("initial content\n"),
            lineCount: 1,
          },
          revealRange: sinon.stub(),
        } as any),
        visibleTextEditors: [],
        tabGroups: {
          all: [], // Default to empty, will be overridden in specific tests
          close: sinon.stub().resolves(true),
          onDidChangeTabs: sinon.stub().returns({ dispose: sinon.stub() }), // Added this line
        },
        onDidChangeActiveTextEditor: sinon.stub().returns({ dispose: sinon.stub() }),
        createOutputChannel: sinon
          .stub()
          .returns({ appendLine: sinon.stub(), show: sinon.stub(), dispose: sinon.stub() }),
      },
      commands: {
        executeCommand: sinon.stub().resolves(undefined),
      },
      Uri: vscode.Uri,
      Range: vscode.Range,
      Position: vscode.Position,
      WorkspaceEdit: vscode.WorkspaceEdit,
      DiagnosticSeverity: vscode.DiagnosticSeverity,
      TextEditorRevealType: vscode.TextEditorRevealType,
      TabInputTextDiff: TabInputTextDiffStub,
      TabInputText: TabInputTextStub,
      FileType: vscode.FileType, 
    };

    const diffViewModule = proxyquire("../diff-view", {
      vscode: vscodeStubs,
      "@/lib/logger": { getLogger: getLoggerStub },
      "./decoration-controller": { DecorationController: decorationControllerStub },      // Provide the stub object directly for DiffOriginContentProvider to ensure 'scheme' is available
      "./diff-origin-content-provider": { DiffOriginContentProvider: diffOriginContentProviderStub },
      "run-exclusive": runExclusiveStub,
      "@/lib/fs": fsStubs,
      "@/lib/diagnostic": diagnosticStubs,
      "node:path": _path,
    });
    DiffView = diffViewModule.DiffView;
  });

  afterEach(() => {
    sinon.restore();
    const diffViewMap = DiffView["DiffViewMap"];
    if (diffViewMap) {
      for (const [id, view] of diffViewMap.entries()) {
        view.dispose();
        diffViewMap.delete(id);
      }
    }
  });

  describe("getOrCreate", () => {
    it("should create a new DiffView instance if one does not exist", async () => {
      const mockEditor = {
        document: {
          uri: testFileUri,
          getText: sinon.stub().returns("initial content\n"),
          lineCount: 1,
          isDirty: false,
          save: sinon.stub().resolves(true),
        },
        revealRange: sinon.stub(),
      };
      vscodeStubs.window.showTextDocument.resolves(mockEditor as any);
      vscodeStubs.commands.executeCommand.withArgs("vscode.diff").callsFake(() => {
        const cb = vscodeStubs.window.onDidChangeActiveTextEditor.getCall(0).args[0];
        cb(mockEditor);
        return Promise.resolve();
      });

      const id = "test-id-1";
      const relPath = "test-file.txt";
      fsStubs.isFileExists.withArgs(vscode.Uri.joinPath(currentTestTempDirUri, relPath)).resolves(true);
      fsStubs.readFile.withArgs(vscode.Uri.joinPath(currentTestTempDirUri, relPath)).resolves(Buffer.from("initial content\n"));

      const diffViewInstance = await DiffView.getOrCreate(id, relPath);

      assert.ok(diffViewInstance instanceof DiffView, "Should return an instance of DiffView");
    });

    it("should return an existing DiffView instance if one exists for the id", async () => {
      const mockEditor = {
        document: {
          uri: testFileUri,
          getText: sinon.stub().returns("initial content\n"),
          lineCount: 1,
        },
        revealRange: sinon.stub(),
      };
      vscodeStubs.window.showTextDocument.resolves(mockEditor as any);
      vscodeStubs.commands.executeCommand.withArgs("vscode.diff").callsFake(() => {
        const cb = vscodeStubs.window.onDidChangeActiveTextEditor.getCall(0).args[0];
        cb(mockEditor);
        return Promise.resolve();
      });
      fsStubs.isFileExists.resolves(true);
      fsStubs.readFile.resolves(Buffer.from("initial content\n"));

      const id = "test-id-2";
      const relPath = "test-file.txt";
      const firstInstance = await DiffView.getOrCreate(id, relPath);
      const secondInstance = await DiffView.getOrCreate(id, relPath);

      assert.strictEqual(secondInstance, firstInstance, "Should return the same instance");
    });
  });

  describe("update", () => {
    // ... tests remain the same ...
    it("should update the document content and decorations", async () => {
      const mockEditor = {
        document: {
          uri: testFileUri,
          getText: sinon.stub().returns("initial content\n"),
          lineCount: 2, 
          version: 1,
        },
        revealRange: sinon.stub(),
      };
      const mockDocument = mockEditor.document;
      vscodeStubs.window.showTextDocument.resolves(mockEditor as any);
      vscodeStubs.workspace.openTextDocument.resolves(mockDocument as any);
      vscodeStubs.workspace.applyEdit = sinon.stub().callsFake(async (edit: vscode.WorkspaceEdit) => {
        const changes = edit.get(testFileUri);
        if (changes && changes.length > 0) {
          const newText = changes[0].newText;
          mockDocument.getText = sinon.stub().returns(newText);
          mockDocument.lineCount = newText.split("\n").length;
        }
        return true;
      });
      vscodeStubs.commands.executeCommand.withArgs("vscode.diff").callsFake(() => {
        const cb = vscodeStubs.window.onDidChangeActiveTextEditor.getCall(0).args[0];
        cb(mockEditor);
        return Promise.resolve();
      });
      fsStubs.isFileExists.resolves(true);
      fsStubs.readFile.resolves(Buffer.from("initial content\n"));

      const diffView = await DiffView.getOrCreate("update-test", "test-file.txt");
      const newContent = "updated content\nline2\nline3";
      await diffView.update(newContent, false);

      assert.ok(vscodeStubs.workspace.applyEdit.calledOnce, "applyEdit should be called");
      const fadedController = decorationControllerStub.getCall(0).returnValue;
      const activeLineController = decorationControllerStub.getCall(1).returnValue;
      assert.ok(activeLineController.setActiveLine.called, "setActiveLine should be called");
      assert.ok(fadedController.updateOverlayAfterLine.called, "updateOverlayAfterLine should be called");
      assert.ok(mockEditor.revealRange.called, "revealRange should be called for scrolling");
    });

    it("should handle final update correctly", async () => {
      const mockEditor = {
        document: {
          uri: testFileUri,
          getText: sinon.stub().returns("initial content\n"),
          lineCount: 2,
          version: 1,
        },
        revealRange: sinon.stub(),
      };
      const mockDocument = mockEditor.document;
      vscodeStubs.window.showTextDocument.resolves(mockEditor as any);
      vscodeStubs.workspace.openTextDocument.resolves(mockDocument as any);
      vscodeStubs.workspace.applyEdit = sinon.stub().resolves(true);
      vscodeStubs.commands.executeCommand.withArgs("vscode.diff").callsFake(() => {
        const cb = vscodeStubs.window.onDidChangeActiveTextEditor.getCall(0).args[0];
        cb(mockEditor);
        return Promise.resolve();
      });
      fsStubs.isFileExists.resolves(true);
      fsStubs.readFile.resolves(Buffer.from("initial content\n"));

      const diffView = await DiffView.getOrCreate("final-update-test", "test-file.txt");
      const finalContent = "final content";
      await diffView.update(finalContent, true);

      assert.strictEqual(diffView.isFinalized, true, "isFinalized should be true");
      assert.ok(fadedOverlayControllerClearStub.calledOnce, "fadedOverlayController.clear should be called");
      assert.ok(activeLineControllerClearStub.calledOnce, "activeLineController.clear should be called");
    });
  });

  describe("saveChanges", () => {
    it("should save the document and return changes", async () => {
      const initialDocText = "initial content\n";
      const newContentFromModel = "content from model\n";
      const userModifiedText = "user modified content\n";

      const mockActiveEditorDocument = {
        uri: testFileUri,
        getText: sinon.stub(),
        isDirty: true,
        save: sinon.stub().resolves(true),
        lineCount: 1,
        version: 1,
      };
      mockActiveEditorDocument.getText.onFirstCall().returns(userModifiedText);
      mockActiveEditorDocument.getText.onSecondCall().returns(userModifiedText);

      const mockEditor = {
        document: mockActiveEditorDocument,
        revealRange: sinon.stub(),
      };
      
      vscodeStubs.window.showTextDocument.resetHistory(); // Reset for this specific test
      vscodeStubs.window.showTextDocument.resolves(mockEditor as any); // General resolve for the call in saveChanges
      
      vscodeStubs.workspace.openTextDocument.resolves(mockActiveEditorDocument as any);
      // Simulate the diff editor opening for getOrCreate
      vscodeStubs.commands.executeCommand.withArgs("vscode.diff").callsFake(() => {
        const cb = vscodeStubs.window.onDidChangeActiveTextEditor.getCall(0).args[0];
        cb(mockEditor); 
        return Promise.resolve();
      });
      fsStubs.isFileExists.resolves(true);
      fsStubs.readFile.resolves(Buffer.from(initialDocText));
      diagnosticStubs.diagnosticsToProblemsString.returns("mock problems");

      // Setup for tab closing check
      const mockTabToClose = {
        input: new vscodeStubs.TabInputTextDiff(
          { scheme: diffOriginContentProviderStub.scheme, path: "save-test", query: Buffer.from(initialDocText).toString("base64"), fragment: testFileUri.fsPath },
          testFileUri
        ),
        isDirty: false,
      };
      vscodeStubs.window.tabGroups.all = [{ tabs: [mockTabToClose] }];

      const diffView = await DiffView.getOrCreate("save-test", "test-file.txt");
      (diffView as any).activeDiffEditor = mockEditor as any;
      (diffView as any).originalContent = initialDocText;

      const result = await diffView.saveChanges("test-file.txt", newContentFromModel);

      assert.ok(mockActiveEditorDocument.save.calledOnce, "document.save should be called");
      assert.ok(vscodeStubs.window.showTextDocument.calledOnce, "showTextDocument should be called once by saveChanges");
      assert.ok(vscodeStubs.window.tabGroups.close.calledWith(mockTabToClose), "tabGroups.close should be called with the correct tab");
      assert.ok(result.userEdits, "User edits should be detected");
      assert.strictEqual(result.newProblems, "mock problems", "New problems should be returned");
    });
  });

  describe("dispose", () => {
    // ... tests remain the same ...
    it("should attempt to delete an empty new file on dispose", async () => {
      const newFileRelPath = "new-empty-file.txt";
      const newFileUri = vscode.Uri.joinPath(currentTestTempDirUri, newFileRelPath);

      const mockEditor = { document: { uri: newFileUri, getText: sinon.stub().returns(""), lineCount: 0 }, revealRange: sinon.stub() };
      
      // Mock the file as not existing initially, then existing after creation with empty content
      fsStubs.isFileExists.resolves(false); 
      fsStubs.ensureFileDirectoryExists.resolves(undefined);
      fsStubs.readFile.resolves(Buffer.from("")); 
      vscodeStubs.workspace.fs.stat.resolves({ type: vscode.FileType.File, ctime: 0, mtime: 0, size: 0 });
      vscodeStubs.workspace.fs.delete.resolves(undefined);
      
      vscodeStubs.window.showTextDocument.resolves(mockEditor as any);
      vscodeStubs.commands.executeCommand.withArgs("vscode.diff").callsFake(() => {
        const cb = vscodeStubs.window.onDidChangeActiveTextEditor.getCall(0).args[0];
        cb(mockEditor);
        return Promise.resolve();
      });

      const diffView = await DiffView.getOrCreate("dispose-new-empty-test", newFileRelPath);
      (diffView as any).fileUri = newFileUri; 

      await diffView.dispose();
      await new Promise(resolve => setTimeout(resolve, 200)); // Wait for async dispose operation

      assert.ok(vscodeStubs.workspace.fs.stat.called, "fs.stat should be called with newFileUri");
      assert.ok(vscodeStubs.workspace.fs.delete.calledWith(newFileUri), "fs.delete should be called for empty new file");
    });

    it("should not delete an existing file or a non-empty new file on dispose", async () => {
      const existingFileRelPath = "test-file.txt";
      const existingFileUri = testFileUri;
      const mockExistingEditor = { document: { uri: existingFileUri, getText: sinon.stub().returns("initial content\n"), lineCount: 1 }, revealRange: sinon.stub() };

      fsStubs.isFileExists.withArgs(existingFileUri).resolves(true); 
      fsStubs.readFile.withArgs(existingFileUri).resolves(Buffer.from("initial content\n"));
      fsStubs.stat.withArgs(existingFileUri).resolves({ type: vscode.FileType.File, ctime: 0, mtime: 0, size: 10 });
      fsStubs.delete.resetHistory(); 

      vscodeStubs.window.showTextDocument.resolves(mockExistingEditor as any);
      vscodeStubs.commands.executeCommand.withArgs("vscode.diff").callsFake(() => {
        const cb = vscodeStubs.window.onDidChangeActiveTextEditor.getCall(0).args[0];
        cb(mockExistingEditor);
        return Promise.resolve();
      });

      const diffViewExisting = await DiffView.getOrCreate("dispose-existing-test", existingFileRelPath);
      (diffViewExisting as any).fileUri = existingFileUri;
      await diffViewExisting.dispose();
      await new Promise(resolve => setTimeout(resolve, 50));
      assert.ok(fsStubs.delete.notCalled, "fs.delete should NOT be called for existing file");

      const newNonEmptyFileRelPath = "new-non-empty-file.txt";
      const newNonEmptyFileUri = vscode.Uri.joinPath(currentTestTempDirUri, newNonEmptyFileRelPath);
      const mockNewNonEmptyEditor = { document: { uri: newNonEmptyFileUri, getText: sinon.stub().returns("I have content!"), lineCount: 1 }, revealRange: sinon.stub() };

      // Set up for new non-empty file (doesn't exist initially)
      fsStubs.isFileExists.resolves(false); 
      fsStubs.ensureFileDirectoryExists.resolves(undefined);
      fsStubs.readFile.resolves(Buffer.from("I have content!"));
      vscodeStubs.workspace.fs.stat.resolves({ type: vscode.FileType.File, ctime: 0, mtime: 0, size: 15 }); 
      vscodeStubs.workspace.fs.delete.resetHistory();
      
      vscodeStubs.window.showTextDocument.resolves(mockNewNonEmptyEditor as any);
      vscodeStubs.window.onDidChangeActiveTextEditor.resetHistory(); 
      vscodeStubs.commands.executeCommand.withArgs("vscode.diff").callsFake(() => {
        const cb = vscodeStubs.window.onDidChangeActiveTextEditor.getCall(0)?.args[0] ?? vscodeStubs.window.onDidChangeActiveTextEditor.lastCall.args[0];
        cb(mockNewNonEmptyEditor);
        return Promise.resolve();
      });

      const diffViewNewNonEmpty = await DiffView.getOrCreate("dispose-new-non-empty-test", newNonEmptyFileRelPath);
      (diffViewNewNonEmpty as any).fileUri = newNonEmptyFileUri;
      
      await diffViewNewNonEmpty.dispose();
      await new Promise(resolve => setTimeout(resolve, 200)); // Wait for async dispose operation

      assert.ok(vscodeStubs.workspace.fs.stat.called, "fs.stat should be called for non-empty new file");
      assert.ok(vscodeStubs.workspace.fs.delete.notCalled, "fs.delete should NOT be called for non-empty new file");
    });
  });

  it("should close existing non-diff editor tabs when opening diff view", async () => {
      const testFileRelPath = "close-tabs-test.txt";
      const testFileUri = vscode.Uri.joinPath(currentTestTempDirUri, testFileRelPath);
      await createFile(testFileUri, "original content");

      // Mock tab groups with existing non-diff tab for the file
      const mockTab = {
        input: new vscodeStubs.TabInputText(testFileUri),
        isDirty: false
      };

      const mockDiffTab = {
        input: new vscodeStubs.TabInputTextDiff(
          { scheme: mockScheme },
          { fsPath: testFileUri.fsPath }
        ),
        isDirty: false
      };

      vscodeStubs.window.tabGroups.all = [{
        tabs: [mockTab, mockDiffTab]
      }];

      // Mock close method
      let closedTabs: any[] = [];
      vscodeStubs.window.tabGroups.close = sinon.stub().callsFake((tab: any) => {
        closedTabs.push(tab);
        return Promise.resolve();
      });

      // Mock the diff command execution
      vscodeStubs.commands.executeCommand = sinon.stub().callsFake((command: string, _args: any[]) => {
        if (command === "vscode.diff") {
          // Simulate opening the diff editor
          const mockEditor = { document: { uri: testFileUri, fsPath: testFileUri.fsPath } };
          vscodeStubs.window.onDidChangeActiveTextEditor.getCall(0).args[0](mockEditor);
        }
        return Promise.resolve();
      });

      // Create diff view - this should close the existing non-diff tab
      await DiffView.getOrCreate("close-tabs-test", testFileRelPath);

      // Verify that the non-diff tab was closed but diff tab was not
      assert.strictEqual(closedTabs.length, 1, "Should close exactly one tab");
      assert.strictEqual(closedTabs[0], mockTab, "Should close the non-diff tab");
      assert.ok(vscodeStubs.commands.executeCommand.calledWith("vscode.diff"), "Should execute diff command");
    });
});
