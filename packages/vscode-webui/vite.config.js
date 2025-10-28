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

      if (id.includes("shiki")) {
        return "shiki";
      }

      if (
        id.includes("react-markdown") ||
        id.includes("streamdown") ||
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

const envPlugin = EnvironmentPlugin({
  POCHI_LOCAL_SERVER: "false",
  POCHI_LOCAL_SYNC_SERVER: "false",
});

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    envPlugin,
    tsconfigPaths({
      ignoreConfigErrors: true,
    }),
    TanStackRouterVite({
      autoCodeSplitting: true,
      routeTreeFileHeader: [
        "// @ts-nocheck",
        "// noinspection JSUnusedGlobalSymbols",
      ],
    }),
    viteReact({
      babel: {
        plugins: [["module:@preact/signals-react-transform"]],
      },
    }),
    tailwindcss(),
    livestoreDevtoolsPlugin({
      schemaPath: "../livekit/src/livestore/default-schema.ts",
    }),
    analyzer({
      enabled: !!process.env.VITE_BUNDLE_ANALYZER,
    }),
  ],
  worker: {
    format: "es",
    rollupOptions: { output: OutputOptions[BuildTarget] },
    plugins: () => [envPlugin],
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
      if (hostId.endsWith(".worker.js")) {
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
