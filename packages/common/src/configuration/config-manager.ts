import * as fs from "node:fs";
import * as fsPromise from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { type ReadonlySignal, type Signal, signal } from "@preact/signals-core";
import * as JSONC from "jsonc-parser/esm";
import { funnel, isDeepEqual, merge, mergeDeep } from "remeda";
import * as fleece from "silver-fleece";
import { getLogger } from "../base";
import { isDev } from "../vscode-webui-bridge";
import { PochiConfig } from "./types";
import type { VendorConfig } from "./vendor";

// remeda prop is not working as expected, so we implement our own
function prop(data: unknown, ...keys: ReadonlyArray<PropertyKey>): unknown {
  let output: unknown = data;
  for (const key of keys) {
    if (output === undefined || output === null) {
      return undefined;
    }
    // @ts-expect-error - we don't know the type of output
    output = output[key];
  }
  return output;
}

const configFileName = isDev ? "dev-config.jsonc" : "test-config.jsonc";

const UserConfigFilePath = path.join(os.homedir(), ".pochi", configFileName);

const getWorkspaceConfigFilePath = (workspacePath: string) =>
  path.join(workspacePath, ".pochi", configFileName);

const logger = getLogger("PochiConfigManager");

export type PochiConfigTarget = "user" | "workspace";

class PochiConfigFile {
  private readonly cfg: Signal<PochiConfig> = signal({});
  private events = new EventTarget();
  readonly configFilePath: string;
  private forceCreateFile: boolean;

  constructor(configFilePath: string, forceCreateFile = true) {
    this.configFilePath = configFilePath;
    this.forceCreateFile = forceCreateFile;
    this.cfg.value = this.load();
    this.watch();
  }

  private load() {
    try {
      const content = fs.readFileSync(this.configFilePath, "utf-8");
      return PochiConfig.parse(JSONC.parse(content));
    } catch (err) {
      logger.debug("Failed to load config file", err);
    }
    return {};
  }

  private onChange = () => {
    const oldValue = this.cfg.value;
    const newValue = this.load();
    if (isDeepEqual(oldValue, newValue)) return;
    this.cfg.value = newValue;
  };

  private async watch() {
    if (this.forceCreateFile) {
      await this.ensureFileExists();
    }
    this.events.addEventListener("change", this.onChange);
    const debouncer = funnel(
      () => {
        this.events.dispatchEvent(new Event("change"));
      },
      {
        minQuietPeriodMs: process.platform === "win32" ? 100 : 1000,
        triggerAt: "end",
      },
    );
    fs.watch(this.configFilePath, { persistent: false }, () =>
      debouncer.call(),
    );
  }

  private async ensureFileExists() {
    const fileExist = await fsPromise
      .access(this.configFilePath)
      .then(() => true)
      .catch(() => false);
    if (!fileExist) {
      const dirPath = path.dirname(this.configFilePath);
      await fsPromise.mkdir(dirPath, { recursive: true });
      await this.save();
    }
  }

  private async save() {
    try {
      let content =
        (
          await fsPromise
            .readFile(this.configFilePath, "utf8")
            .catch(() => undefined)
        )?.trim() || "{}";

      // Apply changes.
      content = fleece.patch(content, this.cfg.value);

      // Formatting.
      const edits = JSONC.format(content, undefined, {
        tabSize: 2,
        insertFinalNewline: true,
        insertSpaces: true,
      });
      content = JSONC.applyEdits(content, edits);

      await fsPromise.writeFile(this.configFilePath, content);
    } catch (err) {
      logger.error("Failed to save config file", err);
    }
  }

  updateConfig = async (newConfig: Partial<PochiConfig>): Promise<boolean> => {
    let config: PochiConfig = {};
    config = mergeDeep(config, this.cfg.value);
    config = mergeDeep(config, newConfig);
    if (isDeepEqual(config, this.cfg.value)) return false;
    this.cfg.value = config;

    // Save to file without await.
    await this.save();
    return true;
  };

  getVendorConfig = (id: string) => {
    const cfg =
      this.cfg.value.vendors?.[id as keyof NonNullable<PochiConfig["vendors"]>];
    return cfg as VendorConfig;
  };

  updateVendorConfig = async (name: string, vendor: VendorConfig | null) => {
    this.cfg.value = {
      ...this.cfg.value,
      vendors: {
        ...this.cfg.value.vendors,
        [name]: vendor,
      },
    };
    await this.save();
  };

  get config(): Signal<PochiConfig> {
    return this.cfg;
  }
}

class PochiConfigManager {
  private userConfigFile: PochiConfigFile;
  private workspaceConfigFile: PochiConfigFile | null = null;

