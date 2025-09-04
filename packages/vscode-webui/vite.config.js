import { resolve } from "node:path";
import { livestoreDevtoolsPlugin } from "@livestore/devtools-vite";
import tailwindcss from "@tailwindcss/vite";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { analyzer } from "vite-bundle-analyzer";
import EnvironmentPlugin from "vite-plugin-environment";
import tsconfigPaths from "vite-tsconfig-paths";

const BuildTarget = process.env.POCHI_BUILD_TARGET || "index";
const BuildSingleFile = BuildTarget === "index";

const CommonOutputOptions = {
  dir: resolve(__dirname, "dist", BuildTarget),
};

const OutputOptions = {
  index: {
    ...CommonOutputOptions,
    manualChunks: false,
    inlineDynamicImports: true,
    entryFileNames: "[name].js",
    assetFileNames: "[name].[ext]",
  },
  share: {
    ...CommonOutputOptions,
    manualChunks(id) {
      if (!id.includes("node_modules")) {
        return;
      }

      if (id.includes("@xterm")) {
        return "xterm";
      }

      if (id.includes("@tiptap")) {
        return "tiptap";
      }

      if (id.includes("refractor")) {
        if (id.includes("/lang/")) {
          return "refractor-lang";
        }
        return "refractor";
      }

      if (id.includes("react-syntax-highlighter")) {
        return "react-syntax-highlighter";
      }

      if (id.includes("better-auth")) {
        return "better-auth";
      }

      if (
        id.includes("react-markdown") ||
        id.includes("remark") ||
        id.includes("rehype")
      ) {
        return "markdown";
      }

      if (
        id.includes("/ai/") ||
        id.includes("@ai-sdk") ||
        id.includes("@ai-v5-sdk")
      ) {
        return "ai";
      }

      if (id.includes("motion")) {
        return "motion";
      }
    },
  },
};

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    EnvironmentPlugin({
      POCHI_LOCAL_SERVER: "false",
    }),
    tsconfigPaths(),
    TanStackRouterVite({ autoCodeSplitting: true }),
    viteReact({
      babel: {
        plugins: [["module:@preact/signals-react-transform"]],
      },
    }),
    tailwindcss(),
    livestoreDevtoolsPlugin({
      schemaPath: "../livekit/src/livestore/schema.ts",
    }),
    analyzer({
      enabled: !!process.env.VITE_BUNDLE_ANALYZER,
    }),
  ],
  worker: {
    format: "es",
    rollupOptions: { output: OutputOptions[BuildTarget] },
  },
  resolve: {
    alias: {
      // Stub out Node.js modules that shouldn't be used in browser
      "cloud-code-ai-provider":
        'data:text/javascript,export function createGoogleCloudCode() { throw new Error("Not available in browser"); }',
      open: 'data:text/javascript,export default function() { throw new Error("Not available in browser"); }',
      "wsl-utils":
        'data:text/javascript,export function getWslFsPath() { throw new Error("Not available in browser"); }',
      "default-browser":
        'data:text/javascript,export default function() { throw new Error("Not available in browser"); }',
    },
  },
  optimizeDeps: {
    // TODO remove once fixed https://github.com/vitejs/vite/issues/8427
    exclude: ["@livestore/wa-sqlite"],
  },
  build: {
    rollupOptions: {
      input: {
        [BuildTarget]: resolve(__dirname, `${BuildTarget}.html`),
      },
      output: OutputOptions[BuildTarget],
    },
  },
  experimental: {
    renderBuiltUrl(filename, { hostId, hostType, type }) {
      if (hostId === "index.js") {
        return {
          runtime: `window.__assetsPath(${JSON.stringify(filename)})`,
        };
      }
      if (hostId === "livestore.worker.js") {
        return {
          runtime: `self.__assetsPath(${JSON.stringify(filename)})`,
        };
      }
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
  },
  server: {
    cors: true,
    hmr: {
      host: "localhost",
      protocol: "ws",
    },
  },
});
