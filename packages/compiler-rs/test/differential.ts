/**
 * L3, the machinery — `CODESIGN.md` §6 L3.
 *
 * The reference for an optimising compiler is the same compiler with the
 * optimisations off. `test/optimisation.test.ts` drives that over the fixture
 * corpus; this module is the part the other two drivers §6 L3 names need — the
 * JSX generator (`generator.ts`) and the EMI mutator (`emi.ts`) — because both
 * produce SOURCE rather than a fixture name, and neither can go through
 * `renderViaCompiler`.
 *
 * Three things live here and nowhere else:
 *
 *  1. `renderIn` — one render entry point taking a MODE, so `-O0`, `-Ox` and
 *     `interp` are three values of one argument rather than three code paths.
 *  2. `interpStatus` — detected, never declared, on `ssr.ts`'s pattern. There is
 *     no constant to flip: the interp half of L3 goes live by itself on the
 *     first build where the reference backend exists, and while it does not, the
 *     suite says so out loud instead of sitting asleep behind a boolean. The
 *     detection is POSITIVE — an unknown napi option is silently ignored, so a
 *     probe that merely compiled would report a DOM build as an interpreter.
 *  3. `compareRenders` — the channel set L3 compares, in one place, so the
 *     generator, the mutator and any later mode all diff the same things.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { compileSource, loadModule, renderModule, type RenderResult } from "./harness.ts";

/**
 * `dom-Ox` is what ships. `dom-O0` is the reference: same front end, same IR,
 * same ABI, same props model, same ownership model, every optimisation off.
 * `interp` is §6 L2's reference backend over the same analysed IR.
 *
 * **Why the string backend is not a fourth mode.** L3's channels are read off a
 * rendered DOM and off a driven interaction — nodes, attributes, text, effect
 * counts across frames. The string backend produces bytes and no interaction at
 * all, so every one of those channels would have to be replaced rather than
 * shared, and a mode that compares nothing the others compare is a second
 * harness wearing this one's name. SSR is covered instead by the channel that
 * fits its output: the dual-render conformance suite in `ssr.test.ts` compares
 * all 130 fixtures' string output against `renderToString` EXACTLY, and
 * `hydration.test.ts` compares the wire against a cold DOM render of the same
 * fixture — which is the string-against-DOM diff L3 would otherwise be asked
 * for. `ssr-O0` against `ssr-Ox` is checkable on bytes alone, so it is
 * asked directly rather than through this axis: `ssr.test.ts`'s "the string
 * backend at -O0 against -Ox" compares all 130 fixtures' markup byte for byte.
 */
export type Mode = "dom-Ox" | "dom-O0" | "interp";

export const OPTIONS: Record<Mode, Record<string, unknown>> = {
  "dom-Ox": {},
  "dom-O0": { optimize: 0 },
  interp: { interp: true },
};

export interface InterpStatus {
  /**
   * `live` — the mode runs. `absent` — this build has no such backend, which is
   * a fact about the milestone. `broken` — the backend is there and does not
   * work, which is a BUG and must never be reported as absence.
   */
  state: "live" | "absent" | "broken";
  /** Whether this build emits a module the reference backend can run. */
  landed: boolean;
  /** Why it does not, while it does not. */
  refusal: string;
}

const INTERP_PROBE =
  'const Probe = () => <section class="p">{hole()}</section>;\nexport default Probe;\n';

/**
 * Detection with a THIRD answer, and the third answer is the point.
 *
 * `ssr.ts` established the pattern this follows — detect the mode rather than
 * being told, so a suite cannot sit asleep behind a boolean somebody forgot to
 * flip. Two-valued detection has a failure mode of its own, and the mutation
 * experiment in `mutants.ts` walked straight into it: a compiler mutant that
 * offered statement splicing to the non-DOM backends made the SSR compile PANIC
 * on 106 of the 117 fixtures and made `interp: true` emit ordinary DOM code —
 * and the whole L3 suite went GREEN, because every probe failed, every mode was
 * classified "not landed", and every claim about those modes was skipped. A
 * detector that cannot distinguish "not built yet" from "built and broken" is
 * fail-open: the worse the compiler gets, the quieter the suite becomes.
 *
 * The two are distinguished by asking whether the OPTION exists, separately from
 * asking whether it works. Existence is read off `index.d.ts`, which napi
 * generates from the Rust option struct — a fact about the build, not a
 * declaration anyone maintains, so it is still nothing to forget to flip. No
 * option means `absent`; an option that is there and produces something which is
 * not an interp module means `broken`.
 *
 * Comparing emitted bytes against a plain compile was the first attempt and it
 * does not work: the very mutant this was written for gives the DOM backend and
 * the reference backend the same treatment, so their output agrees byte for
 * byte and the absence test reports the broken backend as a missing one.
 *
 * The probe carries a HOLE deliberately: a pure-static unit needs no patch
 * program at all, so the backends could legitimately agree on it.
 */
