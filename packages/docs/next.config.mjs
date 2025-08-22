import { createMDX } from "fumadocs-mdx/next";

const withMDX = createMDX();

const basePath = (process.env.NEXT_PUBLIC_BASE_PATH || '/').replace(/\/$/, "");

/** @type {import('next').NextConfig} */
const config = {
  basePath: `${basePath}`,
  assetPrefix: `${basePath}`,
  output: "export",
  reactStrictMode: true,
  trailingSlash: true, // generate index.html
  images: {
    unoptimized: true,
  },
};

export default withMDX(config);
