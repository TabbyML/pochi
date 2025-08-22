import { createMDX } from "fumadocs-mdx/next";

const withMDX = createMDX();

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || ''

/** @type {import('next').NextConfig} */
const config = {
  output: "export",
  reactStrictMode: true,
  assetPrefix: `${basePath}/`,
};

export default withMDX(config);
