// Modified from: https://github.com/TabbyML/tabby/blob/493cef3b3229548175de430dbc7f7e4a092ca507/clients/tabby-agent/src/codeCompletion/buildRequest.ts

import path from "node:path";
import type { CodeCompletionRequest } from "@getpochi/common/pochi-api";
import type * as vscode from "vscode";
import { CodeCompletionConfig } from "./configuration";
import type { CompletionContext, CompletionExtraContexts } from "./contexts";
import { cropTextToMaxChars } from "./utils/strings";

export function buildSegments(params: {
  context: CompletionContext;
  extraContexts: CompletionExtraContexts;
}): CodeCompletionRequest["segments"] {
  const { context, extraContexts } = params;
  const config = CodeCompletionConfig.value.prompt;

  // prefix && suffix
  const prefix = context.prefixLines
    .slice(Math.max(context.prefixLines.length - config.maxPrefixLines, 0))
    .join("");
  const suffix = context.suffixLines.slice(0, config.maxSuffixLines).join("");

  // filepath && git_url
  let relativeRootUri: vscode.Uri | undefined = undefined;
  let gitUrl: string | undefined = undefined;
  if (extraContexts.git?.repository) {
    // find remote url: origin > upstream > first
    const repo = extraContexts.git.repository;
    const remote =
      repo.remotes?.find((remote) => remote.name === "origin") ||
      repo.remotes?.find((remote) => remote.name === "upstream") ||
      repo.remotes?.[0];
    if (remote) {
      relativeRootUri = repo.root;
      gitUrl = remote.url;
    }
  }
  // if relativeFilepathRoot is not set by git context, use path relative to workspace
  if (!relativeRootUri && extraContexts.workspace) {
    relativeRootUri = extraContexts.workspace.uri;
  }
  const relativeRootPath = relativeRootUri?.toString();
  const convertToRelativePath = (uri: vscode.Uri): string => {
    const uriString = uri.toString();
    if (relativeRootPath && uriString.startsWith(relativeRootPath)) {
      return path.relative(relativeRootPath, uriString);
    }
    return uriString;
  };

  const filepath = convertToRelativePath(context.document.uri);

  // snippets location for deduplication
  // FIXME(zhiming): need improve for range overlapping
  const snippetsLocations: { uri: vscode.Uri; range?: vscode.Range }[] = [];
  const isExists = (item: {
    uri: vscode.Uri;
    range?: vscode.Range;
  }): boolean => {
    return !!snippetsLocations.find(
      (location) =>
        location.uri.toString() === item.uri.toString() &&
        (!location.range ||
          !item.range ||
          location.range.intersection(item.range)),
    );
  };

  // declarations
  const declarations: CodeCompletionRequest["segments"]["declarations"] = [];
  for (const item of extraContexts.declarations ?? []) {
    if (declarations.length >= config.fillDeclarations.maxSnippets) {
      continue;
    }
    declarations.push({
      filepath: convertToRelativePath(item.uri),
      body: cropTextToMaxChars(
        item.text,
        config.fillDeclarations.maxCharsPerSnippet,
      ),
    });
    snippetsLocations.push(item);
  }

  // snippets: recently changed code search
  const recentlyChangedCodeSearchResult: CodeCompletionRequest["segments"]["relevantSnippetsFromChangedFiles"] =
    [];
  for (const item of extraContexts.recentlyChangedCodeSearchResult ?? []) {
    if (
      recentlyChangedCodeSearchResult.length >=
        config.collectSnippetsFromRecentChangedFiles.maxSnippets ||
      isExists(item)
    ) {
      continue;
    }
    recentlyChangedCodeSearchResult.push({
      filepath: convertToRelativePath(item.uri),
      body: item.text,
      score: item.score,
    });
    snippetsLocations.push(item);
  }

  // snippets: last viewed ranges
  const lastViewedSnippets: CodeCompletionRequest["segments"]["relevantSnippetsFromRecentlyOpenedFiles"] =
    [];
  for (const item of extraContexts.lastViewedSnippets ?? []) {
    if (
      lastViewedSnippets.length >=
        config.collectSnippetsFromRecentOpenedFiles.maxOpenedFiles ||
      isExists(item)
    ) {
      continue;
    }
    lastViewedSnippets.push({
      filepath: convertToRelativePath(item.uri),
      body: cropTextToMaxChars(
        item.text,
        config.collectSnippetsFromRecentOpenedFiles.maxCharsPerOpenedFiles,
      ),
      score: 1,
    });
    snippetsLocations.push(item);
  }

  return {
    prefix,
    suffix,
    filepath,
    gitUrl,
    declarations: declarations.length > 0 ? declarations : undefined,
    relevantSnippetsFromChangedFiles:
      recentlyChangedCodeSearchResult.length > 0
        ? recentlyChangedCodeSearchResult
        : undefined,
    relevantSnippetsFromRecentlyOpenedFiles:
      lastViewedSnippets.length > 0 ? lastViewedSnippets : undefined,
  };
}
