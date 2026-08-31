/**
 * shadcn's utility classes, as the nested CSS this package writes.
 *
 * The look has to match, and the only description of it upstream publishes is a
 * Tailwind class list. Transcribing one by hand is a guess per utility; running
 * Tailwind over it is the answer, so this loads Tailwind v4 with shadcn's own
 * theme, builds the exact candidates a component uses, and rewrites each rule
 * it gets back with `&` where the utility class was:
 *
 *     .hover\:bg-accent:hover { background-color: var(--accent) }
 *  -> &:hover { background-color: var(--accent) }
 *
 * That is the whole trick. Variants, at-rules, `:has()`, arbitrary selectors
 * and the colour-mix fallbacks all survive it, because none of them is in the
 * part being replaced.
 *
 * `tailwindcss` is a devDependency for this reason and no other: nothing it
 * produces is imported by the package, and the output is committed.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { compile } from "tailwindcss";

/** The `@theme` shadcn maps its semantic tokens through. Kept in sync with `apps/v4/app/globals.css`. */
const THEME = `
@theme inline {
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-chart-1: var(--chart-1);
  --color-chart-2: var(--chart-2);
  --color-chart-3: var(--chart-3);
  --color-chart-4: var(--chart-4);
  --color-chart-5: var(--chart-5);
  --color-sidebar: var(--sidebar);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-ring: var(--sidebar-ring);
}

@custom-variant dark (&:is(.dark *));

@custom-variant data-open {
  &:where([data-state="open"]),
  &:where([data-open]:not([data-open="false"])) {
    @slot;
  }
}

@custom-variant data-closed {
  &:where([data-state="closed"]),
  &:where([data-closed]:not([data-closed="false"])) {
    @slot;
  }
}

@custom-variant data-checked {
  &:where([data-state="checked"]),
  &:where([data-checked]:not([data-checked="false"])) {
    @slot;
  }
}

@custom-variant data-unchecked {
  &:where([data-state="unchecked"]),
  &:where([data-unchecked]:not([data-unchecked="false"])) {
    @slot;
  }
}

@custom-variant data-selected {
  &:where([data-selected]:not([data-selected="false"])) {
    @slot;
  }
}

@custom-variant data-disabled {
  &:where([data-disabled]:not([data-disabled="false"])) {
    @slot;
  }
}

@custom-variant data-active {
  &:where([data-state="active"]),
  &:where([data-active]:not([data-active="false"])) {
    @slot;
  }
}

/*
 * The states @barqjs/aria writes, as variants.
 *
 * Radix says data-state="checked"; aria says data-selected, by its PRESENCE.
 * A shadcn class list is transcribed by swapping data-[state=checked]: for
 * is-selected:, and the specificity comes out the same (0-2-0, a class and an
 * attribute) so a variant still beats the base it refines.
 */
@custom-variant is-selected (&[data-selected]);
@custom-variant not-selected (&:not([data-selected]));
@custom-variant is-indeterminate (&[data-indeterminate]);
@custom-variant is-hovered (&[data-hovered]);
@custom-variant is-pressed (&[data-pressed]);
@custom-variant is-focused (&[data-focused]);
@custom-variant is-focus-visible (&[data-focus-visible]);
@custom-variant is-disabled (&[data-disabled]);
@custom-variant is-readonly (&[data-readonly]);
@custom-variant is-invalid (&[data-invalid]);
@custom-variant is-required (&[data-required]);
@custom-variant is-open (&[data-open]);
@custom-variant is-closed (&[data-closed]);
@custom-variant is-expanded (&[data-expanded]);
@custom-variant not-expanded (&:not([data-expanded]));
@custom-variant not-open (&:not([data-open]));
@custom-variant is-placeholder (&[data-placeholder]);
@custom-variant is-empty (&[data-empty]);
@custom-variant is-dragging (&[data-dragging]);

/* shadcn defines this in apps/v4/app/globals.css, and three of its own
 * scrollers use it. Without it those class lists translate to nothing. */
@utility no-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
}

@custom-variant data-horizontal {
  &:where([data-orientation="horizontal"]) {
    @slot;
  }
}

@custom-variant data-vertical {
  &:where([data-orientation="vertical"]) {
    @slot;
  }
}
`;

