// Modified from: https://github.com/TabbyML/tabby/blob/493cef3b3229548175de430dbc7f7e4a092ca507/clients/tabby-agent/src/config

import { signal } from "@preact/signals-core";

const DefaultConfig = {
  request: {
    timeout: 60_000, // ms
    maxToken: 256,
  },
  prompt: {
    maxPrefixLines: 20,
    maxSuffixLines: 20,
    fillDeclarations: {
      enabled: true,
      maxSnippets: 5,
      maxCharsPerSnippet: 500,
    },
    collectSnippetsFromRecentChangedFiles: {
      enabled: true,
      maxSnippets: 5,
      maxCharsPerSnippet: 500,
      indexing: {
        checkingChangesInterval: 500,
        changesDebouncingInterval: 1000,
        prefixLines: 20,
        suffixLines: 20,
        maxChunks: 100,
        chunkSize: 500,
        overlapLines: 1,
      },
    },
    collectSnippetsFromRecentOpenedFiles: {
      enabled: true,
      maxSnippets: 5,
      maxCharsPerSnippet: 500,
    },
  },
  debounce: {
    mode: "adaptive",
    interval: 250, // ms
  },
  multiChoice: {
    maxItems: 3,
    maxTries: 6,
    temperature: 0.8,
  },
  postprocess: {
    minCompletionChars: 4,
  },
};

// FIXME(zhiming): This config is const, do not support dynamic updates for now.
export const CodeCompletionConfig = signal(DefaultConfig);
