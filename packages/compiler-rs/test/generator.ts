/**
 * The JSX generator: driver 2.
 *
 * Csmith's discipline, and it is the whole of the design: **the generator may
 * only produce programs whose behaviour is well defined**, because a divergence
 * in a program that has no defined behaviour tells you nothing. Csmith buys that
 * by refusing to emit signed overflow, unsequenced side effects and uninitialised
 * reads; the analogue here is that the generated module must have exactly one
 * meaning, must render the same thing twice in one process,
 * and must not depend on any rule the host DOM does not implement.
 *
 * ## What this generator CAN express
 *
 *  - Elements from a closed tag set, nested under a two-level content model
 *    (`flow` / `phrasing`), so no generated tree can trip HTML tree
 *    construction. Static attributes, constant-expression attributes,
 *    live (thunked) attributes, `style` objects and `classList` objects.
 *  - Text children; constant holes (`{"a&b"}`, `{42}`, `{null}`) which P3 may
 *    fold; live holes in BOTH the explicit-thunk form `{() => n0()}` and the
 *    direct form `{n0()}`, since the direct form is what compiler-mode
 *    auto-thunking classifies and a corpus written only in the explicit form
 *    would never reach it.
 *  - Adjacent holes, a hole followed by text, a hole followed by an element, a
 *    trailing hole — the four shapes anchor elision decides between.
 *  - `Show` (thunked body and eager body, with and without a fallback), `For`
 *    and `For keyed={false}` over an array signal, `Switch`/`Match` with a fallback.
 *  - User-defined components: a props boundary, a `children` slot, and a
 *    component nested inside an element so the caller's statics stay in the
 *    caller's template.
 *  - Delegated (`onClick`) and non-delegated (`onMouseEnter`) handlers, both
 *    capture-free (module-scope signal only, so target #7 hoists them) and
 *    capturing (a `For` row's `item`, which it must not).
 *  - Scripted `steps` that write every signal the tree actually reads, and
 *    `events` that dispatch at every handler it bound.
 *
 * ## What it deliberately CANNOT express, and why each is excluded
 *
 *  - **Anything async** — `Await`, `Suspense`, `Loading`, `Errored`, and any
 *    promise. Their observable order is a function of the microtask queue, and
 * the transition design is NOT SPECIFIED. Two builds of a
 *    program with no specified order can differ without either being wrong.
 *  - **Throwing, and `ErrorBoundary`** — the routed error entry points are among
 *    the VIOLATED rules; a generated throw would report a known defect as a
 *    level divergence and drown the signal.
 *  - **`Portal` and `Dynamic`** — `Portal` renders outside the container the
 *    harness snapshots, so a divergence inside one is invisible rather than
 *    caught, which is worse than not generating it. `Dynamic`'s component is a
 *    value, and generating a well-typed one adds no shape the direct call lacks.
 *  - **`ref`, `dangerouslySetInnerHTML`, custom elements, SVG and MathML** —
 *    each is a namespace or an escape hatch whose corpus fixture is hand-written
 *    precisely because its correctness argument is not compositional.
 *  - **`<pre>`, `<textarea>`, `<table>` and form fields carrying `value`** —
 *    happy-dom implements neither the leading-newline rule nor foster parenting,
 *    and form state lives on the property. Those live in `browser-only/` and in
 *    hand-written fixtures for exactly this reason.
 *  - **Non-determinism of any kind** — no `Date`, no `Math.random`, no counters
 *    that survive a render, no iteration over an unordered collection. Every
 *    generated program renders identically every time it is run, which is what
 *    makes a difference between two builds attributable to the compiler.
 *  - **Anything whose value is not structurally comparable** — signals hold
 *    numbers, strings, booleans and arrays of `{ id, name }`, so a step's effect
 *    on the DOM is total and visible.
 *
 * The output is a module in the fixture corpus's own shape (default export,
 * `steps`, `events`), so it renders through exactly the same `renderModule` the
 * corpus does. It is NOT written into `fixtures/` — a generated program is a
 * sample, not a pinned claim, and the seed is what reproduces it.
 */

/** Deterministic, seedable, and small enough to be obviously stateless. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface GeneratedProgram {
  seed: number;
  name: string;
  source: string;
  /** What the program ended up containing, for a failure message worth reading. */
  features: string[];
}

