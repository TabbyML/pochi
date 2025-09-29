import * as fs from "node:fs";
import * as fsPromise from "node:fs/promises";
import * as path from "node:path";
import { type Signal, signal } from "@preact/signals-core";
import * as JSONC from "jsonc-parser/esm";
import { funnel, isDeepEqual, mergeDeep } from "remeda";
import * as fleece from "silver-fleece";
import { getLogger } from "../base";
import { PochiConfig } from "./types";
import type { VendorConfig } from "./vendor";

const logger = getLogger("PochiConfigManager");

export class PochiConfigFile {
  private readonly cfg: Signal<PochiConfig> = signal({});
  private events = new EventTarget();
  readonly configFilePath: string;

  constructor(configFilePath: string) {
    this.configFilePath = configFilePath;
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
