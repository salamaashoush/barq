/**
 * A block of CSS, as the `atoms` object literal that produces it.
 *
 * The package transcribed shadcn's class lists into one `css` block per slot,
 * and 78% of the declarations that came out are exact repeats of another
 * slot's: 1,948 of them across forty-six components, 433 distinct. A block is
 * one class holding all of its declarations, so nothing can be shared. An atom
 * is one class holding ONE declaration, so everything is.
 *
 * This converts the first shape into the second. It is a source transformation
 * and not a new transcription: the declarations are the ones already there,
 * which is what lets `verify` compare against shadcn either way.
 *
 * ```
 * bun run tools/atomize.ts 'color: red; &:hover { color: blue }'
 * ```
 */

import { parse, type CssNode } from "./css.ts";

/**
 * `background-color` -> `backgroundColor`.
 *
 * A property that starts with a dash is left exactly as it is: a custom
 * property has no other spelling, and `-webkit-user-select` camel-cased to
 * `WebkitUserSelect` comes back out of `kebab` as `webkit-user-select`, which
 * is not a property any browser has.
 */
export function camel(property: string): string {
  if (property.startsWith("-")) return property;
  return property.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

/** Whether a key has to be quoted to be a valid identifier. */
function quoted(key: string): string {
  return /^[A-Za-z_$][\w$]*$/.test(key) ? key : JSON.stringify(key);
}

/** A value on one line: `oxfmt` wraps a long one, and the newline is not part of it. */
function value(text: string): string {
  return JSON.stringify(text.replace(/\s+/g, " ").trim());
}

interface Entry {
  readonly property: string;
  /** More than one when the same property is declared twice: a CSS fallback. */
  readonly values: string[];
}

/** A node's own declarations, in order, with repeats collected. */
function declarationsOf(nodes: readonly CssNode[]): Entry[] {
  const order: string[] = [];
  const byProperty = new Map<string, string[]>();
  for (const node of nodes) {
    if (node.kind !== "decl") continue;
    const split = node.text.indexOf(":");
    if (split < 0) continue;
    const property = node.text.slice(0, split).trim();
    const own = node.text.slice(split + 1).trim();
    const held = byProperty.get(property);
    if (held === undefined) {
      order.push(property);
      byProperty.set(property, [own]);
    } else {
      held.push(own);
    }
  }
  return order.map((property) => ({ property, values: byProperty.get(property) ?? [] }));
}

/**
 * A condition key, from a selector or an at-rule.
 *
 * `atoms` reads a key that starts with `:`, `@`, `&` or `[` as a condition, and
 * substitutes `&` for the atom's own class. A selector that starts with a bare
 * tag or a descendant has to say `&` itself.
 */
export function conditionOf(node: CssNode): string {
  if (node.kind === "at") return node.head.trim();
  if (node.kind !== "rule") return "";
  const selector = node.selector.trim().replace(/\s+/g, " ");
  if (selector.startsWith("&")) {
    const rest = selector.slice(1).trim();
    // `&:hover` is a suffix and `& svg` is a descendant; both keep the `&` so
    // `atoms` substitutes rather than concatenates.
    return rest.startsWith(":") || rest.startsWith("[") ? rest : selector;
  }
  return selector.includes("&") ? selector : `& ${selector}`;
}

function body(nodes: readonly CssNode[], indent: string): string[] {
  const lines: string[] = [];
  const inner = `${indent}  `;

  for (const entry of declarationsOf(nodes)) {
    const key = quoted(camel(entry.property));
    if (entry.values.length === 1) {
      lines.push(`${inner}${key}: ${value(entry.values[0] ?? "")},`);
      continue;
    }
    // The same property twice is CSS's own fallback: a browser keeps the last
    // it understands, so preference order is the reverse of source order.
    const preferred = entry.values.toReversed().map(value).join(", ");
    lines.push(`${inner}${key}: firstThatWorks(${preferred}),`);
  }

  // One key per condition, however many rules wrote it. A block often has
  // `&::selection` three times over, and an object literal holds one.
  const order: string[] = [];
  const under = new Map<string, CssNode[]>();
  for (const node of nodes) {
    if (node.kind === "decl") continue;
    const condition = conditionOf(node);
    if (condition === "") continue;
    const held = under.get(condition);
    if (held === undefined) {
      order.push(condition);
      under.set(condition, [...node.nodes]);
    } else {
      held.push(...node.nodes);
    }
  }

  for (const condition of order) {
    const nested = body(under.get(condition) ?? [], inner);
    if (nested.length === 0) continue;
    lines.push(`${inner}${JSON.stringify(condition)}: {`);
    lines.push(...nested);
    lines.push(`${inner}},`);
  }

  return lines;
}

/** The object literal, without the call around it. */
export function atomize(css: string, indent = ""): string {
  const nodes = parse(css);
  const lines = body(nodes, indent);
  if (lines.length === 0) return "{}";
  return `{\n${lines.join("\n")}\n${indent}}`;
}

/** Whether the literal needs `firstThatWorks` in scope. */
export function needsFallback(literal: string): boolean {
  return literal.includes("firstThatWorks(");
}

if (import.meta.main) {
  const source = process.argv.slice(2).join(" ");
  process.stdout.write(`${atomize(source)}\n`);
}
