import { describe, expect, it } from "bun:test"

import {
  compileFixture,
  compileFixtureRaw,
  compileSource,
  emittedCalls,
  fixtureSource,
  listFixtures,
} from "./harness.ts"
import { measure, typicalComponentFile } from "./measure.ts"

const BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"

interface Segment {
  genLine: number
  genCol: number
  srcLine: number
  srcCol: number
}

/** Minimal source-map v3 mappings decoder — absolute positions, no names. */
function decodeMappings(mappings: string): Segment[] {
  const out: Segment[] = []
  let srcFile = 0
  let srcLine = 0
  let srcCol = 0
  let genLine = 0

  for (const line of mappings.split(";")) {
    let genCol = 0
    for (const segment of line.split(",")) {
      if (!segment) continue
      const values: number[] = []
      let i = 0
      while (i < segment.length) {
        let raw = 0
        let shift = 0
        let digit: number
        do {
          digit = BASE64.indexOf(segment[i++])
          raw |= (digit & 31) << shift
          shift += 5
        } while (digit & 32)
        values.push(raw & 1 ? -(raw >> 1) : raw >> 1)
      }
      genCol += values[0]
      if (values.length > 1) {
        srcFile += values[1]
        srcLine += values[2]
        srcCol += values[3]
      }
      out.push({ genLine, genCol, srcLine, srcCol })
    }
    genLine++
  }
  return out
}

/**
 * Snapshots of the Rust compiler's emitted code, one per fixture.
 *
 * These are not correctness assertions — oracle.test.ts owns correctness. Their
 * job is to make every change in emitted output show up as a reviewable diff
 * instead of landing silently. Update with `bun test --update-snapshots` and
 * read the diff before committing it.
 */
describe("emitted code snapshots", () => {
  for (const name of listFixtures()) {
    it(name, () => {
      expect(compileFixture(name)).toMatchSnapshot()
    })
  }
})

