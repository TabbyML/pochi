import * as fs from "node:fs";
import * as fsPromise from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { type ReadonlySignal, type Signal, signal } from "@preact/signals-core";
import * as JSONC from "jsonc-parser/esm";
import { funnel, isDeepEqual, mergeDeep } from "remeda";
import * as fleece from "silver-fleece";
import { getLogger } from "../base";
import { PochiConfig } from "./types";
import type { VendorConfig } from "./vendor";

const PochiConfigFilePath = path.join(os.homedir(), ".pochi", "config.jsonc");

const logger = getLogger("PochiConfigManager");

class PochiConfigManager {
  private readonly cfg: Signal<PochiConfig> = signal({});
  private events = new EventTarget();

  constructor() {
    this.cfg.value = this.load();
    this.watch();

    if (process.env.POCHI_SESSION_TOKEN) {
      this.cfg.value = {
        ...this.cfg.value,
        vendors: {
          ...this.cfg.value.vendors,
          pochi: {
            ...this.cfg.value.vendors?.pochi,
            credentials: {
              token: process.env.POCHI_SESSION_TOKEN,
            },
          },
        },
      };
    }
  }

  private load() {
    try {
      const content = fs.readFileSync(PochiConfigFilePath, "utf-8");
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
      let content =
        (
          await fsPromise
            .readFile(PochiConfigFilePath, "utf8")
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

      await fsPromise.writeFile(PochiConfigFilePath, content);
    } catch (err) {
      logger.error("Failed to save config file", err);
    }
  }

  updateConfig = async (newConfig: Partial<PochiConfig>) => {
    let config: PochiConfig = {};
    config = mergeDeep(config, this.cfg.value);
    config = mergeDeep(config, newConfig);
    if (isDeepEqual(config, this.cfg.value)) return;
    this.cfg.value = config;

    // Save to file without await.
    await this.save();
  };

  getVendorConfig = (name: string) => {
    return this.cfg.value.vendors?.[name];
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

  get config(): ReadonlySignal<PochiConfig> {
    return this.cfg;
  }
}

const { config, updateConfig, getVendorConfig, updateVendorConfig } =
  new PochiConfigManager();
export {
  config as pochiConfig,
  updateConfig as updatePochiConfig,
  getVendorConfig,
  updateVendorConfig,
  PochiConfigFilePath,
};
