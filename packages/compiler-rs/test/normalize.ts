/**
 * DOM normalization.
 *
 * The compiled path and the oracle path build the same rendered result by very
 * different means, so a byte comparison of `innerHTML` fails on differences
 * that carry no meaning. Exactly three of those are normalized away, and each
 * one is narrow enough that it cannot hide a real divergence:
 *
 *  1. Adjacent text nodes are FUSED. `createElement` appends "Total: ", the
 *     hole's text and " clicks" as three text nodes; a cloned template parses
 *     the same characters as one. The fused string is compared verbatim, so any
 *     difference in the characters themselves still fails.
 *
 *  2. Attributes are SORTED by name. Source order is a codegen artifact —
 *     inline-into-template vs. setProp-after-clone reorders them. Names and
 *     values are still compared exactly, and a missing or extra attribute
 *     changes the sorted list.
 *
 *  3. Insignificant inter-tag WHITESPACE is dropped, defined as: a fused text
 *     node that is entirely whitespace AND contains a newline, i.e. source
 *     indentation. A whitespace run without a newline is a real inline space
 *     (`<span>a</span> <span>b</span>`) and is kept, and any text node holding
 *     a single non-whitespace character is kept byte for byte. This rule can
 *     never mask a text-content divergence. It is also switched off entirely
 *     inside `<pre>` and `<textarea>`, where a newline run is what renders.
 *
 *  4. EMPTY comment nodes (`<!---->`) are dropped, and dropping one does NOT
 *     break the surrounding text run, so the runs either side fuse exactly as
 *     rule 1 fuses the oracle's. A compiled template carries one per dynamic
 *     hole as an insert anchor; `createElement` needs none because it appends
 *     in source order. A NAMED comment is still compared.
 *
 *     The limit of this one is real and worth stating: it cannot mask a CONTENT
 *     divergence, but it does erase anchor POSITION. `a<!---->b` and
 *     `a b<!---->` serialize identically here, so a misplaced or spurious marker
 *     is invisible to the DOM comparison. That is why `auditCompiled` bounds
 *     the marker COUNT against the emitted code instead, and why M4's marker
 *     elision needs a position assertion before it can be trusted.
 *
 * Marker comments (`<!--Show:7-->`) carry a process-global counter, so the id
 * differs purely by how many renders ran earlier in the same process. Only the
 * trailing `:<digits>` is canonicalized; the marker NAME is compared, so a
 * `Show` marker where the oracle produced a `Switch` marker still fails.
 *
 * Rules 2 and 4 each erase something real, and neither may be weakened without
 * failing every legitimate output. So the same walk emits two SIDE CHANNELS
 * that carry exactly what the main string threw away — `markers` keeps every
 * anchor in place, `attributes` keeps every attribute in document order — and
 * `auditCompiled` and the per-fixture golden assert on them separately. See
 * `normalizeChannels`.
 */

const VOID_ELEMENTS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "source",
  "track",
  "wbr",
]);

const XHTML_NS = "http://www.w3.org/1999/xhtml";

/**
 * Form-field state lives on the PROPERTY, not the attribute — `dom.ts` routes
 * these through `setProperty` (its DOM_PROPS table). An attributes-only
 * serializer would report `<input value={() => text()}>` as unchanged forever,
 * so the live property is projected into the comparison as `.name="value"`.
 */
const LIVE_PROPS = ["value", "checked", "selected", "indeterminate", "defaultValue"] as const;
const LIVE_PROP_TAGS = new Set(["input", "textarea", "select", "option", "progress", "meter"]);

/** Inside these, a whitespace run containing a newline is rendered content. */
const WHITESPACE_SIGNIFICANT_TAGS = new Set(["pre", "textarea"]);

/**
 * The tags whose first U+000A a conforming parser IGNORES. `intern.rs` flags
 * exactly these three `PRESERVE_WS`, which is why the compiler doubles a
 * leading newline.
 */
const NEWLINE_EATING_TAGS = new Set(["pre", "textarea", "listing"]);

