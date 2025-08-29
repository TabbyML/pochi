import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
import logo from "../../public/logo512.png";
import ExportedImage from "next-image-export-optimizer";
import { GithubInfo } from "fumadocs-ui/components/github-info";

const basePath = process.env.__NEXT_ROUTER_BASEPATH

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
        <ExportedImage src={logo} alt="Pochi Logo" width={24} height={24} basePath={basePath} />
        Pochi Docs
      </>
    ),
  },
  githubUrl: 'https://github.com/TabbyML/pochi',
  links: [
    {
      type:"custom",
      children: <GithubInfo owner="tabbyml" repo="pochi"/>
    }
  ]
};

export function formatTitle(title: string) {
  return `${title} - Pochi`;
}