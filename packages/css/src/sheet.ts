/**
 * The one registry every environment writes to, and the hash every generated
 * name comes from.
 *
 * Its own module because `atoms`, `defineVars` and `createTheme` all register
 * rules and all need the hash, and reaching them back through `index.ts` would
 * be a cycle.
 */

/**
 * Every rule registered on this side of the wire, keyed and in insertion order.
 *
 * ONE registry, and that is the architecture rather than a detail. The compiler
 * emits a module's CSS as an asset in a production build and as a
 * `registerCss` call in dev and under `bun test`, and a block the compiler
 * declined registers here too. So dev, tests, server rendering and the fallback
 * all read one sheet instead of falling into the gap between two.
 */
const registered = new Map<string, string>();

/**
 * FNV-1a over 32 bits.
 *
 * Not the compiler's 64-bit hash, and it does not need to be: the two never
 * name the same block, because a block is either compiled or not. Keeping this
 * one 32-bit is what lets it be four lines instead of a BigInt.
 */
export function hash(text: string): string {
  let value = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 0x01000193) >>> 0;
  }
  return `r${value.toString(36)}`;
}

const SHEET_ID = "barq-css";

/**
 * How an atom is ORDERED against another atom, and nothing more.
 *
 * Not a cascade layer for an UNLAYERED atom, and it was one for a while:
 * layering gave ordering across modules and took away the thing atoms exist
 * for, because a layered rule loses to an unlayered one whatever the
 * specificity. Measured in a browser, an application's `* { margin: 0 }` beat
 * every margin atom on the page and every margin and padding computed to `0px`.
 *
 * Specificity answers most of it on its own: `.a-margin-top_x` is 0-1-0 against
 * the reset's 0-0-0, `:hover` is 0-2-0 and `::before` is 0-1-1. The one pair it
 * cannot separate is a base against the same property under an at-rule, since
 * `@media` adds none — so the tier decides that one.
 *
 * The tier is a TIE-BREAKER on top of specificity, and never a cascade layer:
 * CSS decides by specificity first and order second, where a layer overrides
 * specificity outright. Measured in a browser, emitting each tier into
 * `@layer barq.ui.<tier>` moved 289 computed values on `@barqjs/ui`'s gallery,
 * because a parent's `[data-variant="destructive"] &` at 0-2-0 stopped beating
 * the child's own 0-1-0. So the tier is carried by the ORDER of the rules, and
 * `collectCss` sorts every rule it holds by it — which makes the order global
 * here, where a production bundle needs `orderCss` over the built asset to
 * reach the same place.
 *
 * `descendant` comes FIRST, and that is the one tier order decides rather than
 * specificity. A rule a parent writes about its children — `& > *`, `& svg` —
 * and a rule the child writes about itself are both one class, so nothing
 * separates them but which came last. Measured in a browser: a field saying
 * `& > * { width: 100% }` took a label's own `width: fit-content` away and
 * stretched it across the row. The child's own rule is the more specific
 * INTENT, so the parent's goes before it and loses the tie.
 */
export const TIERS = ["descendant", "base", "select", "element", "media"] as const;

/**
 * The tier each rule sorts in, for the one ordering specificity cannot give:
 * a base against the same property under an at-rule, since `@media` adds no
 * specificity. Everything not an atom is tier 0 and keeps insertion order.
 */
const tiers = new Map<string, number>();

/**
 * Registered under a key rather than pushed, so a block evaluated on every
 * render inserts one rule and a module re-evaluated by HMR REPLACES its own.
 *
 * The element's text is rewritten from the map rather than appended to, which
 * is what makes replacement possible at all. `insertRule` is deliberately not
 * used: it is faster and impossible to read, and this is the path a person is
 * debugging.
 */
/**
 * Where a rule registered DURING a render goes, when a host installs one.
 *
 * A server process imports the application once and serves forever, so a
 * module-scope rule belongs to every request and a rule a component body
 * registers belongs to one. Without the split they went to the same map and
 * `/about` inlined the rules a request for `/css` had produced — bounded, since
 * a block is content-hashed and registers once, but bytes no page on that route
 * can use.
 *
 * A FUNCTION rather than a map, because the host is what knows which request is
 * current: `@barqjs/start` reads its `AsyncLocalStorage`, so two requests in
 * flight at once cannot take each other's rules. No sink means no host has
 * asked — a browser, or a server before its first request — and everything goes
 * to the one sheet.
 */
let sink: ((key: string, rules: string) => boolean) | null = null;

/**
 * The sink RETURNS whether it took the rule, so there is one fallback and not
 * two: outside a request there is nothing to attribute a rule to, the sink says
 * so, and the rule lands in the sheet every request reads.
 */
export function setCssSink(next: ((key: string, rules: string) => boolean) | null): void {
  sink = next;
}

export function register(key: string, rules: string, tier = 0): string {
  if (sink?.(key, rules) === true) return key;
  if (registered.get(key) === rules) return key;
  registered.set(key, rules);
  if (tier !== 0) tiers.set(key, tier);
  paint();
  return key;
}