// ---------------------------------------------------------------------------
// A CSS tree, small enough to keep in one file
// ---------------------------------------------------------------------------

export type CssNode =
  | { readonly kind: "decl"; readonly text: string }
  | { readonly kind: "rule"; readonly selector: string; readonly nodes: CssNode[] }
  | { readonly kind: "at"; readonly head: string; readonly nodes: CssNode[] };

/** The next `;`, `{` or `}` that is not inside a string, a comment or brackets. */
function scan(source: string, from: number): { end: number; found: string } {
  let depth = 0;
  for (let index = from; index < source.length; index++) {
    const character = source[index];
    if (character === "\\") {
      index++;
    } else if (character === '"' || character === "'") {
      const quote = character;
      index++;
      while (index < source.length && source[index] !== quote) {
        if (source[index] === "\\") index++;
        index++;
      }
    } else if (character === "/" && source[index + 1] === "*") {
      const close = source.indexOf("*/", index + 2);
      if (close < 0) return { end: source.length, found: "" };
      index = close + 1;
    } else if (character === "(" || character === "[") {
      depth++;
    } else if (character === ")" || character === "]") {
      depth--;
    } else if (depth === 0 && (character === ";" || character === "{" || character === "}")) {
      return { end: index, found: character };
    }
  }
  return { end: source.length, found: "" };
}

function closingBrace(source: string, open: number): number {
  let index = open + 1;
  let depth = 1;
  while (index < source.length && depth > 0) {
    const { end, found } = scan(source, index);
    if (found === "{") depth++;
    else if (found === "}") depth--;
    else if (found === "") return source.length;
    index = end + 1;
  }
  return index - 1;
}

export function parse(source: string): CssNode[] {
  const nodes: CssNode[] = [];
  let index = 0;
  while (index < source.length) {
    const { end, found } = scan(source, index);
    const head = source.slice(index, end).trim();
    if (found === "{") {
      const stop = closingBrace(source, end);
      const body = source.slice(end + 1, stop);
      if (head.startsWith("@")) nodes.push({ kind: "at", head, nodes: parse(body) });
      else nodes.push({ kind: "rule", selector: head, nodes: parse(body) });
      index = stop + 1;
      continue;
    }
    if (head !== "") nodes.push({ kind: "decl", text: head });
    index = end + 1;
    if (found === "") break;
  }
  return nodes;
}

export function print(nodes: readonly CssNode[], indent = ""): string {
  const out: string[] = [];
  for (const node of nodes) {
    if (node.kind === "decl") out.push(`${indent}${node.text};`);
    else {
      const head = node.kind === "rule" ? node.selector : node.head;
      const body = print(node.nodes, `${indent}  `);
      out.push(body === "" ? `${indent}${head} {}` : `${indent}${head} {\n${body}\n${indent}}`);
    }
  }
  return out.join("\n");
}

// ---------------------------------------------------------------------------
// Compiling
// ---------------------------------------------------------------------------

export interface Compiled {
  /** The whole stylesheet, for a caller that wants a layer this one does not name. */
  readonly tree: CssNode[];
  /** Every rule the candidates produced, in Tailwind's own order. */
  readonly utilities: CssNode[];
  /** `--spacing`, `--text-sm` … the theme variables those rules read. */
  readonly theme: Map<string, string>;
  /** The `@property` declarations the `--ui-*` composition variables need. */
  readonly properties: CssNode[];
  /** `@keyframes` an `animate-*` utility pulled in. */
  readonly keyframes: CssNode[];
}

function find(nodes: readonly CssNode[], predicate: (node: CssNode) => boolean): CssNode[] {
  const out: CssNode[] = [];
  for (const node of nodes) {
    if (predicate(node)) out.push(node);
    if (node.kind !== "decl") out.push(...find(node.nodes, predicate));
  }
  return out;
}

export function layerOf(nodes: readonly CssNode[], name: string): CssNode[] {
  for (const node of nodes) {
    if (node.kind === "at" && node.head.replace(/\s+/g, " ").trim() === `@layer ${name}`) {
      return node.nodes;
    }
    if (node.kind !== "decl") {
      const nested = layerOf(node.nodes, name);
      if (nested.length > 0) return nested;
    }
  }
  return [];
}