const FLOW_TAGS = ["div", "section", "main", "header", "footer"] as const;
const PHRASING_TAGS = ["span", "b", "i", "em", "strong", "small", "code"] as const;
/** Phrasing-content containers that may not nest inside one another. */
const BLOCK_PHRASING_TAGS = ["p", "h2", "label", "button"] as const;

const WORDS = ["alpha", "beta", "gamma", "delta", "one", "two", "row", "cell", "tail", "head"];

/**
 * Constants a hole may carry. The escaping-relevant ones go through an
 * EXPRESSION rather than JSX text, because `<` and `{` are not text in JSX —
 * which also puts them on P3's folding path, where the escaper is the thing
 * under test.
 */
const CONSTANTS = [
  '"a&b"',
  '"x<y"',
  '"q\\"r"',
  '"tail>end"',
  "42",
  "0",
  "true",
  "false",
  "null",
  '""',
];

type Context = "flow" | "phrasing";

class Gen {
  private readonly rng: () => number;
  private readonly lines: string[] = [];
  readonly features = new Set<string>();

  /** Signals read somewhere in the tree, so `steps` only writes live ones. */
  private readonly readNumbers = new Set<string>();
  private readonly readStrings = new Set<string>();
  private readonly readFlags = new Set<string>();
  private readonly readRows = new Set<string>();

  private events = 0;
  private components = 0;
  /**
   * The row contract of the enclosing list, if any. The identity default hands
   * the row VALUE to its body and `keyed={false}` hands an accessor, so
   * `item.id` is correct under one and `undefined` under the other — which is
   * not a divergence (both builds agree) but silently kills a seed's whole
   * numeric channel: seed 111 wrote `n1.set(item.id + 1)` inside a positional
   * row and every later `n1.update` stayed NaN.
   */
  private row: "none" | "For" | "positional" = "none";
  /**
   * Components whose declaration is FINISHED, and the only ones a call site may
   * name. A component whose own body could call itself generates a term with no
   * normal form — the first thing Csmith's discipline rules out, and here it is
   * a stack overflow rather than a divergence.
   */
  private declared = 0;
  private uid = 0;
  private budget: number;

  constructor(readonly seed: number) {
    this.rng = mulberry32(seed);
    this.budget = 14 + this.int(18);
  }

  private int(bound: number): number {
    return Math.floor(this.rng() * bound);
  }

  private pick<T>(items: readonly T[]): T {
    return items[this.int(items.length)];
  }

  private chance(numerator: number, denominator = 10): boolean {
    return this.int(denominator) < numerator;
  }

  private word(): string {
    return this.pick(WORDS);
  }

  private next(): number {
    return this.uid++;
  }

  // -------------------------------------------------------------------------
  // values
  // -------------------------------------------------------------------------

  private number(): string {
    const name = `n${this.int(3)}`;
    this.readNumbers.add(name);
    return name;
  }

  private string(): string {
    const name = `t${this.int(2)}`;
    this.readStrings.add(name);
    return name;
  }

  private flag(): string {
    const name = `f${this.int(2)}`;
    this.readFlags.add(name);
    return name;
  }

  private rows(): string {
    const name = `r${this.int(2)}`;
    this.readRows.add(name);
    return name;
  }

  /** A live read, in one of the two forms the classifier distinguishes. */
  private read(): string {
    const kind = this.int(3);
    const name = kind === 0 ? this.number() : this.string();
    const call = `${name}()`;
    if (this.chance(5)) {
      this.features.add("direct-read hole");
      return call;
    }
    this.features.add("thunked hole");
    return `() => ${call}`;
  }

  // -------------------------------------------------------------------------
  // attributes
  // -------------------------------------------------------------------------

