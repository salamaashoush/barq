/**
 * What the duplication guard reads: every rule group arc writes, as the
 * compiler produces it, and every colour, spacing and radius value it spells
 * out.
 *
 * A module is compiled the way `@barqjs/vite` compiles it for a build, imports
 * resolved, so a group composed from another module folds into the call that
 * composes it. The module's own stylesheet then holds exactly the declarations
 * it wrote itself, which is what tells a call's own declarations from the ones
 * it composed: a class in the call's string that this module's stylesheet does
 * not define came from a group somewhere else.
 */

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import { SHORTHANDS } from "@barqjs/css/internal";

interface Native {
  transform(
    code: string,
    options: Record<string, unknown>,
  ): {
    code: string;
    css?: string;
    map?: string;
    warnings?: string[];
    cssWanted?: string[][];
    cssExports?: string[][];
  };
}

const native = createRequire(import.meta.url)("@barqjs/compiler") as Native;

type Compiled = ReturnType<Native["transform"]>;

const exportsCache = new Map<string, string[][]>();

function resolve(specifier: string, from: string, bareFrom: string): string | undefined {
  try {
    return Bun.resolveSync(specifier, specifier.startsWith(".") ? dirname(from) : bareFrom);
  } catch {
    return undefined;
  }
}

/**
 * One module compiled with what it imports resolved, in as many rounds as it
 * asks for, as `@barqjs/vite`'s `compileWithImports` does.
 */
function compile(file: string, bareFrom: string, depth: number, exportsAsked = false): Compiled {
  const source = readFileSync(file, "utf8");
  const base = { filename: file, strictCss: true, sourcemap: true, cssExports: exportsAsked };
  let out = native.transform(source, base);
  if (depth <= 0) return out;
  const cssImports: string[][] = [];
  const asked = new Set<string>();
  for (let round = 0; round < 4; round++) {
    const wanted = (out.cssWanted ?? []).filter((entry) => !asked.has(entry.join("\0")));
    if (wanted.length === 0) break;
    let learned = false;
    for (const [specifier = "", name = ""] of wanted) {
      asked.add(`${specifier}\0${name}`);
      const dependency = resolve(specifier, file, bareFrom);
      if (dependency === undefined) continue;
      let rows = exportsCache.get(dependency);
      if (rows === undefined) {
        rows = compile(dependency, bareFrom, depth - 1, true).cssExports ?? [];
        exportsCache.set(dependency, rows);
      }
      for (const row of rows) {
        if (row[1] === "from" || (name !== "*" && row[0] !== name)) continue;
        cssImports.push([specifier, ...row]);
        learned = true;
      }
    }
    if (!learned) break;
    out = native.transform(source, { ...base, cssImports });
  }
  return out;
}

/** Each class a stylesheet defines, as the declarations it holds, written without the class. */
export function declarationsByClass(css: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const conditions: string[] = [];
  let at = 0;
  let prelude = "";
  while (at < css.length) {
    const char = css[at] ?? "";
    if (char === "{") {
      const head = prelude.trim();
      prelude = "";
      if (head.startsWith("@")) {
        conditions.push(head.startsWith("@layer") ? "" : head);
        at += 1;
        continue;
      }
      const close = css.indexOf("}", at);
      const body = css.slice(at + 1, close);
      at = close + 1;
      const classes = new Set([...head.matchAll(/\.(a-[\w-]+_[a-z0-9]+)/g)].map((m) => m[1] ?? ""));
      for (const name of classes) {
        const selector = head
          .split(",")
          .filter((one) => one.includes(`.${name}`))
          .map((one) => one.replaceAll(`.${name}`, "&"))
          .join(",");
        const where = [...conditions.filter((one) => one !== ""), selector].join(" ");
        const list = out.get(name) ?? [];
        for (const declaration of body.split(";")) {
          if (declaration.trim() !== "") list.push(`${where} { ${declaration.trim()} }`);
        }
        out.set(name, list);
      }
      continue;
    }
    if (char === "}") {
      conditions.pop();
      prelude = "";
      at += 1;
      continue;
    }
    prelude += char;
    at += 1;
  }
  return out;
}

const LONGHANDS = new Map<string, string>();
for (const [shorthand, longhands] of Object.entries(SHORTHANDS)) {
  LONGHANDS.set([...longhands].toSorted().join(","), shorthand);
}

/**
 * Declarations as they were written: the longhands a shorthand expanded into
 * (`margin: 0` is four atoms) counted as the one declaration they came from.
 */
export function asWritten(declarations: readonly string[]): string[] {
  const groups = new Map<string, string[]>();
  const shape = /^(.*) \{ ([\w-]+):(.*) \}$/;
  for (const one of declarations) {
    const found = shape.exec(one);
    if (found === null) continue;
    const key = `${found[1] ?? ""}\0${found[3] ?? ""}`;
    groups.set(key, [...(groups.get(key) ?? []), found[2] ?? ""]);
  }
  const out: string[] = [];
  for (const [key, properties] of groups) {
    const [where, value] = key.split("\0");
    const shorthand = LONGHANDS.get(properties.toSorted().join(","));
    if (shorthand !== undefined) out.push(`${where ?? ""} { ${shorthand}:${value ?? ""} }`);
    else
      for (const property of properties) out.push(`${where ?? ""} { ${property}:${value ?? ""} }`);
  }
  return out;
}