function optionExists(name: string): boolean {
  try {
    const types = readFileSync(join(import.meta.dir, "..", "index.d.ts"), "utf8");
    return new RegExp(`^\\s*${name}\\?:`, "m").test(types);
  } catch {
    return false;
  }
}

function detect(): InterpStatus {
  if (!optionExists("interp")) {
    return {
      state: "absent",
      landed: false,
      refusal:
        "this build's option surface has no `interp` — the reference backend is not here yet",
    };
  }

  let emitted: string;
  try {
    emitted = compileSource(INTERP_PROBE, "interp-probe.tsx", OPTIONS.interp);
  } catch (error) {
    return {
      state: "broken",
      landed: false,
      refusal: `the build has an \`interp\` option and compiling with it failed: ${error}`,
    };
  }
  if (!emitted.includes("/interp")) {
    return {
      state: "broken",
      landed: false,
      refusal:
        "the build has an `interp` option and the module it emits never mentions the reference " +
        "backend — a broken backend, not a missing one",
    };
  }
  try {
    Bun.resolveSync("@barqjs/core/interp", import.meta.dir);
  } catch (error) {
    return {
      state: "broken",
      landed: false,
      refusal: `the compiler emits for it, but @barqjs/core/interp does not resolve: ${error}`,
    };
  }
  return { state: "live", landed: true, refusal: "" };
}

export const interpStatus: InterpStatus = detect();

/** The modes this build can actually run, in the order a report should list them. */
export function liveModes(): Mode[] {
  const modes: Mode[] = ["dom-Ox", "dom-O0"];
  if (interpStatus.landed) modes.push("interp");
  return modes;
}

/**
 * Compile and render a module given as SOURCE. The corpus goes through
 * `renderViaCompiler`, which is this with the source read off disk; everything
 * generated goes through here, and both end in `renderModule`, so a frame means
 * the same thing on every driver.
 */
export async function renderSource(
  source: string,
  tag: string,
  mode: Mode = "dom-Ox",
): Promise<RenderResult> {
  const code = compileSource(source, `${tag}.tsx`, OPTIONS[mode]);
  const mod = await loadModule(code, tag);
  return { ...(await renderModule(mod)), code };
}

/** Every mode of one source, keyed by mode. */
export async function renderEveryMode(
  source: string,
  tag: string,
): Promise<Map<Mode, RenderResult>> {
  const out = new Map<Mode, RenderResult>();
  for (const mode of liveModes()) out.set(mode, await renderSource(source, `${tag}-${mode}`, mode));
  return out;
}

/**
 * Attribute ORDER across two optimisation levels, stated as the property it
 * actually is rather than as byte equality.
 *
 * Byte equality is wrong here, and the generator proved it on its 21st seed. P3
 * `fold` migrates a constant `SetOnce` out of the patch program INTO the
 * template HTML at its source position among the attributes P1 already baked.
 * So `<p class="c" data-k="d" title={"q"} style={…} data-ev="0">` reaches the
 * DOM as `class,data-k,title,data-ev,style` at `-Ox` (title baked, in source
 * position) and as `class,data-k,data-ev,title,style` at `-O0` (title applied
 * after the clone, so after every baked attribute). Both are correct for their
 * own partition; no fixture in the corpus carries the shape, which is why the
 * corpus-only differential never had to answer the question.
 *
 * What both builds must still satisfy is the property the channel exists for:
 * each emits the baked group and then the patched group, each in SOURCE order.
 * So there must exist ONE total order of the element's attributes — the source
 * order — and one split point per build, such that every build's observed order
 * is its baked prefix followed by its patched suffix, both increasing in that
 * one order. A group emitted backwards makes no such order exist, in any split,
 * which is exactly the failure this channel was written to catch.
 *
 * Attribute counts per element are small, so the split points are simply
 * enumerated and the resulting precedence constraints checked for a cycle.
 */
function namesOf(line: string): string[] {
  return line.slice(line.indexOf(": ") + 2).split(",");
}

function acyclic(edges: Array<[string, string]>, nodes: Set<string>): boolean {
  const after = new Map<string, string[]>();
  const indegree = new Map<string, number>();
  for (const node of nodes) {
    after.set(node, []);
    indegree.set(node, 0);
  }
  for (const [from, to] of edges) {
    after.get(from)?.push(to);
    indegree.set(to, (indegree.get(to) ?? 0) + 1);
  }
  const ready = [...nodes].filter((node) => indegree.get(node) === 0);
  let seen = 0;
  while (ready.length > 0) {
    const node = ready.pop() as string;
    seen++;
    for (const next of after.get(node) ?? []) {
      const left = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, left);
      if (left === 0) ready.push(next);
    }
  }
  return seen === nodes.size;
}

