import { MaxAttachments } from "@/lib/constants";
import { createFileName, validateFile } from "@/lib/utils/attachment";
import type { PochiApi } from "@getpochi/common/pochi-api";
import { getServerBaseUrl } from "@getpochi/common/vscode-webui-bridge";
import type { FileUIPart } from "ai";
import { hc } from "hono/client";
import { useRef, useState } from "react";

interface UseAttachmentUploadOptions {
  maxAttachments?: number;
}

export function useAttachmentUpload(options?: UseAttachmentUploadOptions) {
  const maxAttachments = options?.maxAttachments ?? MaxAttachments;
  const [files, setFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<Error | undefined>(undefined);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortController = useRef<AbortController | null>(null);

  const showError = (message: string) => {
    const error = new Error(message);
    setError(error);
  };

  const clearError = () => {
    setError(undefined);
  };

  const validateAndAddFiles = (
    newFiles: File[],
    fromClipboard = false,
  ): boolean => {
    // Check total count
    if (files.length + newFiles.length > maxAttachments) {
      showError(`Cannot attach more than ${maxAttachments} attachments`);
      return false;
    }

    // Validate each file and collect errors
    const errors: string[] = [];
    const validFiles: File[] = [];

    for (const file of newFiles) {
      const validation = validateFile(file);
      if (validation.valid) {
        // Process clipboard files to have consistent filenames
        const processedFile = fromClipboard
          ? new File([file], createFileName(file.type), {
              type: file.type,
            })
          : file;
        validFiles.push(processedFile);
      } else {
        errors.push(validation.error || "Invalid file");
      }
    }

    if (errors.length > 0) {
      showError(errors[0]); // Show first error
      return false;
    }

    // Check for duplicates (simple name+size check)
    const existingFileIds = new Set(files.map((f) => `${f.name}-${f.size}`));
    const nonDuplicateFiles = validFiles.filter(
      (file) => !existingFileIds.has(`${file.name}-${file.size}`),
    );

    if (nonDuplicateFiles.length < validFiles.length) {
      const duplicateCount = validFiles.length - nonDuplicateFiles.length;
      showError(`${duplicateCount} duplicate file(s) were skipped`);
      if (nonDuplicateFiles.length === 0) {
        return false;
      }
    }

    setFiles((prev) => [...prev, ...nonDuplicateFiles]);
    clearError();
    return true;
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const clearFiles = () => {
    setFiles([]);
    clearError();
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = event.target.files;
    if (selectedFiles && selectedFiles.length > 0) {
      validateAndAddFiles(Array.from(selectedFiles));
    }

    // Clear the input value to allow selecting the same file again
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handlePaste = (event: ClipboardEvent): boolean => {
    const items = event.clipboardData?.items;
    if (!items) return false;

    const pastedFiles = Array.from(items)
      .map((item) => item.getAsFile())
      .filter(Boolean) as File[];

    if (pastedFiles.length > 0) {
      const success = validateAndAddFiles(pastedFiles, true);
      if (success) {
        event.preventDefault();
        return true;
      }
    }

    return false;
  };

  const handleFileDrop = (files: File[]): boolean => {
    if (!files || files.length === 0) return false;

    return validateAndAddFiles(files);
  };

  const upload = async (): Promise<FileUIPart[]> => {
    if (!files.length) {
      return [];
    }

    setIsUploading(true);
    clearError();

    // Create new abort controller for this upload
    abortController.current = new AbortController();

    try {
      const uploadPromises = files.map(async (file) => {
        return {
          type: "file",
          filename: file.name || "unnamed-file",
          mediaType: file.type,
          url: await fileToRemoteUri(file, abortController.current?.signal),
          // url: await fileToDataUri(file),
        } satisfies FileUIPart;
      });

      const uploadedAttachments = await Promise.all(uploadPromises);

      // Clear files after successful upload
      clearFiles();

      return uploadedAttachments;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        showError("Upload cancelled");
      } else {
        showError("Failed to upload attachments. Please try again.");
      }
      throw error;
    } finally {
      setIsUploading(false);
      abortController.current = null;
    }
  };

  const cancelUpload = () => {
    if (abortController.current) {
      abortController.current.abort();
    }
  };

  return {
    // State
    files,
    isUploading,
    error,

    // Refs
    fileInputRef,

    // Actions
    removeFile,
    clearFiles,
    clearError,
    upload,
    cancelUpload,

    // Event handlers
    handleFileSelect,
    handlePaste,
    handleFileDrop,
  };
}

// function fileToDataUri(file: File) {
//   return new Promise<string>((resolve, reject) => {
//     const reader = new FileReader();
//     reader.onload = () => resolve(reader.result as string);
//     reader.onerror = (error) => reject(error);
//     reader.readAsDataURL(file);
//   });
// }

async function fileToRemoteUri(file: File, signal?: AbortSignal) {
  const apiClient = hc<PochiApi>(getServerBaseUrl());
  const response = await apiClient.api.upload.$post(
    {
      form: {
        file,
      },
    },
    {
      init: {
        signal,
      },
    },
  );

  if (!response.ok) {
    throw new Error(`Upload failed: ${response.statusText}`);
  }

  const data = await response.json();

  if (!data.url) {
    throw new Error("Failed to upload attachment");
  }
  return data.url;
}
