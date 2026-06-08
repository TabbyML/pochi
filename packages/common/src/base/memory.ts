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
