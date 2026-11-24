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
interface Entry {
  rules: string;
  tier: number;
  /** The entry as statements, split once: it is read on every repaint. */
  parts: Part[] | null;
  /** The {@link clock} when these rules were registered. */
  mark: number;
  /**
   * Registered by {@link registerCss} while a request was rendering, and not
   * since outside one: the rules of whichever requests register them, rather
   * than of every page the server renders after the first.
   */
  request?: boolean;
}

/**
 * One statement, and the layer it was written in.
 *
 * A layer's contents are held a statement at a time rather than as the block's
 * text, because ordering and deduplication are both questions about one rule.
 */
interface Part {
  readonly layer: string;
  readonly text: string;
  /** `PINNED` for a rule that is not an atom: it keeps the place it was given. */
  readonly tier: number;
  /** Where the rule sorts by the at-rule it is under, and `null` for a rule under none. */
  readonly media: MediaRank | null;
  /** The hash of the condition an atom was declared under, read off its class. */
  readonly condition: string;
  /** One-based place in {@link INTERACTIONS} of the latest its selector carries, 0 for none. */
  readonly interaction: number;
  /** The class of the atom this rule IS, where that is checked: see {@link atomOf}. */
  readonly atom: string | null;
  /**
   * The rule and the layer it is in, as one string: the same text in two
   * layers is two rules. Held because every repaint asks a set for it.
   */
  readonly id: string;
}

const PINNED = -1;

/** A sheet arranged: the top level, with one empty-text part where each layer sits. */
interface Arranged {
  readonly top: Part[];
  readonly layers: Map<string, Part[]>;
}

const registered = new Map<string, Entry>();

/**
 * Counts registrations that changed the sheet, so "what did this page's head
 * hold" is one number a render keeps rather than a copy of the sheet.
 */
let clock = 0;

/**
 * The server's head sheet, once a client has found one in the document.
 *
 * A client's registry starts empty and fills as modules load, so for most of a
 * hydration it holds less than the server sent. A sheet written from the
 * registry alone is missing every rule a module has not registered yet, under
 * markup that is already on the page. Adopted, the server's rules stay where
 * they are and the registry only adds to them.
 */
let adopted: Arranged | null = null;

/** Every rule a server sheet already holds, head and late, by {@link Part.id}. */
let served: Set<string> | null = null;

/** The elements {@link adopted} and the late half of {@link served} were read from. */
let owned: Element | null = null;
let ownedAtoms: Element | null = null;
let late: Element | null = null;

/**
 * The sheet as text, kept until a registration changes it: a server reads the
 * whole sheet once a request, and most requests register nothing.
 */
let serialised: string | null = null;
let split: SheetParts | null = null;

/**
 * A sheet as the two places it goes in a document: every rule that is not an
 * atom, and then the atoms.
 *
 * Two, because a build links its compiled atoms between them. An atom and a
 * `css` block class are both 0-1-0 and the later rule wins, so what the runtime
 * registers has to stay on the right side of that link: its blocks in front of
 * the build's atoms, and its atoms after the build's blocks. One `<style>`
 * after the link let a block the runtime evaluated beat every compiled atom.
 */
export interface SheetParts {
  readonly blocks: string;
  readonly atoms: string;
}

const resets: (() => void)[] = [];

/** A memo that names rules this sheet holds, to be dropped when the sheet is. */
export function onReset(hook: () => void): void {
  resets.push(hook);
}

/**
 * An empty sheet, for a test that compares one against another.
 *
 * A class name is a function of its declaration, so nothing a caller already
 * holds becomes wrong; its rule is simply registered again on next use.
 */
export function resetCss(): void {
  registered.clear();
  serialised = null;
  split = null;
  adopted = null;
  served = null;
  owned = null;
  ownedAtoms = null;
  late = null;
  for (const hook of resets) hook();
  if (typeof document === "undefined") return;
  document.getElementById(SHEET_ID)?.remove();
  document.getElementById(ATOMS_SHEET_ID)?.remove();
  if (constructed !== null) {
    const dropped = constructed;
    document.adoptedStyleSheets = document.adoptedStyleSheets.filter((each) => each !== dropped);
    constructed = null;
    constructedText = "";
  }
}

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

/** The `<style>` that holds the registry's atoms, after {@link SHEET_ID}'s. */
const ATOMS_SHEET_ID = "barq-css-atoms";

/** What marks the `<link>` of a build's compiled atoms. */
const ATOMS_LINK = "link[data-barq-atoms]";

/** The sheet a server writes at the end of `<body>`, for what its render registered. */
const LATE_ID = "barq-css-late";

/**
 * Whether a failure here should stop the page rather than be lived with.
 *
 * Read through a `try`, because a browser has no `process` unless a bundler
 * replaced the expression, and one that did not is a production page.
 */
const STRICT = ((): boolean => {
  try {
    return process.env.NODE_ENV !== "production";
  } catch {
    return false;
  }
})();

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
 * Registered under a key rather than pushed, so a block evaluated on every
 * render inserts one rule and a module re-evaluated by HMR REPLACES its own.
 *
 * The element's text is rewritten from the map rather than appended to, which
 * is what makes replacement possible at all. `insertRule` is deliberately not
 * used: it is faster and impossible to read, and this is the path a person is
 * debugging.
 */
/**
 * Where a rule registered DURING a render is ALSO recorded, when a host asks.
 *
 * The server serialises `<head>` before it renders the body, so a rule the
 * render itself produces reaches the head too late. The sink is how the host
 * learns which rules those were, and it emits them at the end of the body.
 *
 * A FUNCTION rather than a map, because the host is what knows which request is
 * current: `@barqjs/start` reads its `AsyncLocalStorage`, so two requests in
 * flight at once cannot take each other's rules.
 *
 * IT IS A COPY, NOT A MOVE, and that is the whole correction. The sink used to
 * take the rule INSTEAD of the shared sheet, on the reasoning that a rule a
 * component body registers belongs to one request. A module's own rules are
 * registered when the module is first IMPORTED, and a lazily routed module is
 * imported inside whichever request happened to reach it first — so its rules
 * went into that one response and no other. Measured on the dev server against
 * `/charts/area`: the first request carried six `css` blocks in its late sheet
 * and every request after it carried none, and the page arrived with no rules
 * for its own layout at all. The cost of the copy is bytes a later page cannot
 * use; the cost of the move was a page with no styles.
 *
 * WHAT A PAGE IS OWED is everything registered after ITS head was read, by any
 * request, and the rule and its key cannot say that. Two renders in flight
 * share one sheet: the second reads its head, the first then registers a rule,
 * and the second uses it — as a class string a module already holds, or out of
 * a memo, so it registers nothing and is offered nothing. The rule is in
 * neither of that page's sheets. So `head` is told each time the whole sheet is
 * read, which is how a host serialises `<head>`, and handed `late`: a reader
 * for every rule registered after that read, arranged as the sheet itself is.
 */