/**
 * Whether the host parser implements that rule.
 *
 * happy-dom implements neither half of it — it does not eat the newline on the
 * way in and does not write one back on the way out — so a cloned template
 * carries a leading newline where the oracle's `createTextNode` does not. That
 * is a difference between two PARSERS, not between the two rendering paths, and
 * it is why no fixture could carry the shape at all: it went red under
 * happy-dom for a reason a real browser does not have.
 *
 * Where the host conforms — real Chrome, which `browser-parse-check.ts` pins
 * with three rows — nothing below is normalised, so a compiler that stopped
 * doubling is still a divergence there. Where it does not, the leading run is
 * canonicalised away on both sides; that engine could never have seen the
 * doubling in the first place.
 *
 * Lazy, because this module is imported by the bundle the differential page
 * loads and `document` is not guaranteed at module-evaluation time in either
 * host.
 */
let eatsLeadingNewline: boolean | undefined;

function parserEatsALeadingNewline(): boolean {
  if (eatsLeadingNewline === undefined) {
    const host = document.createElement("template");
    host.innerHTML = "<pre>\n\na</pre>";
    eatsLeadingNewline = host.content.firstChild?.textContent === "\na";
  }
  return eatsLeadingNewline;
}

/**
 * The leading newline run of a newline-eating element's first text child.
 *
 * Only the FIRST CHILD, because the rule is about the byte that follows the
 * open tag: a `<!---->` in front of the newline stops it (the parser's next
 * token is a comment), and a hole that materialised a node in front of the text
 * hides where the newline sat. That last shape is not covered here — it has no
 * fixture, and `compile.rs`'s `a_hole_in_front_of_the_newline_does_not_hide_it`
 * pins the emitted bytes for it instead.
 */
function canonicalLeadingNewlines(data: string): string {
  let cut = 0;
  while (cut < data.length && data.charCodeAt(cut) === 10) cut++;
  return cut === 0 ? data : data.slice(cut);
}

const NODE_ELEMENT = 1;
const NODE_TEXT = 3;
const NODE_COMMENT = 8;

function canonicalMarker(data: string): string {
  return data.replace(/:(\d+)$/, ":#");
}

interface Sink {
  html: string[];
  markers: string[];
  attributes: string[];
  identity: number[];
  path: number[];
  anchors: number;
}

/**
 * Per-render node identity, stamped on FIRST SIGHT in document order.
 *
 * Every other channel here is a function of the DOM's shape, and a control-flow
 * component that tears every node down and rebuilds it produces exactly the same
 * shape as one that reuses them: html, markers, attributes and anchors are all
 * invariant under a full rebuild. So a `mapArray` that dropped its keyed
 * reconciliation, or a `Show` that stopped reusing its body, was a fully green
 * mutation with nothing in the harness able to see it.
 *
 * Ordinals are assigned per render and compared frame by frame between the two
 * paths, so what the channel actually records is WHICH NODES SURVIVED each
 * update — the one thing insertion, removal and movement of node ranges is
 * about. Anything living on a node that survives (focus, selection, scroll
 * offset, a form field's dirty value, a running transition) survives with it.
 */
let identityCounter = 0;
let identity = new WeakMap<Node, number>();

/** Call once per render, before the first frame. Ordinals are render-local. */
export function resetIdentity(): void {
  identityCounter = 0;
  identity = new WeakMap<Node, number>();
}

function identityOf(node: Node): number {
  let id = identity.get(node);
  if (id === undefined) {
    id = identityCounter++;
    identity.set(node, id);
  }
  return id;
}

/**
 * A text node whose CHARACTERS are `<!---->` serializes into the marker channel
 * exactly like a real insert anchor, so a fixture that renders that string
 * inflates the anchor count and buys the compiler slack it never earned. The
 * anchors are structure, the text is content, and the channel has to be able to
 * say which is which.
 */
const ANCHOR_IN_TEXT = /<!---->/g;

function tagName(el: Element): string {
  const ns = el.namespaceURI;
  return ns && ns !== XHTML_NS ? `${nsPrefix(ns)}:${el.localName}` : el.localName;
}

