/**
 * `specs/*.json`, read straight out of a shadcn checkout.
 *
 * ```
 * bun run tools/respec.ts ~/Workspace/vendor/ui             # report the drift
 * bun run tools/respec.ts ~/Workspace/vendor/ui --write     # write every spec
 * bun run tools/respec.ts ~/Workspace/vendor/ui --write button   # write one
 * ```
 *
 * A spec is the PROVENANCE for every rule this package ships, and every one of
 * them was typed in by hand. `PORTING.md` has named that as the open problem
 * for as long as the file has existed: `verify` asks that every declaration in
 * a spec exists in the component and never the reverse, so a class shadcn added
 * after the spec was written is invisible — the spec does not mention it, so
 * nothing looks for it, and the bar reads 0 missing while the component is a
 * version behind.
 *
 * WHICH DIRECTORY, because the checkout has three and they are not the same
 * library. `registry/new-york-v4/ui` is the older one this package was ported
 * from. `registry/bases/{base,radix,aria}/ui` is the current source, and its
 * class lists are mostly `cn-*` markers with the look in a separate stylesheet,
 * so there is nothing to transcribe. `styles/<base>-<style>/ui` is those two
 * resolved together: real Tailwind class lists, one set per style, and it is
 * what ui.shadcn.com actually renders and what a person copying from the docs
 * receives. That is the one.
 */

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

/** Which of the 24 sets to read. `radix-nova` is what the docs render. */
const SET = "radix-nova";

/**
 * A `cva` call, as its base and its variants.
 *
 * `cva("BASE", { variants: { axis: { value: "…" } } })`, and the strings may be
 * split across lines by the formatter, so they are joined rather than matched
 * whole.
 */
function readCva(
  source: string,
  at: number,
): { base: string; axes: Map<string, Map<string, string>> } | null {
  const open = source.indexOf("(", at);
  if (open === -1) return null;
  const end = matching(source, open);
  if (end === -1) return null;
  const body = source.slice(open + 1, end);

  const base = readString(body, 0);
  if (base === null) return null;

  const axes = new Map<string, Map<string, string>>();
  const variants = body.indexOf("variants:");
  if (variants !== -1) {
    const brace = body.indexOf("{", variants);
    const close = matching(body, brace);
    const inner = body.slice(brace + 1, close);
    for (const axis of entries(inner)) {
      const values = new Map<string, string>();
      for (const value of entries(axis.body)) {
        const text = readString(value.body, 0);
        if (text !== null) values.set(value.name, text.value);
      }
      if (values.size > 0) axes.set(axis.name, values);
    }
  }
  return { base: base.value, axes };
}