export interface CssSink {
  (key: string, rules: string): boolean;
  head?(late: () => string): void;
  /** Whether the request rendering now registered `key` itself. */
  owns?(key: string): boolean;
}

let sink: CssSink | null = null;

/** The sink's return value is unused: a rule reaches the sheet either way. */
export function setCssSink(next: CssSink | null): void {
  sink = next;
}

export function register(key: string, rules: string, tier = 0, keyed = false): string {
  const held = registered.get(key);
  // Only what the shared sheet did NOT already have, so a rule the head was
  // serialised with is not emitted a second time at the end of the body. A
  // keyed sheet registered again is still told to the request doing it, which
  // is what makes it that request's.
  if (held !== undefined && held.rules === rules) {
    if (keyed && sink?.(key, rules) !== true) held.request = false;
    return key;
  }
  const claimed = sink?.(key, rules) === true;
  const mark = ++clock;
  if (held === undefined) {
    registered.set(key, { rules, tier, parts: null, mark, request: keyed && claimed });
  } else {
    held.request = keyed && claimed;
    if (served !== null) retire(held, rules, tier);
    held.rules = rules;
    held.tier = tier;
    held.parts = null;
    held.mark = mark;
  }
  serialised = null;
  split = null;
  if (holding > 0) painting = true;
  else paint();
  return key;
}

let holding = 0;
let painting = false;

/**
 * Registrations between this and {@link release} rewrite the `<style>` once.
 *
 * The element is rewritten whole, which is a serialised sheet and a reparse of
 * every rule in it, and one `atoms` call registers an atom per declaration and
 * four per box shorthand. Measured under happy-dom over a 2,000-rule sheet: a
 * call of four new declarations cost 3.49 ms painting after each rule, and
 * 0.72 ms painting once. The sheet is still current when the call returns;
 * only the repaints in between are gone.
 */
export function hold(): void {
  holding++;
}

export function release(): void {
  if (--holding === 0 && painting) {
    painting = false;
    paint();
  }
}

/**
 * One atom's rule, under the class its declaration hashes to.
 *
 * The class is the declaration's name, so a different rule under a class the
 * sheet already holds is two declarations that hash alike, and one of them is
 * about to style the other's elements. Nothing downstream can tell: the markup
 * carries one class and the sheet one rule.
 */
export function registerAtom(name: string, rule: string, tier: number): string {
  const held = registered.get(name);
  if (STRICT && held !== undefined && held.rules !== rule) throw collision(name, held.rules, rule);
  return register(name, rule, tier);
}

function collision(name: string, first: string, second: string): Error {
  return new Error(
    `[barq] two declarations hash to the class \`${name}\`: \`${first}\` and \`${second}\`. ` +
      "One class cannot carry both; change either value's spelling, `8px` to `0.5rem` or " +
      "`#fff` to `white`, so they hash apart.",
  );
}

function paint(): void {
  if (typeof document === "undefined") return;
  const blocks = document.getElementById(SHEET_ID);
  const atoms = document.getElementById(ATOMS_SHEET_ID);
  if (blocks !== owned || (atoms !== null && atoms !== ownedAtoms)) adopt(blocks, atoms);
  else adoptLate();
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
  const text = sheetParts();
  const link = document.head?.querySelector(ATOMS_LINK) ?? null;
  const ownBlocks = blocks ?? created(SHEET_ID);
  if (!ownBlocks.isConnected) {
    if (link === null) host.appendChild(ownBlocks);
    else link.before(ownBlocks);
  }
  owned = ownBlocks;
  if (ownBlocks.textContent !== text.blocks) ownBlocks.textContent = text.blocks;
  if (link === null && constructible()) {
    // Emptied rather than removed: it is `<HeadContent />`'s, which reads
    // what it holds when it renders and then leaves out an empty one.
    if (atoms !== null && atoms.textContent !== "") atoms.textContent = "";
    ownedAtoms = atoms;
    adoptConstructed(text.atoms);
    return;
  }
  const ownAtoms = atoms ?? created(ATOMS_SHEET_ID);
  if (!ownAtoms.isConnected) {
    if (link === null) ownBlocks.after(ownAtoms);
    else link.after(ownAtoms);
  }
  ownedAtoms = ownAtoms;
  if (ownAtoms.textContent !== text.atoms) ownAtoms.textContent = text.atoms;
}

function created(id: string): HTMLStyleElement {
  const element = document.createElement("style");
  element.id = id;
  return element;
}

/** The atoms, in dev, where no stylesheet in the document can come after them. */
let constructed: CSSStyleSheet | null = null;
let constructedText = "";

/**
 * Whether the atoms can go in an adopted stylesheet, which the cascade puts
 * after every stylesheet the document holds, in dev.
 *
 * Vite's dev client appends a `<style>` for each plain `.css` file a module
 * imports to the end of `<head>`, after every atom, so a 0-1-0 rule in one beat
 * an atom in dev and lost to it in the build, where that file's rules are in a
 * chunk linked before the atoms. Moving those elements instead does not hold:
 * `<HeadContent />` claims `<head>` by tag, and a foreign `<style>` between two
 * of its own took the place of the second. A build has its atoms' `<link>`, and
 * every stylesheet it links later goes in front of that, so a build keeps two
 * elements either side of it.
 */
function constructible(): boolean {
  return (
    STRICT &&
    typeof CSSStyleSheet !== "undefined" &&
    "replaceSync" in CSSStyleSheet.prototype &&
    Array.isArray(document.adoptedStyleSheets)
  );
}

function adoptConstructed(text: string): void {
  if (constructed === null) {
    constructed = new CSSStyleSheet();
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, constructed];
  }
  if (constructedText === text) return;
  constructedText = text;
  constructed.replaceSync(text);
}

/** What the registry last wrote for its atoms, wherever they went. */
export function paintedAtoms(): string {
  if (constructed !== null) return constructedText;
  return typeof document === "undefined"
    ? ""
    : (document.getElementById(ATOMS_SHEET_ID)?.textContent ?? "");
}

