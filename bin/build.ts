import { build, BuildOptions } from "esbuild";

const packageJson = require("../package.json");

console.log(packageJson);

const entryFile = "src/index.ts";
const shared: BuildOptions = {
  bundle: true,
  entryPoints: [entryFile],
  external: Object.keys(packageJson.dependencies),
  logLevel: "info",
  minify: true,
  sourcemap: false,
  platform: "node",
};

build({
  ...shared,
  format: "esm",
  outfile: "./dist/index.esm.js",
  target: ["ES6"],
});

build({
  ...shared,
  format: "cjs",
  outfile: "./dist/index.cjs.js",
  target: ["ES6"],
});
