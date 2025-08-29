import { exec } from "node:child_process";
import * as os from "node:os";
import { promisify } from "node:util";
import { getLogger } from "@/lib/logger";
import * as jszip from "jszip";
import generate from "project-name-generator";
import * as vscode from "vscode";
import { isFileExists } from "../fs";

const logger = getLogger("newProjectUtils");

const execPromise = promisify(exec);

const homeUri = vscode.Uri.file(os.homedir());
const baseUri = vscode.Uri.joinPath(homeUri, "PochiProjects");

async function createDirectoryIfNotExists(uri: vscode.Uri) {
  const exists = await isFileExists(uri);
  if (!exists) {
    await vscode.workspace.fs.createDirectory(uri);
  }
}

async function validateInput(value: string) {
  if (value.trim() === "") {
    return "Project name cannot be empty";
  }
  if (/[^a-zA-Z0-9-_]/.test(value)) {
    return "Project name can only contain letters, numbers, dashes and underscores";
  }
  const projectUri = vscode.Uri.joinPath(baseUri, value);
  if (await isFileExists(projectUri)) {
    return "Project directory already exists, please choose another name";
  }
  return undefined;
}

const CreateLabel = "Start";
const CancelLabel = "Cancel";

export async function showInputBox(
  placeholder: string,
  baseUri: vscode.Uri,
): Promise<string | undefined> {
  const quickpick = vscode.window.createQuickPick();
  quickpick.title = "Enter a name for the new project";
  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  (quickpick as any).sortByLabel = false;
  quickpick.matchOnDescription = false;
  quickpick.matchOnDetail = false;
  quickpick.value = placeholder;
  quickpick.ignoreFocusOut = true;
  quickpick.items = [
    {
      alwaysShow: true,
      label: CreateLabel,
      detail: "Pochi will create a new project with the name you entered",
    },
    {
      alwaysShow: true,
      label: CancelLabel,
      detail: "Abort this process and do nothing",
    },
    {
      alwaysShow: true,
      kind: vscode.QuickPickItemKind.Separator,
      label: "What Pochi Does",
    },
    {
      alwaysShow: true,
      label: `1. Create a new project in ${baseUri.fsPath}`,
      iconPath: new vscode.ThemeIcon("add"),
    },
    {
      alwaysShow: true,
      label: "2. Open the project in a current window",
      iconPath: new vscode.ThemeIcon("multiple-windows"),
    },
    {
      alwaysShow: true,
      label: "3. Initialize the project",
      iconPath: new vscode.ThemeIcon("cloud-download"),
    },
    {
      alwaysShow: true,
      label: "4. Start working on the project",
      iconPath: new vscode.ThemeIcon("rocket"),
    },
  ];

  quickpick.show();

  return new Promise((resolve) => {
    quickpick.onDidAccept(async () => {
      if (quickpick.selectedItems.length === 0) {
        return;
      }

      const selectedItem = quickpick.selectedItems[0];
      if (selectedItem.label === CreateLabel) {
        const input = quickpick.value.trim();
        const validationError = await validateInput(input);
        if (validationError) {
          vscode.window.showErrorMessage(validationError);
          return;
        }
        quickpick.hide();
        resolve(input);
      } else if (selectedItem.label === CancelLabel) {
        quickpick.hide();
        resolve(undefined);
      }
    });
  });
}

export async function createNewWorkspace(
  namePlaceholder?: string | undefined,
): Promise<vscode.Uri | undefined> {
  await createDirectoryIfNotExists(baseUri);

  const { dashed } = generate();
  const namePrefix = namePlaceholder || "my-project";
  const placeholder = `${namePrefix}-${dashed}`;
  const projectName = await showInputBox(placeholder, baseUri);
  if (!projectName) {
    return undefined;
  }
  const projectUri = vscode.Uri.joinPath(baseUri, projectName);

  await createDirectoryIfNotExists(projectUri);
  logger.info(`Created directory: ${projectUri}`);

  return projectUri;
}

export async function prepareProject(
  projectUri: vscode.Uri,
  githubTemplateUrl: string,
  progress: vscode.Progress<{ message?: string; increment?: number }>,
) {
  const uri = vscode.Uri.parse(githubTemplateUrl);
  const zipArchiveUrl = uri
    .with({
      path: `${uri.path}/archive/refs/heads/main.zip`,
    })
    .toString();

  try {
    logger.info(`Fetch and unzip: ${zipArchiveUrl}`);
    await fetchAndUnzipUsingSystemCommand(zipArchiveUrl, projectUri, progress);
  } catch (error) {
    logger.info(`Failed to fetch and unzip: ${error}`);
    logger.info(`Falling back to JSZip to fetch and unzip: ${zipArchiveUrl}`);
    await fetchAndUnzipUsingJsZip(zipArchiveUrl, projectUri, progress);
  }
}