function paint(): void {
  if (typeof document === "undefined") return;
  const element = document.getElementById(SHEET_ID) as HTMLStyleElement | null;
  if (element !== null) {
    element.textContent = collectCss();
    return;
  }
  // `document.head` is NULL for part of a hydration: the client render rebuilds
  // the document, and a module registering a rule in that window crashed the
  // whole page with `Cannot read properties of null (reading 'appendChild')`.
  // Measured in a browser on every server-rendered route.
  //
  // `<body>` when there is no head to use. A `<style>` there is not what the
  // parser prefers but every browser honours it, and `<head>` is reconciled by
  // `<HeadContent />` as a keyed list — an element this appends there is one
  // that list did not produce, so the next reconcile would take it away again.
  const host = document.head ?? document.body;
  if (host === null) return;
  const created = document.createElement("style");
  created.id = SHEET_ID;
  created.textContent = collectCss();
  host.appendChild(created);
}

/**
 * A compiled module's stylesheet, handed over at module evaluation.
 *
 * What `@barqjs/compiler` appends in dev and under `bun test`, where a
 * production build gets a real `.css` asset instead. The key is the module id,
 * so an HMR update replaces that module's rules rather than stacking a second
 * copy on top of them.
 *
 * Not for hand-written code. It exists so that ONE registry serves every
 * environment: without it, dev and tests had no CSS at all while the build had
 * an asset, which is two systems with a hole between them.
 */
export function registerCss(key: string, rules: string): void {
  register(key, rules);
}

/**
 * Every rule registered so far, for a server render to inline.
 *
 * In a production build that is only what the compiler declined, because a
 * compiled block's CSS is an asset the document links. In dev and under
 * `bun test` it is the whole sheet, which is what makes a server-rendered dev
 * page arrive styled — it used to arrive with 23 classes in its markup and no
 * stylesheet of any kind.
 */
/**
 * Every rule that belongs to EVERY request: the module-scope ones, registered
 * when the application was imported. A render's own rules are the host's, and
 * it collects them from the sink it installed.
 */
export function collectCss(): string {
  // A STABLE sort, so everything within a tier keeps the order it registered
  // in — which is what a scoped block and a global rule need.
  const rules = [...registered.entries()]
    .map((entry, index) => [entry, index] as const)
    .toSorted(([a, i], [b, j]) => (tiers.get(a[0]) ?? 0) - (tiers.get(b[0]) ?? 0) || i - j)
    .map(([entry]) => entry[1]);

  // One block per cascade layer. A layered atom carries its own
  // `@layer barq.ui{…}`, and a package with a thousand of them wrote the
  // wrapper a thousand times: 16 KB of the 110 KB the sheet weighed, and the
  // repetition cost more than it compressed away.
  //
  // Gathering a layer's rules is safe in a way that gathering ordinary rules
  // would not be. Order still decides between two rules INSIDE the layer, and
  // that order is kept; against anything outside it the layer decides, whatever
  // the order. The block sits where the layer was first named.
  const out: string[] = [];
  const layers = new Map<string, string[]>();
  for (const rule of rules) {
    const split = wrapped(rule);
    if (split === null) {
      out.push(rule);
      continue;
    }
    const held = layers.get(split.layer);
    if (held === undefined) {
      layers.set(split.layer, [split.body]);
      out.push(`\u0000${split.layer}`);
    } else {
      held.push(split.body);
    }
  }

  return out
    .map((part) =>
      part.startsWith("\u0000")
        ? `@layer ${part.slice(1)}{${once((layers.get(part.slice(1)) ?? []).join(""))}}`
        : part,
    )
    .join("");
}

/**
 * A layer's contents with each rule written once.
 *
 * The compiler emits a module's atoms with the module, and an atom two modules
 * both use is in both blobs — it dedupes within one compilation and cannot see
 * the others. Measured over `@barqjs/ui`: 1,955 rules where 552 were distinct,
 * and the sheet weighed 210 KB instead of 93. Identical text, so which copy
 * survives does not matter.
 */
function once(body: string): string {
  const seen = new Set<string>();
  const out: string[] = [];
  let from = 0;
  let depth = 0;
  for (let index = 0; index < body.length; index++) {
    if (body[index] === "{") depth++;
    else if (body[index] === "}" && --depth === 0) {
      const statement = body.slice(from, index + 1);
      if (!seen.has(statement)) {
        seen.add(statement);
        out.push(statement);
      }
      from = index + 1;
    }
  }
  // Whatever did not close is not a statement this can reason about.
  return out.join("") + body.slice(from);
}

/** A rule that is exactly one cascade layer, as its name and its contents. */
function wrapped(rule: string): { layer: string; body: string } | null {
  const match = /^@layer ([\w.-]+)\{/.exec(rule);
  if (match === null || !rule.endsWith("}")) return null;
  const open = match[0].length;
  // The layer must CLOSE at the end, or this is a layer holding something that
  // closes early and the text after it would be lifted out of the layer.
  let depth = 1;
  for (let at = open; at < rule.length - 1; at++) {
    if (rule[at] === "{") depth++;
    else if (rule[at] === "}" && --depth === 0) return null;
  }
  return { layer: match[1] ?? "", body: rule.slice(open, -1) };
}
