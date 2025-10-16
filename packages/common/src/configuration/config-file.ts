import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as fsPromise from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { type Signal, signal } from "@preact/signals-core";
import * as JSONC from "jsonc-parser/esm";
import { funnel, isDeepEqual, mergeDeep } from "remeda";
import * as fleece from "silver-fleece";
import { getLogger } from "../base";
import { isVSCodeEnvironment } from "../env-utils";
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
    this.init();
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

  private async init() {
    await this.ensureFileExists();
    if (isVSCodeEnvironment()) {
      this.watch();
    }
  }

  private watch() {
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
    const configDir = path.dirname(this.configFilePath);
    const configFileName = path.basename(this.configFilePath);
    fs.watch(configDir, { persistent: false }, (_eventType, filename) => {
      if (filename === configFileName) {
        debouncer.call();
      }
    });
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

      // writeFile is not atomic,
      // the writing of multiple instance of pochi in the same time would break the config
      // so we use rename to make sure the config remains valid during write
      //
      // the caveat is only the last writer wins, but it's acceptable
      // Using system temp directory and random UUID for unique temporary file name
      const tmp = path.join(
        os.tmpdir(),
        `${path.basename(this.configFilePath)}.${randomUUID()}.tmp`,
      );
      await fsPromise.writeFile(tmp, content);
      await fsPromise.rename(tmp, this.configFilePath);
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
