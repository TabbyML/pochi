const tsConfigPaths = require("tsconfig-paths");
const path = require("node:path");

const baseUrl = path.resolve(__dirname, "../");
const tsconfig = tsConfigPaths;
tsConfigPaths.register({
  baseUrl,
  paths: {
    "@/*": ["./src/*"],
  },
});

require("reflect-metadata");

require("extensionless/register");

const { register } = require("esbuild-register/dist/node");
const { unregister } = register({});
