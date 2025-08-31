import * as fs from "node:fs";
import * as fsPromise from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { type ReadonlySignal, type Signal, signal } from "@preact/signals-core";
import { funnel, isDeepEqual, mergeDeep } from "remeda";
import { loadConfigSync } from "zod-config";
import { jsonAdapter } from "zod-config/json-adapter";
import z from "zod/v4";
import { getLogger } from "../base";
import { McpServerConfig } from "./mcp";
import { CustomModelSetting } from "./model";

const PochiConfigFilePath = path.join(os.homedir(), ".pochi", "config.json");

export const PochiConfig = z.object({
  $schema: z
    .string()
    .default("https://getpochi.com/config.schema.json")
    .optional(),
  credentials: z
    .object({
      pochiToken: z.string().optional(),
    })
    .optional(),
  providers: z.array(CustomModelSetting).optional(),
  mcp: z.record(z.string(), McpServerConfig).optional(),
});

type PochiConfig = z.infer<typeof PochiConfig>;

const logger = getLogger("PochiConfigManager");

class PochiConfigManager {
  private readonly value: Signal<PochiConfig> = signal({});
  private events = new EventTarget();

  constructor() {
    this.value.value = this.load();
    this.value.subscribe(this.onSignalChange);
    this.watch();

    if (process.env.POCHI_SESSION_TOKEN) {
      this.value.value = {
        ...this.value.value,
        credentials: {
          ...this.value.value.credentials,
          pochiToken: process.env.POCHI_SESSION_TOKEN,
        },
      };
    }
  }

  private load() {
    return loadConfigSync({
      schema: PochiConfig,
      adapters: [jsonAdapter({ path: PochiConfigFilePath })],
      logger,
      silent: true,
    });
  }

  private onChange = () => {
    const oldValue = this.value.value;
    const newValue = this.load();
    if (isDeepEqual(oldValue, newValue)) return;
    this.value.value = newValue;
  };

  private onSignalChange = async () => {
    const oldValue = this.load();
    const newValue = this.value.value;
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
      await fsPromise.writeFile(
        PochiConfigFilePath,
        JSON.stringify(this.value, null, 2),
      );
    } catch (err) {
      logger.debug("Failed to save config file", err);
    }
  }

  updateConfig = (newConfig: Partial<PochiConfig>) => {
    let config: PochiConfig = {};
    config = mergeDeep(config, this.value.value);
    config = mergeDeep(config, newConfig);
    this.value.value = config;
  };

  get config(): ReadonlySignal<PochiConfig> {
    return this.value;
  }
}

const { config, updateConfig } = new PochiConfigManager();
export {
  config as pochiConfig,
  updateConfig as updatePochiConfig,
  PochiConfigFilePath,
};