  /**
   * No attribute name is ever written twice on one element. Two `title`s is
   * last-wins in the DOM, so the element has no recoverable SOURCE order — and
   * source order is the thing every claim about attribute order is stated
   * against. Csmith's rule again: a program whose meaning is not pinned down
   * teaches nothing when two builds disagree about it.
   */
  private attributes(context: Context, inRow: boolean): string {
    const out: string[] = [];
    let titled = false;
    if (this.chance(6)) out.push(` class="${this.word()}-${this.next()}"`);
    if (this.chance(3)) out.push(` id="id-${this.next()}"`);
    if (this.chance(3)) out.push(` data-k="${this.word()}"`);
    if (this.chance(3)) {
      this.features.add("constant attribute expression");
      out.push(` title={${this.pick(CONSTANTS.slice(0, 4))}}`);
      titled = true;
    }
    if (!titled && this.chance(4)) {
      this.features.add("live attribute");
      const name = this.string();
      out.push(` title={${this.chance(5) ? `${name}()` : `() => ${name}()`}}`);
    }
    if (this.chance(2)) {
      this.features.add("style object");
      out.push(` style={{ color: "red", marginTop: ${this.number()}() }}`);
    } else if (this.chance(2)) {
      this.features.add("classList object");
      out.push(` classList={{ on: ${this.flag()}(), off: false }}`);
    }
    // Handlers are not a flow-content concept — a `<span>` inside a `For` row is
    // where a capturing one actually occurs, and gating this on `flow` left the
    // capturing shape ungenerated in 150 seeds.
    if (this.chance(context === "flow" ? 3 : 2)) {
      out.push(this.handler(inRow));
    }
    return out.join("");
  }

  private handler(inRow: boolean): string {
    const index = this.events++;
    const target = ` data-ev="${index}"`;
    if (inRow && this.chance(6)) {
      this.features.add("capturing handler");
      const name = this.number();
      const id = this.row === "positional" ? "item().id" : "item.id";
      return `${target} onClick={() => ${name}.set(${id} + ${this.int(5)})}`;
    }
    const name = this.number();
    this.readNumbers.add(name);
    if (this.chance(3)) {
      this.features.add("non-delegated handler");
      return `${target} onMouseEnter={() => ${name}.update((v) => v + 1)}`;
    }
    this.features.add("capture-free delegated handler");
    return `${target} onClick={() => ${name}.update((v) => v + 1)}`;
  }

  // -------------------------------------------------------------------------
  // children
  // -------------------------------------------------------------------------

  private children(context: Context, depth: number, inRow: boolean): string {
    const count = 1 + this.int(3);
    const parts: string[] = [];
    for (let i = 0; i < count; i++) parts.push(this.child(context, depth, inRow));
    return parts.join("");
  }

  private child(context: Context, depth: number, inRow: boolean): string {
    if (this.budget <= 0 || depth <= 0) return this.word();
    this.budget--;

    // Material for driver 3. The corpus is written so that its drivers reach
    // every branch — good fixture hygiene, and it leaves EMI almost nothing to
    // rewrite. A generated program carries subtrees that are unreachable by
    // construction, which is where equivalence-modulo-inputs gets its teeth.
    if (this.chance(1, 12)) return this.dead(context, depth);

    const roll = this.int(context === "flow" ? 100 : 70);
    if (roll < 18) return this.word();
    if (roll < 26) {
      this.features.add("constant hole");
      return `{${this.pick(CONSTANTS)}}`;
    }
    if (roll < 42) return `{${this.read()}}`;
    if (roll < 48) {
      // Two holes side by side: the shape that must never share an anchor.
      this.features.add("adjacent holes");
      return `{${this.read()}}{${this.read()}}`;
    }
    if (roll < 54 && this.declared > 0) {
      return this.componentCall(depth, inRow);
    }
    if (roll < 70) {
      const tag = this.pick(PHRASING_TAGS);
      return `<${tag}${this.attributes("phrasing", inRow)}>${this.children("phrasing", depth - 1, inRow)}</${tag}>`;
    }
    // Flow-only shapes below this line.
    if (roll < 78) {
      const tag = this.pick(BLOCK_PHRASING_TAGS);
      return `<${tag}${this.attributes("flow", inRow)}>${this.children("phrasing", depth - 1, inRow)}</${tag}>`;
    }
    if (roll < 86) {
      const tag = this.pick(FLOW_TAGS);
      return `<${tag}${this.attributes("flow", inRow)}>${this.children("flow", depth - 1, inRow)}</${tag}>`;
    }
    if (roll < 92) return this.show(context, depth, inRow);
    if (roll < 97) return this.list(depth);
    return this.switchMatch(context, depth, inRow);
  }

