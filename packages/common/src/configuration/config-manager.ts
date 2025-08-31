import * as fs from "node:fs";
import * as fsPromise from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { type ReadonlySignal, type Signal, signal } from "@preact/signals-core";
import { funnel, isDeepEqual, mergeDeep } from "remeda";
import * as fleece from "silver-fleece";
import { loadConfigSync } from "zod-config";
import { json5Adapter } from "zod-config/json5-adapter";
import { getLogger } from "../base";
import { PochiConfig } from "./types";

const PochiConfigFilePath = path.join(os.homedir(), ".pochi", "config.jsonc");

const logger = getLogger("PochiConfigManager");

class PochiConfigManager {
  private readonly cfg: Signal<PochiConfig> = signal({});
  private events = new EventTarget();

  constructor() {
    this.cfg.value = this.load();
    this.cfg.subscribe(this.onSignalChange);
    this.watch();

    if (process.env.POCHI_SESSION_TOKEN) {
      this.cfg.value = {
        ...this.cfg.value,
        credentials: {
          ...this.cfg.value.credentials,
          pochiToken: process.env.POCHI_SESSION_TOKEN,
        },
      };
    }
  }

  private load() {
    try {
      return loadConfigSync({
        schema: PochiConfig,
        adapters: [json5Adapter({ path: PochiConfigFilePath })],
        logger,
        silent: true,
      });
    } catch (err) {
      return {} as PochiConfig;
    }
  }

  private onChange = () => {
    const oldValue = this.cfg.value;
    const newValue = this.load();
    if (isDeepEqual(oldValue, newValue)) return;
    this.cfg.value = newValue;
  };

  private onSignalChange = async () => {
    const oldValue = this.load();
    const newValue = this.cfg.value;
    if (isDeepEqual(oldValue, newValue)) return;
    await this.save();
  };

  private async watch() {
    await this.ensureFileExists();
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
    fs.watch(PochiConfigFilePath, { persistent: false }, () =>
      debouncer.call(),
    );
  }

  private async ensureFileExists() {
    const fileExist = await fsPromise
      .access(PochiConfigFilePath)
      .then(() => true)
      .catch(() => false);
    if (!fileExist) {
      const dirPath = path.dirname(PochiConfigFilePath);
      await fsPromise.mkdir(dirPath, { recursive: true });
      await this.save();
    }
  }

  private async save() {
    try {
      const fileContent = await fsPromise
        .readFile(PochiConfigFilePath, "utf8")
        .catch(() => "{}");
      await fsPromise.writeFile(
        PochiConfigFilePath,
        fleece.patch(fileContent, this.cfg.value),
      );
    } catch (err) {
      logger.debug("Failed to save config file", err);
    }
  }

  updateConfig = (newConfig: Partial<PochiConfig>) => {
    let config: PochiConfig = {};
    config = mergeDeep(config, this.cfg.value);
    config = mergeDeep(config, newConfig);
    this.cfg.value = config;
  };

  get config(): ReadonlySignal<PochiConfig> {
    return this.cfg;
  }
}

const { config, updateConfig } = new PochiConfigManager();
export {
  config as pochiConfig,
  updateConfig as updatePochiConfig,
  PochiConfigFilePath,
};
