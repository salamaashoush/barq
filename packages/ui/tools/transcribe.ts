/**
 * A shadcn class list, as the `css` block that replaces it.
 *
 * ```
 * bun run tools/transcribe.ts "inline-flex items-center gap-2 hover:bg-accent"
 * bun run tools/transcribe.ts --spec button.json
 * ```
 *
 * A spec is `{ "slot": "class list" }`, which is how a component with a base
 * and six variants is transcribed in one pass: the output is the blocks in
 * the order the spec named them, ready to paste into the component.
 *
 * Whatever Tailwind produced nothing for is reported rather than dropped. A
 * typo in a class list is otherwise invisible — the CSS is simply missing.
 */

import { readFileSync } from "node:fs";
import { createBuilder, translate } from "./css.ts";

const LAYER = "barq.ui";

function indent(text: string, by: string): string {
  return text
    .split("\n")
    .map((line) => (line === "" ? line : `${by}${line}`))
    .join("\n");
}

function block(css: string): string {
  return `css\`\n  @layer ${LAYER} {\n${indent(css, "    ")}\n  }\n\``;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const build = await createBuilder();

  const specIndex = argv.indexOf("--spec");
  const spec: Record<string, string> =
    specIndex < 0
      ? { "": argv.filter((entry) => !entry.startsWith("--")).join(" ") }
      : (JSON.parse(readFileSync(argv[specIndex + 1] ?? "", "utf8")) as Record<string, string>);

  for (const [name, classes] of Object.entries(spec)) {
    const result = await translate(build, classes);
    if (name !== "") process.stdout.write(`// ${name}\n`);
    process.stdout.write(`${block(result.css)}\n`);
    if (result.unknown.length > 0) {
      process.stderr.write(`  NOT A UTILITY: ${result.unknown.join(" ")}\n`);
    }
    process.stdout.write("\n");
  }
}

await main();
