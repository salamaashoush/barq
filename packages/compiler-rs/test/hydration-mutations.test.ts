import { describe, expect, test } from "bun:test"

import { compileSource } from "./harness.ts"
import { census, compileText, host, reuse, shape, wire } from "./hydration.ts"

/**
 * L6 pointed at hydration. `CODESIGN.md` §6 L6, §11 Q4.
 *
 * **A property no mutation can violate is not a property.** The conformance
 * suite next door says every fixture hydrates cleanly; on its own that is a
 * statement about a corpus, not about a detector. This file corrupts the wire
 * one way at a time and asks the two questions §11 Q4 paid the bytes for:
 *
 *   1. was the corruption DETECTED?
 *   2. did it degrade to a full client render, or to a wrong tree?
 *
 * The second question is the one that matters. `solid-start#1807` is titled
 * "hydration fails silently without an error", and React documents the
 * consequence as event handlers attaching to the wrong elements. A mutation that
 * survives here is exactly that bug, in this codebase, with a name.
 *
 * The first row is the NULL mutation — the wire unedited. It must hydrate
 * cleanly, or every red row below is an artefact of the harness rather than a
 * detection.
 */

const SOURCE = `
import { For, Show, signal } from "@barqjs/core";
export const on = signal(true);
export const label = signal("alpha");
export const rows = signal(["one", "two", "three"]);
export default function Page() {
  return (
    <main class="page">
      <h1>{label()}</h1>
      <Show when={on()} fallback={<em class="off">off</em>}>
        <p class="on">on</p>
      </Show>
      <ul>
        <For each={rows()}>{(row) => <li>{row}</li>}</For>
      </ul>
      <footer>tail</footer>
    </main>
  );
}
`

interface Mutation {
  name: string
  /** What the corruption stands for, in the reader's terms. */
  about: string
  apply: (wire: string) => string
  /** `true` when the corruption must be reported or thrown. */
  detected: boolean
  /**
   * What the page degrades to: `"claim"` — hydration completed with the server's
   * nodes; `"local"` — one range rebuilt, the rest claimed; `"cold"` — the whole
   * page re-rendered on the client, which is exactly today's behaviour.
   */
  degrades: "claim" | "local" | "cold"
}

