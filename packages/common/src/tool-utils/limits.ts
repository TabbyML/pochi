export const MaxRipgrepItems = 500;
export const MaxRipgrepCharLength = 30_000;
export const MaxListFileItems = 1500;
export const MaxListFileCharLength = 30_000;
export const MaxGlobFileItems = 500;
export const MaxReadFileSize = 30_000;
export const MaxTerminalOutputSize = 500_000;
/**
 * Max number of lines kept in a user-opened terminal's reconstructed history
 * (cwd/command headers + output across multiple commands). Oldest lines are
 * evicted first once this cap is exceeded.
 */
export const MaxTerminalHistoryLines = 500;
export const MaxPersistedToolResultSize = 50_000;
export const PersistedToolResultPreviewSize = 2_000;
