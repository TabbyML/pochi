import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
import logo from "../../public/logo512.png";
import ExportedImage from "next-image-export-optimizer";
/**
 * Shared layout configurations
 *
 * you can customise layouts individually from:
 * Home Layout: app/(home)/layout.tsx
 * Docs Layout: app/docs/layout.tsx
 */
export const baseOptions: BaseLayoutProps = {
  nav: {
    title: (
      <>
        <ExportedImage src={logo} alt="Pochi Logo" width={24} height={24} />
        Pochi Docs
      </>
    ),

  },
  githubUrl: 'https://github.com/TabbyML/pochi',
};

export function formatTitle(title: string) {
  return `${title} - Pochi`;
}