/**
 * Take a sheet this module did not write as the start of its own.
 *
 * Whatever the document already holds under the sheet's id was written by a
 * server, and its text is that server's whole registry in the order the server
 * arranged it. Read back into the same parts, it is what this side's rules are
 * merged INTO: none of it is dropped and none of it changes place.
 */
function adopt(blocks: Element | null, atoms: Element | null): void {
  if (blocks !== owned || atoms !== ownedAtoms) {
    owned = blocks;
    ownedAtoms = atoms;
    const text = (blocks?.textContent ?? "") + (atoms?.textContent ?? "");
    adopted = arrange(partsOf({ rules: text, tier: 0, parts: null, mark: 0 }), null, false);
    served = new Set();
    for (const part of adopted.top) if (part.text !== "") served.add(part.id);
    for (const held of adopted.layers.values()) for (const part of held) served.add(part.id);
    late = null;
    serialised = null;
    split = null;
  }
  adoptLate();
}

/** The late sheet's rules count as held; the element is written only to drop a replaced entry's rules. */
function adoptLate(): void {
  const element = document.getElementById(LATE_ID);
  if (element === null || element === late) return;
  late = element;
  served ??= new Set();
  const text = element.textContent ?? "";
  for (const part of partsOf({ rules: text, tier: 0, parts: null, mark: 0 })) {
    served.add(part.id);
  }
  serialised = null;
  split = null;
}

/**
 * Drop what a replaced entry alone had brought, out of the adopted sheet.
 *
 * A module re-evaluated by HMR replaces its own rules, and after a hydration
 * the ones it is replacing are in the server's text rather than in anything
 * this side wrote. Only what no other entry still holds goes: an atom two
 * modules share stays for the one that was not edited.
 */
function retire(entry: Entry, rules: string, tier: number): void {
  if (served === null) return;
  const next = new Set(partsOf({ rules, tier, parts: null, mark: 0 }).map((part) => part.id));
  const gone = partsOf(entry)
    .map((part) => part.id)
    .filter((name) => served?.has(name) === true && !next.has(name));
  if (gone.length === 0) return;
  const kept = new Set<string>();
  for (const other of registered.values()) {
    if (other !== entry) for (const part of partsOf(other)) kept.add(part.id);
  }
  const drop = new Set(gone.filter((name) => !kept.has(name)));
  if (drop.size === 0) return;
  for (const name of drop) served.delete(name);
  // What a server's render registered is in the late sheet, at the end of the
  // body, where it beats the head's copy of any rule: a theme the page swaps
  // after hydration kept losing to the one the server rendered.
  // Found again rather than remembered: a hydration can put a new element
  // under the id, and writing the one adopted earlier changed nothing on the page.
  const element = typeof document === "undefined" ? null : document.getElementById(LATE_ID);
  if (element !== null) {
    const held = partsOf({ rules: element.textContent ?? "", tier: 0, parts: null, mark: 0 });
    if (held.some((part) => drop.has(part.id))) {
      element.textContent = print(
        arrange(
          held.filter((part) => !drop.has(part.id)),
          null,
          false,
        ),
      );
    }
  }
  if (adopted === null) return;
  function keep(part: Part): boolean {
    return part.text === "" || !drop.has(part.id);
  }
  const layers = new Map<string, Part[]>();
  for (const [name, held] of adopted.layers) layers.set(name, held.filter(keep));
  adopted = { top: adopted.top.filter(keep), layers };
}

/**
 * A compiled module's stylesheet, handed over at module evaluation.
 *
 * What the compiler plugin appends in dev and under `bun test`, where a
 * production build gets a real `.css` asset instead. The key is the module id,
 * so an HMR update replaces that module's rules rather than stacking a second
 * copy on top of them.
 *
 * Not for hand-written code. It exists so that ONE registry serves every
 * environment: without it, dev and tests had no CSS at all while the build had
 * an asset, which is two systems with a hole between them.
 */
export function registerCss(key: string, rules: string): void {
  register(key, rules, 0, true);
}

/**
 * One page's share of the registry: the compiled module stylesheets it reaches,
 * in the order its modules run, out of every module stylesheet there is. An
 * entry under any other key, a theme `installTheme` wrote or a rule the runtime
 * evaluated, belongs to every page.
 */
export interface CssScope {
  readonly keys: readonly string[];
  readonly modules: ReadonlySet<string>;
}

/**
 * Every rule registered so far, for a server render to inline.
 *
 * In a production build that is only what the compiler declined, because a
 * compiled block's CSS is an asset the document links. In dev and under
 * `bun test` it is the whole sheet, which is what makes a server-rendered dev
 * page arrive styled — it used to arrive with 23 classes in its markup and no
 * stylesheet of any kind.
 *
 * `scope` is the compiled module stylesheets one page reaches, in the order the
 * page's modules run, and the sheet then holds those and every entry that is
 * not a module's stylesheet at all. A server imports an application once and
 * renders many pages, so its registry holds every module any request has
 * reached: without a scope, `/` rendered after `/create` carried `/create`'s
 * `#app` rules, and the order of two modules' blocks was whichever page the
 * process happened to render first.
 */
export function collectCss(scope?: CssScope): string {
  const entries = scope === undefined ? pageEntries() : entriesIn(scope);
  const text =
    scope === undefined && sink?.owns === undefined
      ? wholeSheet()
      : print(arrange(everyPart(entries), scope === undefined ? served : null, true));
  headRead(entries);
  return text;
}

/** The same sheet as the two places it goes: see {@link SheetParts}. */
export function collectCssParts(scope?: CssScope): SheetParts {
  const entries = scope === undefined ? pageEntries() : entriesIn(scope);
  const text =
    scope === undefined && sink?.owns === undefined
      ? sheetParts()
      : printParts(arrange(everyPart(entries), scope === undefined ? served : null, true));
  headRead(entries);
  return text;
}

/**
 * Every rule that belongs to EVERY request: the module-scope ones, registered
 * when the application was imported. A render's own rules are the host's, and
 * it collects them from the sink it installed.
 */
function headRead(entries: Iterable<Entry>): void {
  if (sink?.head !== undefined) {
    const read = clock;
    const held = new Set(entries);
    sink.head(() => since(read, held));
  }
}

