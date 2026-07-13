import type { AutoMemoryContext } from "./prompts/auto-memory";

export interface TaskMemoryState {
  initialized: boolean;
  lastExtractionTokens: number;
  lastExtractionToolCalls: number;
  /**
   * UUID of the last message incorporated into memory.md by the most recent
   * successful extraction. Compaction uses this as the boundary to know
   * which messages are already covered by the curated session notes and
   * which still need to be preserved verbatim.
   */
  lastExtractionMessageId?: string;
  /**
   * Snapshot of the trailing message UUID at the moment the in-flight
   * extraction was started. Promoted to `lastExtractionMessageId` once the
   * fork agent writes memory.md successfully.
   */
  pendingExtractionMessageId?: string;
  isExtracting: boolean;
  extractionCount: number;
  activeTaskId?: string;
}

export interface AutoMemoryTaskState {
  lastExtractionMessageCount: number;
  pendingExtractionMessageCount?: number;
  isExtracting: boolean;
  extractionCount: number;
  activeExtractionTaskId?: string;
  isDreaming: boolean;
  activeDreamTaskId?: string;
  activeDreamToken?: string;
  activeDreamMemoryDir?: string;
  activeDreamPreviousLastDreamAt?: number;
}

export interface AutoMemoryDreamCandidate {
  taskId: string;
  updatedAt: number;
  cwd?: string | null;
  /**
   * Transcript filename relative to {@link AutoMemoryContext.transcriptDir}.
   * The dream agent reads transcripts on demand via the readFile tool.
   */
  transcriptFilename: string;
  title?: string;
}

export interface AutoMemoryDreamRun {
  context: AutoMemoryContext;
  token: string;
  previousLastDreamAt: number;
  sessionCount: number;
  reason: "time" | "sessions";
  candidates: ReadonlyArray<AutoMemoryDreamCandidate>;
}

export interface AutoMemoryReadContextOptions {
  cwd?: string;
  ensure?: boolean;
  /**
   * When true, bypass the user's Project Memory enabled preference and
   * return the context regardless. Used by UI surfaces that need to surface
   * the memory index file, and by background extraction which keeps running
   * even when memory injection is disabled.
   */
  force?: boolean;
}

export interface AutoMemoryTranscriptInfo {
  transcriptDir: string;
  filename: string;
}

export interface AutoMemoryManager {
  readContext(
    cwdOrOptions?: string | AutoMemoryReadContextOptions,
  ): Promise<AutoMemoryContext | undefined>;
  writeTaskTranscript(options: {
    taskId: string;
    cwd?: string;
    title?: string;
    updatedAt?: number;
    transcript: string;
  }): Promise<AutoMemoryTranscriptInfo | undefined>;
  beginDreamRun(options: {
    cwd?: string;
    candidates?: readonly AutoMemoryDreamCandidate[];
    sessionUpdatedAts?: readonly number[];
    currentTranscript?: AutoMemoryDreamCandidate;
  }): Promise<AutoMemoryDreamRun | undefined>;
  finishDreamRun(options: {
    memoryDir: string;
    token: string;
    previousLastDreamAt: number;
    success: boolean;
  }): Promise<void>;
  clearProjectMemory(options?: { cwd?: string }): Promise<void>;
}
