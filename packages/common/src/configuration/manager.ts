import * as fs from "node:fs";
import * as fsPromise from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { type Signal, signal } from "@preact/signals-core";
import { funnel, isDeepEqual } from "remeda";
import { loadConfigSync } from "zod-config";
import { jsonAdapter } from "zod-config/json-adapter";
import z from "zod/v4";
import { getLogger } from "../base";
import { CustomModelSetting } from "./model";

const ConfigFilePath = path.join(os.homedir(), ".pochi", "config.json");

export const PochiConfig = z.object({
  credentials: z
    .object({
      pochiToken: z.string().optional(),
    })
    .optional(),
  customModelSettings: z.array(CustomModelSetting).optional(),
});

type PochiConfig = z.infer<typeof PochiConfig>;

const logger = getLogger("PochiConfigManager");

class PochiConfigManager {
  readonly config: Signal<PochiConfig> = signal({});
  private events = new EventTarget();

  constructor() {
    this.ensureFileExists();
    this.config.value = this.load();
    this.config.subscribe(this.onSignalChange);
    this.watch();
  }

  private load() {
    return loadConfigSync({
      schema: PochiConfig,
      adapters: [jsonAdapter({ path: ConfigFilePath })],
      logger,
    });
  }

  private onChange = () => {
    const oldValue = this.config.value;
    const newValue = this.load();
    if (isDeepEqual(oldValue, newValue)) return;
    this.config.value = newValue;
  };

  private onSignalChange = async () => {
    const oldValue = this.load();
    const newValue = this.config.value;
    if (isDeepEqual(oldValue, newValue)) return;
    await this.save();
  };

  private async watch() {
    this.events.addEventListener("change", this.onChange);
    const debouncer = funnel(
      () => {
        this.events.dispatchEvent(new Event("change"));
      },
      {
        minGapMs: process.platform === "win32" ? 100 : 1000,
        triggerAt: "both",
      },
    );
    fs.watch(ConfigFilePath, { persistent: false }, () => debouncer.call());
  }

  private async ensureFileExists() {
    const fileExist = await fsPromise
      .access(ConfigFilePath)
      .then(() => true)
      .catch(() => false);
    if (!fileExist) {
      const dirPath = path.dirname(ConfigFilePath);
      await fsPromise.mkdir(dirPath, { recursive: true });
      await this.save();
    }
  }

  private async save() {
    try {
      await fsPromise.writeFile(
        ConfigFilePath,
        JSON.stringify(this.config, null, 2),
      );
    } catch (err) {
      logger.debug("Failed to save config file", err);
    }
  }
}

const { config } = new PochiConfigManager();
export { config as pochiConfig };
