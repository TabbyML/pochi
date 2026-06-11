import os from "node:os";
import path from "node:path";
import { getMainWorktreePath } from "@/integrations/git/util";
import {
  AutoMemoryManager as BaseAutoMemoryManager,
  removeTaskTranscripts,
  resolveMainWorktreePath,
  sanitizeMemoryRepoKey,
} from "@getpochi/common/auto-memory/node";
import { injectable, singleton } from "tsyringe";

@injectable()
@singleton()
export class AutoMemoryManager extends BaseAutoMemoryManager {
  constructor() {
    super({
      resolveMainWorktreePath: getMainWorktreePath,
      projectsRoot: path.join(os.homedir(), ".pochi", "projects"),
    });
  }
}

export {
  removeTaskTranscripts,
  resolveMainWorktreePath,
  sanitizeMemoryRepoKey,
};
