import { compileFixture } from "../test/harness.ts";
for (const n of [
  "control-flow-show-eager-static-body",
  "control-flow-show-static-body",
  "control-flow-show-static-key",
  "dashboard-composite",
]) {
  console.log("=== " + n);
  console.log(
    compileFixture(n)
      .split("\n")
      .filter((l) => /branch\(/.test(l))
      .join("\n")
      .slice(0, 260),
  );
}
