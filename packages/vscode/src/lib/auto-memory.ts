import { AutoMemoryManager as BaseAutoMemoryManager } from "@getpochi/common/auto-memory/node";
import { injectable, singleton } from "tsyringe";

@injectable()
@singleton()
export class AutoMemoryManager extends BaseAutoMemoryManager {}