function chain(names: string[], into: Array<[string, string]>): void {
  for (let i = 1; i < names.length; i++) into.push([names[i - 1], names[i]]);
}

function subset(inner: string[], outer: string[]): boolean {
  const has = new Set(outer);
  return inner.every((name) => has.has(name));
}

/**
 * Whether one source order explains both observed orders, under some split.
 *
 * The splits are not free: one build's baked group must CONTAIN the other's.
 * `-O0` bakes exactly the attributes P1 read as source literals, and `-Ox` bakes
 * those plus whatever P3 folded, so the containment always holds in one
 * direction — and without it the property is far too weak to be worth stating
 * (`a,b,c` against `c,b,a` is explainable by the source order `b,a,c` if either
 * side may split anywhere).
 */
export function oneSourceOrderExplainsBoth(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const nodes = new Set([...a, ...b]);
  if (nodes.size !== a.length) return true; // a duplicate name has no source order to recover
  for (let i = 0; i <= a.length; i++) {
    for (let j = 0; j <= b.length; j++) {
      const baked = [a.slice(0, i), b.slice(0, j)] as const;
      if (!subset(baked[0], baked[1]) && !subset(baked[1], baked[0])) continue;
      const edges: Array<[string, string]> = [];
      chain(a.slice(0, i), edges);
      chain(a.slice(i), edges);
      chain(b.slice(0, j), edges);
      chain(b.slice(j), edges);
      if (acyclic(edges, nodes)) return true;
    }
  }
  return false;
}

/**
 * The channels L3 compares, in one place.
 *
 * `html`, `frames` and `eventFrames` are the rendered DOM across every frame.
 * `attributes` carries the order the DOM reported, which `normalize.ts` rule 2
 * sorts out of `html`; `identity` carries per-element ordinals stamped on first
 * sight, so a build that produced the right markup by REBUILDING nodes diverges
 * here and nowhere else.
 *
 * `markers`/`anchors` are deliberately absent, and the reason is structural
 * rather than a concession: `-O0` turns anchor elision off, so demanding the two
 * levels agree on baked anchors would be demanding that the optimisation do
 * nothing. §6 L4 grades that channel self-check, and `oracle.test.ts` holds each
 * build to its own count.
 *
 * Effect counts are absent for the same reason — with fusion off, every binding
 * is its own effect by design. They are an optimality claim, never an
 * equivalence claim.
 */
export function compareRenders(
  reference: RenderResult,
  subject: RenderResult,
  label: string,
): string[] {
  const out: string[] = [];
  const differ = (what: string, want: unknown, got: unknown): void => {
    if (JSON.stringify(want) === JSON.stringify(got)) return;
    out.push(
      `${label}: ${what}\n  reference: ${JSON.stringify(want)}\n  subject  : ${JSON.stringify(got)}`,
    );
  };

  differ("initial render", reference.html, subject.html);
  differ("scripted steps", reference.frames, subject.frames);
  differ("dispatched events", reference.eventFrames, subject.eventFrames);
  differ("frame count", reference.channels.length, subject.channels.length);

  const frames = Math.min(reference.channels.length, subject.channels.length);
  for (let i = 0; i < frames; i++) {
    const here = reference.channels[i].attributes;
    const there = subject.channels[i].attributes;
    differ(
      `frame ${i} elements carrying attributes`,
      here.map((line) => line.slice(0, line.indexOf(": "))),
      there.map((line) => line.slice(0, line.indexOf(": "))),
    );
    for (let line = 0; line < Math.min(here.length, there.length); line++) {
      if (oneSourceOrderExplainsBoth(namesOf(here[line]), namesOf(there[line]))) continue;
      differ(
        `frame ${i} attribute order on ${here[line].slice(0, here[line].indexOf(": "))}`,
        here[line],
        there[line],
      );
    }
    differ(
      `frame ${i} element identity`,
      reference.channels[i].identity,
      subject.channels[i].identity,
    );
  }
  return out;
}

/**
 * One source, every live mode, each diffed against the REFERENCE — which is
 * `dom-O0` and not `dom-Ox`. That is the whole of L3's framing: the optimised
 * build is the subject, the unoptimised build of the same compiler is what it
 * is judged against. Returns the divergence messages; empty is green.
 */
export const REFERENCE: Mode = "dom-O0";

export async function diffEveryMode(source: string, tag: string): Promise<string[]> {
  const renders = await renderEveryMode(source, tag);
  const reference = renders.get(REFERENCE);
  if (!reference) throw new Error("the reference build is always live");
  const out: string[] = [];
  for (const [mode, render] of renders) {
    if (mode === REFERENCE) continue;
    out.push(...compareRenders(reference, render, `${tag} @ ${mode} vs ${REFERENCE}`));
  }
  return out;
}
