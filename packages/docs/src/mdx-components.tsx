import defaultMdxComponents from 'fumadocs-ui/mdx';
import type { MDXComponents } from 'mdx/types';
import ExportedImage from "next-image-export-optimizer";

const basePath = process.env.__NEXT_ROUTER_BASEPATH

// use this function to get MDX components, you will need it for rendering MDX
export function getMDXComponents(components?: MDXComponents): MDXComponents {
  return {
    ...defaultMdxComponents,
    img: (props) => <ExportedImage {...props} basePath={basePath} />,
    ...components,
  };
}