const MUTATIONS: Mutation[] = [
  {
    name: "null (the wire, unedited)",
    about: "the control. Every row below is meaningless if this one is not clean.",
    apply: (w) => w,
    detected: false,
    degrades: "claim",
  },
  {
    name: "a branch index disagrees",
    about:
      "the server says it took arm `true`, the client's own read says `false`. H2 forbids " +
      "re-deriving the condition, so the disagreement is the only evidence there is.",
    apply: (w) => w.replace("<!--[true-->", "<!--[false-->"),
    detected: true,
    degrades: "local",
  },
  {
    name: "a branch comment is dropped",
    about: "a proxy, a sanitiser or a CDN that strips comments — the byte the design paid for.",
    apply: (w) => w.replace("<!--[true-->", ""),
    detected: true,
    degrades: "cold",
  },
  {
    name: "a closing range comment is dropped",
    about: "the same, at the other end: the anchor every later write to that hole uses.",
    apply: (w) => w.replace("<!--]-->", ""),
    detected: true,
    degrades: "cold",
  },
  {
    name: "the wrong node is at a claim position",
    about:
      "the tag the client builds is not the tag the server wrote. React's documented " +
      "consequence of not catching this is handlers attached to the wrong elements.",
    apply: (w) => w.replace("<h1>", "<h2>").replace("</h1>", "</h2>"),
    detected: true,
    degrades: "cold",
  },
  {
    name: "the client would build a different tree (an element is missing)",
    about: "the server's markup is a prefix of the client's — the walk runs out.",
    apply: (w) => w.replace("<footer>tail</footer>", ""),
    detected: true,
    degrades: "cold",
  },
  {
    name: "the client would build a different tree (an element is extra)",
    about: "the reverse: markup the client's walk has no position for.",
    apply: (w) => w.replace("<footer>", "<aside>x</aside><footer>"),
    detected: true,
    degrades: "cold",
  },
  {
    name: "a row disappears from a list",
    about:
      "the list the server rendered is not the list the client renders. The rows that DO " +
      "match must still keep their nodes — that is H4's blast radius on a list.",
    apply: (w) => w.replace("<!--[--><li><!--[-->two<!--]--></li><!--]-->", ""),
    detected: true,
    // `claim`, and K1 is why: the default row identity is the INDEX, so a row
    // removed from the middle is not a missing row — it is every later row
    // shifting up by one. Each of them claims the node the server wrote at its
    // index and the text is written through it, so nothing is replaced and the
    // last row builds cold. The report says both: a text drift and a row the
    // server did not write.
    degrades: "claim",
  },
  {
    name: "a row's text drifts",
    about:
      "the ordinary case — a timestamp, a locale, a random id. It RECOVERS: the node is " +
      "kept and the text written through it. Reporting it anyway is what makes " +
      "'nothing was reported' mean something.",
    apply: (w) => w.replace(">two<", ">TWO<"),
    detected: true,
    degrades: "claim",
  },
  {
    name: "the whole container is empty",
    about: "a server that failed, a cache that served nothing.",
    apply: () => "",
    detected: true,
    degrades: "cold",
  },
  {
    name: "every range comment is stripped",
    about: "the wire as it would be WITHOUT §11 Q4's bytes — Vapor's zero-byte scheme, in effect.",
    apply: (w) => w.replaceAll(/<!--\[[^]*?-->/g, "").replaceAll("<!--]-->", ""),
    detected: true,
    degrades: "cold",
  },
]

interface Verdict {
  name: string
  detected: boolean
  degraded: "claim" | "local" | "cold"
  reuse: number
  kinds: string[]
}

async function run(mutation: Mutation): Promise<Verdict> {
  const compiled = await compileText(SOURCE, `mut-${mutation.name.replaceAll(/\W+/g, "-")}`)
  const core = await import("@barqjs/core")

  const clean = wire(compiled.ssr)
  const container = host(mutation.apply(clean))
  const before = census(container)
  const dispose = core.hydrate(compiled.dom.default as never, container)
  const claim = reuse(before, container)
  const report = core.hydrate.report
  const hydrated = shape(container)
  dispose()
  container.remove()

  const cold = host("")
  const rendered = core.render(compiled.dom.default as never, cold)
  const coldShape = shape(cold)
  rendered()
  cold.remove()

  // THE point of the whole exercise: whatever the corruption was, the page the
  // user is looking at is the page the client would have built. A mutation that
  // produced a different tree here is the silent-failure bug, found.
  expect({ mutation: mutation.name, shape: hydrated }).toEqual({
    mutation: mutation.name,
    shape: coldShape,
  })

  return {
    name: mutation.name,
    detected: report.recovered || report.mismatches.length > 0,
    degraded: report.recovered ? "cold" : claim.percent === 100 ? "claim" : "local",
    reuse: Math.round(claim.percent),
    kinds: [...new Set(report.mismatches.map((m) => m.kind))].toSorted(),
  }
}

describe("L6 hydration mutations", () => {
  const verdicts: Verdict[] = []

  for (const mutation of MUTATIONS) {
    test(`${mutation.name} — detected and degraded as declared`, async () => {
      const verdict = await run(mutation)
      verdicts.push(verdict)
      expect({
        name: verdict.name,
        detected: verdict.detected,
        degraded: verdict.degraded,
      }).toEqual({
        name: mutation.name,
        detected: mutation.detected,
        degraded: mutation.degrades,
      })
    })
  }

  test("the table", () => {
    const rows = verdicts.map(
      (v) =>
        `  ${v.name.padEnd(52)} ${v.detected ? "DETECTED" : "silent  "}  ` +
        `${v.degraded.padEnd(6)} reuse ${String(v.reuse).padStart(3)}%  ${v.kinds.join(",")}`,
    )
    console.log(`L6 hydration mutations:\n${rows.join("\n")}`)
    // Every mutation but the control has to be caught. A silent one is the
    // failure this file exists to name, and there is no allowance for it.
    const silent = verdicts.filter((v, index) => index > 0 && !v.detected)
    expect(silent.map((v) => v.name)).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// the build-level mutation: the flag itself
// ---------------------------------------------------------------------------

describe("hydrating a page the compiler never made hydratable", () => {
  /**
   * The mutation that cannot be made by editing markup: compile BOTH halves
   * without `hydratable` and hydrate anyway. Nothing throws — there is no range
   * to disagree with — so this is the one failure that has to be detected by
   * what did NOT happen, and it is the case the old replace-based `hydrate`
   * silently was.
   */
  test("is detected by the claim that never happened, and renders cold", async () => {
    const compiled = await compileText(SOURCE, "mut-not-hydratable", false)
    const core = await import("@barqjs/core")
    const container = host(wire(compiled.ssr))
    const before = census(container)
    const dispose = core.hydrate(compiled.dom.default as never, container)
    const report = core.hydrate.report
    const hydrated = shape(container)
    const claim = reuse(before, container)
    dispose()
    container.remove()

    const cold = host("")
    const rendered = core.render(compiled.dom.default as never, cold)
    const coldShape = shape(cold)
    rendered()
    cold.remove()

    expect(report.recovered).toBe(true)
    // Either detector is acceptable and both are honest: the subtree check
    // reaches it first on a page with any structure — the server's `<main>` has
    // the hole's own nodes where a hydratable render would have a range — and
    // the claimed-nothing check is what catches a page with none.
    expect(["structure", "not-hydratable"]).toContain(report.mismatches[0]?.kind)
    expect(hydrated).toBe(coldShape)
    expect(claim.percent).toBe(0)
  })

  /**
   * The other direction, and the one a deployment can actually get wrong: the
   * SERVER was built hydratable and the CLIENT was not. The client's walk is
   * native `.firstChild`/`.nextSibling`, so it steps straight onto a boundary
   * comment and addresses everything after it one position out — the exact shape
   * of "event handlers attached to the wrong elements". It must not be silent.
   */
  test("a hydratable server paired with a non-hydratable client is caught too", async () => {
    const core = await import("@barqjs/core")
    const server = await compileText(SOURCE, "mut-mixed-server", true)
    const client = await compileText(SOURCE, "mut-mixed-client", false)

    const container = host(wire(server.ssr))
    const dispose = core.hydrate(client.dom.default as never, container)
    const report = core.hydrate.report
    const hydrated = shape(container)
    dispose()
    container.remove()

    const cold = host("")
    const rendered = core.render(client.dom.default as never, cold)
    const coldShape = shape(cold)
    rendered()
    cold.remove()

    // DETECTED is the requirement; which degradation it takes is a fact about
    // where the client's first native step happens to land. On this page every
    // region reports that it reached its primitive without the flag and rebuilds
    // its own range, so the answer is `local` rather than `cold` — and the tree
    // is still the tree the client would have built, which is the only thing the
    // user can tell apart.
    expect(report.recovered || report.mismatches.length > 0).toBe(true)
    expect(hydrated).toBe(coldShape)
  })

  test("and the un-hydratable wire really is the wire without the bytes", async () => {
    const plain = compileSource(SOURCE, "flagless.tsx", { ssr: true })
    expect(plain).not.toContain("<!--[")
    const marked = compileSource(SOURCE, "flagged.tsx", { ssr: true, hydratable: true })
    expect(marked).toContain("<!--[-->")
  })
})