/** A rule group written in one place: a style object, as the compiler folded it. */
export interface Place {
  readonly file: string;
  readonly line: number;
  /** The binding or the key it was written under: `root`, `layout.row`. */
  readonly label: string;
  /** What a later group composes it by, when it can be: `layout.row`, `quick`. */
  readonly name: string | undefined;
  readonly declarations: ReadonlySet<string>;
  /** Everything it holds that its module wrote, composed parts included: what a treatment is. */
  readonly full: ReadonlySet<string>;
}

const ATOMS = /(?<![\w-])(a-[\w-]+_[a-z0-9]+(?: a-[\w-]+_[a-z0-9]+)*)(?![\w-])/g;

const VLQ = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** The source line each generated line's first mapping points at, from a source map. */
function sourceLines(map: string | undefined): number[] {
  if (map === undefined) return [];
  const mappings = (JSON.parse(map) as { mappings: string }).mappings;
  const out: number[] = [];
  let sourceLine = 0;
  for (const line of mappings.split(";")) {
    let first: number | undefined;
    for (const segment of line.split(",")) {
      if (segment === "") continue;
      const values: number[] = [];
      let shift = 0;
      let value = 0;
      for (const char of segment) {
        const digit = VLQ.indexOf(char);
        value += (digit & 31) << shift;
        if ((digit & 32) === 0) {
          values.push(value & 1 ? -(value >> 1) : value >> 1);
          shift = 0;
          value = 0;
        } else {
          shift += 5;
        }
      }
      if (values.length >= 4) {
        sourceLine += values[2] ?? 0;
        first ??= sourceLine;
      }
    }
    out.push((first ?? sourceLine) + 1);
  }
  return out;
}

/** Top-level `const` bindings of compiled code, with where each one's initialiser runs. */
function bindings(code: string): { name: string; start: number; end: number }[] {
  const found = [...code.matchAll(/^(?:export )?const (\w+) = /gm)];
  return found.map((match, index) => ({
    name: match[1] ?? "",
    start: (match.index ?? 0) + match[0].length,
    end: found[index + 1]?.index ?? code.length,
  }));
}