/**
 * Whether an entry belongs on the page rendering now. A sheet a request
 * registered through {@link registerCss}, a theme a component installs as it
 * renders, belongs to the requests that register it: on a server that renders
 * many pages from one registry, `/` after `/create` carried `/create`'s
 * `:root` and `.dark` rules otherwise.
 */
function visible(key: string, entry: Entry): boolean {
  return entry.request !== true || sink?.owns === undefined || sink.owns(key);
}

/** Every entry, less what another request registered, when a host can say. */
function pageEntries(): Entry[] {
  const out: Entry[] = [];
  for (const [key, entry] of registered) if (visible(key, entry)) out.push(entry);
  return out;
}

function entriesIn(scope: CssScope): Entry[] {
  const out: Entry[] = [];
  const taken = new Set<string>();
  for (const key of scope.keys) {
    const entry = registered.get(key);
    if (entry === undefined || taken.has(key)) continue;
    taken.add(key);
    out.push(entry);
  }
  for (const [key, entry] of registered) {
    if (!taken.has(key) && !scope.modules.has(key) && visible(key, entry)) out.push(entry);
  }
  return out;
}

function ownArranged(): Arranged {
  const mine = arrange(everyPart(pageEntries()), served, true);
  return adopted === null ? mine : joined(adopted, mine);
}

function wholeSheet(): string {
  serialised ??= print(ownArranged());
  return serialised;
}

function sheetParts(): SheetParts {
  split ??= printParts(ownArranged());
  return split;
}

/**
 * Every rule registered after `mark`, arranged as the whole sheet is.
 *
 * Less whatever the sheet held at `mark` under another key, so a page is not
 * sent one rule in both of its sheets: an atom two modules share is in the
 * head if either module was registered by then.
 *
 * This goes at the end of `<body>`, after the head's atoms, so when it holds a
 * rule that is not an atom it ends with EVERY atom again: a block a module
 * brought during the render would otherwise beat an atom already in the head.
 */
function since(mark: number, head: ReadonlySet<Entry>): string {
  const fresh: Entry[] = [];
  const held = new Set<string>();
  for (const [key, entry] of registered) {
    // A request's own keyed sheet it registered again after its head was
    // read: unchanged, so its mark did not move, and not in that head.
    const again = entry.request === true && !head.has(entry) && sink?.owns?.(key) === true;
    if (entry.mark > mark || again) fresh.push(entry);
    else if (head.has(entry)) for (const part of partsOf(entry)) held.add(part.id);
  }
  if (fresh.length === 0) return "";
  const arranged = arrange(everyPart(fresh), held, true);
  const blocks = printParts(arranged).blocks;
  if (blocks.replace(/@layer [\w.-]+\{\}/g, "") === "") return print(arranged);
  return blocks + printParts(arrange(everyPart(registered.values()), null, true)).atoms;
}

function* everyPart(entries: Iterable<Entry>): Generator<Part> {
  for (const entry of entries) yield* partsOf(entry);
}

/**
 * Parts as the sheet they make: one list for the top level, one a layer.
 *
 * `skip` names rules already on the page, which are left out. `order` is off
 * for a sheet read back from a server, whose order is the thing being kept.
 */
function arrange(parts: Iterable<Part>, skip: Set<string> | null, order: boolean): Arranged {
  const top: Part[] = [];
  const layers = new Map<string, Part[]>();
  // One block per cascade layer. A layered atom carries its own
  // `@layer barq.ui{…}`, and a package with a thousand of them wrote the
  // wrapper a thousand times: 16 KB of the 110 KB the sheet weighed, and the
  // repetition cost more than it compressed away.
  //
  // Gathering a layer's rules is safe in a way that gathering ordinary rules
  // would not be. Order still decides between two rules INSIDE the layer, and
  // that order is kept; against anything outside it the layer decides, whatever
  // the order. The block sits where the layer was first named.
  for (const part of parts) {
    if (skip?.has(part.id) === true) continue;
    if (part.layer === "") {
      top.push(part);
      continue;
    }
    const held = layers.get(part.layer);
    if (held === undefined) {
      layers.set(part.layer, [part]);
      top.push({
        layer: part.layer,
        text: "",
        tier: PINNED,
        media: null,
        condition: "",
        interaction: 0,
        atom: null,
        id: "",
      });
    } else {
      held.push(part);
    }
  }
  if (!order) return { top, layers };
  // A compiled module's atoms arrive in that module's order, which puts a
  // `@media` rule from one module before a base rule from the next. Ordered the
  // way `orderCss` orders the built asset, so a page is the same served by the
  // dev server as built. The atoms the runtime registered are ordered WITH
  // them: in a run of their own, a narrow breakpoint the runtime wrote would
  // sit after a wide one a compiled module has, and win above it.
  orderAtoms(top);
  for (const held of layers.values()) orderAtoms(held);
  return { top, layers };
}

/**
 * This side's rules, put into a sheet a server arranged.
 *
 * Inserted rather than sorted in. `orderAtoms` moves atoms between the places
 * atoms hold, which carries one across a rule that is not an atom whenever the
 * count before it changes — and the server's rules are exactly what must not
 * change place. An atom goes after the last rule that sorts no later than it
 * does; anything else goes in front of the first atom, as {@link orderAtoms}
 * would have put it.
 */
function joined(server: Arranged, own: Arranged): Arranged {
  const top = [...server.top];
  const layers = new Map<string, Part[]>();
  for (const [name, held] of server.layers) layers.set(name, [...held]);
  for (const part of own.top) {
    if (part.text !== "") {
      insert(top, part);
      continue;
    }
    const held = own.layers.get(part.layer) ?? [];
    const into = layers.get(part.layer);
    if (into === undefined) {
      layers.set(part.layer, [...held]);
      top.push(part);
    } else {
      for (const inner of held) insert(into, inner);
    }
  }
  return { top, layers };
}

function insert(list: Part[], part: Part): void {
  if (part.tier === PINNED) {
    const atom = list.findIndex((held) => held.tier !== PINNED);
    if (atom < 0) list.push(part);
    else list.splice(atom, 0, part);
    return;
  }
  let after = -1;
  let first = -1;
  for (let index = 0; index < list.length; index++) {
    const held = list[index];
    if (held.tier === PINNED) continue;
    if (first < 0) first = index;
    if (precedes(held, part) <= 0) after = index;
  }
  if (after >= 0) list.splice(after + 1, 0, part);
  else if (first >= 0) list.splice(first, 0, part);
  else list.push(part);
}

