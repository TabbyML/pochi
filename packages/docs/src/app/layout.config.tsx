import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
import logo from "../../public/logo512.png";
import ExportedImage from "next-image-export-optimizer";
import { ExtendedBaseLayoutProps } from "@/components/sidebar";

const basePath = process.env.__NEXT_ROUTER_BASEPATH

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
        <ExportedImage src={logo} alt="Pochi Logo" width={24} height={24} basePath={basePath} />
        Pochi Docs
      </>
    ),
    transparentMode:"none",
  },
  github: {
    owner: 'tabbyml',
    repo: 'pochi',
  },
};

export function formatTitle(title: string) {
  return `${title} - Pochi`;
}