/** Every rule group a module writes, less what it composed from groups declared elsewhere. */
export function placesIn(file: string, bareFrom: string, shown = file): Place[] {
  const compiled = compile(file, bareFrom, 6);
  const own = declarationsByClass(compiled.css ?? "");
  const code = compiled.code;
  const source = readFileSync(file, "utf8");
  const lines = sourceLines(compiled.map);
  const consts = bindings(code);
  const raw: { line: number; label: string; name: string | undefined; classes: string[] }[] = [];
  for (const match of code.matchAll(ATOMS)) {
    const at = match.index ?? 0;
    const classes = (match[1] ?? "").split(" ").filter((one) => own.has(one));
    if (classes.length === 0) continue;
    const before = code.slice(Math.max(0, at - 120), at);
    const key = /(?:^|[\s{,(])(\w+|"[^"]+")\s*:\s*(?:arc\()?["`]?$/
      .exec(before)?.[1]
      ?.replaceAll('"', "");
    const binding = consts.find((one) => one.start <= at && at < one.end);
    const direct = binding !== undefined && code.slice(binding.start, at).trim().length <= 1;
    const inObject =
      binding !== undefined &&
      key !== undefined &&
      /^\{\s*$/.test(code.slice(binding.start, binding.start + 1)) &&
      !code.slice(binding.start, at).includes("(");
    const name = direct ? binding.name : inObject ? `${binding.name}.${key}` : undefined;
    const label =
      name ?? (key === undefined ? (binding?.name ?? "") : `${binding?.name ?? ""} ${key}`);
    const line = lines[code.slice(0, at).split("\n").length - 1] ?? 0;
    raw.push({ line, label: label.trim(), name, classes });
  }

  const composable = raw.filter((one) => {
    if (one.name === undefined) return false;
    if (one.name.includes(".")) return source.includes(one.name);
    return (source.match(new RegExp(`\\b${one.name}\\b`, "g")) ?? []).length > 1;
  });

  // Largest first, so a group made of smaller ones is taken out whole before
  // its parts are.
  composable.sort((first, second) => second.classes.length - first.classes.length);

  return raw.map((one) => {
    let classes = new Set(one.classes);
    for (const group of composable) {
      if (group === one || group.classes.length > classes.size) continue;
      // The same set under two names is an alias where the later one names the
      // earlier, and only the later is taken to be the use.
      if (group.classes.length === classes.size && one.name !== undefined && group.line >= one.line)
        continue;
      if (group.classes.every((name) => classes.has(name))) {
        classes = new Set([...classes].filter((name) => !group.classes.includes(name)));
      }
    }
    const declarations = asWritten([...classes].flatMap((name) => own.get(name) ?? []));
    const full = asWritten(one.classes.flatMap((name) => own.get(name) ?? []));
    return {
      file: shown,
      line: one.line,
      label: one.label,
      name: one.name,
      declarations: new Set(declarations),
      full: new Set(full),
    };
  });
}

/** The groups ui's `lib/shared-*.ts` declare, each a place, keyed `text.sm`. */
export function uiGroups(libDir: string, bareFrom: string, files: readonly string[]): Place[] {
  const out: Place[] = [];
  for (const file of files) {
    const path = `${libDir}/${file}`;
    const compiled = compile(path, bareFrom, 2, true);
    const own = declarationsByClass(compiled.css ?? "");
    for (const [name, kind, member, value] of compiled.cssExports ?? []) {
      if (kind !== "group" || value === undefined) continue;
      const declarations = asWritten(value.split(" ").flatMap((one) => own.get(one) ?? []));
      out.push({
        file: `@barqjs/ui/${file.replace(/\.ts$/, "")}`,
        line: 0,
        label: `${name ?? ""}.${member ?? ""}`,
        name: `${name ?? ""}.${member ?? ""}`,
        declarations: new Set(declarations),
        full: new Set(declarations),
      });
    }
  }
  return out;
}

export interface Duplicate {
  readonly first: Place;
  readonly second: Place;
  readonly shared: readonly string[];
}

/**
 * Every pair of places that write two or more of the same declarations, and
 * every place that writes out the whole of a treatment it could compose.
 *
 * `shared` is checked against ui's groups by overlap, since each is one
 * specific treatment, and against arc's own by containment, since those are
 * built from each other and a row overlaps a centre by design.
 */
export function duplicates(
  places: readonly Place[],
  shared: readonly Place[] = [],
  treatments: readonly Place[] = [],
): Duplicate[] {
  const out: Duplicate[] = [];
  const all = [...places, ...shared];
  for (let i = 0; i < places.length; i++) {
    const first = places[i];
    if (first === undefined) continue;
    for (let j = i + 1; j < all.length; j++) {
      const second = all[j];
      if (second === undefined) continue;
      const overlap = [...first.declarations].filter((one) => second.declarations.has(one));
      if (overlap.length >= 2) out.push({ first, second, shared: overlap });
    }
    for (const treatment of treatments) {
      if (treatment.file === first.file || treatment.full.size < 2) continue;
      const whole = [...treatment.full];
      if (whole.every((one) => first.declarations.has(one))) {
        out.push({ first, second: treatment, shared: whole });
      }
    }
  }
  return out;
}

const COLOURS = new Set([
  "background",
  "foreground",
  "card",
  "card-foreground",
  "popover",
  "popover-foreground",
  "primary",
  "primary-foreground",
  "secondary",
  "secondary-foreground",
  "muted",
  "muted-foreground",
  "accent",
  "accent-foreground",
  "destructive",
  "border",
  "input",
  "ring",
  "sunken",
  "link",
  "faint-foreground",
  "border-strong",
  "selection",
  "overlay",
  "shadow-color",
  "shadow-color-strong",
  "arc-tone",
  "arc-tone-foreground",
  "arc-tone-subtle",
]);

/** A colour, a step of spacing or a corner, spelled out. */
export const LITERAL =
  /calc\(var\(--spacing\) \* [\d.]+\)|calc\(var\(--radius\)[^)]*\)|var\(--radius\)|var\(--([a-z0-9-]+)\b[^)]*\)|#[0-9a-fA-F]{3,8}\b|(?:oklch|rgb|hsl)\([^)]*\)/g;

export interface Literal {
  readonly value: string;
  readonly file: string;
  readonly line: number;
}

/** The colour, spacing and radius values a module writes in its own string literals. */
export function literalsIn(file: string, shown = file): Literal[] {
  const source = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (comment) =>
    comment.replace(/[^\n]/g, " "),
  );
  const out: Literal[] = [];
  for (const string of source.matchAll(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`[^`]*`/g)) {
    for (const found of string[0].matchAll(LITERAL)) {
      const colour = found[1];
      if (colour !== undefined && !COLOURS.has(colour)) continue;
      const at = (string.index ?? 0) + (found.index ?? 0);
      out.push({ value: found[0], file: shown, line: source.slice(0, at).split("\n").length });
    }
  }
  return out;
}

/** What to compose instead of a value spelled out again. */
export function treatmentFor(value: string): string {
  const step = /calc\(var\(--spacing\) \* ([\d.]+)\)/.exec(value);
  if (step !== null) return `space.x${(step[1] ?? "").replace(".", "_")} from @barqjs/arc/style`;
  if (value.includes("--radius")) return "rounded.* or radius.* from @barqjs/arc/style";
  return "a colour role (fg, bg, edge, surface, interaction) from @barqjs/arc/style";
}
