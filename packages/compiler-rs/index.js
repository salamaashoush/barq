"use strict";

const { existsSync, readFileSync } = require("node:fs");
const { join } = require("node:path");

const { name, version } = require("./package.json");

const PREBUILT = [
  "darwin-arm64",
  "darwin-x64",
  "linux-arm64-gnu",
  "linux-x64-gnu",
  "linux-x64-musl",
  "win32-arm64-msvc",
  "win32-x64-msvc",
];

function isMusl() {
  try {
    return readFileSync("/usr/bin/ldd", "utf8").includes("musl");
  } catch {
    const report = typeof process.report?.getReport === "function" ? process.report.getReport() : null;
    return report !== null && !report.header?.glibcVersionRuntime;
  }
}

function platformKey() {
  const { platform, arch } = process;
  if (platform === "linux") return `linux-${arch}-${isMusl() ? "musl" : "gnu"}`;
  if (platform === "win32") return `win32-${arch}-msvc`;
  return `${platform}-${arch}`;
}

function load() {
  const key = platformKey();

  // A binary beside this file can only be a local `napi build`: `files` does
  // not ship one. It wins over the installed platform package, and a broken one
  // is an error rather than a fallback, so the workspace never silently tests
  // the last published compiler.
  const local = join(__dirname, `barq-compiler.${key}.node`);
  if (existsSync(local)) return require(local);

  const pkg = `${name}-${key}`;
  if (!PREBUILT.includes(key)) {
    throw new Error(
      `${name} has no prebuilt native binding for ${key}. Prebuilt bindings exist for ` +
        `${PREBUILT.join(", ")}. On another platform, build one from source with a Rust ` +
        "toolchain: `napi build --platform --release --no-js` in this package's directory.",
    );
  }

  let resolved;
  try {
    resolved = require.resolve(pkg);
  } catch (error) {
    if (error?.code !== "MODULE_NOT_FOUND") throw error;
    throw new Error(
      `${name} could not find its native binding for ${key}: the optional dependency ${pkg} ` +
        "is not installed. Package managers skip it when optional dependencies are disabled " +
        "(--no-optional, --omit=optional) or when the lockfile was written on another platform. " +
        "Reinstall with optional dependencies enabled.",
      { cause: error },
    );
  }

  const installed = require(`${pkg}/package.json`).version;
  if (installed !== version) {
    throw new Error(
      `${name}@${version} found ${pkg}@${installed}; the two are released together and must ` +
        "match. Reinstall so the lockfile resolves both to the same version.",
    );
  }
  return require(resolved);
}

const binding = load();

// One static assignment per export: node's CommonJS-to-ESM bridge finds named
// exports by scanning for this shape, so `import { transform }` needs it.

module.exports.diagnosticCodes = binding.diagnosticCodes;
module.exports.layerOrder = binding.layerOrder;
module.exports.middlewareSplit = binding.middlewareSplit;
module.exports.opcodes = binding.opcodes;
module.exports.orderCss = binding.orderCss;
module.exports.routeSplit = binding.routeSplit;
module.exports.routeTree = binding.routeTree;
module.exports.transform = binding.transform;