function print(arranged: Arranged): string {
  let out = "";
  // An atom two modules both use is in both stylesheets, and the compiler
  // cannot see across them. Identical text, so which copy survives does not
  // matter. A rule that is not an atom is only dropped inside a layer, where
  // its position against the rest of the page is the layer's and not its own.
  const seen = new Set<string>();
  const classes = STRICT ? new Map<string, string>() : null;
  for (const part of arranged.top) {
    if (part.layer === "") {
      if (part.tier !== PINNED) {
        if (seen.has(part.text)) continue;
        seen.add(part.text);
        if (classes !== null) distinct(classes, part);
      }
      out += part.text;
      continue;
    }
    const within = new Set<string>();
    out += `@layer ${part.layer}{`;
    for (const inner of arranged.layers.get(part.layer) ?? []) {
      if (within.has(inner.text)) continue;
      within.add(inner.text);
      if (classes !== null && inner.tier !== PINNED) distinct(classes, inner);
      out += inner.text;
    }
    out += "}";
  }
  return out;
}

/**
 * {@link print}, as every rule that is not an atom and then every atom. A layer
 * is opened in the first half wherever it was first named, so the layer order
 * that half declares holds, and in the second half wherever it has an atom.
 */
function printParts(arranged: Arranged): SheetParts {
  let blocks = "";
  let atoms = "";
  let layered = "";
  const seen = new Set<string>();
  const classes = STRICT ? new Map<string, string>() : null;
  for (const part of arranged.top) {
    if (part.layer === "") {
      if (part.tier === PINNED) {
        blocks += part.text;
        continue;
      }
      if (seen.has(part.text)) continue;
      seen.add(part.text);
      if (classes !== null) distinct(classes, part);
      atoms += part.text;
      continue;
    }
    const within = new Set<string>();
    let pinned = "";
    let moved = "";
    for (const inner of arranged.layers.get(part.layer) ?? []) {
      if (within.has(inner.text)) continue;
      within.add(inner.text);
      if (inner.tier === PINNED) {
        pinned += inner.text;
        continue;
      }
      if (classes !== null) distinct(classes, inner);
      moved += inner.text;
    }
    blocks += `@layer ${part.layer}{${pinned}}`;
    if (moved !== "") layered += `@layer ${part.layer}{${moved}}`;
  }
  return { blocks, atoms: layered + atoms };
}

/**
 * The same check {@link registerAtom} makes, for atoms that arrive as text.
 *
 * A compiled module's sheet is one registration under the module's id, so two
 * modules whose declarations hash alike never meet at a key. They meet here,
 * as two different rules naming one class.
 */
function distinct(classes: Map<string, string>, part: Part): void {
  if (part.atom === null) return;
  const key = `${part.layer}\u0000${part.atom}`;
  const held = classes.get(key);
  if (held === undefined) classes.set(key, part.text);
  else if (held !== part.text) throw collision(part.atom, held, part.text);
}

/**
 * An entry as the statements it holds, each with the layer it is in.
 *
 * An entry is one registration, and a compiled module's is its whole
 * stylesheet: several `@layer barq.ui{…}` blocks for a module with several
 * `ui()` calls. Whether something is a layer is therefore a question about a
 * statement, never about an entry.
 */
function partsOf(entry: Entry): Part[] {
  if (entry.parts !== null) return entry.parts;
  const parts: Part[] = [];
  function add(layer: string, text: string, closed: boolean): void {
    // The runtime knows an atom's tier from its condition. A compiled
    // stylesheet is text, so the tier is read back off each rule.
    const named = closed ? atomNamed(text) : null;
    const name = named?.name ?? null;
    const tier = entry.tier !== 0 ? entry.tier : name === null ? PINNED : tierOfRule(text, name);
    const media =
      tier === MEDIA || (tier === DESCENDANT && text.startsWith("@")) ? mediaRank(text) : null;
    const condition = named?.condition ?? "";
    const interaction = tier === PINNED ? 0 : interactionOf(selectorOf(text));
    const atom = STRICT && name !== null ? atomOf(layer, text, name) : null;
    parts.push({
      layer,
      text,
      tier,
      media,
      condition,
      interaction,
      atom,
      id: `${layer}\u0000${text}`,
    });
  }
  function addUnits(layer: string, statement: string): void {
    for (const unit of splitUnits(statement)) add(layer, unit.text, true);
  }
  // A byte order mark means nothing inside a `<style>`, and in front of the
  // first rule it would travel with it.
  const rules = entry.rules.startsWith("\uFEFF") ? entry.rules.slice(1) : entry.rules;
  const outer = statements(rules);
  for (const statement of outer.closed) {
    const open = layerOpen(statement);
    if (open === 0) {
      addUnits("", statement);
      continue;
    }
    const layer = statement.slice("@layer ".length, open - 1);
    const inner = statements(statement.slice(open, -1));
    for (const rule of inner.closed) addUnits(layer, rule);
    // An empty block still names its layer where it stands, which is the
    // layer's place in the order when nothing declares one.
    if (inner.tail !== "" || inner.closed.length === 0) add(layer, inner.tail, false);
  }
  if (outer.tail !== "") add("", outer.tail, false);
  entry.parts = parts;
  return parts;
}

interface Unit {
  text: string;
  readonly atom: boolean;
}

/**
 * A statement as the rules it is made of, each with whether it is an atom's.
 *
 * `@media x{a b}` is `@media x{a}` and `@media x{b}`, to any depth, for every
 * group rule a condition can wrap an atom in, and a selector list naming
 * several atoms, or atoms and something else, is one rule per atom and one for
 * the rest. A statement holding no atom is itself, whole. A minifier writes
 * such statements and a server's sheet read back can hold them; `units` in
 * `order.rs` takes a built asset apart by the same rule, so the two agree.
 */
function splitUnits(statement: string): Unit[] {
  const trimmed = statement.trim();
  if (trimmed === "") return [];
  const found = unitsOf(trimmed);
  return found.some((unit) => unit.atom) ? found : [{ text: trimmed, atom: false }];
}