describe("compiler contract", () => {
  it("emits a sourcemap only when asked", () => {
    const without = compileFixtureRaw("static-only")
    const withMap = compileFixtureRaw("static-only", { sourcemap: true })

    expect(without.map).toBeUndefined()
    expect(withMap.map).toBeString()
    // Emitting the map must not change the code it maps.
    expect(withMap.code).toBe(without.code)

    const map = JSON.parse(withMap.map as string) as {
      version: number
      file: string
      sources: string[]
      sourcesContent: string[]
      mappings: string
    }
    expect(map.version).toBe(3)
    expect(map.file).toBe("static-only.tsx")
    expect(map.sources).toEqual(["static-only.tsx"])
    expect(map.sourcesContent[0]).toContain("export default function StaticOnly")
    expect(map.mappings.length).toBeGreaterThan(0)
  })

  it("a hole's emitted code maps back to the original JSX expression", () => {
    // DESIGN §6.1: the parsed node is MOVED into the emitted call rather than
    // rebuilt, so its span cannot drift. This decodes the map and checks that
    // claim on a real hole instead of trusting the mappings string is non-empty.
    const source = fixtureSource("text-hole-fused")
    const { code, map } = compileFixtureRaw("text-hole-fused", { sourcemap: true })
    const segments = decodeMappings(JSON.parse(map as string).mappings as string)

    const generated = code.split("\n")
    const original = source.split("\n")
    const insertLine = generated.findIndex((line) => line.includes("_$insert("))
    expect(insertLine).toBeGreaterThan(-1)

    const onInsert = segments.filter((s) => s.genLine === insertLine)
    expect(onInsert.length).toBeGreaterThan(0)

    // The hole's own expression must land on the hole's own source text.
    const holeLine = original.findIndex((line) => line.includes("{() => clicks()}"))
    const hit = onInsert.find(
      (s) => generated[s.genLine].slice(s.genCol).startsWith("clicks()"),
    )
    expect(hit, `no segment covers the hole expression: ${generated[insertLine]}`).toBeDefined()
    expect(hit?.srcLine).toBe(holeLine)
    expect(original[hit?.srcLine ?? 0].slice(hit?.srcCol ?? 0)).toStartWith("clicks()")
  })

  /**
   * DESIGN §6.2. The template is a STRING LITERAL, so nothing oxc's AST-driven
   * builder records can address its inside: without the segments the compiler
   * adds after printing, a debugger that steps into `_tmpl$1` is looking at
   * bytes with no origin at all.
   */
  it("the inside of a hoisted template maps to the JSX elements that produced it", () => {
    const source = fixtureSource("dedup-identical-markup")
    const { code, map } = compileFixtureRaw("dedup-identical-markup", { sourcemap: true })
    const segments = decodeMappings(JSON.parse(map as string).mappings as string)
    const generated = code.split("\n")
    const original = source.split("\n")

    const cell = generated.findIndex((line) => line.includes('_$template(`<div class="cell">'))
    expect(cell).toBeGreaterThan(-1)
    const inside = segments.filter((s) => s.genLine === cell)

    const at = (needle: string) =>
      inside.find((s) => generated[s.genLine].slice(s.genCol).startsWith(needle))

    // The declaration head lands on the root element, not on the `return (`
    // the unit happened to be written inside.
    const head = at("const _tmpl$1")
    expect(head, `no segment at the head of the declaration: ${generated[cell]}`).toBeDefined()
    expect(original[head?.srcLine ?? -1].slice(head?.srcCol ?? 0)).toStartWith('<div class="cell">')

    // …and the nested element inside the literal lands on its own JSX.
    const span = at("<span>x</span>")
    expect(span, `no segment on the template's <span> bytes: ${generated[cell]}`).toBeDefined()
    expect(original[span?.srcLine ?? -1].slice(span?.srcCol ?? 0)).toStartWith("<span>x</span>")
    expect(span?.srcLine).toBe(3)
  })

  it("the first byte inside the literal maps to the template's root element", () => {
    // The segment at offset 0 is the one nothing else can stand in for: it is
    // the root element of the template, and dropping it left `bun test` green
    // while `cargo test` caught it. This is that claim on this side.
    const source = fixtureSource("dedup-identical-markup")
    const { code, map } = compileFixtureRaw("dedup-identical-markup", { sourcemap: true })
    const segments = decodeMappings(JSON.parse(map as string).mappings as string)
    const generated = code.split("\n")
    const original = source.split("\n")

    const cell = generated.findIndex((line) => line.includes('_$template(`<div class="cell">'))
    const first = generated[cell].indexOf("`") + 1
    const head = segments.find((s) => s.genLine === cell && s.genCol === first)
    expect(head, `no segment on the first byte inside the literal: ${generated[cell]}`).toBeDefined()
    expect(original[head?.srcLine ?? -1].slice(head?.srcCol ?? 0)).toStartWith('<div class="cell">')
  })

  it("a template carrying multi-byte text still maps, instead of killing the compile", () => {
    // The Vite plugin passes `sourcemap: true` unconditionally and does not
    // wrap the native call, so this was an accented paragraph ending the build
    // with a raw Rust panic ("byte index 128 is not a char boundary"). The
    // template search budget lands on byte 100 of the html, which is where an
    // ordinary sentence puts its first non-ASCII character.
    const { code, map } = compileFixtureRaw("unicode-long-template", { sourcemap: true })
    expect(code).toContain("café")
    const segments = decodeMappings(JSON.parse(map as string).mappings as string)
    const generated = code.split("\n")
    const line = generated.findIndex((l) => l.includes("_$template(`"))
    expect(segments.filter((s) => s.genLine === line).length).toBeGreaterThan(1)

    // The same shape at every padding length around the budget, since only one
    // of them puts a character exactly across it.
    for (let pad = 80; pad < 120; pad++) {
      const src = `const V = () => <p class="lead">${"a".repeat(pad)}é — naïve</p>;\n`
      expect(() => compileSource(src, "V.tsx", { sourcemap: true })).not.toThrow()
    }
  })

  /**
   * Target #6 meets §6. One `template()` call serves two source sites, and a
   * source map is a FUNCTION from a generated position to a source position —
   * two sites cannot both own one byte. The bytes name the site that serialised
   * them; the other site is reachable at its own `_tmpl$1()` clone call.
   */
  it("a deduped template maps to its claimant, and every site keeps its clone call", () => {
    const source = fixtureSource("dedup-identical-markup")
    const { code, map } = compileFixtureRaw("dedup-identical-markup", { sourcemap: true })
    const segments = decodeMappings(JSON.parse(map as string).mappings as string)
    const generated = code.split("\n")
    const original = source.split("\n")

    expect(emittedCalls(code, "template")).toBe(2)
    const cell = generated.findIndex((line) => line.includes('_$template(`<div class="cell">'))
    const claimed = segments.find(
      (s) => s.genLine === cell && generated[s.genLine].slice(s.genCol).startsWith("<span>x</span>"),
    )
    // Left is written first, so Left is what those bytes are.
    expect(claimed?.srcLine).toBe(3)
    // Right's identical markup is right there, and it is NOT what they map to.
    expect(original[11]).toContain("<span>x</span>")

    const clones = generated
      .map((line, index) => ({ line, index }))
      .filter(({ line }) => line.includes("_tmpl$1()"))
      .map(({ index }) => segments.find((s) => s.genLine === index))
    expect(clones).toHaveLength(2)
    // Left's clone maps into Left, Right's into Right — so Right is not lost.
    expect(clones[0]?.srcLine).toBeLessThan(7)
    expect(clones[1]?.srcLine).toBeGreaterThan(7)
  })

  /**
   * The map was ~30% of compile time at M1 and it still is — completing §6 cost
   * about a third of the map, and roughly two thirds of it is oxc's own builder
   * and VLQ encoder. Maps are off by default and a mapped compile is 26x inside
   * the 1 ms budget, so the number is printed rather than tuned.
   *
   * The bound is a ratio for the same reason the pass-stage gate is: it does not
   * move with the machine. Asking for a map may not cost more than the compile
   * itself — that catches a doubling, and a slower runner cannot trip it.
   */
  it("generating the map costs less than the compile it maps", () => {
    const source = typicalComponentFile(fixtureSource)
    const plain = measure("map-off", source)
    const mapped = measure("map-on", source, { sourcemap: true })
    const share = (mapped.msPerCompile - plain.msPerCompile) / mapped.msPerCompile
    console.log(
      `\nsourcemap: ${plain.msPerCompile.toFixed(4)} ms off, ` +
        `${mapped.msPerCompile.toFixed(4)} ms on, ${(share * 100).toFixed(1)}% of the compile`,
    )
    // Both halves have to be real: a run that emitted no map would make the
    // ratio 1.0, and one that emitted an empty map would too.
    const raw = compileFixtureRaw("dedup-identical-markup", { sourcemap: true })
    expect((JSON.parse(raw.map as string).mappings as string).length).toBeGreaterThan(0)
    expect(mapped.msPerCompile).toBeLessThan(1)
    expect(mapped.msPerCompile).toBeLessThan(plain.msPerCompile * 2)
    expect(share).toBeLessThan(0.5)
  }, 120_000)

  it("reports no warnings for a clean fixture", () => {
    for (const name of listFixtures()) {
      expect(compileFixtureRaw(name).warnings, `${name} produced warnings`).toEqual([])
    }
  })

  it("every fixture compiles without throwing", () => {
    for (const name of listFixtures()) {
      expect(() => compileFixture(name)).not.toThrow()
    }
  })

  it("emitted code is never empty", () => {
    for (const name of listFixtures()) {
      expect(compileFixture(name).trim().length, `${name} compiled to nothing`).toBeGreaterThan(0)
    }
  })
})