  /**
   * A subtree no driver can reach. The guard is a literal `false` rather than a
   * signal the steps happen not to write: EMI's soundness rests on the region
   * being unreachable for EVERY input, and "no step writes it" is a property of
   * the driver that a later edit can silently remove.
   */
  private dead(context: Context, depth: number): string {
    this.features.add("dead subtree");
    if (this.chance(5)) {
      this.features.add("Show");
      return `<Show when={() => false}>{() => <>${this.child(context, depth - 1, false)}</>}</Show>`;
    }
    return `{false && <i class="never">${this.children("phrasing", depth - 1, false)}</i>}`;
  }

  private show(context: Context, depth: number, inRow: boolean): string {
    this.features.add("Show");
    const flag = this.flag();
    const body = this.child(context, depth - 1, inRow);
    const fallback = this.chance(6) ? ` fallback={<i class="none">none</i>}` : "";
    // Both spellings: the thunked body the runtime contract asks for, and the
    // eager one target #8 hands over as built nodes.
    const children = this.chance(6) ? `{() => <>${body}</>}` : `<>${body}</>`;
    return `<Show when={() => ${flag}()}${fallback}>${children}</Show>`;
  }

  private list(depth: number): string {
    const each = this.rows();
    // One primitive, three modes (K1). The draw stays exactly where it was so
    // that every existing seed keeps the program it had.
    const keyed = this.chance(5);
    this.features.add(keyed ? "For" : "For keyed={false}");
    const outer = this.row;
    this.row = keyed ? "For" : "positional";
    const body = this.children("phrasing", depth - 1, true);
    this.row = outer;
    const row = keyed
      ? `{(item, index) => <li data-id={String(item.id)}>{() => index()}:{item.name}${body}</li>}`
      : `{(item, index) => <li data-ix={String(index)}>{() => item().name}${body}</li>}`;
    const mode = keyed ? "" : " keyed={false}";
    return `<ul class="list-${this.next()}"><For each={() => ${each}()}${mode} fallback={<li class="empty">empty</li>}>${row}</For></ul>`;
  }

  private switchMatch(context: Context, depth: number, inRow: boolean): string {
    this.features.add("Switch/Match");
    const flag = this.flag();
    const a = this.child(context, depth - 1, inRow);
    const b = this.child(context, depth - 1, inRow);
    return (
      `<Switch fallback={<i class="no-match">no</i>}>` +
      `<Match when={() => ${flag}()}>{() => <>${a}</>}</Match>` +
      `<Match when={() => !${flag}()}>{() => <>${b}</>}</Match>` +
      `</Switch>`
    );
  }

  // -------------------------------------------------------------------------
  // components
  // -------------------------------------------------------------------------

  private declareComponent(): void {
    const index = this.components++;
    const body = this.children("phrasing", 2, false);
    this.lines.push(
      `function C${index}(props: { label: string; n: number; children?: unknown }) {`,
      `  return <span class="c${index}">{props.label}:{props.n}${body}<b>{props.children}</b></span>`,
      `}`,
      ``,
    );
    this.declared = index + 1;
  }

  private componentCall(depth: number, inRow: boolean): string {
    this.features.add("component boundary");
    const index = this.int(this.declared);
    const label = this.chance(5) ? `"${this.word()}"` : `{${this.string()}()}`;
    const labelProp = label.startsWith('"') ? ` label=${label}` : ` label=${label}`;
    const children = this.chance(6) ? this.child("phrasing", depth - 1, inRow) : "";
    const call = `<C${index}${labelProp} n={${this.number()}()}>${children}</C${index}>`;
    return call;
  }

  // -------------------------------------------------------------------------
  // the module
  // -------------------------------------------------------------------------

