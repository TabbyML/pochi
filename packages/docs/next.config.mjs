import { createMDX } from "fumadocs-mdx/next";

const withMDX = createMDX();

const basePath = (process.env.NEXT_PUBLIC_BASE_PATH || '').replace(/\/$/, "");

/** @type {import('next').NextConfig} */
const config = {
  basePath: `${basePath}`,
  assetPrefix: `${basePath}`,
  output: "export",
  reactStrictMode: true,
  trailingSlash: true, // generate index.html
  images: {
    loader: "custom",
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
  },
  transpilePackages: ["next-image-export-optimizer"],
  env: {
    nextImageExportOptimizer_imageFolderPath: "public/images",
    nextImageExportOptimizer_exportFolderPath: "out",
    nextImageExportOptimizer_quality: "75",
    nextImageExportOptimizer_storePicturesInWEBP: "true",
    nextImageExportOptimizer_exportFolderName: "nextImageExportOptimizer",
    nextImageExportOptimizer_generateAndUseBlurImages: "true",
    nextImageExportOptimizer_remoteImageCacheTTL: "604800",
  },
};

export default withMDX(config);
