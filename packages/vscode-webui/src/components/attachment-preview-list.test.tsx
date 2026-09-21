// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { FileUIPart } from "ai";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AttachmentPreviewList } from "./attachment-preview-list";

vi.mock("@/components/ui/hover-card", () => {
  const Wrapper = ({ children }: { children: ReactNode }) => <>{children}</>;
  return {
    HoverCard: Wrapper,
    HoverCardContent: Wrapper,
    HoverCardTrigger: Wrapper,
  };
});
vi.mock("@/features/tools", () => ({ FileIcon: () => null }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("./ui/copyable-image", () => ({
  CopyableImage: ({ src, alt }: { src: string; alt: string }) => (
    <img src={src} alt={alt} />
  ),
}));

const uploadedImage: FileUIPart = {
  type: "file",
  filename: "queued.png",
  mediaType: "image/png",
  url: "https://blob/queued.png",
};

describe("AttachmentPreviewList", () => {
  const createObjectURL = vi.fn(() => "blob:local-preview");
  const revokeObjectURL = vi.fn();

  beforeEach(() => {
    createObjectURL.mockClear();
    revokeObjectURL.mockClear();
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("previews local and uploaded images and only revokes local URLs", async () => {
    const localFile = new File(["image"], "new.png", { type: "image/png" });
    const { unmount } = render(
      <AttachmentPreviewList
        files={[uploadedImage, localFile]}
        onRemove={vi.fn()}
        isUploading={false}
      />,
    );

    await waitFor(() => {
      expect(screen.getAllByAltText("queued.png")).toHaveLength(2);
      expect(screen.getAllByAltText("new.png")).toHaveLength(2);
    });
    for (const image of screen.getAllByAltText("queued.png")) {
      expect(image.getAttribute("src")).toBe(uploadedImage.url);
    }
    for (const image of screen.getAllByAltText("new.png")) {
      expect(image.getAttribute("src")).toBe("blob:local-preview");
    }
    expect(createObjectURL).toHaveBeenCalledExactlyOnceWith(localFile);
    unmount();
    expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith(
      "blob:local-preview",
    );
  });

  it("uses uploaded video URLs and omits unavailable file sizes", async () => {
    const { container } = render(
      <AttachmentPreviewList
        files={[
          {
            type: "file",
            filename: "clip.mp4",
            mediaType: "video/mp4",
            url: "https://blob/clip.mp4",
          },
          {
            type: "file",
            filename: "doc.pdf",
            mediaType: "application/pdf",
            url: "https://blob/doc.pdf",
          },
        ]}
        onRemove={vi.fn()}
        isUploading={false}
      />,
    );

    await waitFor(() => {
      expect(container.querySelector("video")?.getAttribute("src")).toBe(
        "https://blob/clip.mp4",
      );
    });
    expect(screen.getByText("doc.pdf")).toBeTruthy();
    expect(container.textContent).not.toContain("KB");
    expect(createObjectURL).not.toHaveBeenCalled();
  });
});
