/**
 * `src/icons/*.tsx` and `src/index.ts`, from `lucide-static`.
 *
 * ```
 * bun run generate
 * ```
 *
 * Run it after bumping `lucide-static` and commit what changes. Nothing else
 * in the package is generated, so a diff here is a diff in lucide.
 *
 * ## What it reads
 *
 * `icon-nodes.json` — the 1,790 canonical icons as
 * `{ "check": [["path", { "d": "…" }]] }`. That is the same data
 * `lucide-react` builds from, so the shapes are lucide's rather than a
 * transcription of them.
 *
 * `icons/*.svg` — 2,048 files, because lucide keeps a file per ALIAS too.
 * An alias is not a second icon: its file is byte-identical to its target's
 * once both are reduced to nodes, so this matches them that way and emits a
 * re-export. `MoreHorizontal` is `Ellipsis` for the same reason it is in
 * `lucide-react`, and it costs nothing.
 *
 * ## Why a file each
 *
 * One module per icon, so a bundler drops the 1,789 an application does not
 * use without needing to prove anything about a barrel. `@barqjs/lucide/icons/check`
 * is the same component by a path a dev server does not have to parse 30,000
 * lines to reach.
 *
 * ## Why JSX rather than data
 *
 * An icon written as `[["path", { d }]]` and built at run time constructs its
 * elements one at a time on every render. Written as JSX it goes through the
 * barq compiler like every other component and becomes one cloned template.
 */

import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";

type IconNode = readonly [string, Record<string, string>];

const require_ = createRequire(import.meta.url);
const lucide = dirname(require_.resolve("lucide-static/package.json"));

/** `arrow-up-1-0` -> `ArrowUp10`, which is the name `lucide-react` exports. */
function pascal(name: string): string {
  return name
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

/** camelCase for the two-word SVG attributes, so barq writes `stroke-width` and not `strokewidth`. */
function attributeName(name: string): string {
  return name.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

function element([tag, attributes]: IconNode): string {
  const written = Object.entries(attributes)
    .map(([name, value]) => `${attributeName(name)}="${value}"`)
    .join(" ");
  return `      <${tag} ${written} />`;
}

/**
 * Names that are already global. `Infinity` is an icon, and
 * `export function Infinity()` shadows the number in its own module — harmless
 * here and confusing everywhere, so the LOCAL is renamed and the export keeps
 * lucide's name.
 */
const RESTRICTED = new Set(["Infinity", "NaN", "undefined", "eval", "arguments"]);

function icon(name: string, nodes: readonly IconNode[]): string {
  const exported = pascal(name);
  const local = RESTRICTED.has(exported) ? `${exported}Icon` : exported;
  const body = `import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

function ${local}(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
${nodes.map(element).join("\n")}
    </svg>
  );
}
`;
  return local === exported
    ? body.replace(`function ${local}(`, `export function ${local}(`)
    : `${body}\nexport { ${local} as ${exported} };\n`;
}

/**
 * An SVG file reduced to the same shape `icon-nodes.json` holds, so the two can
 * be compared. Attribute ORDER is not normalised because lucide writes both
 * from one source and they agree; a mismatch here means an alias has drifted
 * from its target upstream, which is worth not papering over.
 */
function nodesOf(svg: string): string {
  const body = svg.slice(svg.indexOf(">", svg.indexOf("<svg")) + 1, svg.lastIndexOf("</svg>"));
  const nodes: IconNode[] = [];
  for (const match of body.matchAll(/<([a-z]+)\s+([^>]*?)\/>/g)) {
    const attributes: Record<string, string> = {};
    for (const attribute of (match[2] ?? "").matchAll(/([\w-]+)="([^"]*)"/g)) {
      attributes[attribute[1] ?? ""] = attribute[2] ?? "";
    }
    nodes.push([match[1] ?? "", attributes]);
  }
  return JSON.stringify(nodes);
}

function main(): void {
  const nodes = JSON.parse(readFileSync(join(lucide, "icon-nodes.json"), "utf8")) as Record<
    string,
    IconNode[]
  >;

  const names = Object.keys(nodes).toSorted();
  const out = resolve(import.meta.dir, "../src/icons");
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });

  const shapes = new Map<string, string>();
  for (const name of names) {
    writeFileSync(join(out, `${name}.tsx`), icon(name, nodes[name] ?? []));
    shapes.set(JSON.stringify(nodes[name]), name);
  }

  const taken = new Set(names.map(pascal));
  const aliases: [string, string][] = [];
  for (const file of readdirSync(join(lucide, "icons"))) {
    if (!file.endsWith(".svg")) continue;
    const name = file.slice(0, -4);
    if (name in nodes) continue;
    // `arrow-up-10` and `arrow-up-1-0` are two file names for one export name,
    // and re-exporting the second is a duplicate rather than an alias.
    if (taken.has(pascal(name))) continue;
    const target = shapes.get(nodesOf(readFileSync(join(lucide, "icons", file), "utf8")));
    if (target === undefined) continue;
    taken.add(pascal(name));
    aliases.push([name, target]);
  }
  const ordered = aliases.toSorted(([a], [b]) => (a < b ? -1 : 1));

  const version = (
    JSON.parse(readFileSync(join(lucide, "package.json"), "utf8")) as { version: string }
  ).version;

  writeFileSync(
    resolve(import.meta.dir, "../src/index.ts"),
    [
      "/**",
      ` * Every lucide icon, from lucide-static ${version}.`,
      " *",
      " * GENERATED by `tools/generate.ts`. Edit that, not this.",
      " *",
      " * A barrel, and a bundler drops what an application does not import — but",
      " * a dev server still parses the whole file, so",
      " * `@barqjs/lucide/icons/check` is there for the one import you want.",
      " */",
      "",
      `export { type IconProps, iconProps, ICON_VIEW_BOX } from "./icon.ts";`,
      "",
      ...names.map((name) => `export { ${pascal(name)} } from "./icons/${name}.tsx";`),
      "",
      "// Names lucide keeps for icons that were renamed.",
      ...ordered.map(
        ([alias, target]) =>
          `export { ${pascal(target)} as ${pascal(alias)} } from "./icons/${target}.tsx";`,
      ),
      "",
    ].join("\n"),
  );

  writeFileSync(
    resolve(import.meta.dir, "../src/manifest.ts"),
    [
      "/**",
      " * Which icons exist, for a tool that has to choose one by name.",
      " *",
      " * GENERATED by `tools/generate.ts`. Edit that, not this.",
      " */",
      "",
      `export const LUCIDE_VERSION = ${JSON.stringify(version)};`,
      "",
      `export const ICON_NAMES: readonly string[] = ${JSON.stringify(names)};`,
      "",
      `export const ICON_ALIASES: Readonly<Record<string, string>> = ${JSON.stringify(
        Object.fromEntries(ordered),
      )};`,
      "",
    ].join("\n"),
  );

  process.stdout.write(`${names.length} icons, ${ordered.length} aliases, lucide ${version}\n`);
}

main();