function unitsOf(rule: string): Unit[] {
  const open = rule.indexOf("{");
  if (open < 0 || !isGroup(rule) || closingBrace(rule, open + 1) !== rule.length - 1) {
    return byAtom(rule);
  }
  const prelude = rule.slice(0, open);
  const body = statements(rule.slice(open + 1, -1));
  const out: Unit[] = [];
  for (const inner of body.tail === "" ? body.closed : [...body.closed, body.tail]) {
    const start = pastComments(inner, 0);
    const found = unitsOf(inner.slice(start).trim());
    if (found.length > 0) found[0].text = inner.slice(0, start) + found[0].text;
    for (const unit of found) out.push({ text: `${prelude}{${unit.text}}`, atom: unit.atom });
  }
  return out;
}

const NOT_GROUPS = [
  "@keyframes",
  "@-webkit-keyframes",
  "@font-face",
  "@property",
  "@page",
  "@counter-style",
  "@font-palette-values",
  "@font-feature-values",
  "@view-transition",
  "@position-try",
];

/** Whether an at-rule holds rules rather than declarations. */
function isGroup(rule: string): boolean {
  if (rule[0] !== "@") return false;
  return !NOT_GROUPS.some(
    (name) =>
      rule.slice(0, name.length).toLowerCase() === name &&
      !/^[\w-]/.test(rule.slice(name.length, name.length + 1)),
  );
}

interface AtomGroup {
  name: string | null;
  list: string[];
}

/** A rule as one rule per atom its selector list names and one for every other branch. */
function byAtom(rule: string): Unit[] {
  if (rule[0] === "@" || !rule.endsWith("}")) return [{ text: rule, atom: false }];
  const open = rule.indexOf("{");
  if (open < 0) return [{ text: rule, atom: false }];
  const body = rule.slice(open);
  const groups: AtomGroup[] = [];
  for (const branch of branches(rule.slice(0, open))) {
    const name = classIn(branch);
    const held = groups.find((group) => group.name === name);
    if (held === undefined) groups.push({ name, list: [branch.trim()] });
    else held.list.push(branch.trim());
  }
  if (groups.length < 2) {
    const name = groups[0]?.name ?? null;
    return [{ text: rule, atom: name !== null && atomNamed(rule) !== null }];
  }
  return groups.map((group) => ({ text: group.list.join(",") + body, atom: group.name !== null }));
}

const DESCENDANT = 0;
const MEDIA = TIERS.length - 1;

/**
 * Where a rule under an at-rule sorts against another in the media tier, and in
 * the descendant tier against another rule under one.
 *
 * Two queries that both match are two rules of one specificity, so the later
 * one wins, and without this "later" is whichever query a page happened to use
 * first. Mobile-first is the order in which the more specific query is always
 * the later one:
 *
 * 1. `min-width` queries, narrowest floor first; from one floor, the widest
 *    ceiling first and no ceiling before any.
 * 2. `max-width` queries with no floor, widest ceiling first.
 * 3. Everything else: `print`, `prefers-*`, `@supports`, `@container`, a width
 *    in a unit that is not `px`, `em` or `rem`.
 *
 * Ties, and the whole of the third group, go by the at-rule text itself, which
 * is arbitrary and the same on every page. `barq_css`'s `order.rs` sorts a
 * built asset by this rule, read off the same text.
 */
interface MediaRank {
  readonly group: number;
  readonly first: number;
  readonly second: number;
  readonly prelude: string;
}

function mediaRank(rule: string): MediaRank {
  let at = 0;
  while (rule[at] === "@") {
    const brace = rule.indexOf("{", at);
    if (brace < 0) break;
    at = brace + 1;
  }
  const prelude = rule.slice(0, at);
  const floor = bound(prelude, "min-width", ">");
  const ceiling = bound(prelude, "max-width", "<");
  if (floor !== null) {
    return { group: 0, first: floor, second: ceiling === null ? -Infinity : -ceiling, prelude };
  }
  if (ceiling !== null) return { group: 1, first: -ceiling, second: 0, prelude };
  return { group: 2, first: 0, second: 0, prelude };
}

/**
 * The first width a prelude bounds from one side, in pixels: `min-width: 40em`
 * or its range spelling `width >= 40em`.
 */
function bound(prelude: string, feature: string, operator: string): number | null {
  for (let at = prelude.indexOf(feature); at >= 0; at = prelude.indexOf(feature, at + 1)) {
    const colon = pastSpace(prelude, at + feature.length);
    if (prelude[colon] !== ":") continue;
    const found = pixels(prelude, pastSpace(prelude, colon + 1));
    if (found !== null) return found;
  }
  for (let at = prelude.indexOf("width"); at >= 0; at = prelude.indexOf("width", at + 1)) {
    const before = prelude[at - 1];
    if (before !== "(" && !SPACE.includes(before ?? "x")) continue;
    let next = pastSpace(prelude, at + "width".length);
    if (prelude[next] !== operator) continue;
    next += prelude[next + 1] === "=" ? 2 : 1;
    const found = pixels(prelude, pastSpace(prelude, next));
    if (found !== null) return found;
  }
  return null;
}

const SPACE = " \t\n\r\f";

function pastSpace(text: string, from: number): number {
  let at = from;
  while (at < text.length && SPACE.includes(text[at])) at++;
  return at;
}

const DIGITS = "0123456789";

/** A length at `from` as pixels, at the 16px an `em` is in a media query. */
function pixels(text: string, from: number): number | null {
  let at = from;
  while (DIGITS.includes(text[at] ?? "x")) at++;
  if (text[at] === "." && DIGITS.includes(text[at + 1] ?? "x")) {
    at++;
    while (DIGITS.includes(text[at] ?? "x")) at++;
  }
  if (at === from) return null;
  const value = Number(text.slice(from, at));
  let end = at;
  while (/[a-zA-Z]/.test(text[end] ?? "")) end++;
  const unit = text.slice(at, end).toLowerCase();
  if (unit === "px") return value;
  return unit === "em" || unit === "rem" ? value * 16 : null;
}

/**
 * Negative when `a` sorts first, zero when only arrival separates them.
 *
 * In the descendant tier a rule under an at-rule follows every rule under none,
 * and those under one go by {@link MediaRank}, so `.x > *` under `@supports` or
 * `@media` beats the same rule without it, as an element's own rule does.
 *
 * Then, in every tier, the interaction pseudo-class the rule's selector carries,
 * in {@link INTERACTIONS}' order, so `:active` beats `:hover` and `:disabled`
 * beats them all; a selector with none of them comes first.
 *
 * Last, the hash of the condition an atom was declared under. Two atoms of one
 * tier whose conditions both match one element are two rules of one
 * specificity, and a sheet every call shares cannot keep each call's writing
 * order, where arrival is a different thing in dev, a split build and an
 * unsplit one. `order.rs` sorts a built asset by the same keys.
 */