function serializeElement(el: Element, sink: Sink, keepWhitespace: boolean): void {
  const ns = el.namespaceURI;
  const name = tagName(el);

  const attrs: string[] = [];
  const order: string[] = [];
  for (let i = 0; i < el.attributes.length; i++) {
    const a = el.attributes[i];
    attrs.push(`${a.name}="${a.value}"`);
    order.push(a.name);
  }

  if (LIVE_PROP_TAGS.has(el.localName) && (!ns || ns === XHTML_NS)) {
    const record = el as unknown as Record<string, unknown>;
    // The same missing parser rule, surfacing in a second channel: a
    // `<textarea>`'s value comes from its parsed content, so on a host that
    // does not eat the leading newline the clone's property carries one the
    // oracle's `createTextNode` never put there.
    const eatsNewline = el.localName === "textarea" && !parserEatsALeadingNewline();
    for (const prop of LIVE_PROPS) {
      if (!(prop in record)) continue;
      const raw = record[prop] ?? null;
      const value = eatsNewline && typeof raw === "string" ? canonicalLeadingNewlines(raw) : raw;
      attrs.push(`.${prop}=${JSON.stringify(value)}`);
    }
  }

  // Live properties are deliberately absent from `order`: they are set through
  // a different channel than attributes and carry no document order at all.
  if (order.length > 0) {
    sink.attributes.push(`${sink.path.join("/")} ${name}: ${order.join(",")}`);
  }

  attrs.sort();

  sink.identity.push(identityOf(el));

  sink.html.push(`<${name}${attrs.length ? ` ${attrs.join(" ")}` : ""}>`);
  sink.markers.push(`<${name}>`);

  if (VOID_ELEMENTS.has(el.localName) && (!ns || ns === XHTML_NS)) return;

  // A <template>'s children live in its DocumentFragment, not in childNodes.
  // Serializing childNodes only would make every <template> compare equal to
  // every other one, which is the opposite of what that fixture is for.
  const content = (el as HTMLTemplateElement).content;
  serializeChildren(
    content instanceof DocumentFragment ? content : el,
    sink,
    keepWhitespace || WHITESPACE_SIGNIFICANT_TAGS.has(el.localName),
    NEWLINE_EATING_TAGS.has(el.localName) && !parserEatsALeadingNewline(),
  );
  sink.html.push(`</${name}>`);
  sink.markers.push(`</${name}>`);
}

function nsPrefix(ns: string): string {
  if (ns === "http://www.w3.org/2000/svg") return "svg";
  if (ns === "http://www.w3.org/1998/Math/MathML") return "mathml";
  return ns;
}

function serializeChildren(
  parent: Node,
  sink: Sink,
  keepWhitespace = false,
  canonicalizeLeadingNewlines = false,
): void {
  const children = parent.childNodes;
  let elementIndex = 0;

  // Two runs, not one. They hold the same characters and are drained at
  // different moments: an empty comment splits the marker run and leaves the
  // html run accumulating, which is what fuses the text either side of an
  // anchor into the single node the oracle produced.
  let htmlRun = "";
  let markerRun = "";

  const flush = (run: string, channel: string[]): void => {
    if (run === "") return;
    const insignificant = !keepWhitespace && run.trim() === "" && run.includes("\n");
    if (!insignificant) channel.push(run);
  };

  const flushBoth = (): void => {
    flush(htmlRun, sink.html);
    flush(markerRun, sink.markers);
    htmlRun = "";
    markerRun = "";
  };

  for (let i = 0; i < children.length; i++) {
    const node = children[i];
    if (node.nodeType === NODE_TEXT) {
      const data =
        i === 0 && canonicalizeLeadingNewlines
          ? canonicalLeadingNewlines((node as Text).data)
          : (node as Text).data;
      htmlRun += data;
      markerRun += data.replace(ANCHOR_IN_TEXT, "&lt;!----&gt;");
      continue;
    }
    // An empty comment is a compiled insert anchor: invisible to the main
    // string, and it must not split a text run that the oracle produced as one.
    // The marker channel keeps it, in place.
    if (node.nodeType === NODE_COMMENT && (node as Comment).data === "") {
      flush(markerRun, sink.markers);
      markerRun = "";
      sink.markers.push("<!---->");
      sink.anchors++;
      continue;
    }
    flushBoth();
    if (node.nodeType === NODE_COMMENT) {
      const text = `<!--${canonicalMarker((node as Comment).data)}-->`;
      sink.html.push(text);
      sink.markers.push(text);
    } else if (node.nodeType === NODE_ELEMENT) {
      sink.path.push(elementIndex++);
      serializeElement(node as Element, sink, keepWhitespace);
      sink.path.pop();
    }
  }
  flushBoth();
}

