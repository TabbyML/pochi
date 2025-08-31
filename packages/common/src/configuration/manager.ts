import { readFileSync } from "node:fs";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import z from "zod";
import { getLogger } from "../base";
import { CustomModelSetting } from "./model";

const PochiConfig = z.object({
  credentials: z
    .object({
      pochiToken: z.string().optional(),
    })
    .optional(),
  customModelSettings: z.array(CustomModelSetting).optional(),
});

type PochiConfig = z.infer<typeof PochiConfig>;

const ConfigFilePath = path.join(os.homedir(), ".pochi", "config.json");

const logger = getLogger("PochiConfigManager");

class PochiConfigManager {
  private config: PochiConfig;

  constructor() {
    this.config = this.load() || {};
  }

  private load() {
    try {
      const file = readFileSync(ConfigFilePath, "utf-8");
      return PochiConfig.parse(JSON.parse(file));
    } catch (err) {
      logger.debug("Failed to load config file", err);
    }
  }

  private async save() {
    try {
      await fs.writeFile(ConfigFilePath, JSON.stringify(this.config, null, 2));
    } catch (err) {
      logger.debug("Failed to save config file", err);
    }
  }

  get customModelSettings() {
    return this.config.customModelSettings ?? [];
  }

  set customModelSettings(settings: CustomModelSetting[] | undefined) {
    this.config.customModelSettings = settings;
    this.save();
  }

  get pochiToken() {
    return this.config.credentials?.pochiToken;
  }

  set pochiToken(token: string | undefined) {
    this.config.credentials = {
      ...this.config.credentials,
      pochiToken: token,
    };
    this.save();
  }
}

export const pochiConfig = new PochiConfigManager();
