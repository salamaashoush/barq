// Loads @barqjs/compiler-rs through its own loader, with the binding a build
// job produced beside it, and compiles one component. Plain node and no
// install: the runners that check foreign architectures have neither bun nor
// node_modules.
"use strict";

const { join } = require("node:path");

const compiler = require(join(__dirname, "../../packages/compiler-rs/index.js"));
const { code } = compiler.transform("export const A = () => <p>{count()}</p>;", {
  filename: "a.tsx",
});
if (!code.includes("template(")) {
  console.error(code);
  throw new Error("the binding loaded but did not compile JSX");
}
console.log(`${process.platform}-${process.arch}: ok`);