function precedes(a: Part, b: Part): number {
  if (a.tier !== b.tier) return a.tier - b.tier;
  const x = a.media;
  const y = b.media;
  if ((x === null) !== (y === null)) return x === null ? -1 : 1;
  const media =
    x === null || y === null
      ? 0
      : compare(x.group, y.group) ||
        compare(x.first, y.first) ||
        compare(x.second, y.second) ||
        compare(x.prelude, y.prelude);
  return media || compare(a.interaction, b.interaction) || compare(a.condition, b.condition);
}

/**
 * The interaction pseudo-classes in the order a later one wins, the order a
 * hand-written stylesheet uses. `INTERACTIONS` in `order.rs` is the same list.
 */
export const INTERACTIONS = [
  "link",
  "visited",
  "focus-within",
  "hover",
  "focus",
  "focus-visible",
  "active",
  "disabled",
] as const;

/** The latest of {@link INTERACTIONS} a selector carries outside any parentheses, one-based. */
export function interactionOf(selector: string): number {
  let depth = 0;
  let found = 0;
  for (let index = 0; index < selector.length; index++) {
    const character = selector[index];
    if (character === "\\") index++;
    else if (character === '"' || character === "'") index = stringEnd(selector, index);
    else if (character === "(" || character === "[") depth++;
    else if (character === ")" || character === "]") depth--;
    else if (character === ":" && selector[index + 1] === ":") index++;
    else if (character === ":" && depth === 0) {
      const name = /^[A-Za-z0-9-]*/.exec(selector.slice(index + 1))?.[0] ?? "";
      const at = (INTERACTIONS as readonly string[]).indexOf(name.toLowerCase());
      if (at >= 0) found = Math.max(found, at + 1);
      index += name.length;
    }
  }
  return found;
}

/** The selector of a rule, with any at-rule preludes taken off the front. */
function selectorOf(rule: string): string {
  let at = pastSpace(rule, 0);
  while (rule[at] === "@") {
    const brace = rule.indexOf("{", at);
    if (brace < 0) return "";
    at = pastSpace(rule, brace + 1);
  }
  const brace = rule.indexOf("{", at);
  return brace < 0 ? "" : rule.slice(at, brace).trim();
}

function compare<T extends number | string>(a: T, b: T): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * One list as every rule that is not an atom, in arrival order, and then its
 * atoms sorted by tier.
 *
 * A `css` block class and an atom are both 0-1-0, so for one property on one
 * element the sheet's order is all that decides between them, and the atom is
 * the one a caller passed to override. Left in arrival order, the pair went to
 * whichever module registered last. `orderCss` puts a built asset in the same
 * order, and `gatherAtoms` links a build's atoms after its blocks.
 *
 * Stable, so two atoms of one rank keep the order they arrived in, and two
 * blocks keep theirs. Two atoms of one tier under different conditions are not
 * of one rank: {@link precedes} orders them by interaction pseudo-class and
 * then by condition hash, so arrival decides only between two classes of one
 * condition, which meet only where class strings are joined by hand.
 */
function orderAtoms(list: Part[]): void {
  let sorted = true;
  let last: Part | null = null;
  for (const part of list) {
    if (last !== null && precedes(last, part) > 0) sorted = false;
    last = part;
  }
  if (sorted) return;
  const blocks = list.filter((part) => part.tier === PINNED);
  const atoms = list.filter((part) => part.tier !== PINNED).toSorted(precedes);
  list.splice(0, list.length, ...blocks, ...atoms);
}

interface SplitStatements {
  closed: string[];
  tail: string;
}

/**
 * A blob of CSS as its top-level statements, and whatever never closed.
 *
 * Balanced-brace scanning rather than a parser, because that is all the
 * question needs: a statement is whatever closes back to depth zero. A brace
 * inside a string or a comment closes nothing: counted, `content:"}"` ends its
 * rule a brace early and the next rule lands inside that rule's layer.
 *
 * A `;` at depth zero closes one too: `@layer a, b;` and `@import` are whole
 * statements. Left joined to the rule after them, the pair is one statement in
 * a sheet read back from a server and two in the registry that wrote it.
 */
function statements(text: string): SplitStatements {
  const closed: string[] = [];
  let from = 0;
  let depth = 0;
  let nested = 0;
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (character === "{") depth++;
    else if (character === "}") {
      if (--depth === 0) {
        closed.push(text.slice(from, index + 1));
        from = index + 1;
      }
    } else if (character === "(") nested++;
    else if (character === ")") nested--;
    else if (character === ";" && depth === 0 && nested <= 0) {
      closed.push(text.slice(from, index + 1));
      from = index + 1;
    } else if (character === "\\") index++;
    else if (character === '"' || character === "'") index = stringEnd(text, index);
    else if (character === "/" && text[index + 1] === "*") {
      const close = text.indexOf("*/", index + 2);
      index = close < 0 ? text.length : close + 1;
    }
  }
  return { closed, tail: text.slice(from) };
}

/** The index of the quote that closes the string opening at `open`. */
function stringEnd(text: string, open: number): number {
  const quote = text[open];
  for (let index = open + 1; index < text.length; index++) {
    const character = text[index];
    if (character === "\\") index++;
    // An unescaped newline ends a string whether or not it was closed, which
    // is CSS's own recovery and keeps one stray quote from eating the sheet.
    else if (character === quote || character === "\n") return index;
  }
  return text.length;
}

/**
 * Where a statement's contents start when it is exactly one named layer, and
 * `0` when it is anything else.
 */
