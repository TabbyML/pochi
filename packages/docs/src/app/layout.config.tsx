import type { ExtendedBaseLayoutProps } from "@/components/sidebar";
import ExportedImage from "next-image-export-optimizer";
import logo from "../../public/logo512.png";

const basePath = process.env.__NEXT_ROUTER_BASEPATH;

/**
 * Shared layout configurations
 *
 * you can customise layouts individually from:
 * Home Layout: app/(home)/layout.tsx
 * Docs Layout: app/docs/layout.tsx
 */
export const baseOptions: ExtendedBaseLayoutProps = {
  nav: {
    title: (
      <>
        <ExportedImage
          src={logo}
          alt="Pochi Logo"
          width={24}
          height={24}
          basePath={basePath}
        />
        Pochi Docs
      </>
    ),
    transparentMode: "none",
  },
  github: {
    owner: "TabbyML",
    repo: "pochi",
  },
};

export function formatTitle(title: string) {
  return `${title} - Pochi`;
}