async function fetchAndUnzipUsingSystemCommand(
  url: string,
  targetUri: vscode.Uri,
  progress: vscode.Progress<{ message?: string; increment?: number }>,
): Promise<void> {
  // Check if curl and unzip are available using child processes
  const curlExists = await execPromise("curl --version").then(
    () => true,
    () => false,
  );
  const unzipExists = await execPromise("unzip -v").then(
    () => true,
    () => false,
  );

  if (!curlExists || !unzipExists) {
    throw new Error(
      "Required system commands (curl, unzip) are not available.",
    );
  }

  let tempZipFile: vscode.Uri | undefined = undefined;
  let tempExtractDir: vscode.Uri | undefined = undefined;

  try {
    progress.report({ message: "Pochi: Fetching project template..." });
    logger.info(`Fetching project template from: ${url}`);

    const urlBase64 = Buffer.from(url)
      .toString("base64url")
      .replace(/[^a-zA-Z0-9]/g, "");
    const tempZipDir = vscode.Uri.joinPath(
      vscode.Uri.file(os.tmpdir()),
      "pochi",
      "downloads",
    );
    tempZipFile = vscode.Uri.joinPath(tempZipDir, `${urlBase64}.zip`);
    tempExtractDir = vscode.Uri.joinPath(tempZipDir, `${urlBase64}-extract`);

    await createDirectoryIfNotExists(tempZipDir);
    await createDirectoryIfNotExists(tempExtractDir);

    await execPromise(`curl -L "${url}" -o "${tempZipFile.fsPath}"`);

    progress.report({ message: "Pochi: Extracting project template..." });
    logger.info(`Extracting project template to: ${tempExtractDir}`);

    await execPromise(
      `unzip -q "${tempZipFile.fsPath}" -d "${tempExtractDir.fsPath}"`,
    );
    const files = await vscode.workspace.fs.readDirectory(tempExtractDir);
    if (files.length === 1 && files[0][1] === vscode.FileType.Directory) {
      const [firstDir] = files[0];
      const sourceDir = vscode.Uri.joinPath(tempExtractDir, firstDir);
      logger.info(
        `Moving contents from ${sourceDir.fsPath} to ${targetUri.fsPath}`,
      );
      await moveDirectoryContents(sourceDir, targetUri);
    } else {
      logger.info(
        `Moving contents from ${tempExtractDir.fsPath} to ${targetUri.fsPath}`,
      );
      await moveDirectoryContents(tempExtractDir, targetUri);
    }
  } catch (error) {
    throw new Error(
      "Failed to fetch and unzip project template using system commands.",
      {
        cause: error,
      },
    );
  } finally {
    if (tempZipFile) {
      try {
        await vscode.workspace.fs.delete(tempZipFile);
      } catch (error) {
        logger.debug(
          `Failed to delete temporary zip file: ${tempZipFile}`,
          error,
        );
      }
    }
    if (tempExtractDir) {
      try {
        await vscode.workspace.fs.delete(tempExtractDir, { recursive: true });
      } catch (error) {
        logger.debug(
          `Failed to delete temporary extract directory: ${tempExtractDir}`,
          error,
        );
      }
    }
  }
}

async function fetchAndUnzipUsingJsZip(
  url: string,
  targetUri: vscode.Uri,
  progress: vscode.Progress<{ message?: string; increment?: number }>,
): Promise<void> {
  progress.report({ message: "Pochi: Fetching project template..." });
  logger.info(`Fetching project template from: ${url}`);

  let response: Response;
  try {
    response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error ${response.status} ${response.statusText}.`);
    }
  } catch (error) {
    logger.error(`Failed to fetch project template: ${url}`, error);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    throw new Error(`Failed to fetch project template. ${errorMessage}`);
  }
  const zipBuffer = await response.arrayBuffer();

  progress.report({ message: "Pochi: Extracting project template..." });
  logger.info(`Extracting project template to: ${targetUri}`);

  const zip = await jszip.loadAsync(zipBuffer);
  for (const [filePath, file] of Object.entries(zip.files)) {
    const relativePaths = filePath.split(/[/\\]/).slice(1);
    const destinationPath = vscode.Uri.joinPath(targetUri, ...relativePaths);

    if (file.dir) {
      await vscode.workspace.fs.createDirectory(destinationPath);
    } else {
      const content = await file.async("uint8array");
      await vscode.workspace.fs.writeFile(destinationPath, content);
    }
  }
}

async function moveDirectoryContents(
  sourceDir: vscode.Uri,
  destinationDir: vscode.Uri,
) {
  const items = await vscode.workspace.fs.readDirectory(sourceDir);

  for (const [item] of items) {
    const sourcePath = vscode.Uri.joinPath(sourceDir, item);
    const destinationPath = vscode.Uri.joinPath(destinationDir, item);
    await vscode.workspace.fs.rename(sourcePath, destinationPath, {
      overwrite: true,
    });
  }
}
