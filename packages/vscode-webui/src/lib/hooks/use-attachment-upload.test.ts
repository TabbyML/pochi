// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import type { FileUIPart } from "ai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAttachmentUpload } from "./use-attachment-upload";

const fileToUri = vi.hoisted(() => vi.fn(async () => "https://blob/uploaded"));

vi.mock("@getpochi/livekit", () => ({ fileToUri }));
vi.mock("@/lib/remote-blob-store", () => ({ blobStore: {} }));

const restoredPart: FileUIPart = {
  type: "file",
  filename: "queued.png",
  mediaType: "image/png",
  url: "https://blob/queued.png",
};

describe("useAttachmentUpload", () => {
  beforeEach(() => {
    fileToUri.mockClear();
  });

  it("does not upload restored attachments again", async () => {
    const { result } = renderHook(() => useAttachmentUpload());

    act(() => {
      result.current.restoreFiles([restoredPart]);
    });

    expect(result.current.files).toEqual([restoredPart]);

    let uploaded: FileUIPart[] | undefined;
    await act(async () => {
      uploaded = await result.current.upload();
    });

    expect(uploaded).toEqual([restoredPart]);
    expect(fileToUri).not.toHaveBeenCalled();
  });

  it("uploads attachments that were added after a restore", async () => {
    const { result } = renderHook(() => useAttachmentUpload());
    const added = new File(["image"], "added.png", { type: "image/png" });

    act(() => {
      result.current.restoreFiles([restoredPart]);
    });
    act(() => {
      result.current.handleFileDrop([added]);
    });

    let uploaded: FileUIPart[] | undefined;
    await act(async () => {
      uploaded = await result.current.upload();
    });

    expect(uploaded).toEqual([
      restoredPart,
      {
        type: "file",
        filename: "added.png",
        mediaType: "image/png",
        url: "https://blob/uploaded",
      },
    ]);
    expect(fileToUri).toHaveBeenCalledOnce();
    expect(fileToUri).toHaveBeenCalledWith({}, added, expect.any(AbortSignal));
  });

  it("removes a restored attachment without losing the new local file", async () => {
    const { result } = renderHook(() => useAttachmentUpload());
    const added = new File(["image"], "added.png", { type: "image/png" });

    act(() => result.current.restoreFiles([restoredPart]));
    act(() => result.current.handleFileDrop([added]));
    act(() => result.current.removeFile(0));

    expect(result.current.files).toEqual([added]);
    await act(async () => {
      expect(await result.current.upload()).toEqual([
        {
          type: "file",
          filename: "added.png",
          mediaType: "image/png",
          url: "https://blob/uploaded",
        },
      ]);
    });
  });

  it("counts restored attachments toward the attachment limit", () => {
    const { result } = renderHook(() =>
      useAttachmentUpload({ maxAttachments: 1 }),
    );
    const added = new File(["image"], "added.png", { type: "image/png" });

    act(() => result.current.restoreFiles([restoredPart]));
    act(() => {
      expect(result.current.handleFileDrop([added])).toBe(false);
    });

    expect(result.current.files).toEqual([restoredPart]);
    expect(result.current.error?.message).toContain("Cannot attach more than 1");
  });
});
