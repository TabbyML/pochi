import * as fsPromise from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import {
  type ReadonlySignal,
  type Signal,
  effect,
  signal,
  untracked,
} from "@preact/signals-core";
import { isDeepEqual, merge, mergeDeep, pick } from "remeda";
import { getLogger } from "../base";
import { isDev } from "../vscode-webui-bridge";
import { PochiConfigFile } from "./config-file";
import type { PochiConfig } from "./types";
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

// current only allow workspace to override mcp setting
const AllowedWorkspaceConfigKeys = ["mcp"] as const;

const configFileName = isDev ? "dev-config.jsonc" : "config.jsonc";

export const pochiConfigRelativePath = path.join(".pochi", configFileName);

const UserConfigFilePath = path.join(os.homedir(), pochiConfigRelativePath);

const getWorkspaceConfigFilePath = (workspacePath: string) =>
  path.join(workspacePath, pochiConfigRelativePath);

const logger = getLogger("PochiConfigManager");

export type PochiConfigTarget = "user" | "workspace";

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
    const mergedValue: PochiConfig = { ...this.userConfigFile.config.value };
    for (const key of AllowedWorkspaceConfigKeys) {
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
      const fileExist = await fsPromise
        .access(workspaceConfigFilepath)
        .then(() => true)
        .catch(() => false);
      if (
        this.workspaceConfigFile?.configFilePath !== workspaceConfigFilepath &&
        fileExist
      ) {
        logger.debug(`add workspace config: ${workspaceConfigFilepath}`);
        this.workspaceConfigFile = new PochiConfigFile(workspaceConfigFilepath);
        await new Promise<void>((resolve) => {
          this.workspaceConfigFile?.config.subscribe(() => {
            this.updateMergedConfig();
            resolve();
          });
        });
        this.updateMergedConfig();
        return;
      }
    }
    this.workspaceConfigFile = null;
    this.updateMergedConfig();
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

  // callback is called in untrack context, thus won't trigger effect
  watchKeys = (keys: Array<keyof PochiConfig>, callback: () => void) => {
    let previousDeps = pick(this.config.value, keys);
    return effect(() => {
      const deps = pick(this.config.value, keys);
      if (!isDeepEqual(deps, previousDeps)) {
        previousDeps = deps;
        untracked(() => {
          callback();
        });
      }
    });
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
  watchKeys,
} = new PochiConfigManager();

export {
  config as pochiConfig,
  updateConfig as updatePochiConfig,
  getVendorConfig,
  updateVendorConfig,
  inspect as inspectPochiConfig,
  setWorkspacePath as setPochiConfigWorkspacePath,
  getConfigFilePath as getPochiConfigFilePath,
  watchKeys as watchPochiConfigKeys,
};