/** `--tw-` is Tailwind's namespace; what this package emits is its own. */
function rename(nodes: readonly CssNode[]): CssNode[] {
  return nodes.map((node) => {
    if (node.kind === "decl") return { kind: "decl", text: node.text.replaceAll("--tw-", "--ui-") };
    if (node.kind === "rule") {
      return { kind: "rule", selector: node.selector, nodes: rename(node.nodes) };
    }
    return { kind: "at", head: node.head.replaceAll("--tw-", "--ui-"), nodes: rename(node.nodes) };
  });
}

/**
 * A build is one compiler.
 *
 * `compiler.build()` ACCUMULATES: the second call returns the rules for the
 * first call's candidates as well as its own. That is right for a watching
 * bundler and wrong here, where each class list has to produce its own CSS and
 * nobody else's. Compiling the input again costs 1.5 ms, so each build gets a
 * compiler of its own.
 */
export type Builder = (candidates: readonly string[]) => Promise<Compiled>;

export async function createBuilder(): Promise<Builder> {
  const root = resolve(import.meta.dir, "../node_modules/tailwindcss");
  const animate = resolve(import.meta.dir, "../node_modules/tw-animate-css/dist/tw-animate.css");
  const load = (id: string, base: string): { path: string; base: string; content: string } => {
    const path = id.startsWith(".")
      ? resolve(base, id)
      : id === "tw-animate-css"
        ? animate
        : resolve(root, id === "tailwindcss" ? "index.css" : id.replace(/^tailwindcss\//, ""));
    return { path, base: dirname(path), content: readFileSync(path, "utf8") };
  };

  // `tw-animate-css` is where shadcn's `animate-in`, `fade-in-0` and
  // `slide-in-from-top-2` come from. Without it those classes resolve to
  // nothing and an overlay appears with no transition at all.
  const input = `@import "tailwindcss";\n@import "tw-animate-css";\n${THEME}`;

  return async (candidates) => {
    const compiler = await compile(input, {
      base: import.meta.dir,
      loadStylesheet: async (id: string, base: string) => load(id, base),
      loadModule: async () => {
        throw new Error("this translation uses no Tailwind plugins");
      },
    });

    const tree = parse(compiler.build([...candidates]));
    const utilities = rename(layerOf(tree, "utilities"));
    const themeLayer = layerOf(tree, "theme");

    const theme = new Map<string, string>();
    for (const node of find(themeLayer, (n) => n.kind === "decl")) {
      if (node.kind !== "decl") continue;
      const split = node.text.indexOf(":");
      if (split < 0) continue;
      theme.set(node.text.slice(0, split).trim(), node.text.slice(split + 1).trim());
    }

    const properties = rename(
      tree.filter((node) => node.kind === "at" && node.head.startsWith("@property")),
    );
    const keyframes = rename(
      find(tree, (node) => node.kind === "at" && node.head.startsWith("@keyframes")),
    );

    return { tree, utilities, theme, properties, keyframes };
  };
}

// ---------------------------------------------------------------------------
// Rewriting a utility class out of its own selector
// ---------------------------------------------------------------------------

export function candidatePattern(candidate: string): RegExp {
  const body = candidate.replace(/[^a-zA-Z0-9_-]/g, (character) => `\\\\?\\${character}`);
  return new RegExp(`\\.${body}(?![\\w-])`);
}

/**
 * `.hover\:bg-accent:hover` -> `&:hover`.
 *
 * Every candidate is tried rather than assuming the class leads the selector,
 * because it does not always: `peer-*` puts the peer first
 * (`.peer:disabled ~ .peer-disabled\:opacity-50`), and rewriting position 0
 * there would delete the peer instead.
 */
/** Comma-split that respects escapes and brackets: `.transition-\[color\,_x\]` is one selector. */
function selectorParts(selector: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < selector.length; index++) {
    const character = selector[index];
    if (character === "\\") index++;
    else if (character === "(" || character === "[") depth++;
    else if (character === ")" || character === "]") depth--;
    else if (character === "," && depth === 0) {
      out.push(selector.slice(start, index));
      start = index + 1;
    }
  }
  out.push(selector.slice(start));
  return out;
}

export function nest(selector: string, candidates: readonly string[]): string {
  return selectorParts(selector)
    .map((part) => {
      const one = part.trim();
      for (const candidate of candidates) {
        const pattern = candidatePattern(candidate);
        if (pattern.test(one)) return one.replace(pattern, "&");
      }
      return one;
    })
    .join(", ");
}

function rewrite(nodes: readonly CssNode[], candidates: readonly string[]): CssNode[] {
  return nodes.map((node) => {
    if (node.kind === "decl") return node;
    if (node.kind === "rule") {
      return {
        kind: "rule",
        selector: nest(node.selector, candidates),
        nodes: rewrite(node.nodes, candidates),
      };
    }
    return { kind: "at", head: node.head, nodes: rewrite(node.nodes, candidates) };
  });
}

/**
 * Rules that are the bare element (`&` with nothing after it) become loose
 * declarations, which is what a `css` block wants at its top level.
 */
function flatten(nodes: readonly CssNode[]): CssNode[] {
  const out: CssNode[] = [];
  for (const node of nodes) {
    if (node.kind === "rule" && node.selector === "&") out.push(...node.nodes);
    else out.push(node);
  }
  return out;
}

/**
 * The same declaration written twice in one block, dropped.
 *
 * Tailwind emits `content: var(--tw-content)` from every `after:` utility, so
 * six of them produce six copies. A repeat is only dropped when nothing
 * between the two set the same property to something ELSE — `background-color:
 * var(--primary)` followed by a `color-mix` of it is a fallback pair, and
 * removing either half breaks it.
 */
function dedupeDeclarations(nodes: readonly CssNode[]): CssNode[] {
  const seen = new Map<string, string>();
  const out: CssNode[] = [];
  for (const node of nodes) {
    if (node.kind !== "decl") {
      out.push(node);
      continue;
    }
    const split = node.text.indexOf(":");
    const property = split < 0 ? node.text : node.text.slice(0, split).trim();
    if (seen.get(property) === node.text) continue;
    seen.set(property, node.text);
    out.push(node);
  }
  return out;
}

/** Adjacent blocks with the same head, merged. Tailwind emits one rule per utility. */
function coalesce(nodes: readonly CssNode[]): CssNode[] {
  const out: CssNode[] = [];
  for (const node of nodes) {
    const previous = out[out.length - 1];
    if (
      previous !== undefined &&
      previous.kind === node.kind &&
      node.kind !== "decl" &&
      previous.kind !== "decl" &&
      (node.kind === "rule"
        ? previous.kind === "rule" && previous.selector === node.selector
        : previous.kind === "at" && previous.head === node.head)
    ) {
      previous.nodes.push(...node.nodes);
      continue;
    }
    out.push(
      node.kind === "decl"
        ? node
        : node.kind === "rule"
          ? { kind: "rule", selector: node.selector, nodes: [...node.nodes] }
          : { kind: "at", head: node.head, nodes: [...node.nodes] },
    );
  }
  return dedupeDeclarations(
    out.map((node) =>
      node.kind === "decl"
        ? node
        : node.kind === "rule"
          ? { kind: "rule", selector: node.selector, nodes: coalesce(node.nodes) }
          : { kind: "at", head: node.head, nodes: coalesce(node.nodes) },
    ),
  );
}

export interface Translation {
  readonly css: string;
  readonly theme: Map<string, string>;
  readonly properties: CssNode[];
  readonly keyframes: CssNode[];
  /** Candidates Tailwind produced nothing for — a typo, or a class this theme has no rule for. */
  readonly unknown: string[];
}

export async function translate(build: Builder, classes: string): Promise<Translation> {
  const candidates = classes.split(/\s+/).filter((entry) => entry !== "");
  const compiled = await build(candidates);
  const nested = coalesce(flatten(rewrite(compiled.utilities, candidates)));

  const printed = print(compiled.utilities);
  const unknown = candidates.filter((candidate) => !candidatePattern(candidate).test(printed));

  return {
    css: print(nested),
    theme: compiled.theme,
    properties: compiled.properties,
    keyframes: compiled.keyframes,
    unknown,
  };
}