  build(): GeneratedProgram {
    const name = `generated-${this.seed}`;
    const components = 1 + this.int(2);

    // The tree first: it decides which signals are live, and a signal nothing
    // reads must not get a step — an inert step is coverage that looks like
    // coverage and is not.
    const declarations: string[] = [];
    for (let i = 0; i < components; i++) this.declareComponent();
    const body = this.children("flow", 3 + this.int(2), false);
    // Declared and never called: the third shape EMI wants, beside an
    // untaken branch and an unselected `Match`.
    this.features.add("uncalled component");
    this.lines.push(
      `function Uncalled(props: { label: string }) {`,
      `  return <section class="uncalled"><h2 id="uncalled-head">{props.label}</h2>` +
        `<p class="uncalled-body" data-k="dead">${this.children("phrasing", 2, false)}</p></section>`,
      `}`,
      ``,
    );
    declarations.push(...this.lines);

    const signals: string[] = [];
    for (const signal of [...this.readNumbers].sort()) {
      signals.push(`const ${signal} = signal(${Number(signal.slice(1)) + 1})`);
    }
    for (const signal of [...this.readStrings].sort()) {
      signals.push(`const ${signal} = signal("${WORDS[Number(signal.slice(1)) % WORDS.length]}")`);
    }
    for (const signal of [...this.readFlags].sort()) {
      signals.push(`const ${signal} = signal(${Number(signal.slice(1)) % 2 === 0})`);
    }
    for (const signal of [...this.readRows].sort()) {
      signals.push(
        `const ${signal} = signal([{ id: 1, name: "a" }, { id: 2, name: "b" }, { id: 3, name: "c" }])`,
      );
    }

    const steps: string[] = [];
    for (const signal of [...this.readNumbers].sort()) {
      steps.push(`() => ${signal}.update((v) => v + 7)`);
    }
    for (const signal of [...this.readStrings].sort()) {
      steps.push(`() => ${signal}.set("changed-${signal}")`);
    }
    for (const signal of [...this.readFlags].sort()) {
      steps.push(`() => ${signal}.update((v) => !v)`, `() => ${signal}.update((v) => !v)`);
    }
    for (const signal of [...this.readRows].sort()) {
      steps.push(
        `() => ${signal}.update((v) => [...v, { id: v.length + 1, name: "z" }])`,
        `() => ${signal}.update((v) => v.slice(1))`,
        `() => ${signal}.set([])`,
        `() => ${signal}.set([{ id: 9, name: "back" }])`,
      );
    }

    const events: string[] = [];
    for (let index = 0; index < this.events; index++) {
      events.push(
        `(root: HTMLElement) => { const el = root.querySelector('[data-ev="${index}"]') as HTMLElement | null; ` +
          `el?.click(); el?.dispatchEvent(new Event("mouseenter", { bubbles: true })) }`,
      );
    }

    const imports = ["signal"];
    if (this.features.has("Show")) imports.push("Show");
    if (this.features.has("For") || this.features.has("For keyed={false}")) imports.push("For");
    if (this.features.has("Switch/Match")) imports.push("Switch", "Match");

    // Unconditional, and deliberately consuming no randomness so that every
    // existing seed keeps the program it had. A binding that is REASSIGNED
    // before it is read is the one shape that separates "this initialiser is a
    // literal" from "this binding is a constant", and neither the corpus nor
    // this generator contained it: a `fold` that dropped `bind.rs`'s
    // `symbol_is_mutated` guard baked `"before"` into the template, moved the
    // rendered DOM, and survived the entire L3 and Interp differential for want
    // of one input. `fixtures/reassigned-binding.tsx` is the corpus half.
    this.features.add("reassigned binding");

    const source = [
      `import { ${imports.sort().join(", ")} } from "@barqjs/core"`,
      ``,
      `let reassigned = "before"`,
      `reassigned = "after"`,
      ``,
      ...signals,
      ``,
      ...declarations,
      `export default function Generated${this.seed}() {`,
      `  return <div class="gen-root" data-reassigned={reassigned}>` +
        `<span class="reassigned">{reassigned}</span>${body}</div>`,
      `}`,
      ``,
      `export const steps = [${steps.join(", ")}]`,
      ``,
      `export const events = [${events.join(", ")}]`,
      ``,
    ].join("\n");

    return { seed: this.seed, name, source, features: [...this.features].sort() };
  }
}

export function generate(seed: number): GeneratedProgram {
  return new Gen(seed).build();
}

/** `count` programs from a fixed base, so a failing seed is reproducible alone. */
export function generateMany(base: number, count: number): GeneratedProgram[] {
  return Array.from({ length: count }, (_, i) => generate(base + i));
}