/** `name: { … }` or `name: "…"` pairs at the top level of an object body. */
function entries(body: string): { name: string; body: string }[] {
  const out: { name: string; body: string }[] = [];
  const pattern = /(?:^|[,{\s])["']?([A-Za-z][\w-]*)["']?\s*:\s*/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(body)) !== null) {
    const after = match.index + match[0].length;
    if (depthAt(body, match.index) !== 0) continue;
    const character = body[after];
    if (character === "{") {
      const close = matching(body, after);
      out.push({ name: match[1] ?? "", body: body.slice(after + 1, close) });
      pattern.lastIndex = close;
    } else {
      const end = endOfValue(body, after);
      out.push({ name: match[1] ?? "", body: body.slice(after, end) });
      pattern.lastIndex = end;
    }
  }
  return out;
}

function depthAt(text: string, index: number): number {
  let depth = 0;
  for (let at = 0; at < index; at++) {
    const character = text[at];
    if (character === "{" || character === "[") depth++;
    else if (character === "}" || character === "]") depth--;
  }
  return depth;
}

function endOfValue(text: string, from: number): number {
  let depth = 0;
  for (let at = from; at < text.length; at++) {
    const character = text[at];
    if (character === "{" || character === "[" || character === "(") depth++;
    else if (character === "}" || character === "]" || character === ")") {
      if (depth === 0) return at;
      depth--;
    } else if (character === "," && depth === 0) return at;
  }
  return text.length;
}

function matching(text: string, from: number): number {
  const open = text[from];
  const close = open === "(" ? ")" : open === "[" ? "]" : "}";
  let depth = 0;
  for (let at = from; at < text.length; at++) {
    if (text[at] === open) depth++;
    else if (text[at] === close) {
      depth--;
      if (depth === 0) return at;
    }
  }
  return -1;
}

/**
 * The first string literal at or after `from`, with an adjacent one joined on.
 *
 * Prettier breaks a long class list across several quoted lines, and they are
 * one list: `"a b" + "c"` never appears, the strings simply sit next to each
 * other inside a template the formatter wrapped.
 */
function readString(text: string, from: number): { value: string; end: number } | null {
  const start = text.indexOf('"', from);
  if (start === -1) return null;
  let at = start + 1;
  let value = "";
  while (at < text.length && text[at] !== '"') {
    if (text[at] === "\\") {
      value += text[at + 1] ?? "";
      at += 2;
      continue;
    }
    value += text[at];
    at++;
  }
  // A neighbouring literal, separated only by whitespace, continues the list.
  const rest = text.slice(at + 1);
  const next = /^\s*"/.exec(rest);
  if (next !== null) {
    const joined = readString(rest, next.index);
    if (joined !== null) return { value: `${value} ${joined.value}`, end: at + 1 + joined.end };
  }
  return { value: value.trim(), end: at + 1 };
}

/**
 * Every whole string argument of a call, joined into one class list.
 *
 * A class list long enough gets broken across ARGUMENTS rather than lines —
 * `cn("a", "b", className)` — and reading only the first silently dropped the
 * three rules that size the avatar's badge. Only an argument that is nothing
 * but a literal counts: `condition && "x"` is a class list the element wears
 * sometimes, and folding it into the base would claim it always does.
 */
function argumentStrings(text: string, open: number): string {
  const close = matching(text, open);
  if (close === -1) return "";
  const parts: string[] = [];
  let depth = 0;
  let start = open + 1;
  for (let at = open + 1; at <= close; at++) {
    const character = text[at];
    if (character === "(" || character === "[" || character === "{") depth++;
    else if (character === ")" || character === "]" || character === "}") {
      if (at === close) {
        const whole = readWholeString(text.slice(start, at));
        if (whole !== null) parts.push(whole);
        break;
      }
      depth--;
    } else if (character === '"' && depth === 0) {
      const found = readString(text, at);
      if (found !== null) at = found.end - 1;
    } else if (character === "," && depth === 0) {
      const whole = readWholeString(text.slice(start, at));
      if (whole !== null) parts.push(whole);
      start = at + 1;
    }
  }
  return parts.join(" ");
}

/** An argument that is only string literals, joined; `null` for anything else. */
function readWholeString(argument: string): string | null {
  const trimmed = argument.trim();
  if (!trimmed.startsWith('"')) return null;
  const found = readString(trimmed, 0);
  if (found === null || trimmed.slice(found.end).trim() !== "") return null;
  return found.value;
}

/**
 * Which characters sit inside a string literal.
 *
 * `[&>svg]:size-3.5` is an ordinary class and the `>` in it is not the end of
 * anything, so a scan for tag boundaries that reads it as one stops mid
 * attribute — which is how the checkbox's indicator arrived as
 * `grid place-content-center text-current transition-none [&`.
 */
function quoted(source: string): Uint8Array {
  const mask = new Uint8Array(source.length);
  let open: string | null = null;
  for (let at = 0; at < source.length; at++) {
    const character = source[at] ?? "";
    if (open !== null) {
      mask[at] = 1;
      if (character === "\\") {
        mask[at + 1] = 1;
        at++;
      } else if (character === open) open = null;
    } else if (character === '"' || character === "'" || character === "`") {
      open = character;
      mask[at] = 1;
    }
  }
  return mask;
}

/**
 * The opening JSX tag `at` sits inside, as `[start, end]`.
 *
 * Backwards to the `<` and forwards to the `>` that closes it, counting braces
 * so an expression attribute holding either character does not end the tag
 * early. The whole tag rather than the text after `data-slot`, because
 * `className` comes BEFORE it on several elements and reading forwards only
 * lost the native select's icon and its `<select>` both.
 */
function openingTag(source: string, mask: Uint8Array, at: number): [number, number] | null {
  let start = -1;
  for (let scan = at; scan >= 0; scan--) {
    if (mask[scan] === 1) continue;
    if (source[scan] === ">") return null;
    if (source[scan] === "<") {
      start = scan;
      break;
    }
  }
  if (start === -1) return null;

  let depth = 0;
  for (let scan = start; scan < source.length; scan++) {
    if (mask[scan] === 1) continue;
    const character = source[scan];
    if (character === "{") depth++;
    else if (character === "}") depth--;
    else if (character === ">" && depth === 0) return [start, scan];
  }
  return null;
}

/** `data-slot="x"` with a `className` on the same element, in either spelling. */
function readSlots(source: string): Map<string, string> {
  const out = new Map<string, string>();
  const mask = quoted(source);
  const pattern = /data-slot="([a-z0-9-]+)"/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    const bounds = openingTag(source, mask, match.index);
    if (bounds === null) continue;
    const tag = source.slice(bounds[0], bounds[1]);

    const call = /className=\{cn\(/.exec(tag);
    if (call !== null) {
      const found = argumentStrings(tag, call.index + call[0].length - 1);
      if (found !== "") out.set(match[1] ?? "", found);
      continue;
    }
    // `className="…"`, which is what an element with nothing to merge carries.
    const plain = /className="/.exec(tag);
    if (plain === null) continue;
    const found = readString(tag, plain.index + plain[0].length - 1);
    if (found !== null && found.value !== "") out.set(match[1] ?? "", found.value);
  }
  return out;
}

/** Every slot a component file describes, in this package's spec shape. */
export function specFor(source: string): Record<string, string> {
  const spec: Record<string, string> = {};

  for (const slot of readSlots(source)) spec[slot[0]] = slot[1];

  // A `cva` names its slot through the element that spreads it, so the two are
  // matched by the variable: `buttonVariants` styles `data-slot="button"`.
  const pattern = /const (\w+)Variants = cva/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    const read = readCva(source, match.index);
    if (read === null) continue;
    const slot = camelToSlug(match[1] ?? "");
    spec[slot] = read.base;
    for (const [axis, values] of read.axes) {
      for (const [value, classes] of values) spec[`${slot}-${axis}-${value}`] = classes;
    }
  }
  return spec;
}

function camelToSlug(name: string): string {
  return name.replaceAll(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

function main(): void {
  const checkout = process.argv[2];
  if (checkout === undefined) {
    console.error("usage: bun run tools/respec.ts <shadcn-checkout> [--write]");
    process.exit(1);
  }
  const write = process.argv.includes("--write");
  // One component at a time, because writing every spec at once leaves `verify`
  // red until the last component is done and there is nothing to read in that.
  const only = process.argv.slice(3).filter((argument) => !argument.startsWith("--"));
  const from = join(checkout, "apps/v4/styles", SET, "ui");
  const specs = join(import.meta.dir, "../specs");
  const held = new Set(readdirSync(specs).filter((name) => name.endsWith(".json")));

  let changed = 0;
  let added = 0;
  const report: string[] = [];

  for (const file of readdirSync(from).filter((name) => name.endsWith(".tsx"))) {
    const name = basename(file, ".tsx");
    if (only.length > 0 && !only.includes(name)) continue;
    const spec = specFor(readFileSync(join(from, file), "utf8"));
    if (Object.keys(spec).length === 0) continue;

    const target = join(specs, `${name}.json`);
    const before = held.has(`${name}.json`)
      ? (JSON.parse(readFileSync(target, "utf8")) as Record<string, string>)
      : null;

    const differing = Object.keys(spec).filter((slot) => before?.[slot] !== spec[slot]);
    const gone = before === null ? [] : Object.keys(before).filter((slot) => !(slot in spec));
    if (before === null) added++;
    else if (differing.length > 0 || gone.length > 0) changed++;
    else continue;

    report.push(
      `${name}: ${before === null ? "new" : `${String(differing.length)} differ, ${String(gone.length)} gone`}`,
    );
    if (write) writeFileSync(target, `${JSON.stringify(spec, null, 2)}\n`);
  }

  console.log(report.join("\n"));
  console.log(
    `\n${String(added)} new, ${String(changed)} changed${write ? ", written" : " (--write to apply)"}`,
  );
}

if (import.meta.main) main();