function layerOpen(statement: string): number {
  const match = /^@layer [\w.-]+\{/.exec(statement);
  return match === null ? 0 : match[0].length;
}

interface Named {
  readonly name: string;
  /** The condition's hash, and empty for the default. */
  readonly condition: string;
}

/**
 * The atom a rule is, read off its selector alone: exactly one class of the
 * shape `atom` names one, in every branch.
 *
 * `a-<property>[-<condition hash>]_<value hash>`, each hash one to seven
 * characters of base 36, a property in lower case, and `var-<name>` for a
 * custom property, whose name keeps its case and may hold an underscore. The
 * class and never the body, because a minifier rewrites bodies: below its
 * logical-property support it writes `inset-inline-start` as `left` and
 * `right` under `:lang()`. A class has a condition hash exactly when its rule
 * is not the bare class.
 *
 * Rejected: `.a-button__icon{…}`, somebody's BEM, and
 * `background:url(./x.a-b_c.png)`, which is not in a selector. `atom_named` in
 * `order.rs` reads the same shape.
 */
function atomNamed(rule: string): Named | null {
  let at = pastComments(rule, 0);
  let wrapped = false;
  while (rule[at] === "@") {
    const brace = rule.indexOf("{", at);
    if (brace < 0) return null;
    at = pastSpace(rule, brace + 1);
    wrapped = true;
  }
  const open = rule.indexOf("{", at);
  if (open < 0) return null;
  const selector = rule.slice(at, open);
  let found: string | null = null;
  for (const branch of branches(selector)) {
    const name = classIn(branch);
    if (name === null || (found !== null && found !== name)) return null;
    found = name;
  }
  if (found === null) return null;
  const bare = !wrapped && selector.trim() === `.${found}`;
  const condition = atomCondition(found, bare);
  return condition === null ? null : { name: found, condition };
}

function pastComments(text: string, from: number): number {
  let at = from;
  for (;;) {
    while (at < text.length && SPACE.includes(text[at])) at++;
    if (!text.startsWith("/*", at)) return at;
    const end = text.indexOf("*/", at + 2);
    at = end < 0 ? text.length : end + 2;
  }
}

/** Where the block opened just before `from` closes, or -1. */
function closingBrace(text: string, from: number): number {
  let depth = 1;
  for (let index = from; index < text.length; index++) {
    const character = text[index];
    if (character === "\\") index++;
    else if (character === '"' || character === "'") index = stringEnd(text, index);
    else if (character === "/" && text[index + 1] === "*") {
      const end = text.indexOf("*/", index + 2);
      index = end < 0 ? text.length : end + 1;
    } else if (character === "{") depth++;
    else if (character === "}" && --depth === 0) return index;
  }
  return -1;
}

/** A selector list's branches, split at the commas outside brackets, parentheses and strings. */
function branches(selector: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < selector.length; index++) {
    const character = selector[index];
    if (character === "\\") index++;
    else if (character === '"' || character === "'") index = stringEnd(selector, index);
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

/** The one class of an atom's shape a selector branch names, if it names one and no other. */
function classIn(branch: string): string | null {
  let found: string | null = null;
  for (let at = branch.indexOf("."); at >= 0; at = branch.indexOf(".", at + 1)) {
    const name = /^[\w-]*/.exec(branch.slice(at + 1))?.[0] ?? "";
    if (atomCondition(name, true) === null && atomCondition(name, false) === null) continue;
    if (found !== null && found !== name) return null;
    found = name;
  }
  return found;
}

const HASH = /^[0-9a-z]{1,7}$/;

/** A property as an atom's class spells it. */
function isProperty(name: string): boolean {
  if (name.startsWith("var-")) return /^[\w-]+$/.test(name.slice(4));
  return /[a-z]/.test(name) && /^[a-z0-9-]+$/.test(name);
}

/**
 * The condition hash of `name`, read as a bare rule's (none) or as a
 * conditioned one's (the last segment of the key), when it is an atom's class.
 * The value hash starts after the LAST underscore: a custom property's name may
 * hold one, and a hash never does.
 */
function atomCondition(name: string, bare: boolean): string | null {
  if (!name.startsWith("a-")) return null;
  const rest = name.slice(2);
  const underscore = rest.lastIndexOf("_");
  if (underscore < 0 || !HASH.test(rest.slice(underscore + 1))) return null;
  const key = rest.slice(0, underscore);
  if (bare) return isProperty(key) ? "" : null;
  const dash = key.lastIndexOf("-");
  if (dash < 0) return null;
  const condition = key.slice(dash + 1);
  return HASH.test(condition) && isProperty(key.slice(0, dash)) ? condition : null;
}

/**
 * `name` when the rule is that atom's own, and `null` when it only names it.
 *
 * `.a-card__title{…}` is somebody's BEM and `.a-color_x .b1{…}` is a block
 * scoped under an atom; both start with a class shaped like ours, and two such
 * rules differing is not two declarations colliding. An atom's rule is the one
 * whose value hashes to its own suffix, which nothing else does by accident.
 */
function atomOf(layer: string, rule: string, name: string): string | null {
  let at = 0;
  let wraps = 0;
  while (rule[at] === "@") {
    const brace = rule.indexOf("{", at);
    if (brace < 0) return null;
    at = brace + 1;
    wraps++;
  }
  const open = rule.indexOf("{", at);
  if (open < 0) return null;
  const body = rule.slice(open + 1, rule.length - 1 - wraps);
  const colon = body.indexOf(":");
  if (colon < 0) return null;
  const value = body.slice(colon + 1);
  const suffix = name.slice(name.lastIndexOf("_") + 1);
  return hash(layer === "" ? value : `${layer}|${value}`).slice(1) === suffix ? name : null;
}

/**
 * The tier the rule of the atom `name` sorts in, read back off its text, or
 * `PINNED` when the text is not one rule.
 *
 * `tierOf` in `atoms.ts` decides the same thing from the condition, before the
 * rule exists, and the compiler's `tier_of_rule` decides it from the text of a
 * built asset. The three agree or a page is ordered one way in dev and another
 * once built.
 */
function tierOfRule(rule: string, name: string): number {
  let at = 0;
  while (rule[at] === "@") {
    const brace = rule.indexOf("{", at);
    if (brace < 0) return PINNED;
    at = brace + 1;
  }
  const brace = rule.indexOf("{", at);
  if (brace < 0) return PINNED;
  const selector = rule.slice(at, brace).trim();
  if (!aboutSelf(selector, name)) return 0;
  if (at > 0) return 4;
  if (selector.includes("::")) return 3;
  return selector.length === name.length + 1 ? 1 : 2;
}

/** Whether nothing after the class reaches for another element. */
function aboutSelf(selector: string, name: string): boolean {
  const at = selector.lastIndexOf(name);
  if (at < 0) return true;
  let depth = 0;
  for (let index = at + name.length; index < selector.length; index++) {
    const character = selector[index];
    if (character === "(" || character === "[") depth++;
    else if (character === ")" || character === "]") depth--;
    else if (
      depth === 0 &&
      (character === " " || character === ">" || character === "+" || character === "~")
    ) {
      return false;
    }
  }
  return true;
}