  private readonly mergedConfig: Signal<PochiConfig> = signal({});

  constructor() {
    this.userConfigFile = new PochiConfigFile(UserConfigFilePath);
    if (process.env.POCHI_SESSION_TOKEN) {
      this.userConfigFile.config.value = mergeDeep(
        this.userConfigFile.config.value,
        {
          vendors: {
            pochi: {
              credentials: {
                token: process.env.POCHI_SESSION_TOKEN,
              },
            },
          },
        },
      );
    }
    this.userConfigFile.config.subscribe(this.updateMergedConfig);
    this.updateMergedConfig();
  }

  private updateMergedConfig = () => {
    // current only allow workspace to override mcp setting
    const mergeKeys = ["mcp"] as const;
    const mergedValue: PochiConfig = { ...this.userConfigFile.config.value };
    for (const key of mergeKeys) {
      const workspaceValue = prop(
        this.workspaceConfigFile?.config.value || {},
        key,
      ) as PochiConfig[typeof key];
      const userValue = prop(
        this.userConfigFile.config.value,
        key,
      ) as PochiConfig[typeof key];
      // must be shallow merge, because mcp is a record of record, we want to merge the inner record instead of override it
      mergedValue[key] = merge(userValue, workspaceValue ?? {});
    }
    this.mergedConfig.value = mergedValue;
  };

  setWorkspacePath = async (workspacePath: string | undefined) => {
    if (workspacePath) {
      const workspaceConfigFilepath = getWorkspaceConfigFilePath(workspacePath);
      if (
        this.workspaceConfigFile?.configFilePath !== workspaceConfigFilepath
      ) {
        this.workspaceConfigFile = new PochiConfigFile(
          workspaceConfigFilepath,
          false,
        );
        await new Promise<void>((resolve) => {
          this.workspaceConfigFile?.config.subscribe(() => {
            this.updateMergedConfig();
            resolve();
          });
        });
        this.updateMergedConfig();
      }
    } else {
      this.workspaceConfigFile = null;
      this.updateMergedConfig();
    }
  };

  get config(): ReadonlySignal<PochiConfig> {
    return this.mergedConfig;
  }

  updateConfig = async (
    newConfig: Partial<PochiConfig>,
    target: PochiConfigTarget = "user",
  ): Promise<boolean> => {
    if (target === "user") {
      return await this.userConfigFile.updateConfig(newConfig);
    }
    if (target === "workspace" && this.workspaceConfigFile) {
      return await this.workspaceConfigFile.updateConfig(newConfig);
    }
    return false;
  };

  getVendorConfig = (id: string) => {
    const cfg =
      this.config.value.vendors?.[
        id as keyof NonNullable<PochiConfig["vendors"]>
      ];
    return cfg as VendorConfig;
  };

  updateVendorConfig = async (
    name: string,
    vendor: VendorConfig | null,
    target: PochiConfigTarget = "user",
  ) => {
    if (target === "user") {
      await this.userConfigFile.updateVendorConfig(name, vendor);
    } else if (target === "workspace" && this.workspaceConfigFile) {
      await this.workspaceConfigFile.updateVendorConfig(name, vendor);
    }
  };

  private getConfig = (path?: string, target: PochiConfigTarget = "user") => {
    const cfg =
      target === "user"
        ? this.userConfigFile.config.value
        : this.workspaceConfigFile?.config.value;
    if (!path || !cfg) return cfg;
    const segments = path.split(".") as [keyof PochiConfig];
    return prop(cfg, ...segments);
  };

  inspect = (path?: string) => {
    const userValue = this.getConfig(path);
    const workspaceValue = this.getConfig(path, "workspace");
    const effectiveTargets = [] as PochiConfigTarget[];
    if (workspaceValue !== undefined) effectiveTargets.push("workspace");
    if (userValue !== undefined) effectiveTargets.push("user");
    return {
      path,
      userValue,
      workspaceValue,
      effectiveTargets,
    };
  };

  getConfigFilePath = (target: PochiConfigTarget = "user") => {
    switch (target) {
      case "user":
        return this.userConfigFile.configFilePath;
      case "workspace":
        return this.workspaceConfigFile?.configFilePath;
      default:
        throw target satisfies never;
    }
  };
}

const {
  config,
  updateConfig,
  getVendorConfig,
  updateVendorConfig,
  inspect,
  setWorkspacePath,
  getConfigFilePath,
} = new PochiConfigManager();

export {
  config as pochiConfig,
  updateConfig as updatePochiConfig,
  getVendorConfig,
  updateVendorConfig,
  inspect as inspectPochiConfig,
  setWorkspacePath as setPochiConfigWorkspacePath,
  getConfigFilePath as getPochiConfigFilePath,
};
