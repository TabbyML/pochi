import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import z from "zod";
import { getLogger } from "../base";
import { CustomModelSetting } from "./model";

const PochiConfig = z.object({
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
      const file = fs.readFileSync(ConfigFilePath, "utf-8");
      return PochiConfig.parse(JSON.parse(file));
    } catch (err) {
      logger.debug("Failed to load config file", err);
    }
  }

  private save() {
    try {
      fs.writeFileSync(ConfigFilePath, JSON.stringify(this.config, null, 2));
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
}

export const pochiConfig = new PochiConfigManager();