/**
 * Attribute order the compiled path is required to produce, derived from the
 * ORACLE's order — which is source order, because `createElement` walks the
 * props object — and from nothing the compiler decides.
 *
 * A template bakes its static attributes in at parse time and the patch code
 * sets the rest after the clone, so the compiled order is source order stably
 * partitioned into those two groups, and nothing else. Reversing either group's
 * emission order breaks it; a static that merely trails a dynamic in source
 * does not.
 *
 * It lives HERE, beside the walk that produces the lines it partitions, because
 * it had two consumers: the happy-dom harness and the differential page running
 * in Chrome. Both now check the PARTITION rather than a reference's order — the
 * order within each group is a golden — so this is what remains of the
 * shared derivation, kept because a second copy in the page source is how a
 * channel quietly starts measuring two different things in the two engines.
 *
 * LIMIT: the partition is computed from the module-wide set of patched names,
 * so an attribute that is static on one element and dynamic on another is
 * treated as dynamic everywhere. That can only ever move a name later in the
 * expectation, so it loosens rather than breaks — and nothing pins the day it
 * starts mattering. The nearest live check is "the channel is live for most of
 * the corpus, not silently empty" in oracle.test.ts, which asserts the channel
 * produces attribute lines at all, NOT that this partition is exact.
 */
export function expectedAttributeOrder(oracleLine: string, patched: ReadonlySet<string>): string {
  const cut = oracleLine.indexOf(": ");
  const head = oracleLine.slice(0, cut);
  const names = oracleLine.slice(cut + 2).split(",");
  const baked = names.filter((n) => !patched.has(n));
  const applied = names.filter((n) => patched.has(n));
  return `${head}: ${[...baked, ...applied].join(",")}`;
}

export interface DomChannels {
  /** The main diff: markers dropped, adjacent text fused, attributes sorted. */
  html: string;
  /**
   * Structure with every insert anchor in place and no text fusion across one.
   * Rule 4 makes a spurious or misplaced `<!---->` invisible to `html`; this is
   * where it is visible. Attribute values are omitted so that an attribute
   * change fails `html` and nothing else.
   */
  markers: string;
  /**
   * One line per element carrying attributes, in document order:
   * `0/1 div: id,class`. Rule 2 sorts attributes out of `html`; this is where
   * their order survives.
   */
  attributes: string[];
  /**
   * Insert anchors that reached the DOM, counted as NODES during the walk. The
   * `markers` string cannot be counted for this: a text node reading `<!---->`
   * is indistinguishable from an anchor once both are characters.
   */
  anchors: number;
  /**
   * One ordinal per ELEMENT, document order, stamped on first sight within the
   * render. Text nodes are excluded because the two paths legitimately build a
   * different NUMBER of them — a cloned template parses one run where
   * `createElement` appends three — so their identity is not comparable.
   */
  identity: number[];
}

function walk(container: Node): Sink {
  const sink: Sink = { html: [], markers: [], attributes: [], identity: [], path: [], anchors: 0 };
  serializeChildren(container, sink);
  return sink;
}

/** Normalized serialization of a container's children. */
export function normalizeDom(container: Node): string {
  return walk(container).html.join("");
}

/** The main diff plus the two channels it deliberately throws away. */
export function normalizeChannels(container: Node): DomChannels {
  const sink = walk(container);
  return {
    html: sink.html.join(""),
    markers: sink.markers.join(""),
    attributes: sink.attributes,
    anchors: sink.anchors,
    identity: sink.identity,
  };
}

/**
 * Empty comments in a `markers` string. Exact because the walk escapes the same
 * characters when they occur as TEXT; `DomChannels.anchors` is the count taken
 * straight off the nodes and is what the bounds are stated against.
 */
export function countAnchors(markers: string): number {
  return markers.split("<!---->").length - 1;
}
