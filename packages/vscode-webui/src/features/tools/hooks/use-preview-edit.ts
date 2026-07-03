import { vscodeHost } from "@/lib/vscode";
import { useEffect, useState } from "react";

export type PreviewEdit = {
  edit: string;
  editSummary: { added: number; removed: number };
};

/**
 * Computes a preview diff for a file-editing tool call (applyDiff, multiApplyDiff,
 * writeToFile) so that the diff can be shown before the user approves the tool call.
 *
 * The preview is only fetched when `enabled` is true (typically while the tool call
 * is awaiting approval and no result is available yet).
 */
export function usePreviewEdit(
  toolName: string,
  input: unknown,
  enabled: boolean,
): PreviewEdit | undefined {
  const [preview, setPreview] = useState<PreviewEdit | undefined>(undefined);

  // Stabilize the effect against object identity changes of `input`.
  const inputKey = enabled ? safeStringify(input) : undefined;

  // biome-ignore lint/correctness/useExhaustiveDependencies: inputKey stands in for input
  useEffect(() => {
    if (!enabled) {
      setPreview(undefined);
      return;
    }

    let cancelled = false;
    vscodeHost
      .previewEdit(toolName, input)
      .then((result) => {
        if (!cancelled) {
          setPreview(result ?? undefined);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPreview(undefined);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [toolName, inputKey, enabled]);

  return preview;
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? "";
  } catch {
    return "";
  }
}
